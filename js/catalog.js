// 준비된 책(catalog/): Claude가 repo에 추가하면 여기서 서재에 담습니다.
import { state } from "./state.js?v=71";
import { render } from "./bus.js?v=71";
import { persist } from "./sync.js?v=71";
import { esc } from "./util.js?v=71";
import { coverHtml } from "./view-common.js?v=71";
import { showNotice } from "./undo.js?v=71";
import { currentRoute } from "./router.js?v=71";
import { parseToc, parseCatalogText, normalizeBook, findSimilarBook, leavesOf } from "./core.js?v=71";

// 준비된 책 선반은 책 추가 화면 안에 있습니다. 입력 중인 폼을 지우지 않도록 선반 영역만 바꿉니다.
function redraw() {
  var r = currentRoute();
  if (r.name !== "form" || r.id) return;
  var box = document.getElementById("cat-list");
  if (box) box.innerHTML = catalogHtml();
  var count = document.getElementById("shelf-count");
  if (count) count.textContent = catalogCount() == null ? "" : String(catalogCount());
}
// 담을 수 있는 준비된 책 수. 목록을 아직 불러오지 못했으면 null.
export function catalogCount() {
  if (!state.catalog.length) return null;
  return state.catalog.filter(function (x) { return !owned(x); }).length;
}
// 서재에 같은 책(제목 기준, 저자·판본 표기는 무시)이 이미 있으면 그 책을 돌려줍니다. 직접 추가한 책은 id 가 달라 제목으로도 확인합니다.
function owned(x) { return state.books.get(x.id) || findSimilarBook(Array.from(state.books.values()), x.c.title); }
export function loadCatalog() {
  fetch("catalog/index.json").then(function (r) { return r.json(); }).then(function (list) {
    return Promise.all(list.map(function (x) {
      return fetch("catalog/" + encodeURIComponent(x.file)).then(function (r) { return r.text(); }).then(function (t) {
        return { id: "c-" + x.file.replace(/\.txt$/, ""), c: parseCatalogText(t) };
      });
    }));
  }).then(function (all) { state.catalog = all.filter(function (x) { return x.c.title && x.c.toc; }); state.catalogFailed = false; redraw(); }).catch(function () { state.catalogFailed = true; redraw(); });
}
// 책 추가 화면의 '준비된 책' 선반 내용. 서재에 이미 있는 책은 뺍니다.
export function catalogHtml() {
  if (state.catalogFailed && !state.catalog.length) return '<p class="err cat-note" role="status">준비된 책 목록을 불러오지 못했습니다. 아래에 직접 입력해 주세요.</p>';
  if (!state.catalog.length) return '<p class="muted cat-note" role="status">준비된 책을 불러오는 중…</p>';
  var rest = state.catalog.filter(function (x) { return !owned(x); });
  if (!rest.length) return '<p class="muted cat-note" role="status">준비된 책을 모두 서재에 담았습니다.</p>';
  return rest.map(function (x) {
    // 담기 전에 분량을 가늠하도록 챕터 수와 쪽수를 함께 보여 줍니다.
    var n = leavesOf(parseToc(x.c.toc)).length;
    var meta = [n ? n + '챕터' : '', x.c.totalPages ? x.c.totalPages + '쪽' : ''].filter(Boolean).join(' · ');
    return '<div class="book cat-book">' + coverHtml({ title: x.c.title }) +
      '<span class="book-main"><span class="book-title">' + esc(x.c.title) + '</span><span class="book-sub">' + esc(x.c.author) + '</span>' + (meta ? '<span class="book-meta">' + esc(meta) + '</span>' : '') + '</span>' +
      '<span class="book-side"><button type="button" class="btn sm primary" data-act="catadd" data-id="' + esc(x.id) + '" aria-label="' + esc(x.c.title) + ' 서재에 담기">담기</button></span></div>';
  }).join("");
}
export function addFromCatalog(id) {
  var x = state.catalog.find(function (y) { return y.id === id; });
  if (!x) return;
  if (owned(x)) { showNotice("이미 서재에 있는 책입니다."); render(); return; }
  var b = normalizeBook({
    id: id, title: x.c.title, author: x.c.author, totalPages: x.c.totalPages,
    // 단순히 담는 동작은 읽기 시작이 아닙니다. 시작일·완료일은 첫 챕터 체크 시 기록합니다.
    startDate: null, endDate: null, goalDate: null,
    chapters: parseToc(x.c.toc), createdAt: Date.now(),
  });
  // 기기 보관이 실패하면 추가 완료로 표시하지 않습니다.
  if (!persist(b)) return;
  state.books.set(id, b);
  // 이전에 '읽는 중' 필터/검색을 사용했어도 새로 담은 책이 바로 보여야 합니다.
  state.ui.filter = 'todo'; state.ui.q = '';
  // 책 추가 화면에서 담으면 서재의 독서 예정 목록으로 이동합니다.
  if (location.hash === "#catalog" || location.hash === "#add") location.hash = "library";
  render();
}
