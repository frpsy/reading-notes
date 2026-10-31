// 서재 화면: 책 목록, 상태 필터, 검색, 최근 12주 기록.
import { state } from "./state.js?v=38";
import { esc, fmt, ago } from "./util.js?v=38";
import { metrics as calcMetrics, dnum, todayStr, activityByDate, currentStreak, longestStreak, streakStatus, heatmapWeeks, nextLeafIndex, matchBook, searchMemos } from "./core.js?v=38";
import { coverHtml, chipHtml } from "./view-common.js?v=38";
import { catalogHtml } from "./catalog.js?v=38";

function nextLine(b, m) {
  if (m.status === 'done') return '';
  var i = nextLeafIndex(b);
  return i < 0 ? '' : '<span class="book-next">다음 · ' + esc(b.chapters[i].t) + '</span>';
}
function bookRow(b, m) {
  var sub;
  if (m.status === 'done') sub = fmt(m.start) + ' – ' + fmt(m.endStr);
  else if (m.status === 'reading') sub = '시작 ' + fmt(m.start);
  else sub = '아직 시작 전';
  var by = b.author ? esc(b.author) + ' · ' : '';
  var meta = m.D + '/' + m.L + ' 챕터';
  if (m.last) meta += ' · 마지막 기록 ' + ago(m.last);
  if (m.pagePct != null) meta += ' · 분량 기준 ' + Math.round(m.pagePct * 100) + '%';
  var stale = m.status === 'reading' && m.last && (dnum(todayStr()) - dnum(m.last)) >= 7;
  return '<a class="book" href="#book-' + esc(b.id) + '">' + coverHtml(b) +
    '<span class="book-main"><span class="book-title">' + esc(b.title) + (b.example ? ' <span class="chip">예시</span>' : '') + '</span>' +
    '<span class="book-sub">' + by + sub + '</span>' +
    '<span class="bar' + (m.status === 'done' ? ' ok' : '') + '"><i style="width:' + Math.round(m.pct * 100) + '%"></i></span>' +
    '<span class="book-meta">' + meta.split(' · ').map(function (part) { return '<span>' + esc(part) + '</span>'; }).join(' · ') + '</span>' + nextLine(b, m) + '</span>' +
    '<span class="book-side"><b class="pct">' + Math.round(m.pct * 100) + '%</b>' + chipHtml(m) + (stale ? '<span class="chip">잠시 쉬는 중</span>' : '') + '</span></a>';
}

// 오늘 아직 읽지 않았을 때만 보이는 안내. 이어 읽을 책은 가장 최근에 기록한 읽는 중 책
function reminderHtml(all, map) {
  var st = streakStatus(map);
  if (st.state === 'today' || st.state === 'none') return '';
  var reading = all.filter(function (x) { return x.m.status === 'reading' });
  if (!reading.length) return '';
  reading.sort(function (a, c) { return (c.m.last || '').localeCompare(a.m.last || '') });
  var x = reading[0], i = nextLeafIndex(x.b);
  var msg = st.state === 'risk'
    ? '<b>오늘 아직 읽지 않았습니다.</b> 지금 한 챕터를 읽으면 ' + (st.streak + 1) + '일 연속이 됩니다.'
    : '<b>마지막 기록 후 ' + st.gap + '일이 지났습니다.</b> 이어서 한 챕터 읽어 보세요.';
  return '<a class="remind" href="#book-' + esc(x.b.id) + '"><span>' + msg + '</span><span class="remind-go">' + esc(x.b.title) + (i >= 0 ? ' · ' + esc(x.b.chapters[i].t) : '') + ' ›</span></a>';
}

function activityHtml(list) {
  var map = activityByDate(list);
  if (!Object.keys(map).length) return '';
  var cur = currentStreak(map), best = longestStreak(map);
  var cols = heatmapWeeks(map, todayStr(), 12);
  var cells = cols.map(function (col) {
    return col.map(function (d) {
      return '<i class="hc l' + d.level + (d.future ? ' fut' : '') + '"' + (d.future ? '' : ' title="' + esc(d.date.slice(5).replace('-', '/') + ' · ' + d.count + '챕터') + '"') + '></i>';
    }).join('');
  }).join('');
  return '<section class="activity" aria-label="최근 12주 독서 기록"><div class="act-h"><b class="mono">' + cur + '</b><span>일 연속</span><span class="muted">· 최장 ' + best + '일</span></div>' +
    '<div class="heat" role="img" aria-label="최근 12주 동안 챕터를 읽은 날">' + cells + '</div></section>';
}

export function libraryView() {
  var all = Array.from(state.books.values()).map(function (b) { return { b: b, m: calcMetrics(b) } });
  var t = dnum(todayStr()), yr = String(new Date().getFullYear());
  var cnt = { all: all.length, reading: 0, todo: 0, done: 0 }, doneYear = 0, week = 0;
  all.forEach(function (x) {
    cnt[x.m.status]++;
    if (x.m.status === 'done' && x.m.endStr && x.m.endStr.slice(0, 4) === yr) doneYear++;
    x.m.doneDates.forEach(function (d) { var n = dnum(d); if (n != null && n >= t - 6 && n <= t) week++ });
  });
  var head = '<div class="lib-head"><h1 class="page">내 서재</h1><a class="btn primary" href="#add">책 추가</a></div>';
  var note = catalogHtml() +
    (state.mode === 'firebase' ? '<div class="tools"><button type="button" class="btn sm" data-act="logout">로그아웃' + (state.userEmail ? ' (' + esc(state.userEmail) + ')' : '') + '</button></div>' : '');
  if (!all.length) {
    return head + '<div class="empty"><h2>아직 담은 책이 없습니다</h2><p>\'책 추가\'에서 목차를 붙여 넣거나, 아래 \'담을 수 있는 책\'에서 서재에 담기를 누르세요.</p></div>' + note;
  }
  var strip = '<div class="strip"><div class="s"><b>' + cnt.reading + '</b><span>읽는 중</span></div>' +
    '<div class="s"><b>' + cnt.done + '</b><span>완독</span></div>' +
    '<a class="s" href="#year"><b>' + doneYear + '</b><span>올해 완독 · 연간 기록 ›</span></a>' +
    '<div class="s"><b>' + week + '</b><span>최근 7일 완료 챕터</span></div></div>';
  var tabs = '<div class="tabs" role="group" aria-label="상태 필터">' + [['all', '전체'], ['reading', '읽는 중'], ['todo', '읽을 예정'], ['done', '완독']].map(function (x) {
    return '<button type="button" class="tab" data-act="filter" data-v="' + x[0] + '" aria-pressed="' + (state.ui.filter === x[0]) + '">' + x[1] + '<em>' + cnt[x[0]] + '</em></button>';
  }).join('') + '</div>';
  var order = { reading: 0, todo: 1, done: 2 };
  var list = all.filter(function (x) { return (state.ui.filter === 'all' || x.m.status === state.ui.filter) && matchBook(x.b, state.ui.q) });
  list.sort(function (a, c) {
    if (order[a.m.status] !== order[c.m.status]) return order[a.m.status] - order[c.m.status];
    if (a.m.status === 'reading') return (c.m.last || '').localeCompare(a.m.last || '');
    if (a.m.status === 'done') return (c.m.endStr || '').localeCompare(a.m.endStr || '');
    return (c.b.createdAt || 0) - (a.b.createdAt || 0);
  });
  var rows = list.length ? (state.ui.filter === 'all' && !state.ui.q ? ['reading', 'todo', 'done'].map(function (status) {
    var books = list.filter(function (x) { return x.m.status === status; });
    if (!books.length) return '';
    var labels = { reading: '읽는 중', todo: '읽을 예정', done: '완독한 책' };
    return '<section class="library-shelf" aria-label="' + labels[status] + '"><h2 class="shelf-title">' + labels[status] + '<span>' + books.length + '</span></h2><div class="books">' + books.map(function (x) { return bookRow(x.b, x.m); }).join('') + '</div></section>';
  }).join('') : '<div class="books">' + list.map(function (x) { return bookRow(x.b, x.m); }).join('') + '</div>') : '<p class="muted">' + (state.ui.q ? '검색 결과가 없습니다.' : '해당하는 책이 없습니다.') + '</p>';
  var search = all.length > 1 ? '<input type="search" class="search" data-act="search" value="' + esc(state.ui.q) + '" placeholder="제목·저자·메모 검색" aria-label="제목·저자·메모 검색" autocomplete="off">' : '';
  var books = all.map(function (x) { return x.b; }), activity = activityByDate(books);
  var insights = '<details class="library-insights" data-disclosure="library-insights"><summary><span>독서 활동</span><span class="disclosure-hint">' + currentStreak(activity) + '일 연속 · 최근 7일 ' + week + '챕터</span></summary><div class="insights-body">' + strip + activityHtml(books) + '</div></details>';
  var memoHits = state.ui.q ? searchMemos(all.map(function (x) { return x.b }), state.ui.q) : [];
  var memoHtml = memoHits.length ? '<div class="sec-h"><h2 class="sec">메모에서 찾음</h2></div><ul class="memo-hits">' + memoHits.map(function (h) {
    return '<li><a href="#book-' + esc(h.id) + '" data-act="jump" data-id="' + esc(h.id) + '" data-i="' + h.i + '"><span class="memo-hit-h"><b>' + esc(h.title) + '</b> · ' + esc(h.t) + '</span><span class="memo-hit-t">' + esc(h.text) + '</span></a></li>';
  }).join('') + '</ul>' : '';
  return head + search + tabs + rows + memoHtml + reminderHtml(all, activity) + insights + note;
}
