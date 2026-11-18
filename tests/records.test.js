import test from 'node:test';
import assert from 'node:assert/strict';
import { memoMatch, highlightMemo, searchMemos } from '../js/core.js';
test('검색 주변 문장과 강조가 공백·이모지·HTML을 안전하게 처리함', () => {
  const text = '🙂'.repeat(70) + ' 앞 문장 찾을 메모 <img src=x> 뒤 문장';
  const hit = searchMemos([{id:'a',title:'책',chapters:[{t:'1장',memo:text}]}],'찾 을 메 모')[0];
  assert.ok(hit.text.includes('찾을 메모'));
  assert.ok(!hit.text.includes('\uFFFD'));
  assert.match(highlightMemo(hit.text,'찾 을 메 모'),/<mark>찾을 메모<\/mark>/);
  assert.ok(!highlightMemo(hit.text,'찾 을 메 모').includes('<img'));
  assert.equal(memoMatch('abc',' '),null);
  assert.equal(highlightMemo('<script>','x'),'&lt;script&gt;');
  assert.equal(highlightMemo('앞 🙂 다음','🙂'), '앞 <mark>🙂</mark> 다음');
});

test('Markdown 메모: 메모 있는 책만, 책은 ##·챕터는 ###, 메모가 없으면 안내', async () => {
  const { memosMarkdown } = await import('../js/core.js');
  const md = memosMarkdown([
    { title: '빈 책', author: '누구', note: '', chapters: [{ t: '1장', memo: '' }] },
    { title: '메모 책', author: '저자', note: '전체 느낌', chapters: [{ t: '1장', memo: '첫 메모' }, { t: '2장', memo: '' }] },
    { title: '노트만', author: '', note: '', chapters: [{ t: '서문', memo: '서문 메모' }] },
  ], '2026-11-18');
  assert.ok(md.startsWith('# 책갈피 독서 메모\n'));
  assert.ok(!md.includes('빈 책'));
  assert.match(md, /\n## 메모 책\n\n저자\n\n### 독서 메모\n\n전체 느낌\n\n### 1장\n\n첫 메모/);
  assert.ok(!md.includes('### 2장'));
  assert.match(md, /\n## 노트만\n\n### 서문\n\n서문 메모/);
  assert.ok(!/\n{3,}/.test(md), '빈 줄이 세 줄 이상 이어지지 않음');
  assert.match(memosMarkdown([{ title: 'x', note: '', chapters: [] }], '2026-11-18'), /아직 남긴 메모가 없습니다/);
});
