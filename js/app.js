// 책갈피 진입점: 화면 그리기, 이벤트 연결, 시작. 나머지 기능은 모듈별 파일에 있습니다.
import * as store from "./store.js?v=16";
import { state } from "./state.js?v=16";
import { setRenderer, render } from "./bus.js?v=16";
import { initPrefs, saveFolded } from "./prefs.js?v=16";
import { initUndo, mutate, hideToast } from "./undo.js?v=16";
import { initSync, persist, removeBook } from "./sync.js?v=16";
import { onAuth, enterApp } from "./session.js?v=16";
import { currentRoute, redirectLegacy } from "./router.js?v=16";
import { tabBarHtml, APPS } from "./apps.js?v=16";
import { studyView } from "./view-study.js?v=16";
import { workoutView, workoutAct } from "./view-workout.js?v=16";
import { loadCatalog, addFromCatalog } from "./catalog.js?v=16";
import { loginView, loadingView } from "./view-common.js?v=16";
import { libraryView } from "./view-library.js?v=16";
import { bookView, refreshMemos } from "./view-book.js?v=16";
import { yearView } from "./view-year.js?v=16";
import { formView, bindForm } from "./view-form.js?v=16";
import { metrics as calcMetrics, nextLeafIndex, isGroup, completeThrough, toggleChapter as toggle, autoDates } from "./core.js?v=16";

var view = document.getElementById("view");
var tabs = document.getElementById("tabs");
var brand = document.querySelector(".brand");

function draw() {
  var ae = document.activeElement, fk = null;
  if (ae && ae !== document.body && ae.dataset && ae.dataset.act) {
    fk = '[data-act="' + ae.dataset.act + '"]' + (ae.dataset.i != null ? '[data-i="' + ae.dataset.i + '"]' : "");
  }
  var r = currentRoute(), html;
  tabs.innerHTML = tabBarHtml(r.app);
  document.body.dataset.app = r.app;
  var cur = APPS.filter(function (a) { return a.id === r.app; })[0];
  if (cur) { brand.textContent = cur.title; brand.setAttribute("href", cur.home); }
  if (r.app === "study") {
    if (view.dataset.screen === "study") return; // 다시 그리면 안의 사이트가 새로고침되므로 그대로 둡니다
    view.dataset.screen = "study"; view.innerHTML = studyView(); return;
  }
  view.dataset.screen = r.app;
  if (r.app === "workout") { view.innerHTML = workoutView(); restoreFocus(fk); return; }
  if (state.phase === "boot") html = loadingView();
  else if (state.phase !== "app") html = loginView();
  else if (!state.ready) html = loadingView();
  else if (r.name === "library") html = libraryView();
  else if (r.name === "book") html = bookView(r.id);
  else if (r.name === "year") html = yearView(r.year);
  else html = formView(r.id);
  view.innerHTML = html;
  if (state.phase === "app" && state.ready && r.name === "form" && (!r.id || state.books.has(r.id))) bindForm(r.id);
  restoreFocus(fk, ae);
}
function restoreFocus(fk, ae) {
  if (!fk) return;
  var n = view.querySelector(fk);
  if (n) {
    n.focus({ preventScroll: true });
    if (n.dataset.act === "search" && ae && typeof ae.selectionStart === "number") { try { n.setSelectionRange(ae.selectionStart, ae.selectionEnd); } catch (e) { /* 무시 */ } }
  }
}
setRenderer(draw);

window.addEventListener("hashchange", function () { if (redirectLegacy()) return; state.ui.confirmDel = null; hideToast(); render(); window.scrollTo(0, 0); });

/* ---------- 이벤트 ---------- */
view.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act]");
  if (!el) return;
  if (el.dataset.act === "wk") { if (workoutAct(el)) render(); return; }
  var act = el.dataset.act, r = currentRoute(), b = r.name === "book" ? state.books.get(r.id) : null;
  switch (act) {
    case "login":
      state.authMsg = "";
      store.signIn().catch(function (err) {
        state.phase = "error"; state.authMsg = (err && err.code === "auth/popup-closed-by-user") ? "로그인 창이 닫혔습니다." : ((err && err.message) || "로그인하지 못했습니다.");
        render();
      });
      break;
    case "trial": enterApp("local"); break;
    case "logout": store.signOut(); break;
    case "catadd": addFromCatalog(el.dataset.id); break;
    case "upto":
      if (b) { var ui2 = +el.dataset.i; mutate(b, "여기까지 읽음 처리", function () { completeThrough(b, ui2); }); }
      break;
    case "nextdone":
      if (b) { var ni = nextLeafIndex(b); if (ni >= 0) mutate(b, "읽음: " + b.chapters[ni].t, function () { toggle(b, ni); }); }
      break;
    case "toggle":
      if (b) {
        var ti = +el.dataset.i, tc = b.chapters[ti];
        var lbl = isGroup(b.chapters, ti) ? "묶음 전체 변경: " + tc.t : (tc.done ? "읽음 취소: " : "읽음: ") + tc.t;
        mutate(b, lbl, function () { toggle(b, ti); });
      }
      break;
    case "fold":
      if (b) {
        var fk2 = b.id + ":" + el.dataset.i;
        if (state.ui.folded.has(fk2)) state.ui.folded.delete(fk2); else state.ui.folded.add(fk2);
        saveFolded(); render();
      }
      break;
    case "memo":
      if (b) {
        var k = b.id + ":" + el.dataset.i;
        if (state.ui.openMemo.has(k)) state.ui.openMemo.delete(k); else state.ui.openMemo.add(k);
        render();
        if (state.ui.openMemo.has(k)) { var ta = view.querySelector('textarea[data-act="memotext"][data-i="' + el.dataset.i + '"]'); if (ta) ta.focus(); }
      }
      break;
    case "filter": state.ui.filter = el.dataset.v; render(); break;
    case "remaining": state.ui.onlyRemaining = !state.ui.onlyRemaining; render(); break;
    case "del": if (b) { state.ui.confirmDel = b.id; render(); } break;
    case "delno": state.ui.confirmDel = null; render(); break;
    case "delyes":
      if (b) { state.ui.confirmDel = null; removeBook(b.id); location.hash = "/reading/library"; }
      break;
  }
});
view.addEventListener("input", function (e) {
  if (e.target.dataset && e.target.dataset.act === "search") { state.ui.q = e.target.value; render(); }
});
view.addEventListener("change", function (e) {
  var el = e.target, act = el.dataset && el.dataset.act;
  if (!act) return;
  var r = currentRoute();
  if (r.name !== "book") return;
  var b = state.books.get(r.id);
  if (!b) return;
  switch (act) {
    case "start": b.startDate = el.value || null; persist(b); render(); break;
    case "end": b.endDate = calcMetrics(b).status === "done" ? (el.value || null) : null; b.endAuto = false; persist(b); render(); break;
    case "goal": b.goalDate = el.value || null; persist(b); render(); break;
    case "chdate": b.chapters[+el.dataset.i].done = el.value || null; autoDates(b); persist(b); render(); break;
    case "memotext": b.chapters[+el.dataset.i].memo = el.value.trim(); persist(b); refreshMemos(b); break;
    case "rating": b.rating = parseInt(el.value, 10) || 0; persist(b); break;
    case "note": b.note = el.value; persist(b); break;
  }
});

redirectLegacy();
initPrefs();
initUndo();
initSync();
render();
loadCatalog();
store.start(onAuth);

// 화면 파일을 기기에 보관해 오프라인에서도 앱이 열리게 합니다(https 또는 localhost 에서만 동작).
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
