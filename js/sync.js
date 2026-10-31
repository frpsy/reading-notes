// 로그인 계정의 변경을 즉시 기기에 보관한 뒤 서버로 전송합니다.
import * as store from "./store.js?v=26";
import { state } from "./state.js?v=26";
import { validateBook, newId, friendlyError } from "./core.js?v=26";
import { render } from "./bus.js?v=26";
const TEXT = { pending: '연결 중…', saved: '저장됨', saving: '저장 중…', error: '저장 실패 · 다시 시도', offline: '오프라인 · 기기에 보관 중' };
let sequence = 0;
// 연결·서버 사정으로 잠시 실패한 경우만 자동으로 다시 보냅니다(권한·형식·충돌 오류는 사용자 조치가 필요하므로 제외).
const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal', 'cancelled', 'unknown']);
export function isTransient(e) {
  const code = String((e && e.code) || '').replace(/^firestore\//, '');
  return TRANSIENT.has(code) || (!code && /offline|network|fetch|timeout/i.test(String((e && e.message) || '')));
}
export function retryDelay(n) { return Math.min(60000, 2000 * 2 ** n); }
function scheduleRetry() {
  clearTimeout(state.retryTimer);
  const ms = retryDelay(state.retryCount++);
  state.retryTimer = setTimeout(() => { state.retryTimer = null; flush(); }, ms);
  return ms;
}
// 메모 입력란 아래 문구: 기기 보관은 끝났고, 서버 저장이 어디까지 왔는지 알려 줍니다.
const MEMO_TEXT = { saving: '기기에 보관됨 · 서버로 보내는 중', saved: '저장됨', offline: '기기에 보관됨 · 연결되면 보냅니다', error: '기기에 보관됨 · 서버 저장 실패(상단 안내 확인)', pending: '기기에 보관됨 · 연결 중' };
export function memoStatusText(s) { return MEMO_TEXT[s] || MEMO_TEXT.saving; }
export function setSync(s, msg = '') {
  if (s === 'saving' && navigator.onLine === false) s = 'offline';
  const el = document.getElementById('sync');
  el.dataset.state = s; el.textContent = TEXT[s]; el.title = msg;
  document.querySelectorAll('[data-memo-saved][data-touched]:not(.bad)').forEach(function (n) { n.textContent = memoStatusText(s); });
  const detail = document.getElementById('sync-detail');
  if (detail) { detail.textContent = msg; detail.hidden = !msg; }
  const copy = document.getElementById('sync-copy');
  if (copy) copy.hidden = s !== 'error' || !state.conflicts.size;
}
export function hasPending(id) { return [...state.pending.values()].some(x => x.id === id); }
function stage(id, kind, item) {
  const previous = state.lastJson.get(id);
  const queued = [...state.pending.values()].filter(x => x.id === id).at(-1);
  const replace = !!navigator.locks && kind === 'save' && queued?.kind === 'save' && queued.key !== state.activeKey;
  const key = replace ? queued.key : Date.now().toString().padStart(16, '0') + '-' + (++sequence).toString().padStart(8, '0') + '-' + crypto.randomUUID();
  const record = { key, id, kind, base: replace ? queued.base : (previous ? JSON.parse(previous) : null) };
  if (item) record.item = structuredClone(item);
  state.pending.set(key, record);
  if (item) state.lastJson.set(id, JSON.stringify(item)); else state.lastJson.delete(id);
  try { store.writePending(record); }
  catch (e) { setSync('error', '기기에 보관하지 못했습니다. 창을 닫지 말고 저장 공간을 확보한 뒤 다시 시도해 주세요.'); return false; }
  setSync('saving');
  // 서버 전송만 묶습니다. 기기 보관은 위에서 이미 완료했습니다.
  clearTimeout(state.flushTimer); state.flushTimer = setTimeout(flush, 150); return true;
}
export function persist(b) {
  const error = validateBook(b);
  if (error) { setSync('error', error); return false; }
  b.updatedAt = Date.now(); return stage(b.id, 'save', b);
}
export function removeBook(id) { stage(id, 'delete'); state.books.delete(id); }
export async function flush() {
  if (state.flushing || state.phase !== 'app') return;
  const epoch = state.epoch;
  state.flushing = true;
  const attempted = new Set(), blocked = new Set();
  let retryMsg = '';
  try {
    while (epoch === state.epoch) {
      const record = [...state.pending.values()].find(x => !attempted.has(x.key) && !blocked.has(x.id));
      if (!record) break;
      attempted.add(record.key);
      try {
        store.writePending(record);
        if (navigator.onLine === false) { setSync('offline'); break; }
        state.activeKey = record.key;
        await store.sendPending(record);
        if (epoch !== state.epoch) return;
        state.pending.delete(record.key);
        state.retryCount = 0;
      } catch (e) {
        if (epoch !== state.epoch) return;
        blocked.add(record.id);
        if (e && e.code === 'sync-conflict') state.conflicts.add(record.id);
        if (isTransient(e)) retryMsg = friendlyError(e);
        setSync('error', friendlyError(e));
      } finally {
        if (epoch === state.epoch) state.activeKey = null;
      }
    }
  } finally {
    if (epoch === state.epoch) {
      state.flushing = false;
      if (retryMsg && state.pending.size) setSync('error', retryMsg + ' ' + Math.round(scheduleRetry() / 1000) + '초 뒤 자동으로 다시 보냅니다.');
      if (!state.pending.size) {
        setSync('saved');
        store.refresh().catch(e => { if (epoch === state.epoch) setSync('error', friendlyError(e, '기록을 불러오지 못했습니다. 연결을 확인한 뒤 상단의 상태 버튼을 눌러 다시 시도해 주세요.')); });
      }
    }
  }
}
export async function restorePending(epoch = state.epoch) {
  const records = await store.readPending();
  if (epoch !== state.epoch) return;
  for (const record of records) state.pending.set(record.key, record);
  for (const record of state.pending.values()) {
    if (record.kind === 'delete') { state.books.delete(record.id); state.lastJson.delete(record.id); }
    else { state.books.set(record.id, record.item); state.lastJson.set(record.id, JSON.stringify(record.item)); }
  }
  if (state.pending.size) setSync('saving');
  return records.quarantined || 0;
}
export function initSync() {
  window.addEventListener('online', () => { if (state.pending.size) { setSync('saving'); flush(); } });
  window.addEventListener('offline', () => { if (state.pending.size) setSync('offline'); });
  document.getElementById('sync-copy').addEventListener('click', () => {
    for (const id of [...state.conflicts]) {
      const source = state.books.get(id);
      if (!source) continue;
      const copy = structuredClone(source); copy.id = newId(); copy.createdAt = Date.now();
      // 복구본을 먼저 영속 보관한 후 충돌한 대기 기록을 정리합니다.
      if (!persist(copy)) return;
      state.books.set(copy.id, copy);
      try {
        for (const record of [...state.pending.values()]) if (record.id === id) { store.discardPending(record); state.pending.delete(record.key); }
      } catch (e) { setSync('error', friendlyError(e)); return; }
      state.conflicts.delete(id); state.books.delete(id); state.lastJson.delete(id);
      location.hash = 'book-' + copy.id;
    }
    render(); setSync('saving'); flush();
  });
  document.getElementById('sync').addEventListener('click', () => {
    if (state.phase === 'app' && !state.flushing) {
      setSync('saving');
      if (state.pending.size) flush();
      else {
        const epoch = state.epoch;
        store.refresh().then(() => { if (epoch === state.epoch) setSync('saved'); }).catch(e => { if (epoch === state.epoch) setSync('error', friendlyError(e, '기록을 불러오지 못했습니다. 연결을 확인한 뒤 상단의 상태 버튼을 눌러 다시 시도해 주세요.')); });
      }
    }
  });
}
