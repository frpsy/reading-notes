// 연간 기록 화면: 연도별 완독 책, 월별 완료 챕터, 읽은 날.
import { state } from "./state.js?v=32";
import { esc, fmt, hue } from "./util.js?v=32";
import { yearSummary } from "./core.js?v=32";

export function yearView(y) {
  var s = yearSummary(Array.from(state.books.values()), y);
  var max = Math.max.apply(null, s.months.concat([1]));
  var tabs = s.years.length > 1 ? '<div class="tabs" role="group" aria-label="연도">' + s.years.map(function (x) {
    return '<a class="tab" href="#year-' + x + '" aria-current="' + (x === s.year ? 'page' : 'false') + '">' + x + '</a>';
  }).join('') + '</div>' : '';
  var strip = '<div class="strip"><div class="s"><b>' + s.done.length + '</b><span>완독</span></div>' +
    '<div class="s"><b>' + s.chapters + '</b><span>완료 챕터</span></div>' +
    '<div class="s"><b>' + s.readDays + '</b><span>읽은 날</span></div></div>';
  var bars = '<section class="panel" aria-label="월별 완료 챕터"><h2 class="sec">월별 완료 챕터</h2><div class="months">' + s.months.map(function (n, i) {
    return '<div class="mo" title="' + (i + 1) + '월 · ' + n + '챕터"><span class="mo-n mono">' + (n || '') + '</span><i style="height:' + Math.round(n / max * 100) + '%"></i><span class="mo-l">' + (i + 1) + '</span></div>';
  }).join('') + '</div></section>';
  var list = s.done.length ? '<div class="books">' + s.done.map(function (x) {
    var sub = fmt(x.end) + ' 완독' + (x.days ? ' · ' + x.days + '일' : '') + ' · ' + x.L + '챕터';
    return '<a class="book" href="#book-' + esc(x.id) + '"><span class="cover" style="--h:' + hue(x.title) + '" aria-hidden="true">' + esc(x.title.charAt(0)) + '</span>' +
      '<span class="book-main"><span class="book-title">' + esc(x.title) + '</span><span class="book-sub">' + (x.author ? esc(x.author) + ' · ' : '') + esc(sub) + '</span></span>' +
      '<span class="rating mono">' + (x.rating ? x.rating + ' / 5' : '') + '</span></a>';
  }).join('') + '</div>' : '<p class="muted">이 해에 완독한 책이 아직 없습니다.</p>';
  return '<a class="back" href="#library">← 서재</a><h1 class="page">' + esc(s.year) + '년 독서 기록</h1>' + tabs + strip + bars +
    '<div class="sec-h"><h2 class="sec">완독한 책</h2></div>' + list;
}
