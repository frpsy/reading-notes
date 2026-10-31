// 다른 기기의 변경은 보존하고 이 기기에서 바꾼 항목만 병합합니다.
import { normalizeBook, autoDates } from "./core.js?v=36";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shape = ch => ch.map(({ t, lv, p }) => ({ t, lv, p }));
// 같은 챕터 메모를 두 기기에서 동시에 고치면 어느 쪽도 버리지 않고 이 표시로 이어 붙입니다.
export const MEMO_JOIN = '\n\n― 두 기기에서 동시에 고친 메모를 모두 남겼습니다 ―\n';
function joinMemo(server, local) {
  if (server.endsWith(MEMO_JOIN + local)) return server; // 이미 합친 변경을 다시 보낸 경우(멱등)
  const joined = server + MEMO_JOIN + local;
  if (joined.length > 2000) conflict('같은 챕터 메모를 다른 기기에서도 고쳤고, 합치면 2,000자를 넘습니다. 보관된 변경을 새 책으로 저장할 수 있습니다.');
  return joined;
}
function conflict(message) { const error = new Error(message); error.code = 'sync-conflict'; throw error; }
function identities(ch) {
  const counts = new Map();
  return ch.map(c => {
    const k = JSON.stringify([c.t, c.lv]), n = counts.get(k) || 0;
    counts.set(k, n + 1); return k + ':' + n;
  });
}
export function mergeBookChanges(remote, base, desired) {
  if (!remote) {
    if (base) conflict('다른 기기에서 삭제한 책입니다. 보관된 변경을 새 책으로 저장할 수 있습니다.');
    return normalizeBook(desired);
  }
  if (!base) {
    const empty = normalizeBook({ ...desired, startDate: null, endDate: null, endAuto: false, goalDate: null, rating: 0, note: '', chapters: desired.chapters.map(c => ({ ...c, done: null, memo: '' })) });
    return mergeBookChanges(remote, empty, desired);
  }
  const old = normalizeBook(base), next = normalizeBook(desired), current = normalizeBook(remote);
  const result = structuredClone(current);
  for (const k of Object.keys(next)) {
    if (!['chapters', 'updatedAt', 'endDate', 'endAuto'].includes(k) && !equal(old[k], next[k])) result[k] = next[k];
  }
  const localStructure = !equal(shape(old.chapters), shape(next.chapters));
  const remoteStructure = !equal(shape(old.chapters), shape(current.chapters));
  if (localStructure && remoteStructure && !equal(shape(next.chapters), shape(current.chapters))) {
    conflict('다른 기기에서도 목차를 수정했습니다. 보관된 변경을 새 책으로 저장할 수 있습니다.');
  }
  const oldMap = new Map(identities(old.chapters).map((k, i) => [k, old.chapters[i]]));
  const remoteMap = new Map(identities(current.chapters).map((k, i) => [k, current.chapters[i]]));
  const target = structuredClone(localStructure ? next.chapters : current.chapters);
  const targetKeys = identities(target), nextKeys = identities(next.chapters);
  const targetMap = new Map(targetKeys.map((k, i) => [k, target[i]]));
  if (localStructure) target.forEach((c, i) => {
    const before = oldMap.get(targetKeys[i]), server = remoteMap.get(targetKeys[i]);
    if (before && server) for (const f of ['done', 'memo']) if (equal(c[f], before[f])) c[f] = server[f];
  });
  next.chapters.forEach((c, i) => {
    const before = oldMap.get(nextKeys[i]);
    if (!before) return;
    for (const f of ['done', 'memo']) if (!equal(c[f], before[f])) {
      const dest = targetMap.get(nextKeys[i]);
      if (!dest) conflict('다른 기기에서 수정한 챕터가 삭제되었습니다. 보관된 변경을 새 책으로 저장할 수 있습니다.');
      const server = remoteMap.get(nextKeys[i]);
      if (f === 'memo' && server && server.memo && server.memo !== before.memo && server.memo !== c.memo) {
        // 양쪽 모두 바꾼 메모: 이 기기에서 지웠다면 다른 기기 글을 남기고, 둘 다 썼다면 이어 붙입니다.
        dest.memo = c.memo ? joinMemo(server.memo, c.memo) : server.memo;
        continue;
      }
      dest[f] = c[f];
    }
  });
  result.chapters = target;
  if (old.endDate !== next.endDate && !next.endAuto) { result.endDate = next.endDate; result.endAuto = false; }
  result.updatedAt = Math.max(current.updatedAt, next.updatedAt);
  if (result.endAuto) result.endDate = null;
  autoDates(result);
  return result;
}
