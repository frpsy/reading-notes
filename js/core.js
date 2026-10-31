// 순수 로직 (DOM·Firebase 없음). tests/core.test.js 로 검증합니다.
// 날짜는 모두 'YYYY-MM-DD' 문자열(기기 현지 날짜)로 다룹니다.

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ---------- 날짜 ---------- */
export function pad(n) { return String(n).padStart(2, "0"); }

export function todayStr(now = new Date()) {
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

// 'YYYY-MM-DD' → 1970-01-01 기준 일수. 형식이나 달력상 날짜가 틀리면 null (2026-02-31 같은 값 포함)
export function dnum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime() / 864e5;
}

export function dstr(n) {
  const d = new Date(n * 864e5);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

export function fmtDate(s) { return s ? s.replace(/-/g, ".") : "—"; }

export function fmtShort(n) {
  const d = new Date(n * 864e5);
  return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
}

export function agoText(s, today = todayStr()) {
  const n = dnum(s);
  if (n == null) return "";
  const d = dnum(today) - n;
  return d <= 0 ? "오늘" : d === 1 ? "어제" : d + "일 전";
}

export function newId(now = Date.now(), rnd = Math.random) {
  return "b" + now.toString(36) + rnd().toString(36).slice(2, 5);
}

/* ---------- 목차 파서 ---------- */
// 한 줄에 항목 하나. 들여쓰기(공백 2칸·탭)나 1.1 번호로 단계를 나누고,
// 줄 끝의 "........ 123" 형태를 시작 쪽수로 읽습니다.
export function parseToc(text) {
  const items = [];
  String(text || "").replace(/\r/g, "").split("\n").forEach((raw) => {
    if (!raw.trim()) return;
    const ws = raw.match(/^[ \t　]*/)[0];
    let indent = 0;
    for (const c of ws) indent += (c === "\t" || c === "　") ? 2 : 1;
    let lv = Math.floor(indent / 2);
    let t = raw.trim();
    let p = null;
    const m = t.match(/^(.*?\S)(?:\s*(?:[.·]{2,}|…+)\s*|\t+\s*|\s{3,})(\d{1,4})$/);
    if (m) { t = m[1].trim(); p = parseInt(m[2], 10); }
    if (lv === 0) {
      const n = t.match(/^(\d+(?:\.\d+)*)(?=[.\s)])/);
      if (n) {
        const depth = n[1].split(".").length;
        if (depth > 1) lv = depth - 1;
      }
    }
    items.push({ t, lv, p, done: null, memo: "" });
  });
  let prev = -1;
  items.forEach((it) => {
    if (it.lv > prev + 1) it.lv = prev + 1;
    if (it.lv < 0) it.lv = 0;
    if (it.lv > 3) it.lv = 3;
    prev = it.lv;
  });
  return items;
}

export function tocText(book) {
  return book.chapters.map((c) => "  ".repeat(c.lv) + c.t + (c.p != null ? " ........ " + c.p : "")).join("\n");
}

/* ---------- 챕터 구조 ---------- */
export function isGroup(ch, i) { return i + 1 < ch.length && ch[i + 1].lv > ch[i].lv; }

export function leavesOf(ch) {
  const r = [];
  for (let i = 0; i < ch.length; i++) if (!isGroup(ch, i)) r.push(i);
  return r;
}

export function descLeaves(ch, i) {
  const r = [];
  for (let j = i + 1; j < ch.length && ch[j].lv > ch[i].lv; j++) if (!isGroup(ch, j)) r.push(j);
  return r;
}

// 각 읽을 단위(leaf)의 쪽수. 시작 쪽수가 모자라면 null
export function leafPages(book, leafIdx) {
  const ch = book.chapters;
  const w = [];
  for (const i of leafIdx) {
    if (ch[i].p == null) return null;
    let nxt = null;
    for (let j = i + 1; j < ch.length; j++) if (ch[j].p != null) { nxt = ch[j].p; break; }
    if (nxt == null) {
      if (book.totalPages) nxt = book.totalPages + 1;
      else return null;
    }
    const n = nxt - ch[i].p;
    if (n <= 0) return null;
    w.push(n);
  }
  return w;
}

/* ---------- 지표 ---------- */
export function metrics(book, today = todayStr()) {
  const ch = book.chapters || [];
  const leafIdx = leavesOf(ch);
  const L = leafIdx.length;
  const doneIdx = leafIdx.filter((i) => ch[i].done);
  const D = doneIdx.length;
  const doneDates = doneIdx.map((i) => ch[i].done).sort();
  const last = doneDates.length ? doneDates[doneDates.length - 1] : null;
  const first = doneDates[0] || null;
  const t = dnum(today);
  const start = book.startDate || first;
  const sN = dnum(start);
  const finished = L > 0 && D === L; // 종료일만 있다고 완독이 아님
  const endStr = book.endDate || (finished ? last : null);
  const status = finished ? "done" : ((sN != null && sN <= t) || D > 0) ? "reading" : "todo";
  const eN = finished ? (endStr ? dnum(endStr) : t) : t;
  const days = (sN != null && eN != null && eN >= sN) ? eN - sN + 1 : null;
  const rate = (D > 0 && days) ? D / days : null;
  let etaStr = null;
  let etaIn = null;
  if (status === "reading" && rate && D < L) {
    etaIn = Math.ceil((L - D) / rate);
    etaStr = dstr(t + etaIn);
  }
  const pw = leafPages(book, leafIdx);
  let pagePct = null, pagesRead = null, pagesTotal = null;
  if (pw) {
    pagesTotal = pw.reduce((a, x) => a + x, 0);
    pagesRead = 0;
    leafIdx.forEach((i, k) => { if (ch[i].done) pagesRead += pw[k]; });
    pagePct = pagesRead / pagesTotal;
  }
  const stale = status === "reading" && last != null && (t - dnum(last)) >= 7;
  return {
    leafIdx, L, D, pct: L ? D / L : 0, pagePct, pagesRead, pagesTotal,
    doneDates, last, first, start, endStr, status, days, rate, etaStr, etaIn, stale,
  };
}

// 모든 읽을 단위를 마치면 종료일을 자동으로 채우고, 하나라도 풀면 자동 채운 종료일을 지웁니다.
export function autoDates(book) {
  const ch = book.chapters;
  const leaves = leavesOf(ch);
  const dates = leaves.filter((i) => ch[i].done).map((i) => ch[i].done).sort();
  const L = leaves.length;
  const D = dates.length;
  if (!book.startDate && D > 0) book.startDate = dates[0];
  if (L > 0 && D === L) {
    if (!book.endDate) { book.endDate = dates[dates.length - 1]; book.endAuto = true; }
  } else {
    // 다 읽지 않았으면 종료일은 없음(실수로 입력돼도 완독으로 보이지 않게 비웁니다)
    book.endDate = null;
    book.endAuto = false;
  }
}

// 아직 읽지 않은 첫 읽을 단위의 인덱스. 모두 읽었으면 -1
export function nextLeafIndex(book) {
  const ch = book.chapters || [];
  const i = leavesOf(ch).find((k) => !ch[k].done);
  return i === undefined ? -1 : i;
}

// "여기까지 읽음": 이 단위와 앞의 읽을 단위를 모두 완료 처리. 이미 완료한 날짜는 유지
export function completeThrough(book, i, today = todayStr()) {
  const ch = book.chapters;
  leavesOf(ch).forEach((k) => { if (k <= i && !ch[k].done) ch[k].done = today; });
  autoDates(book);
}

export function toggleChapter(book, i, today = todayStr()) {
  const ch = book.chapters;
  if (isGroup(ch, i)) {
    const idx = descLeaves(ch, i);
    const all = idx.every((j) => ch[j].done);
    idx.forEach((j) => { ch[j].done = all ? null : (ch[j].done || today); });
  } else {
    ch[i].done = ch[i].done ? null : today;
  }
  autoDates(book);
}

// 목표 완독일 안내. 없으면 null
export function goalInfo(book, m, today = todayStr()) {
  if (!book.goalDate || m.status === "done") return null;
  const t = dnum(today);
  const g = dnum(book.goalDate);
  if (g == null) return null;
  const rem = m.L - m.D;
  if (rem <= 0) return null;
  const left = g - t;
  let text;
  if (left < 0) text = `목표일이 ${-left}일 지났습니다. 남은 챕터 ${rem}개`;
  else if (left === 0) text = `오늘이 목표일입니다. 남은 챕터 ${rem}개`;
  else text = `목표일까지 ${left}일, 하루 ${Math.max(rem / left, 0.1).toFixed(1)}챕터씩 읽으면 됩니다.`;
  let cmp = null;
  if (m.etaIn != null) {
    const diff = (t + m.etaIn) - g;
    cmp = diff <= 0
      ? { tone: "done", text: "현재 속도로 목표 이내" }
      : { tone: "warn", text: `현재 속도면 ${diff}일 늦음` };
  }
  return { text, cmp };
}

/* ---------- 독서 기록(연속 일수·히트맵) ---------- */
// 날짜별 완료한 읽을 단위 수
export function activityByDate(books) {
  const map = {};
  books.forEach((b) => {
    const ch = b.chapters || [];
    leavesOf(ch).forEach((i) => { if (ch[i].done) map[ch[i].done] = (map[ch[i].done] || 0) + 1; });
  });
  return map;
}

// 오늘(기록이 없으면 어제)부터 거꾸로 이어진 날 수
export function currentStreak(map, today = todayStr()) {
  let d = dnum(today);
  if (!map[dstr(d)]) d -= 1;
  let n = 0;
  while (map[dstr(d)]) { n++; d -= 1; }
  return n;
}

// 오늘 읽기 알림용 상태. today: 오늘 읽음 / risk: 어제까지 이어진 기록이 오늘 끊길 수 있음 / lapsed: 이틀 넘게 쉼 / none: 기록 없음
export function streakStatus(map, today = todayStr()) {
  const n = dnum(today);
  if (map[dstr(n)]) return { state: "today", streak: currentStreak(map, today), gap: 0 };
  if (map[dstr(n - 1)]) return { state: "risk", streak: currentStreak(map, today), gap: 1 };
  const days = Object.keys(map).map(dnum).filter((d) => d != null && d < n);
  if (!days.length) return { state: "none", streak: 0, gap: 0 };
  return { state: "lapsed", streak: 0, gap: n - Math.max(...days) };
}

export function longestStreak(map) {
  const days = Object.keys(map).map(dnum).filter((n) => n != null).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  days.forEach((d) => {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  });
  return best;
}

export function heatLevel(count) { return !count ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : 3; }

// 일요일 시작 주 단위 열. 마지막 열이 오늘이 있는 주
export function heatmapWeeks(map, today = todayStr(), weeks = 12) {
  const t = dnum(today);
  const dow = (t + 4) % 7; // 1970-01-01 은 목요일
  const start = t - dow - (weeks - 1) * 7;
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const n = start + w * 7 + d;
      const date = dstr(n);
      col.push({ date, count: map[date] || 0, level: heatLevel(map[date] || 0), future: n > t });
    }
    cols.push(col);
  }
  return cols;
}

/* ---------- 누적 그래프 ---------- */
export function chartGeometry(book, m, today = todayStr()) {
  if (!m.doneDates.length) return null;
  const W = 420, H = 200, ml = 34, mr = 14, mt = 18, mb = 28;
  const L = m.L;
  const t = dnum(today);
  const firstN = dnum(m.doneDates[0]);
  const lastN = dnum(m.doneDates[m.doneDates.length - 1]);
  const sN = dnum(m.start);
  const x0 = sN != null ? Math.min(sN, firstN) : firstN;
  const goalN = book.goalDate ? dnum(book.goalDate) : null;
  let x1;
  if (m.status === "done") x1 = Math.max(m.endStr ? dnum(m.endStr) : lastN, lastN);
  else {
    x1 = Math.max(t, lastN);
    if (goalN != null) x1 = Math.max(x1, goalN);
  }
  if (x1 <= x0) x1 = x0 + 1;
  const X = (d) => ml + (d - x0) / (x1 - x0) * (W - ml - mr);
  const Y = (v) => mt + (1 - v / L) * (H - mt - mb);
  const byDate = {};
  m.doneDates.forEach((d) => { byDate[d] = (byDate[d] || 0) + 1; });
  let cum = 0;
  let path = "M" + X(x0).toFixed(1) + " " + Y(0).toFixed(1);
  Object.keys(byDate).sort().forEach((k) => {
    cum += byDate[k];
    path += " H" + X(dnum(k)).toFixed(1) + " V" + Y(cum).toFixed(1);
  });
  const endN = m.status === "done" ? x1 : Math.min(Math.max(t, lastN), x1);
  path += " H" + X(endN).toFixed(1);
  const area = path + " V" + Y(0).toFixed(1) + " Z";
  let ticks = [0];
  if (L >= 4) ticks.push(Math.round(L / 2));
  ticks.push(L);
  ticks = ticks.filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ v, y: Y(v) }));
  const showToday = m.status !== "done" && t >= x0 && t <= x1;
  const showGoal = m.status !== "done" && goalN != null && goalN >= x0 && goalN <= x1;
  return {
    W, H, ml, mr, mt, mb, L, D: m.D, path, area, ticks,
    today: { show: showToday, x: X(t) },
    goal: { show: showGoal, x: goalN != null ? X(goalN) : 0 },
    dot: { x: X(endN), y: Y(m.D) },
    xStart: x0, xEnd: x1,
  };
}

/* ---------- 메모·검색·연간 기록 ---------- */
// 메모가 있는 챕터(목차 순서)
export function memosOf(book) {
  return (book.chapters || []).map((c, i) => ({ i, t: c.t, memo: c.memo, done: c.done })).filter((x) => x.memo);
}

// 제목·저자에 검색어가 들어 있는지(대소문자·공백 무시)
export function matchBook(book, q) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
  const k = norm(q);
  return !k || norm(book.title).includes(k) || norm(book.author).includes(k);
}

// 한 해의 독서 기록: 완독한 책(종료일 순), 월별 완료 챕터 수, 읽은 날 수, 기록이 있는 해 목록(최근 순)
export function yearSummary(books, year, today = todayStr()) {
  const y = String(year);
  const years = new Set([today.slice(0, 4)]);
  const months = Array(12).fill(0);
  const dayset = new Set();
  const done = [];
  books.forEach((b) => {
    const m = metrics(b, today);
    m.doneDates.forEach((d) => {
      years.add(d.slice(0, 4));
      if (d.slice(0, 4) === y) { months[+d.slice(5, 7) - 1]++; dayset.add(d); }
    });
    if (m.status === "done" && m.endStr) {
      years.add(m.endStr.slice(0, 4));
      if (m.endStr.slice(0, 4) === y) done.push({ id: b.id, title: b.title, author: b.author || "", end: m.endStr, rating: b.rating || 0, days: m.days, L: m.L });
    }
  });
  done.sort((a, b) => a.end.localeCompare(b.end));
  return { year: y, years: [...years].sort().reverse(), done, months, chapters: months.reduce((a, x) => a + x, 0), readDays: dayset.size };
}

/* ---------- 책 데이터 정리 ---------- */
const isDateStr = (s) => typeof s === "string" && dnum(s) != null;

// 저장소·백업에서 읽은 값을 앱이 쓰는 모양으로 맞춥니다. 키 순서가 항상 같습니다.
export function normalizeBook(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const chapters = (Array.isArray(r.chapters) ? r.chapters : []).map((c) => {
    const x = c && typeof c === "object" ? c : {};
    const p = Number.isFinite(x.p) ? Math.trunc(x.p) : null;
    const lv = Number.isFinite(x.lv) ? Math.min(3, Math.max(0, Math.trunc(x.lv))) : 0;
    return {
      t: String(x.t == null ? "" : x.t),
      lv,
      p,
      done: isDateStr(x.done) ? x.done : null,
      memo: String(x.memo == null ? "" : x.memo),
    };
  }).filter((c) => c.t);
  let prev = -1;
  chapters.forEach((c) => { if (c.lv > prev + 1) c.lv = prev + 1; prev = c.lv; });
  const pages = Number.isFinite(r.totalPages) && r.totalPages > 0 ? Math.trunc(r.totalPages) : null;
  const rating = Number.isFinite(r.rating) ? Math.min(5, Math.max(0, Math.trunc(r.rating))) : 0;
  const lf = leavesOf(chapters);
  const allDone = lf.length > 0 && lf.every((i) => chapters[i].done);
  return {
    id: String(r.id || ""),
    title: String(r.title == null ? "" : r.title),
    author: String(r.author == null ? "" : r.author),
    totalPages: pages,
    startDate: isDateStr(r.startDate) ? r.startDate : null,
    endDate: allDone && isDateStr(r.endDate) ? r.endDate : null, // 다 읽지 않은 책의 종료일은 버림
    endAuto: allDone && r.endAuto === true,
    goalDate: isDateStr(r.goalDate) ? r.goalDate : null,
    rating,
    note: String(r.note == null ? "" : r.note),
    createdAt: Number.isFinite(r.createdAt) ? r.createdAt : 0,
    updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
    chapters,
  };
}

/* ---------- 준비된 책(catalog) 문안 ---------- */
// 제목: / 저자: / 쪽수: / 출처: 머리말 뒤에 "목차:" 줄과 목차 본문이 옵니다.
export function parseCatalogText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const head = {};
  let i = 0;
  for (; i < lines.length; i++) {
    if (/^목차\s*:/.test(lines[i])) { i++; break; }
    const m = /^(제목|저자|쪽수|출처)\s*:\s*(.*)$/.exec(lines[i]);
    if (m) head[m[1]] = m[2].trim();
  }
  return {
    title: head["제목"] || "",
    author: head["저자"] || "",
    totalPages: parseInt(head["쪽수"], 10) || null,
    source: head["출처"] || "",
    toc: lines.slice(i).join("\n").trim(),
  };
}

// 입력을 조용히 자르지 않고, 저장 전에 제한을 안내합니다.
export function validateBook(b) {
  if (!b.title || b.title.length > 200) return '제목은 1~200자로 입력해 주세요.';
  if ((b.author || '').length > 100) return '저자는 100자까지 입력할 수 있습니다.';
  if ((b.note || '').length > 20000) return '독서 메모는 20,000자까지 입력할 수 있습니다.';
  if (!Array.isArray(b.chapters) || !b.chapters.length || b.chapters.length > 3000) return '목차는 1~3,000개 항목으로 입력해 주세요.';
  if (b.chapters.some(c => !c.t || c.t.length > 300)) return '목차 제목은 항목마다 1~300자로 입력해 주세요.';
  if (b.chapters.some(c => (c.memo || '').length > 2000)) return '챕터 메모는 2,000자까지 입력할 수 있습니다.';
  if (new TextEncoder().encode(JSON.stringify(b)).length > 900000) return '책의 기록이 너무 큽니다. 목차나 메모를 줄여 주세요.';
  return '';
}
