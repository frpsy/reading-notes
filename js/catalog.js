// 준비된 책(catalog/): Claude가 repo에 추가하면 여기서 서재에 담습니다.
import { state } from "./state.js?v=52";
import { render } from "./bus.js?v=52";
import { persist } from "./sync.js?v=52";
import { esc, hue } from "./util.js?v=52";
import { parseToc, parseCatalogText, normalizeBook } from "./core.js?v=52";

export function loadCatalog() {
  fetch("catalog/index.json").then(function (r) { return r.json(); }).then(function (list) {
    return Promise.all(list.map(function (x) {
      return fetch("catalog/" + encodeURIComponent(x.file)).then(function (r) { return r.text(); }).then(function (t) {
        return { id: "c-" + x.file.replace(/\.txt$/, ""), c: parseCatalogText(t) };
      });
    }));
  }).then(function (all) { state.catalog = all.filter(function (x) { return x.c.title && x.c.toc; }); state.catalogFailed = false; render(); }).catch(function () { state.catalogFailed = true; render(); });
}
export function catalogHtml() {
  var rest = state.catalog.filter(function (x) { return !state.books.has(x.id); });
  if (!rest.length) return state.catalogFailed ? '<div class="sec-h"><h2 class="sec">담을 수 있는 책</h2></div><p class="err" role="status">책 목록을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.</p>' : "";
  return '<div class="sec-h"><h2 class="sec">담을 수 있는 책</h2></div><div class="books">' + rest.map(function (x) {
    return '<div class="book"><span class="cover" style="--h:' + hue(x.c.title) + '" aria-hidden="true">' + esc(x.c.title.charAt(0)) + '</span>' +
      '<span class="book-main"><span class="book-title">' + esc(x.c.title) + '</span><span class="book-sub">' + esc(x.c.author) + '</span></span>' +
      '<span class="book-side"><button type="button" class="btn sm primary" data-act="catadd" data-id="' + esc(x.id) + '">서재에 담기</button></span></div>';
  }).join("") + "</div>";
}
export function addFromCatalog(id) {
  var x = state.catalog.find(function (y) { return y.id === id; });
  if (!x || state.books.has(id)) return;
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
  // 책 찾기 화면에서 담으면 서재의 독서 예정 목록으로 이동합니다.
  if (location.hash === "#catalog") location.hash = "library";
  render();
}
