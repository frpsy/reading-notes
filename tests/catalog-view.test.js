import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const V = /js\/app\.js\?v=(\d+)/.exec(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))[1];
const { state } = await import('../js/state.js?v=' + V);
const { parseCatalogText } = await import('../js/core.js?v=' + V);
const { catalogHtml } = await import('../js/catalog.js?v=' + V);

test('책 찾기: 카드에 챕터 수·쪽수와 책 이름이 들어간 담기 버튼', () => {
  const text = readFileSync(new URL('../catalog/' + JSON.parse(readFileSync(new URL('../catalog/index.json', import.meta.url), 'utf8'))[0].file, import.meta.url), 'utf8');
  const c = parseCatalogText(text);
  state.books.clear();
  state.catalog = [{ id: 'c-test', c }];
  const html = catalogHtml();
  assert.match(html, /<div class="book cat-book"><span class="cover"/);
  assert.match(html, /<span class="book-meta">\d+챕터( · \d+쪽)?<\/span>/);
  assert.match(html, /data-act="catadd" data-id="c-test" aria-label="[^"]+ 서재에 담기">담기<\/button>/);
  state.catalog = [];
});

test('책 추가: 붙여 넣기·준비된 책 두 탭, 책 찾기 주소는 준비된 책 탭, 수정 화면에는 탭 없음', async () => {
  const { formView } = await import('../js/view-form.js?v=' + V);
  const { libraryView } = await import('../js/view-library.js?v=' + V);
  state.books.clear();
  state.catalog = [];
  const add = formView(null);
  assert.match(add, /role="tablist"/);
  assert.match(add, /id="tab-paste"[^>]*aria-selected="true"/);
  assert.match(add, /<section class="add-shelf" id="add-shelf" role="tabpanel"[^>]* hidden>/);
  assert.match(add, /<form class="form" id="bookForm" novalidate role="tabpanel" aria-labelledby="tab-paste">/);
  assert.match(add, /id="f-paste"/);
  assert.ok(add.indexOf('id="f-paste"') < add.indexOf('id="f-title"'), '붙여 넣기 칸이 맨 위');
  assert.doesNotMatch(add, /id="f-cat"/);
  const fromCatalog = formView(null, 'catalog');
  assert.match(fromCatalog, /id="tab-shelf"[^>]*aria-selected="true"/);
  assert.match(fromCatalog, /id="bookForm" novalidate role="tabpanel" aria-labelledby="tab-paste" hidden>/);
  state.books.set('e1', { id: 'e1', title: '수정할 책', chapters: [{ t: '1장', lv: 0 }], createdAt: 1 });
  const edit = formView('e1');
  assert.doesNotMatch(edit, /tablist|f-paste|add-shelf/);
  state.books.clear();
  const lib = libraryView();
  assert.doesNotMatch(lib, /href="#catalog"/);
  assert.match(lib, /href="#add">책 추가<\/a>/);
});
