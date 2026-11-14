// 서재: 핵심 독서 기능. 독서 활동 통계는 별도 화면에 표시합니다.
import { state } from "./state.js?v=66";
import { esc, fmt, ago } from "./util.js?v=66";
import { metrics as calcMetrics, dnum, todayStr, activityByDate, currentStreak, longestStreak, streakStatus, heatmapWeeks, nextLeafIndex, matchBook, searchMemos, highlightMemo } from "./core.js?v=66";
import { coverHtml, chipHtml } from "./view-common.js?v=66";

function nextLine(b, m) {
  // 독서 예정인 책은 '다음' 안내를 표시해 시작한 것처럼 보이지 않게 합니다.
  if (m.status !== 'reading') return '';
  var i = nextLeafIndex(b);
  return i < 0 ? '' : '<span class="book-next"><b>다음</b> ' + esc(b.chapters[i].t) + '</span>';
}
function bookRow(b, m, hideChip) {
  var sub;
  if (m.status === 'done') sub = fmt(m.start) + ' – ' + fmt(m.endStr);
  else if (m.status === 'reading') sub = '';
  else sub = '아직 시작 전';
  var by = b.author ? esc(b.author) + (sub ? ' · ' : '') : '';
  var meta = m.D + '/' + m.L + ' 챕터';
  if (m.last) meta += ' · 마지막 기록 ' + ago(m.last);
  // 큰 퍼센트와 같은 값이면 반복하지 않고, 다를 때만 분량 기준을 보여 줍니다.
  if (m.pagePct != null && Math.round(m.pagePct * 100) !== Math.round(m.pct * 100)) meta += ' · 분량 기준 ' + Math.round(m.pagePct * 100) + '%';
  var stale = m.status === 'reading' && m.last && (dnum(todayStr()) - dnum(m.last)) >= 7;
  return '<a class="book" href="#book-' + esc(b.id) + '">' + coverHtml(b) +
    '<span class="book-main"><span class="book-title">' + esc(b.title) + (b.example ? ' <span class="chip">예시</span>' : '') + '</span>' +
    '<span class="book-sub">' + by + sub + '</span>' +
    '<span class="bar' + (m.status === 'done' ? ' ok' : '') + '"><i style="width:' + Math.round(m.pct * 100) + '%"></i></span>' +
    '<span class="book-meta">' + meta.split(' · ').map(function (part) { return '<span>' + esc(part) + '</span>'; }).join(' · ') + '</span>' + nextLine(b, m) + '</span>' +
    '<span class="book-side"><b class="pct">' + Math.round(m.pct * 100) + '%</b>' + (hideChip && m.status === 'reading' ? '' : chipHtml(m)) + (stale ? '<span class="chip">잠시 쉬는 중</span>' : '') + '</span></a>';
}

// 기존 독서 기록에서 최근 읽은 한 권을 표시합니다. 오늘 읽었어도 안내는 유지합니다.
function resumeHtml(all) {
  var reading = all.filter(function (x) { return x.m.status === 'reading' && nextLeafIndex(x.b) >= 0; });
  if (!reading.length) return '';
  reading.sort(function (a, b) {
    var ad = a.m.last || a.m.start || '', bd = b.m.last || b.m.start || '';
    return bd.localeCompare(ad) || (b.b.updatedAt || b.b.createdAt || 0) - (a.b.updatedAt || a.b.createdAt || 0);
  });
  var x = reading[0], i = nextLeafIndex(x.b), pct = Math.round(x.m.pct * 100);
  return '<a class="remind resume" href="#book-' + esc(x.b.id) + '" aria-label="이어서 읽기: ' + esc(x.b.title) + ', 진행률 ' + pct + '%">' +
    coverHtml(x.b) + '<span class="resume-body"><span class="resume-label">이어서 읽기</span>' +
    '<strong class="resume-title">' + esc(x.b.title) + '</strong>' +
    '<span class="resume-next">' + esc(x.b.chapters[i].t) + '</span>' +
    '<span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span></span>' +
    '<span class="resume-side"><b>' + pct + '%</b><span>읽기 ›</span></span></a>';
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
    '<div class="heat" role="img" aria-label="최근 12주 동안 챕터를 읽은 날">' + cells + '</div>' +
    '<p class="heat-legend" aria-hidden="true"><span>최근 12주</span><span class="heat-scale">적게<i class="hc"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i>많이</span></p></section>';
}

export function libraryView() {
  var all = Array.from(state.books.values()).map(function (b) { return { b: b, m: calcMetrics(b) } });
  var cnt = { all: all.length, reading: 0, todo: 0, done: 0 };
  all.forEach(function (x) { cnt[x.m.status]++; });
  var head = '<div class="lib-head"><h1 class="page">내 서재</h1><div class="lib-actions"><a class="btn" href="#catalog">책 찾기</a><a class="btn primary" href="#add">책 추가</a></div></div>';
  if (!all.length) {
    return head + '<div class="empty"><h2>아직 담은 책이 없습니다</h2><p>책을 직접 추가하거나 준비된 책을 찾아보세요.</p><a class="btn" href="#catalog">책 찾기</a></div>';
  }
  var tabs = '<div class="tabs" role="group" aria-label="상태 필터">' + [['all', '전체'], ['reading', '읽는 중'], ['todo', '독서 예정'], ['done', '완독']].map(function (x) {
    return '<button type="button" class="tab' + (cnt[x[0]] === 0 ? ' zero' : '') + '" data-act="filter" data-v="' + x[0] + '" aria-pressed="' + (state.ui.filter === x[0]) + '">' + x[1] + '<em>' + cnt[x[0]] + '</em></button>';
  }).join('') + '</div>';
  var order = { reading: 0, todo: 1, done: 2 };
  var filtered = all.filter(function (x) { return state.ui.filter === 'all' || x.m.status === state.ui.filter; });
  var list = filtered.filter(function (x) { return matchBook(x.b, state.ui.q) });
  list.sort(function (a, c) {
    if (order[a.m.status] !== order[c.m.status]) return order[a.m.status] - order[c.m.status];
    if (a.m.status === 'reading') return (c.m.last || '').localeCompare(a.m.last || '');
    if (a.m.status === 'done') return (c.m.endStr || '').localeCompare(a.m.endStr || '');
    return (c.b.createdAt || 0) - (a.b.createdAt || 0);
  });
  var rows = list.length ? (state.ui.filter === 'all' && !state.ui.q ? ['reading', 'todo', 'done'].map(function (status) {
    var books = list.filter(function (x) { return x.m.status === status; });
    if (!books.length) return '';
    var labels = { reading: '읽는 중', todo: '독서 예정', done: '완독한 책' };
    return '<section class="library-shelf" aria-label="' + labels[status] + '"><h2 class="shelf-title">' + labels[status] + '<span>' + books.length + '</span></h2><div class="books">' + books.map(function (x) { return bookRow(x.b, x.m, true); }).join('') + '</div></section>';
  }).join('') : '<div class="books">' + list.map(function (x) { return bookRow(x.b, x.m, state.ui.filter === 'reading' && !state.ui.q); }).join('') + '</div>') : '<div class="empty search-empty"><h2>' + (state.ui.q ? '검색 결과가 없습니다.' : '해당하는 책이 없습니다.') + '</h2><p>다른 검색어를 입력하거나 전체 서재를 확인해 보세요.</p><button class="btn" type="button" data-act="reset-search">전체 서재 보기</button></div>';
  var search = all.length > 0 ? '<input type="search" class="search" data-act="search" value="' + esc(state.ui.q) + '" placeholder="제목·저자·메모 검색" aria-label="제목·저자·메모 검색" autocomplete="off">' : '';
  var memoHits = state.ui.q ? searchMemos(filtered.map(function (x) { return x.b }), state.ui.q) : [];
  var memoHtml = memoHits.length ? '<div class="sec-h"><h2 class="sec">메모에서 찾음</h2></div><ul class="memo-hits">' + memoHits.map(function (h) {
    return '<li><a href="#book-' + esc(h.id) + '" data-act="jump" data-id="' + esc(h.id) + '" data-i="' + h.i + '"><span class="memo-hit-h"><b>' + esc(h.title) + '</b> · ' + esc(h.t) + '</span><span class="memo-hit-t">' + highlightMemo(h.text, state.ui.q) + '</span></a></li>';
  }).join('') + '</ul>' : '';
  var resultStatus = state.ui.q ? '<p class="search-status" role="status">책 ' + list.length + '권 · 메모 ' + memoHits.length + '개</p>' : '';
  var resume = !state.ui.q && state.ui.filter === 'all' ? resumeHtml(all) : '';
  return head + resume + search + tabs + resultStatus + rows + memoHtml;
}

export function activityView() {
  const books = Array.from(state.books.values());
  const map = activityByDate(books);
  const all = books.map(function (b) { return calcMetrics(b); });
  const year = String(new Date().getFullYear());
  let reading = 0, done = 0, doneYear = 0, week = 0;
  const today = dnum(todayStr());
  all.forEach(function (m) {
    if (m.status === 'reading') reading++;
    if (m.status === 'done') {
      done++;
      if (m.endStr && m.endStr.slice(0, 4) === year) doneYear++;
    }
    m.doneDates.forEach(function (date) {
      const day = dnum(date);
      if (day != null && day >= today - 6 && day <= today) week++;
    });
  });
  const strip = '<div class="strip"><div class="s"><b>' + reading + '</b><span>읽는 중</span></div>' +
    '<div class="s"><b>' + done + '</b><span>완독</span></div>' +
    '<a class="s" href="#year"><b>' + doneYear + '</b><span>올해 완독 · 연간 기록 ›</span></a>' +
    '<div class="s"><b>' + week + '</b><span>최근 7일 챕터</span></div></div>';
  return '<a class="back" href="#settings">← 설정</a><h1 class="page">독서 활동</h1>' +
    '<section class="activity-page">' + strip + activityHtml(books) + '</section>';
}
