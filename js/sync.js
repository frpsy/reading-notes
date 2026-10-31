// 로그인 계정의 변경을 즉시 기기에 보관한 뒤 서버로 전송합니다.
import * as store from "./store.js?v=22";
import { state } from "./state.js?v=22";
import { validateBook, newId } from "./core.js?v=22";
import { render } from "./bus.js?v=22";
const TEXT = { pending: '연결 중…', saved: '저장됨', saving: '저장 중…', error: '저장 실패 · 다시 시도', offline: '오프라인 · 기기에 보관 중' };
let sequence = 0;
export function setSync(s, msg = '') {
  if (s === 'saving' && navigator.onLine === false) s = 'offline';
  const el = document.getElementById('sync');
  el.dataset.state = s; el.textContent = TEXT[s]; el.title = msg;
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
      } catch (e) {
        if (epoch !== state.epoch) return;
        blocked.add(record.id);
        if (e && e.code === 'sync-conflict') state.conflicts.add(record.id);
        setSync('error', (e && e.message) || '저장하지 못했습니다. 다시 시도해 주세요.');
      } finally {
        if (epoch === state.epoch) state.activeKey = null;
      }
    }
  } finally {
    if (epoch === state.epoch) {
      state.flushing = false;
      if (!state.pending.size) {
        setSync('saved');
        store.refresh().catch(e => { if (epoch === state.epoch) setSync('error', e.message); });
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
      } catch (e) { setSync('error', e.message); return; }
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
        store.refresh().then(() => { if (epoch === state.epoch) setSync('saved'); }).catch(e => { if (epoch === state.epoch) setSync('error', e.message); });
      }
    }
  });
}
