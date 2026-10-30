// 책갈피 화면 코드. 순수 로직은 core.js, 저장소는 store.js 에 있습니다.
import {
  escapeHtml, todayStr, dnum, fmtDate, fmtShort, agoText, parseToc,
  isGroup, leavesOf, descLeaves, metrics as calcMetrics, autoDates, toggleChapter as toggle,
  goalInfo, chartGeometry, normalizeBook, parseCatalogText,
} from "./core.js";
import * as store from "./store.js";

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
var ui = { filter: "all", onlyRemaining: false, openMemo: new Set(), confirmDel: null };

/* ---------- 저장 ---------- */
var SYNC_TEXT = { pending: "연결 중…", saved: "저장됨", saving: "저장 중…", error: "저장 실패 · 다시 시도", local: "이 브라우저에만 저장" };
function setSync(s, msg) {
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
syncEl.addEventListener("click", function () {
  if (syncEl.dataset.state === "error") { dirty.forEach(function (id) { flush(id); }); setSync("saving"); }
});

function markReady() {
  if (ready) return;
  ready = true;
  clearTimeout(readyTimer);
  render();
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
  if (changed) render();
}
function enterApp(m) {
  mode = m; phase = "app"; ready = false;
  books.clear(); lastJson.clear();
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
  phase = st.state; ready = false; books.clear(); lastJson.clear();
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
  if ((m = /^book-(.+)$/.exec(h))) return { name: "book", id: m[1] };
  return { name: "library" };
}
window.addEventListener("hashchange", function () { ui.confirmDel = null; render(); window.scrollTo(0, 0); });

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
    '<span class="book-meta">'+esc(meta)+'</span></span>'+
    '<span class="book-side"><b class="pct">'+Math.round(m.pct*100)+'%</b>'+chipHtml(m)+(stale?'<span class="chip warn">7일 넘게 기록 없음</span>':'')+'</span></a>';
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
  var head='<div class="lib-head"><h1 class="page">내 서재</h1></div>';
  var note=(mode==='local'?'<p class="notice">체험 모드입니다. 기록이 이 브라우저에만 저장됩니다.</p>':'')+
    catalogHtml()+'<div class="tools">'+
    (mode==='firebase'?'<button type="button" class="btn sm" data-act="logout">로그아웃'+(userEmail?' ('+esc(userEmail)+')':'')+'</button>':'')+'</div>';
  if(!all.length){
    return head+'<div class="empty"><h2>아직 담은 책이 없습니다</h2><p>책은 Claude에게 \'책 이름\'을 말해 추가합니다. 추가되면 아래에 나타나고, 담기를 누르면 서재에 들어옵니다.</p></div>'+note;
  }
  var strip='<div class="strip"><div class="s"><b>'+cnt.reading+'</b><span>읽는 중</span></div>'+
    '<div class="s"><b>'+cnt.done+'</b><span>완독</span></div>'+
    '<div class="s"><b>'+doneYear+'</b><span>올해 완독</span></div>'+
    '<div class="s"><b>'+week+'</b><span>최근 7일 완료 챕터</span></div></div>';
  var tabs='<div class="tabs" role="group" aria-label="상태 필터">'+[['all','전체'],['reading','읽는 중'],['todo','읽을 예정'],['done','완독']].map(function(x){
    return '<button type="button" class="tab" data-act="filter" data-v="'+x[0]+'" aria-pressed="'+(ui.filter===x[0])+'">'+x[1]+'<em>'+cnt[x[0]]+'</em></button>';
  }).join('')+'</div>';
  var order={reading:0,todo:1,done:2};
  var list=all.filter(function(x){return ui.filter==='all'||x.m.status===ui.filter});
  list.sort(function(a,c){
    if(order[a.m.status]!==order[c.m.status])return order[a.m.status]-order[c.m.status];
    if(a.m.status==='reading')return (c.m.last||'').localeCompare(a.m.last||'');
    if(a.m.status==='done')return (c.m.endStr||'').localeCompare(a.m.endStr||'');
    return (c.b.createdAt||0)-(a.b.createdAt||0);
  });
  var rows=list.length?'<div class="books">'+list.map(function(x){return bookRow(x.b,x.m)}).join('')+'</div>':'<p class="muted">해당하는 책이 없습니다.</p>';
  return head+strip+tabs+rows+note;
}

function goalHtml(b, m) {
  var g = goalInfo(b, m);
  if (!g) return "";
  var cmp = g.cmp ? ' <span class="chip ' + g.cmp.tone + '">' + esc(g.cmp.text) + "</span>" : "";
  return '<p class="goal">' + esc(g.text) + cmp + "</p>";
}

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
    s += '<text class="ch-lbl" x="' + g.today.x.toFixed(1) + '" y="11" text-anchor="' + (g.today.x > W - 50 ? "end" : "middle") + '">오늘</text>';
  }
  if (g.goal.show) {
    s += '<line class="ch-mark" x1="' + g.goal.x.toFixed(1) + '" x2="' + g.goal.x.toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"/>';
    if (!g.today.show || Math.abs(g.goal.x - g.today.x) > 40) s += '<text class="ch-lbl" x="' + g.goal.x.toFixed(1) + '" y="11" text-anchor="' + (g.goal.x > W - 50 ? "end" : "middle") + '">목표</text>';
  }
  s += '<circle class="ch-dot" cx="' + g.dot.x.toFixed(1) + '" cy="' + g.dot.y.toFixed(1) + '" r="4.5"/>';
  s += '<text class="ch-lbl" x="' + ml + '" y="' + (H - 8) + '" text-anchor="start">' + fmtShort(g.xStart) + "</text>";
  s += '<text class="ch-lbl" x="' + (W - mr) + '" y="' + (H - 8) + '" text-anchor="end">' + fmtShort(g.xEnd) + "</text>";
  return s + "</svg>";
}

function chaptersHtml(b,m){
  var ch=b.chapters, nextLeaf=m.status==='done'?-1:m.leafIdx.find(function(i){return !ch[i].done});
  var out='';
  for(var i=0;i<ch.length;i++){
    var c=ch[i], page=c.p!=null?'<span class="pg">p.'+c.p+'</span>':'';
    if(isGroup(ch,i)){
      var idx=descLeaves(ch,i), dn=idx.filter(function(j){return ch[j].done}).length, tot=idx.length;
      if(ui.onlyRemaining&&dn===tot)continue;
      var st=dn===tot?'true':dn===0?'false':'mixed';
      out+='<li class="ch group" style="--lv:'+c.lv+'"><button type="button" class="chk" role="checkbox" aria-checked="'+st+'" data-act="toggle" data-i="'+i+'" aria-label="'+esc(c.t)+' 전체 완료 표시">'+(st==='true'?CHECK:st==='mixed'?DASH:'')+'</button>'+
        '<div class="ch-main"><span class="ch-title">'+esc(c.t)+'</span>'+page+'</div>'+
        '<div class="ch-tools"><span class="count">'+dn+'/'+tot+'</span></div></li>';
    }else{
      if(ui.onlyRemaining&&c.done)continue;
      var key=b.id+':'+i, open=ui.openMemo.has(key);
      out+='<li class="ch leaf'+(c.done?' done':'')+'" style="--lv:'+c.lv+'"><button type="button" class="chk" role="checkbox" aria-checked="'+(c.done?'true':'false')+'" data-act="toggle" data-i="'+i+'" aria-label="'+esc(c.t)+' 완료 표시">'+(c.done?CHECK:'')+'</button>'+
        '<div class="ch-main"><span class="ch-title">'+esc(c.t)+(i===nextLeaf?' <span class="chip reading">다음</span>':'')+'</span>'+page+
        (c.memo&&!open?'<span class="ch-memo">'+esc(c.memo)+'</span>':'')+'</div>'+
        '<div class="ch-tools">'+(c.done?'<input type="date" data-act="chdate" data-i="'+i+'" value="'+esc(c.done)+'" aria-label="'+esc(c.t)+' 완료일">':'')+
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
    pace=m.rate>=1?'하루 '+m.rate.toFixed(1)+'챕터':'챕터당 '+(1/m.rate).toFixed(1)+'일';
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
    '<div class="by">'+(b.author?esc(b.author)+' · ':'')+chipHtml(m)+(stale?' <span class="chip warn">7일 넘게 기록 없음</span>':'')+(b.totalPages?' · '+b.totalPages+'쪽':'')+'</div></div>'+'</div>'+
    '<section class="panel" aria-label="진척 현황"><div class="prog"><span class="big">'+pct+'%</span><span class="of">'+m.D+' / '+m.L+' 챕터</span>'+alt+'</div>'+
    '<div class="bar lg'+(m.status==='done'?' ok':'')+'"><i style="width:'+pct+'%"></i></div>'+goalHtml(b,m)+statsHtml+'</section>'+
    '<section class="panel" aria-label="날짜"><div class="dates">'+
      '<label class="fld"><span>읽기 시작일</span><input type="date" id="d-start" data-act="start" value="'+esc(b.startDate||'')+'"></label>'+
      '<label class="fld"><span>종료일</span><input type="date" id="d-end" data-act="end" value="'+esc(b.endDate||'')+'"></label>'+
      '<label class="fld"><span>목표 완독일</span><input type="date" id="d-goal" data-act="goal" value="'+esc(b.goalDate||'')+'"></label></div>'+
    '<p class="hint">모든 챕터를 완료하면 종료일이 자동으로 채워집니다. 날짜는 직접 고칠 수 있습니다.</p></section>'+
    '<section class="panel" aria-label="누적 그래프"><h2 class="sec">누적 완료 챕터</h2><div style="margin-top:12px">'+chartSvg(b,m)+'</div></section>'+
    '<div class="sec-h"><h2 class="sec">챕터</h2><button type="button" class="tgl" data-act="remaining" aria-pressed="'+ui.onlyRemaining+'">남은 챕터만 보기</button></div>'+
    chaptersHtml(b,m)+
    '<div class="sec-h"><h2 class="sec">독서 메모</h2></div>'+
    '<div class="panel" style="margin-top:0"><div class="dates"><label class="fld"><span>평점</span><select id="d-rating" data-act="rating">'+rating+'</select></label></div>'+
    '<label class="fld" style="margin-top:12px"><span>전체 느낌, 남기고 싶은 문장</span><textarea id="d-note" data-act="note">'+esc(b.note||'')+'</textarea></label></div>'+
    '<div style="margin-top:28px">'+del+'</div>';
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
  else html = bookView(r.id);
  view.innerHTML = html;
  if (fk) { var n = view.querySelector(fk); if (n) n.focus({ preventScroll: true }); }
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
    case "toggle":
      if (b) { toggleChapter(b, +el.dataset.i); persist(b); render(); }
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
view.addEventListener("change", function (e) {
  var el = e.target, act = el.dataset && el.dataset.act;
  if (!act) return;
  var r = currentRoute();
  if (r.name !== "book") return;
  var b = books.get(r.id);
  if (!b) return;
  switch (act) {
    case "start": b.startDate = el.value || null; persist(b); render(); break;
    case "end": b.endDate = el.value || null; b.endAuto = false; persist(b); render(); break;
    case "goal": b.goalDate = el.value || null; persist(b); render(); break;
    case "chdate": b.chapters[+el.dataset.i].done = el.value || null; autoDates(b); persist(b); render(); break;
    case "memotext": b.chapters[+el.dataset.i].memo = el.value.trim(); persist(b); break;
    case "rating": b.rating = parseInt(el.value, 10) || 0; persist(b); break;
    case "note": b.note = el.value; persist(b); break;
  }
});

render();
loadCatalog();
store.start(onAuth);
