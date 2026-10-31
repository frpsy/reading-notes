// 로그인 상태와 저장소 실시간 목록을 연결합니다.
import * as store from "./store.js?v=31";
import { state } from "./state.js?v=31";
import { render } from "./bus.js?v=31";
import { setSync, hasPending, restorePending, flush } from "./sync.js?v=31";
import { hideToast, showNotice } from "./undo.js?v=31";
import { currentRoute } from "./router.js?v=31";
import { normalizeBook, friendlyError } from "./core.js?v=31";

function markReady() {
  if (state.ready) return;
  state.ready = true;
  clearTimeout(state.readyTimer);
  render();
}
// 로그아웃·계정 전환 때 이전 계정의 저장 대기 상태가 남아 새 데이터를 막지 않도록 비웁니다.
function resetSaving() {
  state.epoch++; state.pending.clear(); state.conflicts.clear(); state.flushing = false;
  clearTimeout(state.flushTimer); state.flushTimer = null; state.activeKey = null;
  clearTimeout(state.retryTimer); state.retryTimer = null; state.retryCount = 0;
  clearTimeout(state.readyTimer); state.readyTimer = null;
  state.books.clear(); state.lastJson.clear();
}
function onSnap(list, meta) {
  var changed = false, seen = new Set();
  list.forEach(function (raw) {
    var id = raw.id; seen.add(id);
    if (hasPending(id)) return;
    var b = normalizeBook(raw); b.id = id;
    var j = JSON.stringify(b);
    if (state.lastJson.get(id) !== j) { state.books.set(id, b); state.lastJson.set(id, j); changed = true; }
  });
  Array.from(state.books.keys()).forEach(function (id) {
    if (!seen.has(id) && !hasPending(id)) { state.books.delete(id); state.lastJson.delete(id); changed = true; }
  });
  if (!state.ready) {
    if (meta && meta.fromCache && meta.empty) { if (!state.readyTimer) state.readyTimer = setTimeout(markReady, 1200); return; }
    markReady(); return;
  }
  var view = document.getElementById("view");
  var ae = document.activeElement;
  var typing = ae && view.contains(ae) && /^(TEXTAREA|INPUT)$/.test(ae.tagName);
  if (changed && !typing && currentRoute().name !== "form") render(); // 입력 중에는 다시 그리지 않아 글이 사라지지 않게 함
}

export async function enterApp() {
  state.mode = 'firebase'; state.phase = 'app'; state.ready = false;
  resetSaving();
  setSync('saved');
  const epoch = state.epoch;
  let quarantined = 0;
  try { quarantined = await restorePending(epoch); } catch (e) { if (epoch !== state.epoch) return; state.phase = 'error'; state.authMsg = friendlyError(e, '기기에 보관된 변경을 읽지 못했습니다. 새로고침해 주세요.'); render(); return; }
  if (epoch !== state.epoch) return;
  if (state.unsub) state.unsub();
  state.unsub = store.watch(onSnap, e => { setSync('error', friendlyError(e, '기록을 불러오지 못했습니다. 연결을 확인한 뒤 상단의 상태 버튼을 눌러 다시 시도해 주세요.')); markReady(); });
  flush(); render();
  if (quarantined) showNotice('읽을 수 없는 보관 기록 ' + quarantined + '건을 따로 옮겨 두었습니다. 나머지 기록은 정상입니다.');
}

export function onAuth(st) {
  if (st.state === "login" && (state.phase === "denied" || state.phase === "error")) return;
  if (st.state === "ready") { state.userEmail = st.email || ""; enterApp(); return; }
  if (state.unsub) { state.unsub(); state.unsub = null; }
  state.phase = st.state; state.ready = false; resetSaving(); hideToast();
  state.authMsg = st.state === "denied" ? (st.email + " 계정은 이 앱을 쓸 수 없습니다.") : (st.message || "");
  setSync("pending"); document.getElementById("sync").textContent = "로그인 필요";
  render();
}
