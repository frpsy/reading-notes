// 알림창: 챕터 체크·취소에는 띄우지 않습니다(진도 체크는 알림창 없이 바로 반영, 취소는 다시 누르기).
// 메모 삭제처럼 되돌릴 수 없는 동작에만 '되돌리기'를 잠시 보여 줍니다.
import { state } from "./state.js?v=38";
import { render } from "./bus.js?v=38";
import { persist } from "./sync.js?v=38";
import { esc } from "./util.js?v=38";

export function hideToast() {
  clearTimeout(state.toastTimer); state.undo = null;
  var t = document.getElementById("toast"); if (t) t.hidden = true;
}
function showToast(label) {
  var t = document.getElementById("toast"); if (!t) return;
  t.innerHTML = '<span class="toast-msg">' + esc(label) + '</span><button type="button" data-undo="1">되돌리기</button>';
  t.hidden = false;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(hideToast, 6000);
}
// 되돌리기 없이 알리기만 하는 안내(10초)
export function showNotice(text) {
  var t = document.getElementById("toast"); if (!t) return;
  state.undo = null;
  t.innerHTML = '<span class="toast-msg wrap">' + esc(text) + '</span>';
  t.hidden = false;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(hideToast, 10000);
}
export function mutate(b, fn) {
  fn(); persist(b); render();
}
// 임의 동작을 되돌리는 안내(예: 지운 메모 복구)
export function offerUndo(label, restore) { showToast(label); state.undo = { restore: restore }; }
export function restoreUndo() {
  var s = state.undo; if (!s) return;
  hideToast(); s.restore();
}
export function initUndo() {
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-undo]")) restoreUndo(); });
}
