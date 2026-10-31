// 책 추가·정보 수정 화면: 목차 붙여넣기, 미리보기, 준비된 책 불러오기.
import { state } from "./state.js?v=25";
import { esc } from "./util.js?v=25";
import { parseToc, tocText, todayStr, leavesOf, isGroup, parseCatalogText, newId, autoDates, validateBook, carryOver } from "./core.js?v=25";
import { persist } from "./sync.js?v=25";
import { notFound } from "./view-common.js?v=25";

function previewHtml(items) {
  if (!items.length) return '<p class="muted">목차를 붙여 넣으면 인식 결과가 여기에 표시됩니다.</p>';
  var leaves = leavesOf(items).length, groups = items.length - leaves, pages = items.filter(function (c) { return c.p != null }).length;
  var rows = items.slice(0, 14).map(function (c, i) {
    return '<li style="--lv:' + c.lv + '">' + (isGroup(items, i) ? '<b>' + esc(c.t) + '</b>' : esc(c.t)) + (c.p != null ? ' <span class="pg">p.' + c.p + '</span>' : '') + '</li>';
  }).join('');
  return '<p>읽을 챕터 <b>' + leaves + '</b>개 · 묶음 <b>' + groups + '</b>개' + (pages ? ' · 시작 페이지 ' + pages + '개 인식' : '') + '</p><ul class="pv-list">' + rows + '</ul>' +
    (items.length > 14 ? '<p class="muted" style="margin-top:8px">외 ' + (items.length - 14) + '개 항목</p>' : '');
}

export function formView(id) {
  var b = id ? state.books.get(id) : null;
  if (id && !b) return notFound();
  var v = { title: b ? b.title : '', author: b ? (b.author || '') : '', pages: b && b.totalPages ? b.totalPages : '', start: b ? (b.startDate || '') : todayStr(), goal: b ? (b.goalDate || '') : '', toc: b ? tocText(b) : '' };
  return '<a class="back" href="' + (b ? '#book-' + esc(b.id) : '#library') + '">← ' + (b ? '책으로 돌아가기' : '서재') + '</a>' +
    '<h1 class="page">' + (b ? '정보·목차 수정' : '책 추가') + '</h1>' +
    '<form class="form" id="bookForm" novalidate>' +
      (b ? '' : '<label class="fld"><span>준비된 책에서 불러오기 (선택)</span><select id="f-cat"><option value="">직접 입력</option></select></label>') +
      '<label class="fld"><span>제목</span><input id="f-title" type="text" maxlength="200" value="' + esc(v.title) + '" autocomplete="off"></label>' +
      '<div class="row2">' +
        '<label class="fld"><span>저자 (선택)</span><input id="f-author" type="text" maxlength="100" value="' + esc(v.author) + '" autocomplete="off"></label>' +
        '<label class="fld"><span>총 쪽수 (선택)</span><input id="f-pages" type="number" inputmode="numeric" min="1" value="' + esc(v.pages) + '"></label>' +
      '</div>' +
      '<div class="row2">' +
        '<label class="fld"><span>읽기 시작일 (선택)</span><input id="f-start" type="date" value="' + esc(v.start) + '"></label>' +
        '<label class="fld"><span>목표 완독일 (선택)</span><input id="f-goal" type="date" value="' + esc(v.goal) + '"></label>' +
      '</div>' +
      '<label class="fld"><span>목차</span><textarea id="f-toc" spellcheck="false">' + esc(v.toc) + '</textarea></label>' +
      '<p class="hint" style="margin:-8px 0 0">한 줄에 항목 하나. 공백 두 칸 또는 탭으로 들여쓰면 하위 항목이 되고, 1.1 같은 번호도 단계로 인식합니다. 줄 끝에 "........ 123"처럼 쓰면 시작 쪽수로 인식합니다.</p>' +
      '<div class="pv" id="toc-preview" aria-live="polite"></div>' +
      '<div class="lost-warn" id="f-lost" role="alert" hidden></div>' +
      '<p class="err" id="f-err" role="alert" hidden></p>' +
      '<div class="form-actions"><button class="btn primary" type="submit" id="f-submit">' + (b ? '저장' : '책 추가') + '</button><a class="btn" href="' + (b ? '#book-' + esc(b.id) : '#library') + '">취소</a></div>' +
    '</form>';
}

export function bindForm(id) {
  var ta = document.getElementById('f-toc'), out = document.getElementById('toc-preview');
  ta.placeholder = '1부. 시작하기 ........ 9\n  1장. 왜 읽는가 ........ 11\n  2장. 무엇을 읽는가 ........ 27\n2부. 깊이 읽기 ........ 45\n  3장. 질문하며 읽기 ........ 47';
  function upd() { out.innerHTML = previewHtml(parseToc(ta.value)) }
  var cat = document.getElementById('f-cat');
  if (cat) {
    fetch('catalog/index.json').then(function (r) { return r.json() }).then(function (list) {
      list.forEach(function (x) { var o = document.createElement('option'); o.value = x.file; o.textContent = x.label; cat.appendChild(o) });
    }).catch(function () {
      var e = document.getElementById('f-err');
      if (e) { e.textContent = '준비된 책 목록을 불러오지 못했습니다. 목차를 직접 붙여넣어 주세요.'; e.hidden = false }
    });
    cat.addEventListener('change', function () {
      if (!cat.value) return;
      fetch('catalog/' + encodeURIComponent(cat.value)).then(function (r) { return r.text() }).then(function (t) {
        var c = parseCatalogText(t);
        document.getElementById('f-title').value = c.title;
        document.getElementById('f-author').value = c.author;
        document.getElementById('f-pages').value = c.totalPages || '';
        ta.value = c.toc; upd();
      }).catch(function () { showErr('목록을 불러오지 못했습니다.') });
    });
  }
  var form = document.getElementById('bookForm'), err = document.getElementById('f-err');
  var lostBox = document.getElementById('f-lost'), submitBtn = document.getElementById('f-submit'), lostAck = null;
  function showErr(msg) { err.textContent = msg; err.hidden = false }
  // 목차를 다시 고치면 경고 확인을 처음부터 다시 받습니다.
  function resetLost() { lostAck = null; lostBox.hidden = true; lostBox.textContent = ''; submitBtn.textContent = id ? '저장' : '책 추가'; submitBtn.classList.remove('danger'); }
  ta.addEventListener('input', function () { upd(); resetLost(); }); upd();
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var title = document.getElementById('f-title').value.trim();
    var items = parseToc(ta.value);
    if (!title) { showErr('제목을 입력해 주세요.'); return }
    if (!items.length) { showErr('목차를 한 줄 이상 입력해 주세요.'); return }
    var pages = parseInt(document.getElementById('f-pages').value, 10);
    var b = id ? structuredClone(state.books.get(id)) : null, isNew = !b;
    if (isNew) b = { id: newId(), createdAt: Date.now(), rating: 0, note: '', endDate: null, endAuto: false };
    else {
      var moved = carryOver(b.chapters, items);
      items = moved.items;
      if (moved.lost.length) {
        // 제목이 바뀌거나 지운 챕터의 완료일·메모는 옮길 곳이 없어 사라지므로, 저장 전에 한 번 더 확인받습니다.
        var sig = JSON.stringify(moved.lost.map(function (x) { return x.t }));
        if (lostAck !== sig) {
          lostAck = sig;
          var names = moved.lost.slice(0, 5).map(function (x) { return '<li>' + esc(x.t) + ' <span class="muted">(' + [x.done ? '완료일' : '', x.memo ? '메모' : ''].filter(Boolean).join('·') + ')</span></li>' }).join('');
          lostBox.innerHTML = '<p><b>목차에서 사라지는 챕터 ' + moved.lost.length + '개의 기록이 함께 삭제됩니다.</b> 챕터 제목을 바꾸면 기록을 옮기지 못합니다. 기록을 남기려면 원래 제목으로 두세요.</p><ul>' + names + '</ul>' + (moved.lost.length > 5 ? '<p class="muted">외 ' + (moved.lost.length - 5) + '개</p>' : '');
          lostBox.hidden = false; err.hidden = true;
          submitBtn.textContent = '기록 삭제하고 저장'; submitBtn.classList.add('danger');
          lostBox.scrollIntoView({ block: 'center' });
          return;
        }
      }
    }
    b.title = title;
    b.author = document.getElementById('f-author').value.trim();
    b.totalPages = pages > 0 ? pages : null;
    b.startDate = document.getElementById('f-start').value || null;
    b.goalDate = document.getElementById('f-goal').value || null;
    b.chapters = items;
    autoDates(b);
    var error = validateBook(b);
    if (error) { showErr(error); return; }
    state.books.set(b.id, b);
    persist(b);
    location.hash = 'book-' + b.id;
  });
}
