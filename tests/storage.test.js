import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store-core.js';
import { mergeBookChanges } from '../js/sync-core.js';
import { normalizeBook, validateBook } from '../js/core.js';

const book = () => normalizeBook({ id: 'x', title: '책', chapters: [{ t: '1장' }, { t: '2장' }] });
const copy = structuredClone;
function memory() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i], getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,v), removeItem: k => m.delete(k) };
}
async function setup(storage = memory()) {
  let onAuth, current = book(), failures = 0, writes = 0;
  const sdk = {
    initializeApp: () => ({}), getAuth: () => ({}), initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    onAuthStateChanged: (_, cb) => { onAuth = cb; cb({ uid: 'a', email: 'owner@example.com', emailVerified: true }); },
    doc: (_, ...path) => path.join('/'), collection: () => ({}),
    runTransaction: async (_, fn) => {
      if (failures) { failures--; throw Error('permission-denied'); }
      await fn({ get: async () => ({ exists: () => !!current, data: () => copy(current) }), set: (_, value) => { current = copy(value); writes++; } });
    },
    deleteDoc: async () => { if (failures) { failures--; throw Error('permission-denied'); } current = null; writes++; },
  };
  const store = createStore({ firebaseConfig: { apiKey: 'test', projectId: 'test' }, sdkBase: 'fake', allowedEmails: ['owner@example.com'], userCollection: 'u', itemCollection: 'books', merge: mergeBookChanges, validate: validateBook, importSdk: async () => sdk, storage });
  await store.start(() => {});
  return { store, storage, get current() { return current; }, get writes() { return writes; }, fail: () => { failures++; }, auth: uid => onAuth({ uid, email: 'owner@example.com', emailVerified: true }) };
}

test('설정이 없으면 오류이며 로그인 없는 저장 API는 제공하지 않음', async () => {
  const s = createStore({ firebaseConfig: {} });
  const events = []; await s.start(x => events.push(x));
  assert.equal(events[0].state, 'error');
  assert.equal(s.localWrite, undefined); assert.equal(s.localList, undefined);
  assert.throws(() => s.writePending({}), /기기에 변경/);
  await assert.rejects(s.signIn(), /로그인 설정/);
});

test('계정별 대기 기록은 즉시 저장되고 새 인스턴스에서도 복구됨', async () => {
  const a = await setup();
  const r = { key: '01', id: 'x', kind: 'save', base: book(), item: book() };
  r.item.chapters[0].memo = '즉시 보관'; a.store.writePending(r);
  assert.equal(a.storage.length, 1);
  const reload = await setup(a.storage);
  assert.equal((await reload.store.readPending())[0].item.chapters[0].memo, '즉시 보관');
  await reload.auth('b'); assert.deepEqual(await reload.store.readPending(), []);
  await reload.auth('a'); assert.equal((await reload.store.readPending()).length, 1);
});

test('저장 공간 부족을 숨기지 않음', async () => {
  const storage = memory(); storage.setItem = () => { throw Error('quota'); };
  const {store} = await setup(storage);
  assert.throws(() => store.writePending({key:'01'}), /보관하지 못했습니다/);
});

test('실패한 삭제를 보관하고 재시도하며 중복 전송은 생략함', async () => {
  const s = await setup(), r = {key:'01', id:'x', kind:'delete', base:book()};
  s.store.writePending(r); s.fail();
  await assert.rejects(s.store.sendPending(r), /permission-denied/);
  assert.equal((await s.store.readPending()).length, 1); assert.ok(s.current);
  await s.store.sendPending(r); assert.equal(s.current, null);
  assert.deepEqual(await s.store.readPending(), []);
  await s.store.sendPending(r); assert.equal(s.writes, 1);
});

test('다른 기기의 챕터 완료와 이 기기의 메모를 모두 유지함', async () => {
  const s = await setup(), base = book(), desired = book();
  s.current.chapters[0].done = '2026-10-31'; desired.chapters[1].memo = '메모';
  const r = {key:'01', id:'x', kind:'save', base, item:desired};
  s.store.writePending(r); await s.store.sendPending(r);
  assert.equal(s.current.chapters[0].done, '2026-10-31');
  assert.equal(s.current.chapters[1].memo, '메모');
});

test('연속 변경의 기준을 유지하므로 전송 중 체크 취소도 적용됨', () => {
  const initial = book(), checked = book(), undone = book(); checked.chapters[0].done = '2026-10-31';
  let remote = mergeBookChanges(initial, initial, checked);
  remote.chapters[1].memo = '다른 기기';
  remote = mergeBookChanges(remote, checked, undone);
  assert.equal(remote.chapters[0].done, null); assert.equal(remote.chapters[1].memo, '다른 기기');
});

test('목차 수정 시 기존 챕터의 다른 기기 메모·완료 날짜 보존', () => {
  const base = book(), remote = book(), desired = book();
  remote.chapters[0].memo = '원격 메모'; remote.chapters[1].done = '2026-10-31';
  desired.chapters.push({t:'3장',lv:0,p:null,done:null,memo:''});
  const merged = mergeBookChanges(remote, base, desired);
  assert.equal(merged.chapters.length, 3); assert.equal(merged.chapters[0].memo, '원격 메모'); assert.equal(merged.chapters[1].done, '2026-10-31');
});

test('병합할 수 없는 목차 수정과 원격 삭제는 덮어쓰지 않음', () => {
  const base = book(), remote = book(), desired = book();
  remote.chapters[0].t = '원격 제목'; desired.chapters[0].t = '로컬 제목';
  assert.throws(() => mergeBookChanges(remote, base, desired), /목차/);
  assert.throws(() => mergeBookChanges(null, base, desired), /삭제한 책/);
  assert.equal(mergeBookChanges(remote, null, desired).chapters[0].t, '원격 제목');
});

test('동시 챕터 완료로 완독하면 종료일을 다시 계산함', () => {
  const base = book(), a = book(), b = book();
  a.chapters[0].done = '2026-10-30'; b.chapters[1].done = '2026-10-31';
  const merged = mergeBookChanges(a, base, b);
  assert.equal(merged.endDate, '2026-10-31'); assert.equal(merged.endAuto, true);
});

test('입력 제한은 오류로 안내하고 기존 긴 메모는 읽을 때 자르지 않음', () => {
  const b = book(); b.chapters[0].memo = '가'.repeat(2100);
  assert.equal(normalizeBook(b).chapters[0].memo.length, 2100); assert.match(validateBook(b), /2,000/);
  b.chapters[0].memo = ''; b.title = '가'.repeat(201); assert.match(validateBook(b), /200/);
  b.title = '책'; b.author = '가'.repeat(101); assert.match(validateBook(b), /100/);
  b.author = ''; b.chapters = Array.from({length:3001}, () => ({t:'장'})); assert.match(validateBook(b), /3,000/);
});

test('같은 챕터 메모를 두 기기에서 고치면 둘 다 남기고, 다시 보내도 중복되지 않음', async () => {
  const { MEMO_JOIN } = await import('../js/sync-core.js');
  const base = book(), remote = book(), desired = book();
  base.chapters[0].memo = '원래'; remote.chapters[0].memo = '원격에서 고침'; desired.chapters[0].memo = '이 기기에서 고침';
  const merged = mergeBookChanges(remote, base, desired);
  assert.equal(merged.chapters[0].memo, '원격에서 고침' + MEMO_JOIN + '이 기기에서 고침');
  assert.equal(mergeBookChanges(merged, base, desired).chapters[0].memo, merged.chapters[0].memo, '재전송 멱등');
  const cleared = book(); cleared.chapters[0].memo = '';
  assert.equal(mergeBookChanges(remote, base, cleared).chapters[0].memo, '원격에서 고침', '이 기기에서 지워도 다른 기기 글은 보존');
  const remoteCleared = book(); remoteCleared.chapters[0].memo = '';
  assert.equal(mergeBookChanges(remoteCleared, base, desired).chapters[0].memo, '이 기기에서 고침');
  const same = book(); same.chapters[0].memo = '이 기기에서 고침';
  assert.equal(mergeBookChanges(same, base, desired).chapters[0].memo, '이 기기에서 고침', '같은 글이면 그대로');
  const long = book(); long.chapters[0].memo = '가'.repeat(1500); const mine = book(); mine.chapters[0].memo = '나'.repeat(600);
  assert.throws(() => mergeBookChanges(long, base, mine), /2,000자/);
});

test('손상된 대기 기록은 격리하고 나머지는 복구함', async () => {
  const a = await setup();
  const good = { key: '02', id: 'x', kind: 'save', base: book(), item: book() };
  a.store.writePending(good);
  const p = [...Array(a.storage.length).keys()].map(i => a.storage.key(i))[0].replace(/02$/, '');
  a.storage.setItem(p + '01', '{깨진 JSON');
  a.storage.setItem(p + '03', JSON.stringify({ key: '03', id: 'x', kind: 'save' })); // item 없음
  const records = await a.store.readPending();
  assert.deepEqual(records.map(r => r.key), ['02']);
  assert.equal(records.quarantined, 2);
  const keys = [...Array(a.storage.length).keys()].map(i => a.storage.key(i));
  assert.equal(keys.filter(k => k.startsWith('chaekgalpi-quarantine-v1:')).length, 2, '원문은 별도 키로 보존');
  assert.equal(a.storage.getItem('chaekgalpi-quarantine-v1:' + p + '01'), '{깨진 JSON');
  assert.equal((await a.store.readPending()).quarantined, 0, '다시 읽으면 정상');
});

test('일시 오류만 자동 재시도하고 간격은 최대 1분', async () => {
  const { isTransient, retryDelay } = await import('../js/sync.js');
  assert.ok(isTransient({ code: 'unavailable' })); assert.ok(isTransient({ code: 'firestore/deadline-exceeded' }));
  assert.ok(isTransient(new Error('Failed to fetch')));
  assert.ok(!isTransient({ code: 'permission-denied' })); assert.ok(!isTransient({ code: 'sync-conflict', message: 'x' }));
  assert.ok(!isTransient(new Error('챕터 메모는 2,000자까지 입력할 수 있습니다.')));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 10].map(retryDelay), [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
});
