// 책 상세 화면: 진척, 날짜, 그래프, 챕터 체크, 메모, 평점.
import { state } from "./state.js?v=21";
import { esc, fmt, ago } from "./util.js?v=21";
import { metrics as calcMetrics, dnum, todayStr, goalInfo, chartGeometry, fmtShort, isGroup, descLeaves, nextLeafIndex, memosOf } from "./core.js?v=21";
import { CHECK, DASH, coverHtml, chipHtml, notFound, paceText } from "./view-common.js?v=21";

function nextPanel(b, m) {
  if (m.status === 'done') return '';
  var i = nextLeafIndex(b);
  if (i < 0) return '';
  var c = b.chapters[i];
  return '<section class="panel next" aria-label="이어 읽기"><div class="next-main"><span class="next-lbl">이어 읽기</span>' +
    '<span class="next-title">' + esc(c.t) + '</span>' + (c.p != null ? '<span class="pg">p.' + c.p + '</span>' : '') + '</div>' +
    '<div class="next-act"><b class="next-pct">' + Math.round(m.pct * 100) + '%</b><button type="button" class="btn primary" data-act="nextdone">읽음 표시</button></div></section>';
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
        '<div class="ch-main"><span class="ch-title">' + esc(c.t) + '</span>' + page + '</div>' +
        '<div class="ch-tools"><span class="count">' + dn + '/' + tot + '</span><button type="button" class="memo-btn" data-act="fold" data-i="' + i + '" aria-expanded="' + (!folded) + '">' + (folded ? '펼치기' : '접기') + '</button></div></li>';
      if (folded) skipLv = c.lv;
    } else {
      if (ui.onlyRemaining && c.done) continue;
      var key = b.id + ':' + i, open = ui.openMemo.has(key);
      out += '<li class="ch leaf' + (c.done ? ' done' : '') + '" style="--lv:' + c.lv + '"><button type="button" class="chk" role="checkbox" aria-checked="' + (c.done ? 'true' : 'false') + '" data-act="toggle" data-i="' + i + '" aria-label="' + esc(c.t) + ' 완료 표시">' + (c.done ? CHECK : '') + '</button>' +
        '<div class="ch-main"><span class="ch-title">' + esc(c.t) + (i === nextLeaf ? ' <span class="chip reading">다음</span>' : '') + '</span>' + page +
        (c.memo && !open ? '<div class="ch-memo">' + memoPreview(c.memo, i) + '</div>' : '') + '</div>' +
        '<div class="ch-tools">' + (c.done ? '<input type="date" data-act="chdate" data-i="' + i + '" value="' + esc(c.done) + '" aria-label="' + esc(c.t) + ' 완료일">' : '') +
        (!c.done && nextLeaf >= 0 && i > nextLeaf ? '<button type="button" class="memo-btn" data-act="upto" data-i="' + i + '">여기까지 읽음</button>' : '') +
        '<button type="button" class="memo-btn' + (open ? ' save' : (c.memo ? ' has' : '')) + '" data-act="memo" data-i="' + i + '" aria-expanded="' + open + '">' + (open ? '메모 저장' : '메모') + '</button></div></li>';
      if (open) out += '<li class="memo-row" style="--lv:' + c.lv + '"><textarea maxlength="2000" data-act="memotext" data-i="' + i + '" aria-label="' + esc(c.t) + ' 메모" placeholder="이 챕터에서 남기고 싶은 말">' + esc(c.memo) + '</textarea></li>';
    }
  }
  if (!out) out = '<li class="ch"><span></span><div class="ch-main muted">남은 챕터가 없습니다.</div></li>';
  return '<ul class="chapters">' + out + '</ul>';
}

function memosHtml(b) {
  var list = memosOf(b);
  if (!list.length) return '';
  return '<details class="panel memos"><summary>챕터 메모 모아보기 <em>' + list.length + '</em></summary><ul>' + list.map(function (x) {
    return '<li><div class="memo-h"><b>' + esc(x.t) + '</b>' + (x.done ? '<span class="mono">' + esc(fmt(x.done)) + '</span>' : '') + '</div>' + memoPreview(x.memo, x.i) + '</li>';
  }).join('') + '</ul></details>';
}

// 메모를 고친 뒤 모아보기 칸만 바꿉니다(전체를 다시 그리면 누르려던 버튼이 사라질 수 있음).
export function refreshMemos(b) {
  var box = document.getElementById('memos-box'); if (!box) return;
  var d = box.querySelector('details'), open = d && d.open;
  var expanded = Array.from(box.querySelectorAll('.memo-preview[open]')).map(function (el) { return el.dataset.memoIndex; });
  box.innerHTML = memosHtml(b);
  if (open && (d = box.querySelector('details'))) d.open = true;
  box.querySelectorAll('.memo-preview').forEach(function (el) { el.open = expanded.includes(el.dataset.memoIndex); });
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
  else stats.push(['예상 완독일', m.etaStr ? fmt(m.etaStr) : '—', m.etaIn != null ? '약 ' + m.etaIn + '일 후' : '기록이 쌓이면 계산돼요']);
  stats.push(['마지막 기록', m.last ? ago(m.last) : '—', m.last ? fmt(m.last) : '아직 없음']);
  var statsHtml = '<dl class="stats">' + stats.map(function (s) { return '<div class="stat"><dt>' + s[0] + '</dt><dd>' + esc(s[1]) + '</dd><small>' + esc(s[2]) + '</small></div>' }).join('') + '</dl>';
  var alt = m.pagePct != null ? '<span class="alt">분량 기준 ' + Math.round(m.pagePct * 100) + '% (' + m.pagesRead + '/' + m.pagesTotal + '쪽)</span>' : '';
  var del = state.ui.confirmDel === b.id ?
    '<div class="confirm"><span>이 책의 기록이 모두 삭제됩니다.</span><button type="button" class="btn danger sm" data-act="delyes">삭제</button><button type="button" class="btn sm" data-act="delno">취소</button></div>' :
    '<button type="button" class="btn danger sm" data-act="del">책 삭제</button>';
  var rating = '<option value="0">평점 없음</option>' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + ((b.rating || 0) === n ? ' selected' : '') + '>' + n + ' / 5</option>' }).join('');
  return '<a class="back" href="#library">← 서재</a>' +
    '<div class="head">' + coverHtml(b, true) + '<div><h1>' + esc(b.title) + (b.example ? ' <span class="chip">예시</span>' : '') + '</h1>' +
    '<div class="by">' + (b.author ? esc(b.author) + ' · ' : '') + chipHtml(m) + (stale ? ' <span class="chip warn">7일 넘게 기록 없음</span>' : '') + (b.totalPages ? ' · ' + b.totalPages + '쪽' : '') + '</div></div>' + '<div class="head-actions"><a class="btn sm" href="#edit-' + esc(b.id) + '">정보·목차 수정</a></div></div>' +
    nextPanel(b, m) + doneBanner(b, m) +
    '<section class="panel" aria-label="진척 현황"><div class="prog"><span class="big">' + pct + '%</span><span class="of">' + m.D + ' / ' + m.L + ' 챕터</span>' + alt + '</div>' +
    '<div class="bar lg' + (m.status === 'done' ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div>' + goalHtml(b, m) + statsHtml + '</section>' +
    '<section class="panel" aria-label="날짜"><div class="dates">' +
      '<label class="fld"><span>읽기 시작일</span><input type="date" id="d-start" data-act="start" value="' + esc(b.startDate || '') + '"></label>' +
      '<label class="fld"><span>종료일</span><input type="date" id="d-end" data-act="end" value="' + esc(b.endDate || '') + '"></label>' +
      '<label class="fld"><span>목표 완독일</span><input type="date" id="d-goal" data-act="goal" value="' + esc(b.goalDate || '') + '"></label></div>' +
    '<p class="hint">모든 챕터를 완료하면 종료일이 자동으로 채워집니다. 날짜는 직접 고칠 수 있습니다.</p></section>' +
    '<section class="panel" aria-label="누적 그래프"><h2 class="sec">누적 완료 챕터</h2><div style="margin-top:12px">' + chartSvg(b, m) + '</div></section>' +
    '<div class="sec-h"><h2 class="sec">챕터</h2><button type="button" class="tgl" data-act="remaining" aria-pressed="' + state.ui.onlyRemaining + '">남은 챕터만 보기</button></div>' +
    chaptersHtml(b, m) + '<div id="memos-box">' + memosHtml(b) + '</div>' +
    '<div class="sec-h"><h2 class="sec">독서 메모</h2></div>' +
    '<div class="panel" style="margin-top:0"><div class="dates"><label class="fld"><span>평점</span><select id="d-rating" data-act="rating">' + rating + '</select></label></div>' +
    noteEditor(b.note) + '</div>' +
    '<div style="margin-top:28px">' + del + '</div>';
}
