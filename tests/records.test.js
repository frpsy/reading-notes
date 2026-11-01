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
