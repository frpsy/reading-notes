// 되돌리기: 마지막 체크·날짜 변경을 6초 동안 되돌릴 수 있게 합니다.
import { state } from "./state.js?v=31";
import { render } from "./bus.js?v=31";
import { persist } from "./sync.js?v=31";
import { esc } from "./util.js?v=31";

function snapshot(b) {
  return { id: b.id, done: b.chapters.map(function (x) { return x.done; }), startDate: b.startDate, endDate: b.endDate, endAuto: b.endAuto };
}
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
export function mutate(b, label, fn) {
  var s = snapshot(b);
  fn(); persist(b); state.undo = s; showToast(label); render();
}
// 임의 동작을 되돌리는 안내(예: 지운 메모 복구)
export function offerUndo(label, restore) { showToast(label); state.undo = { restore: restore }; }
export function restoreUndo() {
  var s = state.undo; if (!s) return;
  if (s.restore) { hideToast(); s.restore(); return; }
  var b = state.books.get(s.id); hideToast(); if (!b) return;
  // 읽음 날짜만 되돌립니다. 그 사이 적은 메모·평점 등은 그대로 둡니다.
  if (s.done.length === b.chapters.length) b.chapters.forEach(function (x, i) { x.done = s.done[i]; });
  b.startDate = s.startDate; b.endDate = s.endDate; b.endAuto = s.endAuto;
  persist(b); render();
}
export function initUndo() {
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-undo]")) restoreUndo(); });
}
