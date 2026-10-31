// 책갈피 진입점: 화면 그리기, 이벤트 연결, 시작. 나머지 기능은 모듈별 파일에 있습니다.
import * as store from "./store.js?v=22";
import { state } from "./state.js?v=22";
import { setRenderer, render } from "./bus.js?v=22";
import { initPrefs, saveFolded } from "./prefs.js?v=22";
import { initUndo, mutate, hideToast } from "./undo.js?v=22";
import { initSync, persist, removeBook } from "./sync.js?v=22";
import { onAuth } from "./session.js?v=22";
import { currentRoute } from "./router.js?v=22";
import { loadCatalog, addFromCatalog } from "./catalog.js?v=22";
import { loginView, loadingView } from "./view-common.js?v=22";
import { libraryView } from "./view-library.js?v=22";
import { bookView, refreshMemos } from "./view-book.js?v=22";
import { yearView } from "./view-year.js?v=22";
import { formView, bindForm } from "./view-form.js?v=22";
import { metrics as calcMetrics, nextLeafIndex, isGroup, completeThrough, toggleChapter as toggle, autoDates } from "./core.js?v=22";

var view = document.getElementById("view");

function draw() {
  var ae = document.activeElement, fk = null;
  if (ae && ae !== document.body && ae.dataset && ae.dataset.act) {
    fk = '[data-act="' + ae.dataset.act + '"]' + (ae.dataset.i != null ? '[data-i="' + ae.dataset.i + '"]' : "");
  }
  var disclosures = new Map(Array.from(view.querySelectorAll('details[data-disclosure]')).map(function (el) { return [el.dataset.disclosure, el.open]; }));
  var r = currentRoute(), html;
  if (state.phase === "boot") html = loadingView();
  else if (state.phase !== "app") html = loginView();
  else if (!state.ready) html = loadingView();
  else if (r.name === "library") html = libraryView();
  else if (r.name === "book") html = bookView(r.id);
  else if (r.name === "year") html = yearView(r.year);
  else html = formView(r.id);
  view.innerHTML = html;
  view.querySelectorAll('details[data-disclosure]').forEach(function (el) { if (disclosures.has(el.dataset.disclosure)) el.open = disclosures.get(el.dataset.disclosure); });
  if (state.phase === "app" && state.ready && r.name === "form" && (!r.id || state.books.has(r.id))) bindForm(r.id);
  if (fk) {
    var n = view.querySelector(fk);
    if (n) {
      n.focus({ preventScroll: true });
      if (n.dataset.act === "search" && typeof ae.selectionStart === "number") { try { n.setSelectionRange(ae.selectionStart, ae.selectionEnd); } catch (e) { /* 무시 */ } }
    }
  }
}
setRenderer(draw);

window.addEventListener("hashchange", function () { state.ui.confirmDel = null; hideToast(); render(); window.scrollTo(0, 0); });

/* ---------- 이벤트 ---------- */
document.addEventListener('click', function (e) {
  if (!e.target.isConnected) return; // 다시 그리기 전의 클릭 대상으로 새 메뉴를 닫지 않습니다.
  view.querySelectorAll('.book-menu[open]').forEach(function (menu) { if (!menu.contains(e.target)) menu.open = false; });
});
view.addEventListener('keydown', function (e) {
  var menu = e.target.closest('.book-menu[open]');
  if (e.key === 'Escape' && menu) { menu.open = false; menu.querySelector('summary').focus(); }
});
view.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act]");
  if (!el) return;
  var act = el.dataset.act, r = currentRoute(), b = r.name === "book" ? state.books.get(r.id) : null;
  switch (act) {
    case "login":
      state.authMsg = "";
      store.signIn().catch(function (err) {
        state.phase = "error"; state.authMsg = (err && err.code === "auth/popup-closed-by-user") ? "로그인 창이 닫혔습니다." : ((err && err.message) || "로그인하지 못했습니다.");
        render();
      });
      break;
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
        if (state.ui.openMemo.has(k)) {
          // 열려 있으면 '메모 저장': 입력한 글을 저장하고 자동으로 닫습니다.
          var ta0 = view.querySelector('textarea[data-act="memotext"][data-i="' + el.dataset.i + '"]'), ch0 = b.chapters[+el.dataset.i];
          if (ta0 && (ch0.memo || "") !== ta0.value.trim()) { ch0.memo = ta0.value.trim(); persist(b); }
          state.ui.openMemo.delete(k);
        } else state.ui.openMemo.add(k);
        render();
        if (state.ui.openMemo.has(k)) { var ta = view.querySelector('textarea[data-act="memotext"][data-i="' + el.dataset.i + '"]'); if (ta) ta.focus(); }
      }
      break;
    case "filter": state.ui.filter = el.dataset.v; render(); break;
    case "remaining": state.ui.onlyRemaining = !state.ui.onlyRemaining; render(); break;
    case "del": if (b) { state.ui.confirmDel = b.id; render(); } break;
    case "delno": state.ui.confirmDel = null; render(); break;
    case "delyes":
      if (b) { state.ui.confirmDel = null; removeBook(b.id); location.hash = "library"; }
      break;
  }
});
view.addEventListener("input", function (e) {
  if (e.target.dataset && e.target.dataset.act === "search") { state.ui.q = e.target.value; render(); }
  var el = e.target, act = el.dataset && el.dataset.act;
  if (act !== 'note' && act !== 'memotext') return;
  var r = currentRoute(), b = r.name === 'book' ? state.books.get(r.id) : null;
  if (!b) return;
  if (act === 'note') b.note = el.value;
  else { b.chapters[+el.dataset.i].memo = el.value.trim(); refreshMemos(b); }
  persist(b);
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
    case "memotext": break; // input에서 기기에 즉시 보관
    case "rating": b.rating = parseInt(el.value, 10) || 0; persist(b); break;
    case "note": break; // input에서 기기에 즉시 보관
  }
});

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
