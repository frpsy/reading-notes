import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 모듈 import 의 ?v= 와 같은 주소로 불러와야 같은 state 를 씁니다(버전은 index.html 기준).
const V = /js\/app\.js\?v=(\d+)/.exec(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))[1];
const { state } = await import('../js/state.js?v=' + V);
const { normalizeBook } = await import('../js/core.js?v=' + V);
const { bookView } = await import('../js/view-book.js?v=' + V);

function book(over) {
  return normalizeBook(Object.assign({
    id: 'b1', title: '책 <b>제목</b>', author: '저자', totalPages: 300, startDate: '2026-10-01', note: '독서 메모', rating: 4, createdAt: 1,
    chapters: [
      { t: '1부', lv: 0, p: 1 }, { t: '1장', lv: 1, p: 5, done: '2026-10-01', memo: '짧은 메모' }, { t: '2장', lv: 1, p: 30 },
      { t: '2부', lv: 0, p: 100 }, { t: '3장', lv: 1, p: 110 },
    ],
  }, over || {}));
}
function reset(b) {
  state.books.clear(); state.books.set(b.id, b);
  state.ui.onlyRemaining = false; state.ui.folded.clear(); state.ui.openMemo.clear(); state.ui.confirmDel = null;
}

test('책 상세: 화면 조각이 순서대로 이어지고 사용자 입력은 이스케이프됨', () => {
  reset(book());
  const html = bookView('b1');
  const order = ['class="back"', 'class="head"', 'aria-label="진척 현황"', 'book-insights', 'chapter-heading', 'id="chapters-list"', 'id="memos-box"', 'note-panel'];
  let at = -1;
  for (const marker of order) { const i = html.indexOf(marker); assert.ok(i > at, marker + ' 위치'); at = i; }
  assert.ok(!html.includes('<b>제목</b>'));
  assert.ok(html.includes('&lt;b&gt;제목&lt;/b&gt;'));
});

test('책 상세: 챕터 체크 버튼은 묶음 2개 + 항목 3개, 남은 챕터만 보기에서는 완료 항목이 빠짐', () => {
  reset(book());
  const count = (h) => (h.match(/class="chk"/g) || []).length;
  assert.equal(count(bookView('b1')), 5);
  state.ui.onlyRemaining = true;
  assert.equal(count(bookView('b1')), 4);
});

test('책 상세: 접기·삭제 확인·메모 입력창 상태가 화면에 반영됨', () => {
  reset(book());
  assert.match(bookView('b1'), /data-act="foldall"[^>]*aria-expanded="true">전체 접기/);
  state.ui.folded.add('b1:0'); state.ui.folded.add('b1:3');
  assert.match(bookView('b1'), /aria-expanded="false">전체 펼치기/);
  assert.match(bookView('b1'), /data-act="del">책 삭제/);
  state.ui.confirmDel = 'b1';
  assert.match(bookView('b1'), /data-act="delyes"/);
  state.ui.folded.clear(); state.ui.openMemo.add('b1:2');
  assert.match(bookView('b1'), /data-act="memotext" data-i="2"/);
});

test('책 상세: 완독한 책은 완독 배너와 종료일, 없는 책은 안내 화면', () => {
  reset(book({ chapters: [{ t: '하나', lv: 0, done: '2026-10-01' }, { t: '둘', lv: 0, done: '2026-10-05' }] }));
  const html = bookView('b1');
  assert.match(html, /완독했습니다/);
  assert.match(html, /<dt>종료일<\/dt>/);
  assert.ok(!html.includes('이어 읽기'));
  assert.ok(!/data-act="foldall"/.test(html));
  assert.ok(bookView('없는-책').length > 0);
});
