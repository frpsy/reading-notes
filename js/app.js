// 책갈피 진입점: 화면 그리기, 이벤트 연결, 시작. 나머지 기능은 모듈별 파일에 있습니다.
import * as store from "./store.js?v=64";
import { state } from "./state.js?v=64";
import { setRenderer, render } from "./bus.js?v=64";
import { initPrefs, saveFolded } from "./prefs.js?v=64";
import { initUndo, mutate, hideToast } from "./undo.js?v=64";
import { initSync, removeBook } from "./sync.js?v=64";
import { onAuth } from "./session.js?v=64";
import { currentRoute } from "./router.js?v=64";
import { loadCatalog, addFromCatalog } from "./catalog.js?v=64";
import { loginView, loadingView } from "./view-common.js?v=64";
import { libraryView, activityView } from "./view-library.js?v=64";
import { settingsView, catalogView } from "./view-settings.js?v=64";
import { bookView, fillMemos } from "./view-book.js?v=64";
import { yearView } from "./view-year.js?v=64";
import { patchView, resetPatch } from "./patch.js?v=64";
import { formView, bindForm } from "./view-form.js?v=64";
import { nextLeafIndex, completeThrough, toggleChapter as toggle, friendlyError } from "./core.js?v=64";

import { recordsView, preserve, restoreTrash, exportRecords } from "./records.js?v=64";
import { toggleMemoEditor, deleteMemo, foldAll, toggleFold, setGoalPreset, rememberNote, saveTypedText, applyFieldChange } from "./actions.js?v=64";

var view = document.getElementById("view");

function draw() {
  const syncButton = document.getElementById("sync");
  syncButton.hidden = state.phase !== "app" || syncButton.dataset.quiet === "true";
  document.getElementById("settings-link").hidden = state.phase !== "app";
  var ae = document.activeElement, fk = null;
  if (ae && ae !== document.body && ae.dataset && ae.dataset.act) {
    // 같은 동작의 버튼이 여럿이면(필터 탭 등) 값까지 맞춰야 누른 버튼으로 포커스가 돌아갑니다.
    fk = '[data-act="' + ae.dataset.act + '"]' + ["i", "v", "id", "key", "weeks"].map(function (k) { return ae.dataset[k] != null ? '[data-' + k + '="' + CSS.escape(ae.dataset[k]) + '"]' : ""; }).join("");
  }
  var disclosures = new Map(Array.from(view.querySelectorAll('details[data-disclosure]')).map(function (el) { return [el.dataset.disclosure, el.open]; }));
  var r = currentRoute(), html;
  if (state.phase === "boot") html = loadingView();
  else if (state.phase !== "app") html = loginView();
  else if (!state.ready) html = loadingView();
  else if (r.name === "library") html = libraryView();
  else if (r.name === "book") html = bookView(r.id);
  else if (r.name === "records") html = recordsView();
  else if (r.name === "settings") html = settingsView();
  else if (r.name === "catalog") html = catalogView();
  else if (r.name === "activity") html = activityView();
  else if (r.name === "year") html = yearView(r.year);
  else html = formView(r.id);
  if (state.phase === "app" && state.ready && (r.name === "book" || r.name === "library")) patchView(view, html, r.name === "book" ? "book:" + r.id : "library");
  else { resetPatch(); view.innerHTML = html; }
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

// 화면별 스크롤 위치: 링크를 누르는 순간(이동하기 전)에 떠나는 화면의 위치를 저장합니다.
// 이동이 시작되면 브라우저가 스크롤을 0으로 되돌리므로 스크롤 이벤트나 hashchange 시점에는 이미 늦습니다.
var scrollPos = {};
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
document.addEventListener("click", function (e) {
  if (e.target.closest && e.target.closest("a[href^='#']")) scrollPos[location.hash || "#library"] = window.scrollY;
}, true);
function applyJump() {
  var j = state.ui.jump, r = currentRoute();
  if (!j || r.name !== "book" || r.id !== j.id) return false;
  state.ui.jump = null;
  if (j.i < 0) { var note = document.querySelector(".note-panel"); if (note) note.scrollIntoView({ block: "start" }); return true; }
  var b = state.books.get(j.id), changed = false;
  if (b && state.ui.onlyRemaining && b.chapters[j.i] && b.chapters[j.i].done) { state.ui.onlyRemaining = false; changed = true; }
  if (b && b.chapters[j.i]) {
    // 접어 둔 묶음 안의 챕터라면 그 묶음들을 펼칩니다.
    for (var g = j.i - 1, lv = b.chapters[j.i].lv; g >= 0 && lv > 0; g--) {
      if (b.chapters[g].lv < lv) { lv = b.chapters[g].lv; if (state.ui.folded.delete(b.id + ":" + g)) changed = true; }
    }
  }
  if (changed) { saveFolded(); render(); }
  var li = document.getElementById("ch-" + j.i);
  if (!li) return false;
  li.scrollIntoView({ block: "center" });
  li.classList.add("flash"); setTimeout(function () { li.classList.remove("flash"); }, 1600);
  var pv = li.querySelector(".memo-preview"); if (pv) pv.open = true;
  return true;
}
window.addEventListener("hashchange", function () {
  state.ui.confirmDel = null; state.ui.confirmReread = null; hideToast(); render();
  if (applyJump()) return;
  var r = currentRoute(), keep = r.name === "library" || r.name === "year" || r.name === "settings" || r.name === "activity" || r.name === "catalog";
  window.scrollTo(0, keep ? (scrollPos[location.hash || "#library"] || 0) : 0);
});

/* ---------- 이벤트 ---------- */
document.addEventListener('click', function (e) {
  if (!e.target.isConnected) return; // 다시 그리기 전의 클릭 대상으로 새 메뉴를 닫지 않습니다.
  view.querySelectorAll('.book-menu[open], .chapter-options[open]').forEach(function (menu) { if (!menu.contains(e.target)) menu.open = false; });
});
view.addEventListener('keydown', function (e) {
  var menu = e.target.closest('.book-menu[open], .chapter-options[open]');
  if (e.key === 'Escape' && menu) { menu.open = false; menu.querySelector('summary').focus(); }
});
view.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act]");
  if (!el) {
    // 챕터 줄의 빈 곳(쪽수 줄·여백)을 눌러도 체크됩니다. 버튼·링크·메모·옵션은 제외합니다.
    var row = e.target.closest(".chapters > li.ch.leaf");
    if (row && !e.target.closest("button, a, summary, details, input, textarea, label, .ch-memo")) el = row.querySelector('.chk[data-act="toggle"]');
  }
  if (!el) return;
  var act = el.dataset.act, r = currentRoute(), b = r.name === "book" ? state.books.get(r.id) : null;
  switch (act) {
    case "export-json": exportRecords('json'); break;
    case "export-md": exportRecords('md'); break;
    case "trash-restore": restoreTrash(el.dataset.key); break;
    case "login":
      state.authMsg = "";
      store.signIn().catch(function (err) {
        state.phase = "error"; state.authMsg = friendlyError(err, "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        render();
      });
      break;
    case "logout": store.signOut(); break;
    case "catadd": addFromCatalog(el.dataset.id); break;
    case "upto":
      if (b) { var ui2 = +el.dataset.i; mutate(b, function () { completeThrough(b, ui2); }); }
      break;
    case "goal-preset":
      if (b) setGoalPreset(b, el.dataset.weeks === "2" ? 2 : el.dataset.weeks === "4" ? 4 : 0);
      break;
    case "nextdone":
      if (b) { var ni = nextLeafIndex(b); if (ni >= 0) mutate(b, function () { toggle(b, ni); }); }
      break;
    case "toggle":
      if (b) {
        var ti = +el.dataset.i;
        mutate(b, function () { toggle(b, ti); });
      }
      break;
    case "foldall": if (b) foldAll(b); break;
    case "fold": if (b) toggleFold(b, +el.dataset.i); break;
    case "edit-note": {
      // 독서 메모: 미리보기 펼치기 → 본문을 다시 눌러 편집 (별도 연필 아이콘 없음).
      if (!b) break;
      const editor = view.querySelector('.note-editor');
      if (!editor) break;
      editor.open = true;
      const noteInput = editor.querySelector('#d-note');
      if (noteInput) noteInput.focus({preventScroll:true});
      break;
    }
    case "memo":
      if (b) {
        // 메모 편집 화면으로 전환하기 전에 옵션 팝오버를 닫습니다.
        // 열린 팝오버가 다시 그린 메모를 덮어 터치와 E2E 클릭을 가로막지 않도록 합니다.
        var chapterMenu = el.closest(".chapter-options");
        if (chapterMenu) chapterMenu.open = false;
        toggleMemoEditor(b, +el.dataset.i, view);
      }
      break;
    case "jump":
      // 메모 검색 결과·이어 읽기 '위치': 해당 책을 열고 그 챕터로 스크롤합니다(주소는 책 화면 그대로).
      e.preventDefault();
      state.ui.jump = { id: el.dataset.id, i: +el.dataset.i };
      if (location.hash !== "#book-" + el.dataset.id) location.hash = "book-" + el.dataset.id; else applyJump();
      break;
    case "memodel":
      // 메모 내용을 지우고 입력창을 닫습니다. 실수는 '되돌리기'로 복구합니다.
      if (b) deleteMemo(b, +el.dataset.i, view);
      break;
    case "reset-search":
      state.ui.q = ''; state.ui.filter = 'all'; render();
      view.querySelector('[data-act="search"]')?.focus({ preventScroll: true });
      break;
    case "filter": state.ui.filter = el.dataset.v; render(); break;
    case "remaining": state.ui.onlyRemaining = !state.ui.onlyRemaining; render(); break;
    case "del": if (b) { state.ui.confirmDel = b.id; render(); } break;
    case "delno": state.ui.confirmDel = null; render(); break;
    case "reread": if (b && b.chapters.length) { state.ui.confirmReread = b.id; render(); } break;
    case "rereadno": state.ui.confirmReread = null; render(); break;
    case "rereadyes":
      // 지금의 완독 기록은 휴지통에 먼저 보관한 뒤 진도를 처음으로 되돌립니다.
      if (b && preserve(b)) {
        state.ui.confirmReread = null;
        mutate(b, function () {
          b.chapters.forEach(function (c) { c.done = null; });
          b.startDate = null; b.endDate = null; b.endAuto = false; b.goalDate = null;
        });
      }
      break;
    case "delyes":
      if (b && preserve(b) && removeBook(b.id)) { state.ui.confirmDel = null; location.hash = "library"; }
      break;
  }
});
view.addEventListener('focusin', function (e) {
  if (e.target.dataset.act === 'note') rememberNote(e.target);
});
view.addEventListener("input", function (e) {
  if (e.target.dataset && e.target.dataset.act === "search") { state.ui.q = e.target.value; render(); }
  var el = e.target, act = el.dataset && el.dataset.act;
  if (act !== 'note' && act !== 'memotext') return;
  var r = currentRoute(), b = r.name === 'book' ? state.books.get(r.id) : null;
  if (!b) return;
  saveTypedText(b, el, act);
});
// 접힌 목록(메모 모아보기)은 펼칠 때 채웁니다. toggle 은 버블링되지 않아 캡처로 받습니다.
view.addEventListener("toggle", function (e) {
  var d = e.target;
  if (!d.open || !d.matches || !d.matches("details.memos[data-lazy]")) return;
  var r = currentRoute(), b = r.name === "book" ? state.books.get(r.id) : null;
  if (b) fillMemos(d, b);
}, true);
view.addEventListener("change", function (e) {
  var el = e.target, act = el.dataset && el.dataset.act;
  if (!act) return;
  var r = currentRoute();
  if (r.name !== "book") return;
  var b = state.books.get(r.id);
  if (!b) return;
  applyFieldChange(b, act, el);
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
