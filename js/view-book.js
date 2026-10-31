// 책 상세 화면: 진척, 날짜, 그래프, 챕터 체크, 메모, 평점.
import { state } from "./state.js?v=35";
import { esc, fmt, ago } from "./util.js?v=35";
import { metrics as calcMetrics, dnum, todayStr, goalInfo, chartGeometry, fmtShort, isGroup, descLeaves, nextLeafIndex, memosOf } from "./core.js?v=35";
import { CHECK, DASH, CHEVRON, DOTS, coverHtml, chipHtml, notFound, paceText } from "./view-common.js?v=35";

function nextPanel(b, m) {
  if (m.status === 'done') return '';
  var i = nextLeafIndex(b);
  if (i < 0) return '';
  var c = b.chapters[i];
  return '<section class="panel next" aria-label="이어 읽기"><div class="next-main"><span class="next-lbl">이어 읽기</span>' +
    '<span class="next-title">' + esc(c.t) + '</span>' + (c.p != null ? '<span class="pg">p.' + c.p + '</span>' : '') + '</div>' +
    '<div class="next-act"><a class="btn" href="#ch-' + i + '" data-act="jump" data-id="' + esc(b.id) + '" data-i="' + i + '" aria-label="목차에서 ' + esc(c.t) + ' 위치 보기">위치</a><button type="button" class="btn primary" data-act="nextdone">읽음 표시</button></div></section>';
}
function doneBanner(b, m) {
  if (m.status !== 'done') return '';
  var s = (m.days ? m.days + '일 동안 ' : '') + m.L + '챕터';
  if (m.rate) s += ' · ' + paceText(m.rate);
  return '<section class="panel done-banner" aria-label="완독"><b>완독했습니다</b><span>' + esc(s) + '</span></section>';
}
function goalHtml(b, m) {
  var g = goalInfo(b, m);
  if (!g) return "";
  var cmp = g.cmp ? ' <span class="chip ' + g.cmp.tone + '">' + esc(g.cmp.text) + "</span>" : "";
  return '<p class="goal">' + esc(g.text) + cmp + "</p>";
}

// 세로 표시선 라벨이 축 숫자나 오른쪽 끝에 겹치지 않도록 정렬을 고릅니다
function anchorAt(x, W, ml) { return x > W - 50 ? "end" : (x < ml + 24 ? "start" : "middle"); }
function chartSvg(b, m) {
  var g = chartGeometry(b, m);
  if (!g) return '<p class="empty-note">챕터를 완료하면 누적 그래프가 그려집니다.</p>';
  var W = g.W, H = g.H, ml = g.ml, mr = g.mr, mt = g.mt, mb = g.mb;
  var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="누적 완료 챕터 ' + g.D + "개, 전체 " + g.L + '개">';
  g.ticks.forEach(function (t) {
    s += '<line class="ch-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + t.y.toFixed(1) + '" y2="' + t.y.toFixed(1) + '"/>';
    s += '<text class="ch-lbl" x="' + (ml - 6) + '" y="' + (t.y + 4).toFixed(1) + '" text-anchor="end">' + t.v + "</text>";
  });
  s += '<path class="ch-area" d="' + g.area + '"/><path class="ch-line" d="' + g.path + '"/>';
  if (g.today.show) {
    s += '<line class="ch-mark" x1="' + g.today.x.toFixed(1) + '" x2="' + g.today.x.toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"/>';
    s += '<text class="ch-lbl" x="' + g.today.x.toFixed(1) + '" y="11" text-anchor="' + anchorAt(g.today.x, W, ml) + '">오늘</text>';
  }
  if (g.goal.show) {
    s += '<line class="ch-mark" x1="' + g.goal.x.toFixed(1) + '" x2="' + g.goal.x.toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"/>';
    if (!g.today.show || Math.abs(g.goal.x - g.today.x) > 40) s += '<text class="ch-lbl" x="' + g.goal.x.toFixed(1) + '" y="11" text-anchor="' + anchorAt(g.goal.x, W, ml) + '">목표</text>';
  }
  s += '<circle class="ch-dot" cx="' + g.dot.x.toFixed(1) + '" cy="' + g.dot.y.toFixed(1) + '" r="4.5"/>';
  s += '<text class="ch-lbl" x="' + ml + '" y="' + (H - 8) + '" text-anchor="start">' + fmtShort(g.xStart) + "</text>";
  s += '<text class="ch-lbl" x="' + (W - mr) + '" y="' + (H - 8) + '" text-anchor="end">' + fmtShort(g.xEnd) + "</text>";
  return s + "</svg>";
}

// 긴 메모는 앞 160자를 미리 보여주고 원문은 펼쳐 읽습니다.
function longMemo(text) { return Array.from(text || '').length > 160 || (text || '').split(/\r?\n/).length > 3; }
function memoExcerpt(text) {
  var chars = Array.from(text || '');
  return chars.slice(0, 160).join('').replace(/\s+/g, ' ').trim() + (chars.length > 160 ? '…' : '');
}
function memoPreview(text, index) {
  if (!longMemo(text)) return '<p class="memo-text">' + esc(text) + '</p>';
  var excerpt = memoExcerpt(text);
  return '<details class="memo-preview" data-memo-index="' + index + '"><summary><span class="memo-excerpt">' + esc(excerpt) + '</span><span class="memo-expand">전체 보기</span><span class="memo-collapse">접기</span></summary><p class="memo-text">' + esc(text) + '</p></details>';
}
function noteEditor(note) {
  return '<details class="note-editor"' + (longMemo(note) ? '' : ' open') + '><summary><span class="memo-excerpt">' + esc(note ? memoExcerpt(note) : '독서 메모') + '</span><span class="memo-expand">전체 보기 · 수정</span><span class="memo-collapse">접기</span></summary><label class="fld" style="margin-top:12px"><span>전체 느낌, 남기고 싶은 문장</span><textarea maxlength="20000" id="d-note" data-act="note">' + esc(note || '') + '</textarea></label></details>';
}

function chaptersHtml(b, m) {
  var ui = state.ui;
  var ch = b.chapters, nextLeaf = m.status === 'done' ? -1 : m.leafIdx.find(function (i) { return !ch[i].done });
  var out = '', skipLv = null;
  for (var i = 0; i < ch.length; i++) {
    var c = ch[i], page = c.p != null ? '<span class="pg">p.' + c.p + '</span>' : '';
    if (skipLv !== null) { if (c.lv > skipLv) continue; skipLv = null }
    if (isGroup(ch, i)) {
      var idx = descLeaves(ch, i), dn = idx.filter(function (j) { return ch[j].done }).length, tot = idx.length;
      if (ui.onlyRemaining && dn === tot) continue;
      var st = dn === tot ? 'true' : dn === 0 ? 'false' : 'mixed', folded = ui.folded.has(b.id + ':' + i);
      out += '<li class="ch group" style="--lv:' + c.lv + '"><button type="button" class="chk" role="checkbox" aria-checked="' + st + '" data-act="toggle" data-i="' + i + '" aria-label="' + esc(c.t) + ' 전체 완료 표시">' + (st === 'true' ? CHECK : st === 'mixed' ? DASH : '') + '</button>' +
        '<div class="ch-main"><span class="ch-title">' + esc(c.t) + '</span><span class="ch-meta">' + page + '<span class="count">' + dn + '/' + tot + '</span></span></div>' +
        '<div class="ch-opt"><button type="button" class="fold-btn" data-act="fold" data-i="' + i + '" aria-expanded="' + (!folded) + '" aria-label="' + esc(c.t) + (folded ? ' 펼치기' : ' 접기') + '">' + CHEVRON + '</button></div></li>';
      if (folded) skipLv = c.lv;
    } else {
      if (ui.onlyRemaining && c.done) continue;
      var key = b.id + ':' + i, open = ui.openMemo.has(key);
      var opts = c.done || (nextLeaf >= 0 && i > nextLeaf);
      // 정보 줄: 쪽수 · 읽은 날 · 메모 버튼(작은 글자 버튼). 날짜 수정·여기까지 읽음은 '⋯' 팝업에 둡니다.
      out += '<li id="ch-' + i + '" class="ch leaf' + (c.done ? ' done' : '') + (i === nextLeaf ? ' next' : '') + '" style="--lv:' + c.lv + '"><button type="button" class="chk" role="checkbox" aria-checked="' + (c.done ? 'true' : 'false') + '" data-act="toggle" data-i="' + i + '" aria-label="' + esc(c.t) + ' 완료 표시">' + (c.done ? CHECK : '') + '</button>' +
        '<div class="ch-main"><button type="button" class="ch-title ch-hit" data-act="toggle" data-i="' + i + '" tabindex="-1" aria-hidden="true">' + esc(c.t) + (i === nextLeaf ? ' <span class="chip reading">다음</span>' : '') + '</button>' +
        '<span class="ch-meta">' + page + (c.done ? '<span class="ch-date">' + esc(c.done.slice(5).replace('-', '.')) + ' 읽음</span>' : '') +
        '<button type="button" class="memo-btn' + (open ? ' save' : (c.memo ? ' has' : '')) + '" data-act="memo" data-i="' + i + '" aria-expanded="' + open + '" aria-label="' + esc(c.t) + (open ? ' 메모 저장' : c.memo ? ' 메모 수정' : ' 메모 쓰기') + '">' + (open ? '메모 저장' : (c.memo ? '메모 수정' : '메모')) + '</button></span>' +
        (c.memo && !open ? '<div class="ch-memo"><button type="button" class="memo-tap" data-act="memo" data-i="' + i + '" aria-label="' + esc(c.t) + ' 메모 수정"><span class="memo-text">' + esc(c.memo) + '</span></button></div>' : '') + '</div>' +
        '<div class="ch-opt">' + (opts ? '<details class="chapter-options" data-disclosure="chapter-' + esc(b.id) + '-' + i + '"><summary aria-label="' + esc(c.t) + ' 추가 작업">' + DOTS + '</summary><div class="chapter-options-body">' +
          (c.done ? '<label class="opt-fld"><span>읽은 날</span><input type="date" data-act="chdate" data-i="' + i + '" value="' + esc(c.done) + '" aria-label="' + esc(c.t) + ' 완료일"></label>' : '') +
          (!c.done && nextLeaf >= 0 && i > nextLeaf ? '<button type="button" class="opt-btn" data-act="upto" data-i="' + i + '">여기까지 읽음</button>' : '') +
          '</div></details>' : '') + '</div></li>';
      if (open) out += '<li class="memo-row" style="--lv:' + c.lv + '"><textarea maxlength="2000" data-act="memotext" data-i="' + i + '" aria-label="' + esc(c.t) + ' 메모" placeholder="이 챕터에서 남기고 싶은 말" rows="4">' + esc(c.memo) + '</textarea>' +
        '<div class="memo-foot"><span class="memo-meta"><span class="memo-count" data-memo-count>' + Array.from(c.memo || '').length + '/2000</span><span class="memo-saved" data-memo-saved>입력하면 기기에 바로 보관됩니다</span></span>' +
        '<span class="memo-btns"><button type="button" class="memo-del" data-act="memodel" data-i="' + i + '" aria-label="' + esc(c.t) + ' 메모 삭제">삭제</button>' +
        '<button type="button" class="btn primary sm memo-done" data-act="memo" data-i="' + i + '">완료</button></span></div></li>';
    }
  }
  if (!out) out = '<li class="ch"><span></span><div class="ch-main muted">남은 챕터가 없습니다.</div></li>';
  return '<ul class="chapters">' + out + '</ul>';
}

function memoItems(list) {
  return list.map(function (x) {
    return '<li><div class="memo-h"><b>' + esc(x.t) + '</b>' + (x.done ? '<span class="mono">' + esc(fmt(x.done)) + '</span>' : '') + '</div>' + memoPreview(x.memo, x.i) + '</li>';
  }).join('');
}
// 접혀 있을 때는 목록을 만들지 않고(큰 책에서 입력이 느려지지 않도록) 펼칠 때 채웁니다.
function memosHtml(b, open) {
  var list = memosOf(b);
  if (!list.length) return '';
  // data-disclosure: 다시 그려도 펼침 상태를 유지합니다(펼친 채로 복원되면 toggle 에서 목록을 채움).
  return '<details class="panel memos" data-disclosure="memos-' + esc(b.id) + '"' + (open ? ' open' : ' data-lazy') + '><summary>챕터 메모 모아보기 <em>' + list.length + '</em></summary><ul>' + (open ? memoItems(list) : '') + '</ul></details>';
}
export function fillMemos(d, b) {
  if (!d.hasAttribute('data-lazy')) return;
  d.removeAttribute('data-lazy');
  d.querySelector('ul').innerHTML = memoItems(memosOf(b));
}

// 메모를 고친 뒤 모아보기 칸만 바꿉니다(전체를 다시 그리면 누르려던 버튼이 사라질 수 있음).
var memoTimer = null;
export function refreshMemos(b) {
  var box = document.getElementById('memos-box'); if (!box) return;
  var d = box.querySelector('details');
  if (!d || !d.open) { box.innerHTML = memosHtml(b, false); return; }
  // 펼쳐 둔 상태에서는 입력이 잠시 멈춘 뒤 한 번만 다시 그립니다.
  clearTimeout(memoTimer);
  memoTimer = setTimeout(function () {
    var cur = document.getElementById('memos-box'); if (cur !== box) return;
    var expanded = Array.from(box.querySelectorAll('.memo-preview[open]')).map(function (el) { return el.dataset.memoIndex; });
    var stillOpen = box.querySelector('details') && box.querySelector('details').open;
    box.innerHTML = memosHtml(b, !!stillOpen);
    box.querySelectorAll('.memo-preview').forEach(function (el) { el.open = expanded.includes(el.dataset.memoIndex); });
  }, 250);
}

export function bookView(id) {
  var b = state.books.get(id);
  if (!b) return notFound();
  var m = calcMetrics(b), pct = Math.round(m.pct * 100);
  var stale = m.status === 'reading' && m.last && (dnum(todayStr()) - dnum(m.last)) >= 7;
  var stats = [];
  stats.push(['읽은 기간', m.days ? m.days + '일' : '—', m.start ? '시작 ' + fmt(m.start) : '시작일 미정']);
  var pace = '—', paceSub = '챕터를 완료하면 계산돼요';
  if (m.rate) {
    pace = paceText(m.rate);
    paceSub = m.status === 'done' ? '시작일부터 종료일까지 평균' : '시작일부터 오늘까지 평균';
  }
  stats.push(['읽는 속도', pace, paceSub]);
  if (m.status === 'done') stats.push(['종료일', fmt(m.endStr), '완독']);
  else stats.push(['예상 완독일', m.etaStr ? fmt(m.etaStr) : '—', m.etaIn != null ? '약 ' + m.etaIn + '일 후 · ' + paceText(m.rate) + ' 속도 기준' : '3챕터·3일 이상 기록하면 계산돼요']);
  stats.push(['마지막 기록', m.last ? ago(m.last) : '—', m.last ? fmt(m.last) : '아직 없음']);
  var statsHtml = '<dl class="stats">' + stats.map(function (s) { return '<div class="stat"><dt>' + s[0] + '</dt><dd>' + esc(s[1]) + '</dd><small>' + esc(s[2]) + '</small></div>' }).join('') + '</dl>';
  var alt = m.pagePct != null ? '<span class="alt">분량 기준 ' + Math.round(m.pagePct * 100) + '% (' + m.pagesRead + '/' + m.pagesTotal + '쪽)</span>' : '';
  var del = state.ui.confirmDel === b.id ?
    '<div class="confirm"><span>이 책의 기록이 모두 삭제됩니다.</span><button type="button" class="btn danger sm" data-act="delyes">삭제</button><button type="button" class="btn sm" data-act="delno">취소</button></div>' :
    '<button type="button" class="btn danger sm" data-act="del">책 삭제</button>';
  var rating = '<option value="0">평점 없음</option>' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + ((b.rating || 0) === n ? ' selected' : '') + '>' + n + ' / 5</option>' }).join('');
  var progress = '<section class="reading-progress" aria-label="진척 현황"><div class="prog"><span class="big">' + pct + '%</span><span class="of">' + m.D + ' / ' + m.L + ' 챕터</span>' + alt + '</div><div class="bar' + (m.status === 'done' ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div></section>';
  var insights = '<details class="panel book-insights" data-disclosure="insights-' + esc(b.id) + '"><summary><span>통계와 날짜</span><span class="disclosure-hint">읽는 속도 · 예상 완독일 · 그래프</span></summary><div class="insights-body">' + goalHtml(b, m) + statsHtml +
    '<section class="insight-chart" aria-label="누적 그래프"><h3>누적 완료 챕터</h3>' + chartSvg(b, m) + '</section>' +
    '<section class="insight-dates" aria-label="날짜"><h3>날짜 설정</h3><div class="dates">' +
      '<label class="fld"><span>읽기 시작일</span><input type="date" id="d-start" data-act="start" value="' + esc(b.startDate || '') + '"></label>' +
      '<label class="fld"><span>종료일</span><input type="date" id="d-end" data-act="end" value="' + esc(b.endDate || '') + '"></label>' +
      '<label class="fld"><span>목표 완독일</span><input type="date" id="d-goal" data-act="goal" value="' + esc(b.goalDate || '') + '"></label></div>' +
    '<p class="hint">모든 챕터를 완료하면 종료일이 자동으로 채워집니다. 날짜는 직접 고칠 수 있습니다.</p></section></div></details>';
  return '<a class="back" href="#library">← 서재</a>' +
    '<div class="head">' + coverHtml(b, true) + '<div><h1>' + esc(b.title) + (b.example ? ' <span class="chip">예시</span>' : '') + '</h1><div class="by">' + (b.author ? esc(b.author) + ' · ' : '') + chipHtml(m) + (stale ? ' <span class="chip">잠시 쉬는 중</span>' : '') + (b.totalPages ? ' · ' + b.totalPages + '쪽' : '') + '</div></div>' +
    '<details class="book-menu" data-disclosure="menu-' + esc(b.id) + '"><summary aria-label="책 설정">⋯</summary><div class="book-menu-items"><a href="#edit-' + esc(b.id) + '">정보·목차 수정</a>' + del + '</div></details></div>' +
    nextPanel(b, m) + doneBanner(b, m) + progress +
    '<div class="sec-h"><h2 class="sec">챕터</h2><button type="button" class="tgl" data-act="remaining" aria-pressed="' + state.ui.onlyRemaining + '">남은 챕터만 보기</button></div>' +
    chaptersHtml(b, m) + '<div id="memos-box">' + memosHtml(b, false) + '</div>' +
    '<div class="sec-h"><h2 class="sec">독서 메모</h2></div><div class="panel note-panel" style="margin-top:0"><div class="dates"><label class="fld"><span>평점</span><select id="d-rating" data-act="rating">' + rating + '</select></label></div>' + noteEditor(b.note) + '</div>' + insights;
}
