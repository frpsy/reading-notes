// 책갈피 진입점: 화면 그리기, 이벤트 연결, 시작. 나머지 기능은 모듈별 파일에 있습니다.
import * as store from "./store.js?v=38";
import { state } from "./state.js?v=38";
import { setRenderer, render } from "./bus.js?v=38";
import { initPrefs, saveFolded } from "./prefs.js?v=38";
import { initUndo, mutate, hideToast, offerUndo } from "./undo.js?v=38";
import { initSync, persist, removeBook, memoStatusText } from "./sync.js?v=38";
import { onAuth } from "./session.js?v=38";
import { currentRoute } from "./router.js?v=38";
import { loadCatalog, addFromCatalog } from "./catalog.js?v=38";
import { loginView, loadingView } from "./view-common.js?v=38";
import { libraryView } from "./view-library.js?v=38";
import { bookView, refreshMemos, fillMemos } from "./view-book.js?v=38";
import { yearView } from "./view-year.js?v=38";
import { patchView, resetPatch } from "./patch.js?v=38";
import { formView, bindForm } from "./view-form.js?v=38";
import { metrics as calcMetrics, nextLeafIndex, isGroup, completeThrough, toggleChapter as toggle, autoDates, friendlyError } from "./core.js?v=38";

var view = document.getElementById("view");

function draw() {
  document.getElementById("sync").hidden = state.phase !== "app";
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
  if (state.phase === "app" && state.ready && r.name === "book") patchView(view, html, "book:" + r.id);
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
  state.ui.confirmDel = null; hideToast(); render();
  if (applyJump()) return;
  var r = currentRoute(), keep = r.name === "library" || r.name === "year";
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
    if (row && !e.target.closest("button, a, summary, details, input, textarea, label")) el = row.querySelector('.chk[data-act="toggle"]');
  }
  if (!el) return;
  var act = el.dataset.act, r = currentRoute(), b = r.name === "book" ? state.books.get(r.id) : null;
  switch (act) {
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
    case "nextdone":
      if (b) { var ni = nextLeafIndex(b); if (ni >= 0) mutate(b, function () { toggle(b, ni); }); }
      break;
    case "toggle":
      if (b) {
        var ti = +el.dataset.i, tc = b.chapters[ti];
        mutate(b, function () { toggle(b, ti); });
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
          var orig = state.ui.memoOrig.get(k) || ""; state.ui.memoOrig.delete(k);
          if (orig && !ch0.memo) {
            // 메모를 모두 지우면 바로 저장되므로, 잠시 되돌릴 기회를 줍니다.
            var mi = +el.dataset.i, bid = b.id;
            offerUndo("메모를 지웠습니다", function () {
              var bb = state.books.get(bid); if (!bb || !bb.chapters[mi] || bb.chapters[mi].memo) return;
              bb.chapters[mi].memo = orig; persist(bb); render();
            });
          }
        } else { state.ui.openMemo.add(k); state.ui.memoOrig.set(k, b.chapters[+el.dataset.i].memo || ""); }
        render();
        if (state.ui.openMemo.has(k)) {
          var ta = view.querySelector('textarea[data-act="memotext"][data-i="' + el.dataset.i + '"]');
          if (ta) {
            growMemo(ta, true); ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
            // 키보드가 올라온 뒤에도 입력란이 보이도록 화면 가운데로
            setTimeout(function () { if (document.activeElement === ta) ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
          }
        }
      }
      break;
    case "jump":
      // 메모 검색 결과·이어 읽기 '위치': 해당 책을 열고 그 챕터로 스크롤합니다(주소는 책 화면 그대로).
      e.preventDefault();
      state.ui.jump = { id: el.dataset.id, i: +el.dataset.i };
      if (location.hash !== "#book-" + el.dataset.id) location.hash = "book-" + el.dataset.id; else applyJump();
      break;
    case "memodel":
      // 메모 내용을 지우고 입력창을 닫습니다. 실수는 아래 '되돌리기'로 복구합니다.
      if (b) {
        var di = +el.dataset.i, dk = b.id + ":" + di, dch = b.chapters[di];
        var dta = view.querySelector('textarea[data-act="memotext"][data-i="' + di + '"]');
        var before = (dta ? dta.value.trim() : "") || dch.memo || state.ui.memoOrig.get(dk) || "";
        dch.memo = ""; persist(b);
        state.ui.openMemo.delete(dk); state.ui.memoOrig.delete(dk);
        if (before) {
          var dbid = b.id;
          offerUndo("메모를 삭제했습니다", function () {
            var bb = state.books.get(dbid); if (!bb || !bb.chapters[di] || bb.chapters[di].memo) return;
            bb.chapters[di].memo = before; persist(bb); render();
          });
        }
        render();
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
// 메모 입력란은 글 길이에 맞게 늘어난다(화면 높이의 60%까지)
function growMemo(ta, force) {
  // 글이 넘칠 때만 늘립니다(입력마다 높이를 다시 재면 큰 책에서 느려짐). 열 때와 글이 크게 줄었을 때만 다시 잽니다.
  var len = ta.value.length, last = +(ta.dataset.len || 0);
  ta.dataset.len = len;
  if (!force && len >= last && ta.scrollHeight <= ta.clientHeight) return;
  if (!force && len < last && last - len < 200) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, Math.round(window.innerHeight * 0.6)) + 'px';
}
view.addEventListener("input", function (e) {
  if (e.target.dataset && e.target.dataset.act === "search") { state.ui.q = e.target.value; render(); }
  var el = e.target, act = el.dataset && el.dataset.act;
  if (act !== 'note' && act !== 'memotext') return;
  var r = currentRoute(), b = r.name === 'book' ? state.books.get(r.id) : null;
  if (!b) return;
  if (act === 'note') { b.note = el.value; persist(b); return; }
  b.chapters[+el.dataset.i].memo = el.value.trim(); refreshMemos(b);
  growMemo(el);
  // 문구는 실제 기기 보관 결과를 따릅니다. 서버 저장 여부는 상단 상태 표시가 알려 줍니다.
  var kept = persist(b);
  var row = el.closest('.memo-row'), cnt = row && row.querySelector('[data-memo-count]'), sv = row && row.querySelector('[data-memo-saved]');
  if (cnt) cnt.textContent = Array.from(el.value).length + '/2000';
  if (sv) { sv.dataset.touched = '1'; sv.classList.toggle('bad', !kept); sv.textContent = kept ? memoStatusText(document.getElementById('sync').dataset.state) : '보관하지 못했습니다 · 상단 안내를 확인해 주세요'; }
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
