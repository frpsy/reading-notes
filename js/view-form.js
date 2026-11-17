// 책 추가·정보 수정 화면: 준비된 책 담기(책 추가일 때), 목차 붙여넣기, 미리보기.
import { state } from "./state.js?v=70";
import { esc } from "./util.js?v=70";
import { parseToc, tocText, leavesOf, isGroup, newId, parseBookPaste, autoDates, validateBook, carryOver, findSimilarBook } from "./core.js?v=70";
import { persist } from "./sync.js?v=70";
import { notFound } from "./view-common.js?v=70";
import { catalogHtml, catalogCount } from "./catalog.js?v=70";

function previewHtml(items) {
  if (!items.length) return '<p class="muted">목차를 붙여 넣으면 인식 결과가 여기에 표시됩니다.</p>';
  var leaves = leavesOf(items).length, groups = items.length - leaves, pages = items.filter(function (c) { return c.p != null }).length;
  var rows = items.slice(0, 14).map(function (c, i) {
    return '<li style="--lv:' + c.lv + '">' + (isGroup(items, i) ? '<b>' + esc(c.t) + '</b>' : esc(c.t)) + (c.p != null ? ' <span class="pg">p.' + c.p + '</span>' : '') + '</li>';
  }).join('');
  return '<p>읽을 챕터 <b>' + leaves + '</b>개 · 묶음 <b>' + groups + '</b>개' + (pages ? ' · 시작 페이지 ' + pages + '개 인식' : '') + '</p><ul class="pv-list">' + rows + '</ul>' +
    (items.length > 14 ? '<p class="muted" style="margin-top:8px">외 ' + (items.length - 14) + '개 항목</p>' : '');
}

function addTabs(shelfFirst) {
  var n = catalogCount();
  return '<div class="add-tabs" role="tablist" aria-label="책 추가 방법">' +
    '<button type="button" role="tab" id="tab-paste" aria-controls="bookForm" aria-selected="' + !shelfFirst + '">붙여 넣기</button>' +
    '<button type="button" role="tab" id="tab-shelf" aria-controls="add-shelf" aria-selected="' + shelfFirst + '">준비된 책<em id="shelf-count">' + (n == null ? '' : n) + '</em></button></div>' +
    '<section class="add-shelf" id="add-shelf" role="tabpanel" aria-labelledby="tab-shelf"' + (shelfFirst ? '' : ' hidden') + '><p class="muted shelf-help">누르면 서재의 \'독서 예정\'에 바로 담깁니다.</p><div class="cat-list" id="cat-list">' + catalogHtml() + '</div></section>';
}

export function formView(id, from) {
  var b = id ? state.books.get(id) : null;
  if (id && !b) return notFound();
  var v = { title: b ? b.title : '', author: b ? (b.author || '') : '', pages: b && b.totalPages ? b.totalPages : '', start: b ? (b.startDate || '') : '', goal: b ? (b.goalDate || '') : '', toc: b ? tocText(b) : '' };
  return '<a class="back" href="' + (b ? '#book-' + esc(b.id) : '#library') + '">← ' + (b ? '책으로 돌아가기' : '서재') + '</a>' +
    '<h1 class="page">' + (b ? '정보·목차 수정' : '책 추가') + '</h1>' +
    // 책 추가: '붙여 넣기'와 '준비된 책' 두 가지 방법을 탭으로 나눠 한 번에 하나만 보여 줍니다.
    (b ? '' : addTabs(from === 'catalog')) +
    '<form class="form" id="bookForm" novalidate' + (b ? '' : ' role="tabpanel" aria-labelledby="tab-paste"' + (from === 'catalog' ? ' hidden' : '')) + '>' +
      (b ? '' : '<div class="paste-box"><label class="paste-label" for="f-paste">서점 페이지나 목차를 붙여 넣으세요</label>' +
        '<textarea id="f-paste" rows="4" spellcheck="false" aria-describedby="f-paste-hint" placeholder="YES24·교보문고·알라딘 책 페이지에서 전체 선택(⌘A 또는 Ctrl+A) → 복사 → 여기에 붙여넣기"></textarea>' +
        '<p class="hint" id="f-paste-hint">제목·저자·쪽수·목차를 알아서 채웁니다. 목차만 붙여 넣어도 됩니다.</p>' +
        '<p class="paste-result" id="paste-result" role="status" aria-live="polite" hidden></p></div>' +
        '<p class="form-h">확인하고 필요하면 고쳐 주세요</p>') +
      '<label class="fld"><span>제목</span><input id="f-title" aria-required="true" type="text" maxlength="200" value="' + esc(v.title) + '" autocomplete="off"></label>' +
      '<div class="row2">' +
        '<label class="fld"><span>저자 (선택)</span><input id="f-author" type="text" maxlength="100" value="' + esc(v.author) + '" autocomplete="off"></label>' +
        '<label class="fld"><span>총 쪽수 (선택)</span><input id="f-pages" type="number" inputmode="numeric" min="1" value="' + esc(v.pages) + '"></label>' +
      '</div>' +
      '<div class="row2">' +
        '<label class="fld"><span>읽기 시작일 (선택)</span><input id="f-start" type="date" value="' + esc(v.start) + '"></label>' +
        '<label class="fld"><span>목표 완독일 (선택)</span><input id="f-goal" type="date" value="' + esc(v.goal) + '"></label>' +
      '</div>' +
      '<label class="fld"><span>목차</span><textarea id="f-toc" aria-required="true" aria-describedby="f-toc-hint" spellcheck="false">' + esc(v.toc) + '</textarea></label>' +
      '<p class="hint toc-hint" id="f-toc-hint">한 줄에 챕터 하나씩 붙여 넣으세요. 쪽수는 없어도 괜찮습니다.</p><details class="toc-help"><summary>목차 입력 방법</summary><p>공백 두 칸 또는 탭으로 들여쓰면 하위 항목이 됩니다. 1.1 같은 번호도 단계로 인식합니다. 줄 끝에 "........ 123"처럼 쓰면 시작 쪽수를 함께 기록합니다.</p></details>' +
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
  // 탭: 화면을 다시 그리지 않고 보이기만 바꿔 입력 중인 내용을 지킵니다.
  var tabs = Array.from(document.querySelectorAll('.add-tabs [role="tab"]'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); var next = tabs[(tabs.indexOf(tab) + 1) % tabs.length]; selectTab(next); next.focus();
    });
  });
  function selectTab(tab) {
    tabs.forEach(function (t) { var on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; document.getElementById(t.getAttribute('aria-controls')).hidden = !on; });
  }
  tabs.forEach(function (t) { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
  // 붙여 넣은 서점 페이지·목차에서 찾은 값으로 칸을 채웁니다. 찾지 못한 칸은 그대로 둡니다.
  var paste = document.getElementById('f-paste'), result = document.getElementById('paste-result');
  function fill(r) {
    var set = function (elId, value) { if (value == null || value === '') return false; var el = document.getElementById(elId); el.value = value; el.removeAttribute('aria-invalid'); return true; };
    set('f-title', r.title); set('f-author', r.author); set('f-pages', r.pages);
    if (r.toc) { ta.value = r.toc; upd(); }
    dupAck = null; resetLost(); err.hidden = true;
  }
  function describe(r) {
    if (!r.found.length) return '책 정보나 목차를 찾지 못했습니다. 아래 칸에 직접 입력해 주세요.';
    var leaves = r.toc ? leavesOf(parseToc(r.toc)).length : 0;
    var got = [r.title && '제목', r.author && '저자', r.pages && '쪽수(' + r.pages + '쪽)', leaves && '목차(' + leaves + '챕터)'].filter(Boolean).join(' · ');
    var extra = [r.publisher, r.isbn && 'ISBN ' + r.isbn].filter(Boolean).join(' · ');
    return '채웠습니다: ' + got + (extra ? ' — ' + extra : '') + (r.toc ? '' : '. 목차는 찾지 못했습니다. 목차 부분도 복사해 붙여 넣어 주세요.');
  }
  var pasteTimer = null;
  if (paste) paste.addEventListener('input', function () {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(function () {
      if (!paste.value.trim()) { result.hidden = true; return; }
      var r = parseBookPaste(paste.value);
      fill(r);
      result.textContent = describe(r);
      result.classList.toggle('miss', !r.found.length);
      result.hidden = false;
      // 다 채웠으면 붙여 넣은 원문은 비워 화면을 깔끔하게 둡니다(입력 이벤트 없이 비우므로 결과 안내는 남습니다).
      if (r.found.length) paste.value = '';
    }, 120);
  });
  // 목차 칸에 페이지 전체를 붙여 넣어도 목차만 골라내고 나머지 칸을 채웁니다.
  ta.addEventListener('paste', function () {
    setTimeout(function () {
      var r = parseBookPaste(ta.value);
      if (r.found.some(function (k) { return k !== 'toc'; }) || /(^|\n)\s*목\s*차\s*(\n|$)/.test(ta.value)) { fill(r); if (result) { result.textContent = describe(r); result.classList.remove('miss'); result.hidden = false; } }
    }, 0);
  });
  var form = document.getElementById('bookForm'), err = document.getElementById('f-err');
  var lostBox = document.getElementById('f-lost'), submitBtn = document.getElementById('f-submit'), lostAck = null, dupAck = null, saved = false;
  function showErr(msg, field) {
    err.textContent = msg; err.hidden = false;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', field.id === 'f-toc' ? 'f-toc-hint f-err' : 'f-err');
      field.focus();
    }
  }
  form.addEventListener('input', function (e) {
    if (!e.target.matches('input,textarea,select')) return;
    // 이전 오류는 해당 입력을 고치기 시작하면 해제합니다.
    if (e.target.getAttribute('aria-invalid') === 'true') {
      e.target.removeAttribute('aria-invalid');
      if (e.target.id === 'f-toc') e.target.setAttribute('aria-describedby', 'f-toc-hint');
      else e.target.removeAttribute('aria-describedby');
      err.hidden = true;
    }
  });
  // 목차를 다시 고치면 경고 확인을 처음부터 다시 받습니다.
  function resetLost() { lostAck = null; dupAck = null; lostBox.hidden = true; lostBox.textContent = ''; submitBtn.textContent = id ? '저장' : '책 추가'; submitBtn.classList.remove('danger'); }
  ta.addEventListener('input', function () { upd(); resetLost(); }); upd();
  document.getElementById('f-title').addEventListener('input', resetLost);
  document.getElementById('f-author').addEventListener('input', function () { if (dupAck) resetLost(); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (saved) return; // 저장 뒤 화면이 바뀌기 전에 한 번 더 눌러도 같은 책을 또 만들지 않습니다.
    var title = document.getElementById('f-title').value.trim();
    var items = parseToc(ta.value);
    if (!title) { showErr('제목을 입력해 주세요.', document.getElementById('f-title')); return }
    if (!items.length) { showErr('목차를 한 줄 이상 입력해 주세요.', ta); return }
    var pages = parseInt(document.getElementById('f-pages').value, 10);
    var b = id ? state.books.get(id) : null, isNew = !id;
    // 수정 중 그 책이 목록에서 사라졌다면(다른 기기 삭제·동기화) 새 책으로 만들지 않고 알려 줍니다.
    if (id && !b) { showErr('수정하던 책을 찾을 수 없습니다. 서재로 돌아가 다시 열어 주세요.'); return; }
    if (b) b = structuredClone(b);
    if (isNew) {
      // 한 책은 서재에 한 권만 둡니다(읽는 중·독서 예정 어느 쪽이든). 이미 있으면 그 책으로 안내하고 추가하지 않습니다.
      var dup = findSimilarBook(Array.from(state.books.values()), title);
      if (dup) {
        lostBox.innerHTML = '<p><b>서재에 이미 같은 책이 있습니다.</b> <a href="#book-' + esc(dup.id) + '">' + esc(dup.title) + (dup.author ? ' · ' + esc(dup.author) : '') + '</a></p><p class="muted">한 책은 한 권만 둘 수 있습니다. 위 책을 열어 이어서 읽어 주세요.</p>';
        lostBox.hidden = false; err.hidden = true;
        return;
      }
      b = { id: newId(), createdAt: Date.now(), rating: 0, note: '', endDate: null, endAuto: false };
    }
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
    if (!persist(b)) {
      showErr('변경을 기기에 보관하지 못했습니다. 저장 공간을 확보한 뒤 다시 저장해 주세요.');
      return;
    }
    state.books.set(b.id, b);
    saved = true; submitBtn.disabled = true;
    location.hash = 'book-' + b.id;
  });
}
