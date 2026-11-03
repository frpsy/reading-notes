// 휴지통은 이 기기·계정에만 보관합니다. 복구는 원본을 덮어쓰지 않는 새 책으로 만듭니다.
import * as store from './store.js?v=48';
import { state } from './state.js?v=48';
import { esc, fmt } from './util.js?v=48';
import { newId, todayStr, friendlyError } from './core.js?v=48';
import { persist } from './sync.js?v=48';
import { showNotice } from './undo.js?v=48';

export function preserve(book, kind = 'book', index = -1, text = '') {
  try { store.archiveTrash(book,kind,index,text); return true; }
  catch (e) { showNotice(friendlyError(e)); return false; }
}
export function recordsView() {
  let items = [], error = '';
  try { items = store.readTrash(); }
  catch (e) { error = '<p role="alert">' + esc(friendlyError(e)) + '</p>'; }
  return '<a class="back" href="#library">← 서재</a><h1 class="page">기록 관리</h1>' +
    '<section class="panel"><h2 class="sec">내 기록 내려받기</h2><p class="hint">현재 서재의 기록을 파일로 저장합니다. 휴지통은 포함하지 않습니다. JSON은 보관용이며 가져오기는 지원하지 않습니다.</p><div class="tools"><button class="btn" data-act="export-json">JSON 백업</button><button class="btn" data-act="export-md">Markdown 메모</button></div></section>' +
    '<section class="panel"><h2 class="sec">휴지통</h2><p class="hint">삭제한 책·메모를 이 기기의 같은 브라우저에 30일간 보관합니다. 다른 기기로 동기화되지 않으며 브라우저 데이터를 지우면 사라집니다. 복구하면 기존 기록을 덮어쓰지 않고 삭제 당시 책의 복구본을 만듭니다.</p>' +
    (error || (items.length ? '<ul class="trash-list">' + items.map(e => '<li><div><b>' + esc(e.book.title) + '</b><p class="hint">' + ({book:'책',memo:'챕터 메모',note:'독서 메모'}[e.kind]) + ' · ' + esc(fmt(todayStr(new Date(e.deletedAt)))) + ' 삭제</p>' + (e.kind !== 'book' ? '<p class="trash-preview">' + esc(Array.from(e.text).slice(0,160).join('')) + '</p>' : '') + '</div><button class="btn sm" data-act="trash-restore" data-key="' + esc(e.key) + '">복구본 만들기</button></li>').join('') + '</ul>' : '<p class="muted">최근 삭제한 기록이 없습니다.</p>')) + '</section>';
}
export function restoreTrash(key) {
  try {
    const entry = store.readTrash().find(e => e.key === key); if (!entry) return;
    const book = structuredClone(entry.book);
    book.id = newId(); book.title = book.title.slice(0,190).replace(/[\uD800-\uDBFF]$/, '') + ' (복구본)'; book.createdAt = Date.now();
    if (entry.kind === 'memo' && book.chapters[entry.index]) book.chapters[entry.index].memo = entry.text;
    if (entry.kind === 'note') book.note = entry.text;
    if (!persist(book)) return;
    state.books.set(book.id,book);
    // 휴지통 원본은 만료일까지 유지합니다. 저장 실패나 연결 끊김에도 복구 기회가 남습니다.
    location.hash = 'book-' + book.id;
  } catch (e) { showNotice(friendlyError(e)); }
}
export function exportRecords(kind) {
  const books = Array.from(state.books.values());
  const text = kind === 'json' ? JSON.stringify({ format: 'chaekgalpi', version: 1, exportedAt: new Date().toISOString(), books },null,2) :
    '# 독서 메모\n\n' + books.map(b => '# ' + b.title + '\n' + (b.author || '') + '\n\n' + (b.note || '') + '\n\n' + b.chapters.filter(c => c.memo).map(c => '## ' + c.t + '\n\n' + c.memo).join('\n\n')).join('\n\n---\n\n');
  const url = URL.createObjectURL(new Blob([text],{type:kind === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'}));
  const a = document.createElement('a'); a.href=url; a.download='책갈피-' + todayStr() + (kind === 'json' ? '.json' : '.md');
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),60000);
}
