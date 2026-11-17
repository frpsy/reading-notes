import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const V = /js\/app\.js\?v=(\d+)/.exec(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))[1];
const { state } = await import('../js/state.js?v=' + V);
const { normalizeBook } = await import('../js/core.js?v=' + V);
const { libraryView } = await import('../js/view-library.js?v=' + V);

function book(id, title, date, options = {}) {
  return normalizeBook({
    id, title, createdAt: options.createdAt || 1, startDate: options.todo ? null : '2026-10-01',
    chapters: [
      { t: '첫 번째 장', lv: 0, done: options.todo ? null : date },
      { t: '두 번째 장', lv: 0, done: options.completed ? date : null },
    ],
  });
}
function reset(...books) {
  state.books.clear();
  for (const b of books) state.books.set(b.id, b);
  state.ui.filter = 'all'; state.ui.q = '';
}

test('서재: 읽는 중 책이 없으면 기존 빈 상태 또는 책 목록만 보임', () => {
  reset();
  assert.match(libraryView(), /아직 담은 책이 없습니다/);
  assert.doesNotMatch(libraryView(), /class="remind resume"/);
  reset(book('todo', '독서 예정', null, { todo: true }), book('done', '완독', '2026-10-20', { completed: true }));
  assert.doesNotMatch(libraryView(), /class="remind resume"/);
});

test('서재: 최근 독서한 한 권이 검색·필터 위에 있고 진도 및 상세 링크를 표시', () => {
  reset(book('older', '먼저 읽은 책', '2026-10-02'), book('recent', '새로운 <책>', '2026-10-29'));
  const html = libraryView();
  const card = /<a class="remind resume"[\s\S]*?<\/a>/.exec(html)?.[0];
  assert.ok(card);
  assert.match(card, /href="#book-recent"/);
  assert.match(card, /새로운 &lt;책&gt;/);
  assert.doesNotMatch(card, /새로운 <책>/);
  assert.match(card, /진행률 50%/);
  assert.match(card, /두 번째 장/);
  assert.match(card, /<span class="cover( marked)?"/);
  assert.ok(html.indexOf('class="remind resume"') < html.indexOf('class="search"'));
  assert.equal((html.match(/class="remind resume"/g)||[]).length,1);
});

test('서재: 오늘 독서했어도 이어 읽기를 보여주고 필터·검색 시에는 숨김', () => {
  reset(book('today', '오늘 읽은 책', '2026-11-10'));
  assert.match(libraryView(), /class="remind resume"/);
  state.ui.filter = 'reading';
  assert.doesNotMatch(libraryView(), /class="remind resume"/);
  state.ui.filter = 'all'; state.ui.q = '오늘';
  assert.doesNotMatch(libraryView(), /class="remind resume"/);
});

test('서재: 읽는 중 책 표지에만 책갈피 리본, 이어서 읽기에 최근 7일 리듬', () => {
  const today = new Date(); const pad = (n) => String(n).padStart(2, '0');
  const t = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  reset(book('r', '읽는 책', t), book('w', '예정 책', t, { todo: true }), book('d', '끝난 책', t, { completed: true }));
  const html = libraryView();
  const card = /<a class="remind resume"[\s\S]*?<\/a>/.exec(html)[0];
  assert.match(card, /class="cover marked"/);
  assert.match(card, /최근 7일 중 1일 읽음/);
  assert.equal((card.match(/<i class="on( today)?">/g) || []).length, 1);
  const row = (id) => new RegExp('<a class="book" href="#book-' + id + '">[\\s\\S]*?</a>').exec(html)[0];
  assert.match(row('r'), /class="cover marked"/);
  assert.doesNotMatch(row('w'), /marked/);
  assert.doesNotMatch(row('d'), /marked/);
});
