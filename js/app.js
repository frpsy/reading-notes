// 책갈피 화면 코드. 순수 로직은 core.js, 저장소는 store.js 에 있습니다.
import {
  escapeHtml, todayStr, dnum, fmtDate, fmtShort, agoText, newId, parseToc, tocText, parseCatalogText,
  isGroup, leavesOf, descLeaves, nextLeafIndex, activityByDate, currentStreak, longestStreak, heatmapWeeks, metrics as calcMetrics, autoDates, toggleChapter as toggle, completeThrough,
  goalInfo, chartGeometry, normalizeBook, memosOf, matchBook, yearSummary,
} from "./core.js?v=12";
import * as store from "./store.js?v=12";

var view = document.getElementById("view");
var syncEl = document.getElementById("sync");
function esc(s) { return escapeHtml(s); }
var fmt = fmtDate;
function ago(s) { return agoText(s); }
function metrics(b) { return calcMetrics(b); }
function toggleChapter(b, i) { toggle(b, i); }
function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

/* ---------- 상태 ---------- */
var books = new Map(), lastJson = new Map(), dirty = new Set(), timers = new Map(), inflight = new Set();
var mode = "pending";      // firebase | local
var phase = "boot";        // boot | login | denied | error | app
var ready = false, readyTimer = null, unsub = null, authMsg = "", userEmail = "";
var ui = { filter: "all", q: "", onlyRemaining: false, openMemo: new Set(), confirmDel: null, folded: loadFolded() };

/* ---------- 테마 ---------- */
var themeEl = document.getElementById("theme");
var THEME_TEXT = { auto: "테마 자동", light: "밝게", dark: "어둡게" };
function getTheme() { try { var t = localStorage.getItem("chaekgalpi-theme"); return THEME_TEXT[t] ? t : "auto"; } catch (e) { return "auto"; } }
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  themeEl.textContent = THEME_TEXT[t];
  themeEl.setAttribute("aria-label", "화면 테마: " + THEME_TEXT[t] + " (누르면 바뀝니다)");
}
var curTheme = getTheme(); // 저장소를 못 써도 이번 화면에서는 순환되도록 변수로 들고 있습니다
themeEl.addEventListener("click", function () {
  var order = ["auto", "light", "dark"];
  curTheme = order[(order.indexOf(curTheme) + 1) % 3];
  try { localStorage.setItem("chaekgalpi-theme", curTheme); } catch (e) { /* 무시 */ }
  applyTheme(curTheme);
});
applyTheme(curTheme);

/* ---------- 묶음 접기 ---------- */
function loadFolded() {
  try { return new Set(JSON.parse(localStorage.getItem("chaekgalpi-fold") || "[]")); } catch (e) { return new Set(); }
}
function saveFolded() {
  try { localStorage.setItem("chaekgalpi-fold", JSON.stringify(Array.from(ui.folded))); } catch (e) { /* 무시 */ }
}

/* ---------- 되돌리기 ---------- */
var undoState = null, toastTimer = null;
function snapshot(b) {
  return { id: b.id, done: b.chapters.map(function (x) { return x.done; }), startDate: b.startDate, endDate: b.endDate, endAuto: b.endAuto };
}
function hideToast() {
  clearTimeout(toastTimer); undoState = null;
  var t = document.getElementById("toast"); if (t) t.hidden = true;
}
function showToast(label) {
  var t = document.getElementById("toast"); if (!t) return;
  t.innerHTML = '<span class="toast-msg">' + esc(label) + '</span><button type="button" data-undo="1">되돌리기</button>';
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000);
}
function mutate(b, label, fn) {
  var s = snapshot(b);
  fn(); persist(b); undoState = s; showToast(label); render();
}
function restoreUndo() {
  var s = undoState; if (!s) return;
  var b = books.get(s.id); hideToast(); if (!b) return;
  // 읽음 날짜만 되돌립니다. 그 사이 적은 메모·평점 등은 그대로 둡니다.
  if (s.done.length === b.chapters.length) b.chapters.forEach(function (x, i) { x.done = s.done[i]; });
  b.startDate = s.startDate; b.endDate = s.endDate; b.endAuto = s.endAuto;
  persist(b); render();
}
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-undo]")) restoreUndo(); });

/* ---------- 저장 ---------- */
var SYNC_TEXT = { pending: "연결 중…", saved: "저장됨", saving: "저장 중…", error: "저장 실패 · 다시 시도", local: "이 브라우저에만 저장", offline: "오프라인 · 기기에 보관 중" };
function setSync(s, msg) {
  // 오프라인에서 쓴 기록은 기기(IndexedDB)에 남아 있다가 연결되면 자동으로 올라갑니다.
  if (s === "saving" && mode === "firebase" && navigator.onLine === false) { s = "offline"; msg = "연결되면 자동으로 저장합니다."; }
  syncEl.dataset.state = s;
  syncEl.textContent = SYNC_TEXT[s];
  syncEl.title = msg || (s === "local" ? "체험 모드: 이 브라우저에만 저장합니다." : "");
}
function okState() { return mode === "local" ? "local" : "saved"; }
function backendSet(id, doc) {
  if (mode === "firebase") return store.save(doc);
  store.localWrite(Array.from(books.values())); return Promise.resolve();
}
function backendDel(id) {
  if (mode === "firebase") return store.remove(id);
  store.localWrite(Array.from(books.values())); return Promise.resolve();
}
function persist(b) {
  b.updatedAt = Date.now();
  lastJson.set(b.id, JSON.stringify(b));
  dirty.add(b.id);
  setSync("saving");
  clearTimeout(timers.get(b.id));
  timers.set(b.id, setTimeout(function () { flush(b.id); }, 350));
}
function flush(id) {
  if (inflight.has(id)) { timers.set(id, setTimeout(function () { flush(id); }, 200)); return; }
  var b = books.get(id);
  if (!b) { dirty.delete(id); return; }
  inflight.add(id);
  var json = JSON.stringify(b);
  backendSet(id, JSON.parse(json)).then(function () {
    inflight.delete(id);
    if (JSON.stringify(books.get(id)) !== json) { flush(id); return; }
    dirty.delete(id);
    if (!dirty.size && !inflight.size) setSync(okState());
  }).catch(function (e) {
    inflight.delete(id);
    setSync("error", (e && e.message) || "");
  });
}
function removeBook(id) {
  books.delete(id); lastJson.delete(id); dirty.delete(id);
  clearTimeout(timers.get(id));
  backendDel(id).then(function () { if (!dirty.size && !inflight.size) setSync(okState()); })
    .catch(function (e) { setSync("error", (e && e.message) || ""); });
}
function onNet() { if (phase === "app" && mode === "firebase" && (dirty.size || inflight.size)) setSync("saving"); }
window.addEventListener("online", onNet);
window.addEventListener("offline", onNet);
syncEl.addEventListener("click", function () {
  if (syncEl.dataset.state === "error") { dirty.forEach(function (id) { flush(id); }); setSync("saving"); }
});

function markReady() {
  if (ready) return;
  ready = true;
  clearTimeout(readyTimer);
  render();
}
// 로그아웃·계정 전환 때 이전 계정의 저장 대기 상태가 남아 새 데이터를 막지 않도록 비웁니다.
function resetSaving() {
  timers.forEach(function (t) { clearTimeout(t); });
  timers.clear(); dirty.clear(); inflight.clear();
  books.clear(); lastJson.clear();
}
function onSnap(list, meta) {
  var changed = false, seen = new Set();
  list.forEach(function (raw) {
    var id = raw.id; seen.add(id);
    if (dirty.has(id)) return;
    var b = normalizeBook(raw); b.id = id;
    var j = JSON.stringify(b);
    if (lastJson.get(id) !== j) { books.set(id, b); lastJson.set(id, j); changed = true; }
  });
  Array.from(books.keys()).forEach(function (id) {
    if (!seen.has(id) && !dirty.has(id)) { books.delete(id); lastJson.delete(id); changed = true; }
  });
  if (!ready) {
    if (meta && meta.fromCache && meta.empty) { if (!readyTimer) readyTimer = setTimeout(markReady, 1200); return; }
    markReady(); return;
  }
  var ae = document.activeElement;
  var typing = ae && view.contains(ae) && /^(TEXTAREA|INPUT)$/.test(ae.tagName);
  if (changed && !typing && currentRoute().name !== "form") render(); // 입력 중에는 다시 그리지 않아 글이 사라지지 않게 함
}
function enterApp(m) {
  mode = m; phase = "app"; ready = false;
  resetSaving();
  if (m === "firebase") {
    setSync("saved");
    if (unsub) unsub();
    unsub = store.watch(onSnap, function (e) { setSync("error", (e && e.message) || ""); markReady(); });
  } else {
    store.localList().forEach(function (raw) {
      var b = normalizeBook(raw);
      if (b.id && b.chapters.length) { books.set(b.id, b); lastJson.set(b.id, JSON.stringify(b)); }
    });
    setSync("local");
    ready = true;
  }
  render();
}
function onAuth(st) {
  if (st.state === "login" && (phase === "denied" || phase === "error")) return;
  if (st.state === "ready") { userEmail = st.email || ""; enterApp(st.mode); return; }
  if (unsub) { unsub(); unsub = null; }
  phase = st.state; ready = false; resetSaving(); hideToast();
  authMsg = st.state === "denied" ? (st.email + " 계정은 이 앱을 쓸 수 없습니다.") : (st.message || "");
  setSync("pending"); syncEl.textContent = "로그인 필요";
  render();
}

/* ---------- 준비된 책(catalog): Claude가 repo에 추가, 여기서 서재에 담음 ---------- */
var catalog = [];
function loadCatalog() {
  fetch("catalog/index.json").then(function (r) { return r.json(); }).then(function (list) {
    return Promise.all(list.map(function (x) {
      return fetch("catalog/" + encodeURIComponent(x.file)).then(function (r) { return r.text(); }).then(function (t) {
        return { id: "c-" + x.file.replace(/\.txt$/, ""), c: parseCatalogText(t) };
      });
    }));
  }).then(function (all) { catalog = all.filter(function (x) { return x.c.title && x.c.toc; }); render(); }).catch(function () {});
}
function catalogHtml() {
  var rest = catalog.filter(function (x) { return !books.has(x.id); });
  if (!rest.length) return "";
  return '<div class="sec-h"><h2 class="sec">담을 수 있는 책</h2></div><div class="books">' + rest.map(function (x) {
    return '<div class="book"><span class="cover" style="--h:' + hue(x.c.title) + '" aria-hidden="true">' + esc(x.c.title.charAt(0)) + '</span>' +
      '<span class="book-main"><span class="book-title">' + esc(x.c.title) + '</span><span class="book-sub">' + esc(x.c.author) + '</span></span>' +
      '<span class="book-side"><button type="button" class="btn sm primary" data-act="catadd" data-id="' + esc(x.id) + '">서재에 담기</button></span></div>';
  }).join("") + "</div>";
}
function addFromCatalog(id) {
  var x = catalog.find(function (y) { return y.id === id; });
  if (!x || books.has(id)) return;
  var b = normalizeBook({
    id: id, title: x.c.title, author: x.c.author, totalPages: x.c.totalPages,
    chapters: parseToc(x.c.toc), createdAt: Date.now(),
  });
  books.set(id, b); persist(b); render();
}

/* ---------- 라우팅 ---------- */
function currentRoute() {
  var h = location.hash.replace(/^#/, ""), m;
  if (h === "add") return { name: "form", id: null };
  if ((m = /^edit-(.+)$/.exec(h))) return { name: "form", id: m[1] };
  if ((m = /^book-(.+)$/.exec(h))) return { name: "book", id: m[1] };
  if (h === "year") return { name: "year", year: todayStr().slice(0, 4) };
  if ((m = /^year-(\d{4})$/.exec(h))) return { name: "year", year: m[1] };
  return { name: "library" };
}
window.addEventListener("hashchange", function () { ui.confirmDel = null; hideToast(); render(); window.scrollTo(0, 0); });

function loginView() {
  var trial = '<button type="button" class="btn" data-act="trial">로그인 없이 체험하기 (이 브라우저에만 저장)</button>';
  if (phase === "denied" || phase === "error") {
    return '<div class="login"><h1>책갈피</h1><p class="err">' + esc(authMsg) + '</p>' +
      '<button type="button" class="btn primary" data-act="login">다른 구글 계정으로 로그인</button>' + trial + '</div>';
  }
  return '<div class="login"><h1>책갈피</h1><p class="muted">읽은 책의 목차와 진도를 기록하는 개인 독서 노트입니다. 구글 계정으로 로그인하면 어느 기기에서나 같은 기록을 봅니다.</p>' +
    (authMsg ? '<p class="err">' + esc(authMsg) + '</p>' : '') +
    '<button type="button" class="btn primary" data-act="login">구글로 로그인</button>' + trial + '</div>';
}

/* ---------- 화면 조각 ---------- */

var CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var DASH='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
function coverHtml(b,lg){
  var ch=(b.title||'?').trim().charAt(0)||'?';
  return '<span class="cover'+(lg?' lg':'')+'" style="--h:'+hue(b.title||'')+'" aria-hidden="true">'+esc(ch)+'</span>';
}
var ST={reading:'읽는 중',done:'완독',todo:'읽을 예정'};
function chipHtml(m){return '<span class="chip '+m.status+'">'+ST[m.status]+'</span>'}

function loadingView(){return '<p class="muted">불러오는 중…</p>'}
function notFound(){return '<p>이 책을 찾을 수 없습니다.</p><p><a href="#library">서재로 돌아가기</a></p>'}

function nextLine(b,m){
  if(m.status==='done')return '';
  var i=nextLeafIndex(b);
  return i<0?'':'<span class="book-next">다음 · '+esc(b.chapters[i].t)+'</span>';
}
function nextPanel(b,m){
  if(m.status==='done')return '';
  var i=nextLeafIndex(b);
  if(i<0)return '';
  var c=b.chapters[i];
  return '<section class="panel next" aria-label="이어 읽기"><div class="next-main"><span class="next-lbl">이어 읽기</span>'+
    '<span class="next-title">'+esc(c.t)+'</span>'+(c.p!=null?'<span class="pg">p.'+c.p+'</span>':'')+'</div>'+
    '<div class="next-act"><b class="next-pct">'+Math.round(m.pct*100)+'%</b><button type="button" class="btn primary" data-act="nextdone">읽음 표시</button></div></section>';
}
// 읽는 속도 문구: 소수 첫째 자리까지, 끝의 .0 은 뺍니다
function paceText(rate){
  var r1=function(x){return String(Math.round(x*10)/10)};
  return rate>=1?'하루 '+r1(rate)+'챕터':'챕터당 '+r1(1/rate)+'일';
}
function doneBanner(b,m){
  if(m.status!=='done')return '';
  var s=(m.days?m.days+'일 동안 ':'')+m.L+'챕터';
  if(m.rate)s+=' · '+paceText(m.rate);
  return '<section class="panel done-banner" aria-label="완독"><b>완독했습니다</b><span>'+esc(s)+'</span></section>';
}
function bookRow(b,m){
  var sub;
  if(m.status==='done')sub=fmt(m.start)+' – '+fmt(m.endStr);
  else if(m.status==='reading')sub='시작 '+fmt(m.start);
  else sub='아직 시작 전';
  var by=b.author?esc(b.author)+' · ':'';
  var meta=m.D+'/'+m.L+' 챕터';
  if(m.last)meta+=' · 마지막 기록 '+ago(m.last);
  if(m.pagePct!=null)meta+=' · 분량 기준 '+Math.round(m.pagePct*100)+'%';
  var stale=m.status==='reading'&&m.last&&(dnum(todayStr())-dnum(m.last))>=7;
  return '<a class="book" href="#book-'+esc(b.id)+'">'+coverHtml(b)+
    '<span class="book-main"><span class="book-title">'+esc(b.title)+(b.example?' <span class="chip">예시</span>':'')+'</span>'+
    '<span class="book-sub">'+by+sub+'</span>'+
    '<span class="bar'+(m.status==='done'?' ok':'')+'"><i style="width:'+Math.round(m.pct*100)+'%"></i></span>'+
    '<span class="book-meta">'+esc(meta)+'</span>'+nextLine(b,m)+'</span>'+
    '<span class="book-side"><b class="pct">'+Math.round(m.pct*100)+'%</b>'+chipHtml(m)+(stale?'<span class="chip warn">7일 넘게 기록 없음</span>':'')+'</span></a>';
}

function activityHtml(list){
  var map=activityByDate(list);
  if(!Object.keys(map).length)return '';
  var cur=currentStreak(map), best=longestStreak(map);
  var cols=heatmapWeeks(map,todayStr(),12);
  var cells=cols.map(function(col){return col.map(function(d){
    return '<i class="hc l'+d.level+(d.future?' fut':'')+'"'+(d.future?'':' title="'+esc(d.date.slice(5).replace('-','/')+' · '+d.count+'챕터')+'"')+'></i>';
  }).join('')}).join('');
  return '<section class="activity" aria-label="최근 12주 독서 기록"><div class="act-h"><b class="mono">'+cur+'</b><span>일 연속</span><span class="muted">· 최장 '+best+'일</span></div>'+
    '<div class="heat" role="img" aria-label="최근 12주 동안 챕터를 읽은 날">'+cells+'</div></section>';
}

function libraryView(){
  var all=Array.from(books.values()).map(function(b){return {b:b,m:metrics(b)}});
  var t=dnum(todayStr()), yr=String(new Date().getFullYear());
  var cnt={all:all.length,reading:0,todo:0,done:0}, doneYear=0, week=0;
  all.forEach(function(x){
    cnt[x.m.status]++;
    if(x.m.status==='done'&&x.m.endStr&&x.m.endStr.slice(0,4)===yr)doneYear++;
    x.m.doneDates.forEach(function(d){var n=dnum(d);if(n!=null&&n>=t-6&&n<=t)week++});
  });
  var head='<div class="lib-head"><h1 class="page">내 서재</h1><a class="btn primary" href="#add">책 추가</a></div>';
  var note=(mode==='local'?'<p class="notice">체험 모드입니다. 기록이 이 브라우저에만 저장됩니다.</p>':'')+
    catalogHtml()+
    (mode==='firebase'?'<div class="tools"><button type="button" class="btn sm" data-act="logout">로그아웃'+(userEmail?' ('+esc(userEmail)+')':'')+'</button></div>':'');
  if(!all.length){
    return head+'<div class="empty"><h2>아직 담은 책이 없습니다</h2><p>\'책 추가\'에서 목차를 붙여 넣거나, 아래 \'담을 수 있는 책\'에서 서재에 담기를 누르세요.</p></div>'+note;
  }
  var strip='<div class="strip"><div class="s"><b>'+cnt.reading+'</b><span>읽는 중</span></div>'+
    '<div class="s"><b>'+cnt.done+'</b><span>완독</span></div>'+
    '<a class="s" href="#year"><b>'+doneYear+'</b><span>올해 완독 · 연간 기록 ›</span></a>'+
    '<div class="s"><b>'+week+'</b><span>최근 7일 완료 챕터</span></div></div>';
  var tabs='<div class="tabs" role="group" aria-label="상태 필터">'+[['all','전체'],['reading','읽는 중'],['todo','읽을 예정'],['done','완독']].map(function(x){
    return '<button type="button" class="tab" data-act="filter" data-v="'+x[0]+'" aria-pressed="'+(ui.filter===x[0])+'">'+x[1]+'<em>'+cnt[x[0]]+'</em></button>';
  }).join('')+'</div>';
  var order={reading:0,todo:1,done:2};
  var list=all.filter(function(x){return (ui.filter==='all'||x.m.status===ui.filter)&&matchBook(x.b,ui.q)});
  list.sort(function(a,c){
    if(order[a.m.status]!==order[c.m.status])return order[a.m.status]-order[c.m.status];
    if(a.m.status==='reading')return (c.m.last||'').localeCompare(a.m.last||'');
    if(a.m.status==='done')return (c.m.endStr||'').localeCompare(a.m.endStr||'');
    return (c.b.createdAt||0)-(a.b.createdAt||0);
  });
  var rows=list.length?'<div class="books">'+list.map(function(x){return bookRow(x.b,x.m)}).join('')+'</div>':'<p class="muted">'+(ui.q?'검색 결과가 없습니다.':'해당하는 책이 없습니다.')+'</p>';
  var search=all.length>1?'<input type="search" class="search" data-act="search" value="'+esc(ui.q)+'" placeholder="제목·저자 검색" aria-label="제목·저자 검색" autocomplete="off">':'';
  return head+strip+activityHtml(all.map(function(x){return x.b}))+search+tabs+rows+note;
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

function chaptersHtml(b,m){
  var ch=b.chapters, nextLeaf=m.status==='done'?-1:m.leafIdx.find(function(i){return !ch[i].done});
  var out='', skipLv=null;
  for(var i=0;i<ch.length;i++){
    var c=ch[i], page=c.p!=null?'<span class="pg">p.'+c.p+'</span>':'';
    if(skipLv!==null){if(c.lv>skipLv)continue;skipLv=null}
    if(isGroup(ch,i)){
      var idx=descLeaves(ch,i), dn=idx.filter(function(j){return ch[j].done}).length, tot=idx.length;
      if(ui.onlyRemaining&&dn===tot)continue;
      var st=dn===tot?'true':dn===0?'false':'mixed', folded=ui.folded.has(b.id+':'+i);
      out+='<li class="ch group" style="--lv:'+c.lv+'"><button type="button" class="chk" role="checkbox" aria-checked="'+st+'" data-act="toggle" data-i="'+i+'" aria-label="'+esc(c.t)+' 전체 완료 표시">'+(st==='true'?CHECK:st==='mixed'?DASH:'')+'</button>'+
        '<div class="ch-main"><span class="ch-title">'+esc(c.t)+'</span>'+page+'</div>'+
        '<div class="ch-tools"><span class="count">'+dn+'/'+tot+'</span><button type="button" class="memo-btn" data-act="fold" data-i="'+i+'" aria-expanded="'+(!folded)+'">'+(folded?'펼치기':'접기')+'</button></div></li>';
      if(folded)skipLv=c.lv;
    }else{
      if(ui.onlyRemaining&&c.done)continue;
      var key=b.id+':'+i, open=ui.openMemo.has(key);
      out+='<li class="ch leaf'+(c.done?' done':'')+'" style="--lv:'+c.lv+'"><button type="button" class="chk" role="checkbox" aria-checked="'+(c.done?'true':'false')+'" data-act="toggle" data-i="'+i+'" aria-label="'+esc(c.t)+' 완료 표시">'+(c.done?CHECK:'')+'</button>'+
        '<div class="ch-main"><span class="ch-title">'+esc(c.t)+(i===nextLeaf?' <span class="chip reading">다음</span>':'')+'</span>'+page+
        (c.memo&&!open?'<span class="ch-memo">'+esc(c.memo)+'</span>':'')+'</div>'+
        '<div class="ch-tools">'+(c.done?'<input type="date" data-act="chdate" data-i="'+i+'" value="'+esc(c.done)+'" aria-label="'+esc(c.t)+' 완료일">':'')+
        (!c.done&&nextLeaf>=0&&i>nextLeaf?'<button type="button" class="memo-btn" data-act="upto" data-i="'+i+'">여기까지 읽음</button>':'')+
        '<button type="button" class="memo-btn'+(c.memo?' has':'')+'" data-act="memo" data-i="'+i+'" aria-expanded="'+open+'">'+(open?'메모 닫기':'메모')+'</button></div></li>';
      if(open)out+='<li class="memo-row" style="--lv:'+c.lv+'"><textarea data-act="memotext" data-i="'+i+'" aria-label="'+esc(c.t)+' 메모" placeholder="이 챕터에서 남기고 싶은 말">'+esc(c.memo)+'</textarea></li>';
    }
  }
  if(!out)out='<li class="ch"><span></span><div class="ch-main muted">남은 챕터가 없습니다.</div></li>';
  return '<ul class="chapters">'+out+'</ul>';
}

function bookView(id){
  var b=books.get(id);
  if(!b)return notFound();
  var m=metrics(b), pct=Math.round(m.pct*100);
  var stale=m.status==='reading'&&m.last&&(dnum(todayStr())-dnum(m.last))>=7;
  var stats=[];
  stats.push(['읽은 기간',m.days?m.days+'일':'—',m.start?'시작 '+fmt(m.start):'시작일 미정']);
  var pace='—', paceSub='챕터를 완료하면 계산돼요';
  if(m.rate){
    pace=paceText(m.rate);
    paceSub=m.status==='done'?'시작일부터 종료일까지 평균':'시작일부터 오늘까지 평균';
  }
  stats.push(['읽는 속도',pace,paceSub]);
  if(m.status==='done')stats.push(['종료일',fmt(m.endStr),'완독']);
  else stats.push(['예상 완독일',m.etaStr?fmt(m.etaStr):'—',m.etaIn!=null?'약 '+m.etaIn+'일 후':'기록이 쌓이면 계산돼요']);
  stats.push(['마지막 기록',m.last?ago(m.last):'—',m.last?fmt(m.last):'아직 없음']);
  var statsHtml='<dl class="stats">'+stats.map(function(s){return '<div class="stat"><dt>'+s[0]+'</dt><dd>'+esc(s[1])+'</dd><small>'+esc(s[2])+'</small></div>'}).join('')+'</dl>';
  var alt=m.pagePct!=null?'<span class="alt">분량 기준 '+Math.round(m.pagePct*100)+'% ('+m.pagesRead+'/'+m.pagesTotal+'쪽)</span>':'';
  var del=ui.confirmDel===b.id?
    '<div class="confirm"><span>이 책의 기록이 모두 삭제됩니다.</span><button type="button" class="btn danger sm" data-act="delyes">삭제</button><button type="button" class="btn sm" data-act="delno">취소</button></div>':
    '<button type="button" class="btn danger sm" data-act="del">책 삭제</button>';
  var rating='<option value="0">평점 없음</option>'+[1,2,3,4,5].map(function(n){return '<option value="'+n+'"'+((b.rating||0)===n?' selected':'')+'>'+n+' / 5</option>'}).join('');
  return '<a class="back" href="#library">← 서재</a>'+
    '<div class="head">'+coverHtml(b,true)+'<div><h1>'+esc(b.title)+(b.example?' <span class="chip">예시</span>':'')+'</h1>'+
    '<div class="by">'+(b.author?esc(b.author)+' · ':'')+chipHtml(m)+(stale?' <span class="chip warn">7일 넘게 기록 없음</span>':'')+(b.totalPages?' · '+b.totalPages+'쪽':'')+'</div></div>'+'<div class="head-actions"><a class="btn sm" href="#edit-'+esc(b.id)+'">정보·목차 수정</a></div></div>'+
    nextPanel(b,m)+doneBanner(b,m)+
    '<section class="panel" aria-label="진척 현황"><div class="prog"><span class="big">'+pct+'%</span><span class="of">'+m.D+' / '+m.L+' 챕터</span>'+alt+'</div>'+
    '<div class="bar lg'+(m.status==='done'?' ok':'')+'"><i style="width:'+pct+'%"></i></div>'+goalHtml(b,m)+statsHtml+'</section>'+
    '<section class="panel" aria-label="날짜"><div class="dates">'+
      '<label class="fld"><span>읽기 시작일</span><input type="date" id="d-start" data-act="start" value="'+esc(b.startDate||'')+'"></label>'+
      '<label class="fld"><span>종료일</span><input type="date" id="d-end" data-act="end" value="'+esc(b.endDate||'')+'"></label>'+
      '<label class="fld"><span>목표 완독일</span><input type="date" id="d-goal" data-act="goal" value="'+esc(b.goalDate||'')+'"></label></div>'+
    '<p class="hint">모든 챕터를 완료하면 종료일이 자동으로 채워집니다. 날짜는 직접 고칠 수 있습니다.</p></section>'+
    '<section class="panel" aria-label="누적 그래프"><h2 class="sec">누적 완료 챕터</h2><div style="margin-top:12px">'+chartSvg(b,m)+'</div></section>'+
    '<div class="sec-h"><h2 class="sec">챕터</h2><button type="button" class="tgl" data-act="remaining" aria-pressed="'+ui.onlyRemaining+'">남은 챕터만 보기</button></div>'+
    chaptersHtml(b,m)+'<div id="memos-box">'+memosHtml(b)+'</div>'+
    '<div class="sec-h"><h2 class="sec">독서 메모</h2></div>'+
    '<div class="panel" style="margin-top:0"><div class="dates"><label class="fld"><span>평점</span><select id="d-rating" data-act="rating">'+rating+'</select></label></div>'+
    '<label class="fld" style="margin-top:12px"><span>전체 느낌, 남기고 싶은 문장</span><textarea id="d-note" data-act="note">'+esc(b.note||'')+'</textarea></label></div>'+
    '<div style="margin-top:28px">'+del+'</div>';
}

function memosHtml(b){
  var list=memosOf(b);
  if(!list.length)return '';
  return '<details class="panel memos"><summary>챕터 메모 모아보기 <em>'+list.length+'</em></summary><ul>'+list.map(function(x){
    return '<li><div class="memo-h"><b>'+esc(x.t)+'</b>'+(x.done?'<span class="mono">'+esc(fmt(x.done))+'</span>':'')+'</div><p>'+esc(x.memo)+'</p></li>';
  }).join('')+'</ul></details>';
}

// 메모를 고친 뒤 모아보기 칸만 바꿉니다(전체를 다시 그리면 누르려던 버튼이 사라질 수 있음).
function refreshMemos(b){
  var box=document.getElementById('memos-box');if(!box)return;
  var d=box.querySelector('details'),open=d&&d.open;
  box.innerHTML=memosHtml(b);
  if(open&&(d=box.querySelector('details')))d.open=true;
}

function yearView(y){
  var s=yearSummary(Array.from(books.values()),y);
  var max=Math.max.apply(null,s.months.concat([1]));
  var tabs=s.years.length>1?'<div class="tabs" role="group" aria-label="연도">'+s.years.map(function(x){
    return '<a class="tab" href="#year-'+x+'" aria-current="'+(x===s.year?'page':'false')+'">'+x+'</a>';
  }).join('')+'</div>':'';
  var strip='<div class="strip"><div class="s"><b>'+s.done.length+'</b><span>완독</span></div>'+
    '<div class="s"><b>'+s.chapters+'</b><span>완료 챕터</span></div>'+
    '<div class="s"><b>'+s.readDays+'</b><span>읽은 날</span></div></div>';
  var bars='<section class="panel" aria-label="월별 완료 챕터"><h2 class="sec">월별 완료 챕터</h2><div class="months">'+s.months.map(function(n,i){
    return '<div class="mo" title="'+(i+1)+'월 · '+n+'챕터"><span class="mo-n mono">'+(n||'')+'</span><i style="height:'+Math.round(n/max*100)+'%"></i><span class="mo-l">'+(i+1)+'</span></div>';
  }).join('')+'</div></section>';
  var list=s.done.length?'<div class="books">'+s.done.map(function(x){
    var sub=fmt(x.end)+' 완독'+(x.days?' · '+x.days+'일':'')+' · '+x.L+'챕터';
    return '<a class="book" href="#book-'+esc(x.id)+'"><span class="cover" style="--h:'+hue(x.title)+'" aria-hidden="true">'+esc(x.title.charAt(0))+'</span>'+
      '<span class="book-main"><span class="book-title">'+esc(x.title)+'</span><span class="book-sub">'+(x.author?esc(x.author)+' · ':'')+esc(sub)+'</span></span>'+
      '<span class="rating mono">'+(x.rating?x.rating+' / 5':'')+'</span></a>';
  }).join('')+'</div>':'<p class="muted">이 해에 완독한 책이 아직 없습니다.</p>';
  return '<a class="back" href="#library">← 서재</a><h1 class="page">'+esc(s.year)+'년 독서 기록</h1>'+tabs+strip+bars+
    '<div class="sec-h"><h2 class="sec">완독한 책</h2></div>'+list;
}

function previewHtml(items){
  if(!items.length)return '<p class="muted">목차를 붙여 넣으면 인식 결과가 여기에 표시됩니다.</p>';
  var leaves=leavesOf(items).length, groups=items.length-leaves, pages=items.filter(function(c){return c.p!=null}).length;
  var rows=items.slice(0,14).map(function(c,i){
    return '<li style="--lv:'+c.lv+'">'+(isGroup(items,i)?'<b>'+esc(c.t)+'</b>':esc(c.t))+(c.p!=null?' <span class="pg">p.'+c.p+'</span>':'')+'</li>';
  }).join('');
  return '<p>읽을 챕터 <b>'+leaves+'</b>개 · 묶음 <b>'+groups+'</b>개'+(pages?' · 시작 페이지 '+pages+'개 인식':'')+'</p><ul class="pv-list">'+rows+'</ul>'+
    (items.length>14?'<p class="muted" style="margin-top:8px">외 '+(items.length-14)+'개 항목</p>':'');
}

function formView(id){
  var b=id?books.get(id):null;
  if(id&&!b)return notFound();
  var v={title:b?b.title:'',author:b?(b.author||''):'',pages:b&&b.totalPages?b.totalPages:'',start:b?(b.startDate||''):todayStr(),goal:b?(b.goalDate||''):'',toc:b?tocText(b):''};
  return '<a class="back" href="'+(b?'#book-'+esc(b.id):'#library')+'">← '+(b?'책으로 돌아가기':'서재')+'</a>'+
    '<h1 class="page">'+(b?'정보·목차 수정':'책 추가')+'</h1>'+
    '<form class="form" id="bookForm" novalidate>'+
      (b?'':'<label class="fld"><span>준비된 책에서 불러오기 (선택)</span><select id="f-cat"><option value="">직접 입력</option></select></label>')+
      '<label class="fld"><span>제목</span><input id="f-title" type="text" value="'+esc(v.title)+'" autocomplete="off"></label>'+
      '<div class="row2">'+
        '<label class="fld"><span>저자 (선택)</span><input id="f-author" type="text" value="'+esc(v.author)+'" autocomplete="off"></label>'+
        '<label class="fld"><span>총 쪽수 (선택)</span><input id="f-pages" type="number" inputmode="numeric" min="1" value="'+esc(v.pages)+'"></label>'+
      '</div>'+
      '<div class="row2">'+
        '<label class="fld"><span>읽기 시작일 (선택)</span><input id="f-start" type="date" value="'+esc(v.start)+'"></label>'+
        '<label class="fld"><span>목표 완독일 (선택)</span><input id="f-goal" type="date" value="'+esc(v.goal)+'"></label>'+
      '</div>'+
      '<label class="fld"><span>목차</span><textarea id="f-toc" spellcheck="false">'+esc(v.toc)+'</textarea></label>'+
      '<p class="hint" style="margin:-8px 0 0">한 줄에 항목 하나. 공백 두 칸 또는 탭으로 들여쓰면 하위 항목이 되고, 1.1 같은 번호도 단계로 인식합니다. 줄 끝에 "........ 123"처럼 쓰면 시작 쪽수로 인식합니다.</p>'+
      '<div class="pv" id="toc-preview" aria-live="polite"></div>'+
      '<p class="err" id="f-err" role="alert" hidden></p>'+
      '<div class="form-actions"><button class="btn primary" type="submit">'+(b?'저장':'책 추가')+'</button><a class="btn" href="'+(b?'#book-'+esc(b.id):'#library')+'">취소</a></div>'+
    '</form>';
}

function bindForm(id){
  var ta=document.getElementById('f-toc'), out=document.getElementById('toc-preview');
  ta.placeholder='1부. 시작하기 ........ 9\n  1장. 왜 읽는가 ........ 11\n  2장. 무엇을 읽는가 ........ 27\n2부. 깊이 읽기 ........ 45\n  3장. 질문하며 읽기 ........ 47';
  function upd(){out.innerHTML=previewHtml(parseToc(ta.value))}
  var cat=document.getElementById('f-cat');
  if(cat){
    fetch('catalog/index.json').then(function(r){return r.json()}).then(function(list){
      list.forEach(function(x){var o=document.createElement('option');o.value=x.file;o.textContent=x.label;cat.appendChild(o)});
    }).catch(function(){});
    cat.addEventListener('change',function(){
      if(!cat.value)return;
      fetch('catalog/'+encodeURIComponent(cat.value)).then(function(r){return r.text()}).then(function(t){
        var c=parseCatalogText(t);
        document.getElementById('f-title').value=c.title;
        document.getElementById('f-author').value=c.author;
        document.getElementById('f-pages').value=c.totalPages||'';
        ta.value=c.toc;upd();
      }).catch(function(){showErr('목록을 불러오지 못했습니다.')});
    });
  }
  ta.addEventListener('input',upd);upd();
  var form=document.getElementById('bookForm'), err=document.getElementById('f-err');
  function showErr(msg){err.textContent=msg;err.hidden=false}
  form.addEventListener('submit',function(ev){
    ev.preventDefault();
    var title=document.getElementById('f-title').value.trim();
    var items=parseToc(ta.value);
    if(!title){showErr('제목을 입력해 주세요.');return}
    if(!items.length){showErr('목차를 한 줄 이상 입력해 주세요.');return}
    var pages=parseInt(document.getElementById('f-pages').value,10);
    var b=id?books.get(id):null, isNew=!b;
    if(isNew)b={id:newId(),createdAt:Date.now(),rating:0,note:'',endDate:null,endAuto:false};
    else{
      var pool=new Map();
      b.chapters.forEach(function(c){if(!pool.has(c.t))pool.set(c.t,[]);pool.get(c.t).push(c)});
      items.forEach(function(it){
        var q=pool.get(it.t);
        if(q&&q.length){var o=q.shift();it.done=o.done||null;it.memo=o.memo||''}
      });
    }
    b.title=title;
    b.author=document.getElementById('f-author').value.trim();
    b.totalPages=pages>0?pages:null;
    b.startDate=document.getElementById('f-start').value||null;
    b.goalDate=document.getElementById('f-goal').value||null;
    b.chapters=items;
    autoDates(b);
    books.set(b.id,b);
    persist(b);
    location.hash='book-'+b.id;
  });
}
/* ---------- 렌더 ---------- */
function render() {
  var ae = document.activeElement, fk = null;
  if (ae && ae !== document.body && ae.dataset && ae.dataset.act) {
    fk = '[data-act="' + ae.dataset.act + '"]' + (ae.dataset.i != null ? '[data-i="' + ae.dataset.i + '"]' : "");
  }
  var r = currentRoute(), html;
  if (phase === "boot") html = loadingView();
  else if (phase !== "app") html = loginView();
  else if (!ready) html = loadingView();
  else if (r.name === "library") html = libraryView();
  else if (r.name === "book") html = bookView(r.id);
  else if (r.name === "year") html = yearView(r.year);
  else html = formView(r.id);
  view.innerHTML = html;
  if (phase === "app" && ready && r.name === "form" && (!r.id || books.has(r.id))) bindForm(r.id);
  if (fk) {
    var n = view.querySelector(fk);
    if (n) {
      n.focus({ preventScroll: true });
      if (n.dataset.act === "search" && typeof ae.selectionStart === "number") { try { n.setSelectionRange(ae.selectionStart, ae.selectionEnd); } catch (e) { /* 무시 */ } }
    }
  }
}

/* ---------- 이벤트 ---------- */
view.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act]");
  if (!el) return;
  var act = el.dataset.act, r = currentRoute(), b = r.name === "book" ? books.get(r.id) : null;
  switch (act) {
    case "login":
      authMsg = "";
      store.signIn().catch(function (err) {
        phase = "error"; authMsg = (err && err.code === "auth/popup-closed-by-user") ? "로그인 창이 닫혔습니다." : ((err && err.message) || "로그인하지 못했습니다.");
        render();
      });
      break;
    case "trial": enterApp("local"); break;
    case "logout": store.signOut(); break;
    case "catadd": addFromCatalog(el.dataset.id); break;
    case "upto":
      if (b) { var ui2 = +el.dataset.i; mutate(b, "여기까지 읽음 처리", function () { completeThrough(b, ui2); }); }
      break;
    case "nextdone":
      if (b) { var ni = nextLeafIndex(b); if (ni >= 0) mutate(b, "읽음: " + b.chapters[ni].t, function () { toggleChapter(b, ni); }); }
      break;
    case "toggle":
      if (b) {
        var ti = +el.dataset.i, tc = b.chapters[ti];
        var lbl = isGroup(b.chapters, ti) ? "묶음 전체 변경: " + tc.t : (tc.done ? "읽음 취소: " : "읽음: ") + tc.t;
        mutate(b, lbl, function () { toggleChapter(b, ti); });
      }
      break;
    case "fold":
      if (b) {
        var fk2 = b.id + ":" + el.dataset.i;
        if (ui.folded.has(fk2)) ui.folded.delete(fk2); else ui.folded.add(fk2);
        saveFolded(); render();
      }
      break;
    case "memo":
      if (b) {
        var k = b.id + ":" + el.dataset.i;
        if (ui.openMemo.has(k)) ui.openMemo.delete(k); else ui.openMemo.add(k);
        render();
        if (ui.openMemo.has(k)) { var ta = view.querySelector('textarea[data-act="memotext"][data-i="' + el.dataset.i + '"]'); if (ta) ta.focus(); }
      }
      break;
    case "filter": ui.filter = el.dataset.v; render(); break;
    case "remaining": ui.onlyRemaining = !ui.onlyRemaining; render(); break;
    case "del": if (b) { ui.confirmDel = b.id; render(); } break;
    case "delno": ui.confirmDel = null; render(); break;
    case "delyes":
      if (b) { ui.confirmDel = null; removeBook(b.id); location.hash = "library"; }
      break;
  }
});
view.addEventListener("input", function (e) {
  if (e.target.dataset && e.target.dataset.act === "search") { ui.q = e.target.value; render(); }
});
view.addEventListener("change", function (e) {
  var el = e.target, act = el.dataset && el.dataset.act;
  if (!act) return;
  var r = currentRoute();
  if (r.name !== "book") return;
  var b = books.get(r.id);
  if (!b) return;
  switch (act) {
    case "start": b.startDate = el.value || null; persist(b); render(); break;
    case "end": b.endDate = metrics(b).status === "done" ? (el.value || null) : null; b.endAuto = false; persist(b); render(); break;
    case "goal": b.goalDate = el.value || null; persist(b); render(); break;
    case "chdate": b.chapters[+el.dataset.i].done = el.value || null; autoDates(b); persist(b); render(); break;
    case "memotext": b.chapters[+el.dataset.i].memo = el.value.trim(); persist(b); refreshMemos(b); break;
    case "rating": b.rating = parseInt(el.value, 10) || 0; persist(b); break;
    case "note": b.note = el.value; persist(b); break;
  }
});

render();
loadCatalog();
store.start(onAuth);

// 화면 파일을 기기에 보관해 오프라인에서도 앱이 열리게 합니다(https 또는 localhost 에서만 동작).
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
