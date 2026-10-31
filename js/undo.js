// 되돌리기: 마지막 체크·날짜 변경을 6초 동안 되돌릴 수 있게 합니다.
import { state } from "./state.js?v=22";
import { render } from "./bus.js?v=22";
import { persist } from "./sync.js?v=22";
import { esc } from "./util.js?v=22";

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
export function mutate(b, label, fn) {
  var s = snapshot(b);
  fn(); persist(b); state.undo = s; showToast(label); render();
}
export function restoreUndo() {
  var s = state.undo; if (!s) return;
  var b = state.books.get(s.id); hideToast(); if (!b) return;
  // 읽음 날짜만 되돌립니다. 그 사이 적은 메모·평점 등은 그대로 둡니다.
  if (s.done.length === b.chapters.length) b.chapters.forEach(function (x, i) { x.done = s.done[i]; });
  b.startDate = s.startDate; b.endDate = s.endDate; b.endAuto = s.endAuto;
  persist(b); render();
}
export function initUndo() {
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-undo]")) restoreUndo(); });
}
