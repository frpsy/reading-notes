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
