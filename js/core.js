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

// 읽은 날 입력값: 형식이 틀리면 null, 오늘보다 뒤면 오늘로 맞춥니다.
export function clampPastDate(s, today = todayStr()) {
  const n = dnum(s);
  if (n == null) return null;
  return n > dnum(today) ? today : s;
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

/* ---------- 서점 페이지 붙여넣기 ---------- */
// YES24·알라딘·교보문고 상품 페이지를 통째로 복사해 붙여 넣으면 제목·저자·출판사·쪽수·ISBN·목차를 골라냅니다.
// 목차만 붙여 넣어도 됩니다. 찾지 못한 값은 비워 두고(추측하지 않음) found 에 무엇을 찾았는지 남깁니다.
const WEB_PAGE = /(?:로그인|회원가입|장바구니|카트에 넣기|바로구매|고객센터|Copyright|All Rights Reserved)/i;
const TOC_HEAD = /^\s*(?:\[\s*)?목\s*차(?:\s*\])?(?:\s*(?:보기|열기|펼치기|펼쳐보기))?\s*$/;
const TOC_STOP = /^\s*(?:접어보기|펼쳐보기|더보기|닫기|저자\s*소개|작가\s*소개|저자소개|역자\s*소개|옮긴이\s*소개|책\s*속으로|책\s*속에서|책속에서|출판사\s*리뷰|출판사\s*서평|출판사\s*제공|추천평|추천사|회원\s*리뷰|리뷰|한줄평|품목\s*정보|상세\s*이미지|북\s*트레일러|이\s*책의|카테고리|관련\s*분류|이벤트|책\s*소개|기본\s*정보|주제\s*분류|함께\s*(?:구매|산|본)|구매\s*혜택|배송|교환|반품|작가의\s*다른|이\s*상품의|선택한\s*상품|미리보기)(?:\s|\(|$)/;
const MARK_PART = /^(?:part\s*\d+|파트\s*\d+|제?\s*\d+\s*부(?:\s|[.:]|$)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.:]?\s|section\s*\d+)/i;
const MARK_CH = /^(?:chapter\s*\d+|챕터\s*\d+|제?\s*\d+\s*(?:장|강|화|편)(?:\s|[.:]|$)|\d+(?:\.\d+)*\s*[.)]?\s+\S|\d+[.)]\S)/i;
const MARK_EDGE = /^(?:prologue|epilogue|introduction|intro|preface|appendix|notes?|index|프롤로그|에필로그|서문|서론|결론|머리말|머리글|들어가며|들어가는\s*말|시작하며|여는\s*글|나오며|나가며|맺음말|맺는\s*말|마치며|닫는\s*글|부록|주석?(?:\s*\(|$|\s)|미주|참고\s*문헌|찾아보기|색인|감사의\s*(?:말|글)|옮긴이의\s*말|역자\s*(?:후기|의\s*말)|해제|추천의\s*(?:말|글)|더\s*읽을거리|작가의\s*말|저자의\s*말)/i;
function cleanTitle(t) {
  t = String(t || "").replace(/^\s*\[(?:도서|eBook|전자책|중고|국내도서|외국도서)\]\s*/i, "");
  t = t.split(/\s+\|\s+/)[0];                       // 알라딘 "제목 : 부제 | 시리즈"
  t = t.split(/\s+[:：]\s+/)[0];                     // "제목 : 부제"
  t = t.replace(/\s*\[\s*[^\]]*\]\s*/g, " ");          // [ 양장 ] 같은 표기
  t = t.replace(/\s*\((?=[^)]*(?:판|에디션|기념|개정|합본|양장|반양장|무선|리커버|특별))[^)]*\)\s*/g, " ");
  t = t.replace(/^[A-Z][A-Z0-9&'.\- ]{3,}\s+(?=[가-힣])/, ""); // YES24 "STRESS 스트레스"
  return t.replace(/\s+/g, " ").trim();
}
function authorFromLine(line) {
  let m;
  // YES24: "제임스 클리어 저/이한이 역 | 비즈니스북스 | 2019년 02월 26일"
  if ((m = line.match(/^(.+?)\s*(?:저|글|지음|著)(?:\s*[\/·,]\s*.+?)?\s*\|\s*([^|]+?)\s*\|\s*(?:\d{4}[년.\-])/))) return { author: m[1], publisher: m[2] };
  // 알라딘: "로버트 M. 새폴스키 (지은이),이재담 (옮긴이)사이언스북스2008-11-28"
  if ((m = line.match(/^(.+?)\s*\((?:지은이|글|저자)\)(?:.*\((?:옮긴이|그림|엮은이|감수)\))?\s*(.*?)(\d{4}-\d{2}-\d{2})/))) return { author: m[1], publisher: m[2].replace(/^[,\s]+/, "") };
  // 교보문고: "로버트 M. 새폴스키 저자(글) · 이재담 번역 · 사이언스북스 · 2008년 11월 28일"
  if ((m = line.match(/^(.+?)\s*저자(?:\(글\))?(?:\s*[·∙|]\s*.+?(?:번역|옮김|역|그림))*\s*[·∙|]\s*([^·∙|]+?)\s*[·∙|]\s*\d{4}[년.\-]/))) return { author: m[1], publisher: m[2] };
  return null;
}
export function parseBookPaste(text) {
  const out = { title: "", author: "", publisher: "", pages: null, isbn: "", toc: "", found: [] };
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const t = lines.map((l) => l.replace(/ /g, " ").trimEnd());
  // 저자 줄과 그 위의 제목 줄
  let ai = -1;
  for (let i = 0; i < t.length; i++) { const a = authorFromLine(t[i].trim()); if (a) { ai = i; out.author = a.author.replace(/\s*외\s*\d*명?$/, "").trim(); out.publisher = a.publisher.trim(); break; } }
  // 교보문고는 "저자명 / 저자(글) / 역자 / 번역 / 출판사 / · / 날짜"가 한 줄씩 나뉩니다.
  if (ai < 0) {
    const ki = t.findIndex((l) => /^\s*저자(?:\(글\))?\s*$/.test(l));
    if (ki > 0) {
      const back = (i) => { i--; while (i >= 0 && !t[i].trim()) i--; return i; };
      const fwd = (i) => { i++; while (i < t.length && !t[i].trim()) i++; return i; };
      const na = back(ki);
      out.author = t[na].trim();
      let j = fwd(ki);
      while (j < t.length && (/^\s*(?:번역|옮김|그림|감수|엮음|역)\s*$/.test(t[j + 1] || "") || /^\s*(?:번역|옮김|그림|감수|엮음|역)\s*$/.test(t[j]))) j = fwd(j);
      if (j < t.length && !/^\s*[·∙]\s*$/.test(t[j]) && !/\d{4}년/.test(t[j])) out.publisher = t[j].trim();
      // 제목: 저자 위로 가격·판매처 줄을 건너뛰고, 빈 줄로 떨어진 부제가 있으면 그 위 줄이 제목입니다.
      const skip = (l) => !l.trim() || /원$|^(?:국내도서|외국도서|eBook|전자책|중고|sam|오디오북)$/i.test(l.trim());
      let c = na - 1; while (c >= 0 && skip(t[c])) c--;
      let c2 = c - 1, gap = false; while (c2 >= 0 && !t[c2].trim()) { c2--; gap = true; }
      out.title = cleanTitle(gap && c2 >= 0 ? t[c2] : t[c]);
      ai = na;
    }
  }
  if (ai > 0 && !out.title) {
    let k = ai - 1;
    while (k >= 0 && !t[k].trim()) k--;
    if (k >= 0) out.title = cleanTitle(t[k]);
    // YES24 는 '도서정보' 바로 위에 부제 없는 짧은 제목을 한 번 더 씁니다.
    const di = t.findIndex((l, i) => i > ai && /^\s*도서\s*정보\s*$/.test(l));
    if (di > 0) { let j = di - 1; while (j > ai && !t[j].trim()) j--; const short = cleanTitle(t[j]); if (short && out.title.indexOf(short) === 0 || (short && short.length < out.title.length && out.title.includes(short))) out.title = short; }
  }
  const joined = t.join("\n");
  let m = joined.match(/쪽수[^\n]*?(\d{2,5})\s*(?:쪽|페이지|p\b)/) || joined.match(/(?:^|[\s|,(])(\d{2,5})\s*쪽(?:\s*\||\s*,|\s*$|\s*\))/m);
  if (m) out.pages = parseInt(m[1], 10);
  m = joined.match(/(?:ISBN(?:13)?[^\n\d]*)?\b(97[89][\d\- ]{10,14})/i);
  if (m) { const digits = m[1].replace(/\D/g, ""); if (digits.length === 13) out.isbn = digits; }
  // 목차: '목차' 머리 다음부터 다른 영역 제목 전까지. 머리가 없고 저자 줄도 없으면 전체를 목차로 봅니다.
  let start = t.findIndex((l) => TOC_HEAD.test(l));
  let body;
  if (start >= 0) {
    body = [];
    for (let i = start + 1; i < t.length; i++) { if (TOC_STOP.test(t[i])) break; body.push(t[i]); }
  } else body = ai >= 0 || WEB_PAGE.test(joined) ? [] : t.slice(); // 상품 페이지가 아닌 웹 화면 전체는 목차로 쓰지 않습니다.
  out.toc = tidyToc(body);
  ["title", "author", "publisher", "pages", "isbn"].forEach((k) => { if (out[k]) out.found.push(k); });
  if (out.toc) out.found.push("toc");
  return out;
}
// 서점 목차 정리: 빈 줄·판권 줄을 빼고, 장 아래 소개 줄(절 목록)을 빼고, 부 아래 장을 들여씁니다.
export function tidyToc(rawLines) {
  const src = (Array.isArray(rawLines) ? rawLines : String(rawLines || "").replace(/\r/g, "").split("\n"));
  const rows = [];
  src.forEach((raw) => {
    const s = raw.replace(/ /g, " ");
    const trimmed = s.trim();
    if (!trimmed) return;
    if (/^(?:화보\s*)?판권$|^화보$|^(?:목차|목\s*차)$/.test(trimmed)) return;
    rows.push({ raw: s.replace(/\s+$/, ""), t: trimmed, indented: /^[ \t　]/.test(s) });
  });
  if (!rows.length) return "";
  const kind = (x) => MARK_PART.test(x) ? "part" : MARK_CH.test(x) ? "ch" : MARK_EDGE.test(x) ? "edge" : "";
  rows.forEach((r) => { r.k = kind(r.t); });
  const marked = rows.filter((r) => r.k).length;
  const structured = marked >= 3 && !rows.some((r) => r.indented);
  const kept = [];
  rows.forEach((r) => {
    if (structured) {
      if (/\s[｜|]\s/.test(r.t)) return;                       // 절 목록 줄
      const prev = kept[kept.length - 1];
      if (!r.k && prev && prev.k === "ch") return;            // 장 바로 아래 소개 줄
    }
    kept.push(r);
  });
  const hasPart = structured && kept.some((r) => r.k === "part") && kept.some((r) => r.k === "ch");
  let inPart = false;
  return kept.map((r) => {
    if (!structured) return r.raw;
    if (r.k === "part") { inPart = true; return r.t; }
    if (r.k === "edge") { inPart = false; return r.t; }
    return (hasPart && inPart ? "  " : "") + r.t;
  }).join("\n");
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
  // 각 위치 바로 다음의 알려진 시작 쪽수를 한 번의 역방향 순회로 구합니다.
  // 묶음 항목의 쪽수도 다음 경계로 사용해 기존 계산 결과를 유지합니다.
  const nextPages = new Array(ch.length);
  let next = null;
  for (let j = ch.length - 1; j >= 0; j--) {
    nextPages[j] = next;
    if (ch[j].p != null) next = ch[j].p;
  }
  for (const i of leafIdx) {
    if (ch[i].p == null) return null;
    const nxt = nextPages[i] ?? (book.totalPages ? book.totalPages + 1 : null);
    if (nxt == null) return null;
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
  // 예상 완독일은 기록이 충분할 때만(완료 3챕터 이상, 기간 3일 이상) 계산합니다. 근거는 rate(시작일부터 평균 속도)입니다.
  if (status === "reading" && rate && D < L && D >= 3 && days >= 3) {
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
      : { tone: "reading", text: `현재 속도로는 목표보다 ${diff}일 뒤` };
  }
  return { text, cmp };
}

/* ---------- 독서 기록(연속 일수·히트맵) ---------- */
// 날짜별 완료한 읽을 단위 수
// 최근 n일(오늘 포함, 오래된 날부터)의 읽은 챕터 수. 서재의 '최근 7일' 리듬 표시에 씁니다.
export function recentDays(map, today = todayStr(), n = 7) {
  const end = dnum(today);
  if (end == null) return [];
  const out = [];
  for (let k = n - 1; k >= 0; k--) { const date = dstr(end - k); out.push({ date: date, count: map[date] || 0 }); }
  return out;
}

// 책 상세의 진도 칸: 읽을 단위(챕터)마다 한 칸. 많으면 칸 대신 기존 막대를 씁니다.
export function progressSegments(book, max = 60) {
  const ch = book.chapters || [];
  const leaves = leavesOf(ch);
  if (!leaves.length || leaves.length > max) return null;
  const next = nextLeafIndex(book);
  return leaves.map((i) => ({ i: i, done: !!ch[i].done, next: i === next }));
}

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

// 히트맵 위의 월 표시: 열(주)의 첫날이 새 달이면 'N월'. 바로 붙은 두 표시는 앞의 것을 뺍니다.
export function heatmapMonths(cols) {
  const out = cols.map(function () { return ""; });
  let prev = null;
  cols.forEach(function (col, w) {
    const mo = +col[0].date.slice(5, 7);
    if (mo !== prev) out[w] = mo + "월";
    prev = mo;
  });
  for (let w = 0; w + 2 < out.length; w++) if (out[w] && (out[w + 1] || out[w + 2])) out[w] = "";
  return out;
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

/* ---------- 오류 안내 ---------- */
// Firebase·브라우저 오류를 사용자가 대응할 수 있는 한국어 문장으로 바꿉니다. 앱이 만든 한국어 문장은 그대로 둡니다.
const ERROR_TEXT = {
  "permission-denied": "저장 권한이 없습니다. 로그아웃 후 다시 로그인해 주세요. 변경은 기기에 보관되어 있습니다.",
  "unauthenticated": "로그인이 만료되었습니다. 다시 로그인해 주세요. 변경은 기기에 보관되어 있습니다.",
  "unavailable": "서버에 연결하지 못했습니다. 연결을 확인한 뒤 상단의 상태 버튼을 눌러 다시 시도해 주세요. 변경은 기기에 보관되어 있습니다.",
  "deadline-exceeded": "서버 응답이 늦습니다. 잠시 후 상단의 상태 버튼을 눌러 다시 시도해 주세요. 변경은 기기에 보관되어 있습니다.",
  "resource-exhausted": "서버 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요. 변경은 기기에 보관되어 있습니다.",
  "aborted": "다른 저장과 겹쳤습니다. 상단의 상태 버튼을 눌러 다시 시도해 주세요. 변경은 기기에 보관되어 있습니다.",
  "failed-precondition": "이 브라우저에서 저장소를 열지 못했습니다. 다른 탭을 닫고 새로고침해 주세요.",
  "invalid-argument": "저장할 수 없는 형식입니다. 목차나 메모 길이를 확인해 주세요.",
  "auth/popup-blocked": "로그인 창이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 눌러 주세요.",
  "auth/popup-closed-by-user": "로그인 창이 닫혔습니다. 다시 눌러 로그인해 주세요.",
  "auth/cancelled-popup-request": "로그인 창이 닫혔습니다. 다시 눌러 로그인해 주세요.",
  "auth/network-request-failed": "인터넷에 연결되어 있지 않아 로그인하지 못했습니다. 연결을 확인해 주세요.",
  "auth/unauthorized-domain": "이 주소에서는 로그인할 수 없습니다. 관리자에게 Firebase 승인 도메인 설정을 확인해 달라고 알려 주세요.",
  "auth/too-many-requests": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "auth/user-disabled": "사용이 중지된 계정입니다.",
  "auth/internal-error": "로그인 중 문제가 생겼습니다. 새로고침한 뒤 다시 시도해 주세요.",
};
export function friendlyError(e, fallback = "저장하지 못했습니다. 상단의 상태 버튼을 눌러 다시 시도해 주세요. 변경은 기기에 보관되어 있습니다.") {
  const code = String((e && e.code) || "").replace(/^firestore\//, "");
  if (ERROR_TEXT[code]) return ERROR_TEXT[code];
  const msg = String((e && e.message) || "");
  if (/[가-힣]/.test(msg)) return msg;
  if (/offline/i.test(msg)) return ERROR_TEXT.unavailable;
  if (/permission|insufficient/i.test(msg)) return ERROR_TEXT["permission-denied"];
  return fallback;
}

/* ---------- 목차 수정 시 기록 이전 ---------- */
// 같은 제목의 챕터(같은 제목이 여러 개면 순서대로)에 완료일·메모를 옮깁니다.
// 옮길 곳이 없어 사라지는 기록은 lost 로 돌려주어 저장 전에 알릴 수 있게 합니다.
export function carryOver(oldChapters, items) {
  const pool = new Map();
  (oldChapters || []).forEach((c) => { if (!pool.has(c.t)) pool.set(c.t, []); pool.get(c.t).push(c); });
  const next = items.map((it) => {
    const q = pool.get(it.t), o = q && q.length ? q.shift() : null;
    return Object.assign({}, it, { done: o ? o.done || null : it.done || null, memo: o ? o.memo || "" : it.memo || "" });
  });
  const lost = [];
  pool.forEach((q) => q.forEach((c) => { if (c.done || c.memo) lost.push({ t: c.t, done: c.done || null, memo: c.memo || "" }); }));
  return { items: next, lost };
}

// 챕터 메모·독서 메모에서 검색어 찾기(대소문자·공백 무시). 결과는 책 순서·목차 순서, 최대 limit 개
export function memoMatch(text, q) {
  const chars = Array.from(String(text || '')), map = [], normalized = [];
  chars.forEach((ch,i) => { if (!/\s/.test(ch)) for (const c of ch.toLowerCase()) { normalized.push(c); map.push(i); } });
  const needle = Array.from(String(q || '').toLowerCase().replace(/\s+/g,''));
  const hay = normalized.join(''), key = needle.join('');
  const at = key ? hay.indexOf(key) : -1;
  if (at < 0) return null;
  // indexOf는 UTF-16 위치를 반환하므로 코드 포인트 위치로 환산합니다.
  const start = Array.from(hay.slice(0,at)).length;
  return { start: map[start], end: map[start + needle.length - 1] + 1 };
}
export function highlightMemo(text, q) {
  const m = memoMatch(text,q), c = Array.from(String(text || ''));
  return m ? escapeHtml(c.slice(0,m.start).join('')) + '<mark>' + escapeHtml(c.slice(m.start,m.end).join('')) + '</mark>' + escapeHtml(c.slice(m.end).join('')) : escapeHtml(text);
}
export function searchMemos(books, q, limit = 30) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
  const k = norm(q);
  if (!k) return [];
  const out = [];
  const snippet = (text) => {
    const flat = String(text).replace(/\s+/g, ' ').trim(), chars = Array.from(flat), m = memoMatch(flat,q);
    const start = Math.max(0, (m?.start || 0) - 20), end = Math.min(chars.length, Math.max(start + 80, m?.end || 0));
    return (start ? '…' : '') + chars.slice(start,end).join('') + (end < chars.length ? '…' : '');
  };
  for (const b of books) {
    (b.chapters || []).forEach((c, i) => { if (c.memo && norm(c.memo).includes(k)) out.push({ id: b.id, title: b.title, i, t: c.t, text: snippet(c.memo) }); });
    if (b.note && norm(b.note).includes(k)) out.push({ id: b.id, title: b.title, i: -1, t: "독서 메모", text: snippet(b.note) });
  }
  return out.slice(0, limit);
}

// 제목 비교용 키: 대소문자·공백·문장부호와 괄호 안 표기((20주년 기념판), (복구본) 등)를 무시합니다.
const titleKey = (x) => String(x || "").toLowerCase().replace(/[(\[{（【][^)\]}）】]*[)\]}）】]/g, "").replace(/[\s.,:;!?·'"()\[\]{}<>\-–—_]/g, "");
// 부제는 ":" 또는 " - " 뒤로 봅니다.
const mainKey = (x) => titleKey(String(x || "").replace(/[(\[{（【][^)\]}）】]*[)\]}）】]/g, "").split(/[:：]|\s[-–—]\s/)[0]);
// 같은 책이 이미 서재에 있는지(저자가 둘 다 있으면 저자도 비교). 한쪽에만 부제가 있으면 같은 책, 둘 다 있는데 다르면(1부·2부 등) 다른 책입니다.
export function findDuplicate(books, title, author, exceptId) {
  const norm = (x) => String(x || "").toLowerCase().replace(/[\s.,:;!?·'"()\[\]{}<>\-–—_]/g, "");
  const same = (x, y) => titleKey(x) === titleKey(y) || (mainKey(x).length >= 2 && (mainKey(x) === titleKey(y) || mainKey(y) === titleKey(x)));
  const t = titleKey(title), a = norm(author);
  if (!t) return null;
  for (const b of books) {
    if (b.id === exceptId || !same(b.title, title)) continue;
    if (a && norm(b.author) && norm(b.author) !== a) continue;
    return b;
  }
  return null;
}
// 책 찾기에서 '이미 서재에 있는 책'인지 볼 때는 더 넓게 봅니다. 저자 표기(앤드루/앤드류)나 판본 표기가 달라도 같은 책이면 한 권만 유지합니다.
export function findSimilarBook(books, title) {
  const t = titleKey(title), m = mainKey(title);
  if (!t) return null;
  for (const b of books) {
    const bt = titleKey(b.title), bm = mainKey(b.title);
    if (!bt) continue;
    if (bt === t || (m.length >= 2 && bm === m)) return b;
    const [short, long] = bt.length <= t.length ? [bt, t] : [t, bt];
    if (short.length >= 4 && long.startsWith(short)) return b;
  }
  return null;
}

/* ---------- 글자 크기 설정 ---------- */
// 화면 전체 글자 배율(%). 90~130, 5% 단위, 기본 100. 잘못된 값은 기본으로 돌립니다.
export const FONT_SCALE = { min: 90, max: 130, step: 5, def: 100 };
export function clampFontScale(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return FONT_SCALE.def;
  const n = Number(v);
  if (!Number.isFinite(n)) return FONT_SCALE.def;
  const snapped = Math.round(n / FONT_SCALE.step) * FONT_SCALE.step;
  return Math.min(FONT_SCALE.max, Math.max(FONT_SCALE.min, snapped));
}
export function stepFontScale(cur, dir) { return clampFontScale(clampFontScale(cur) + (dir < 0 ? -1 : 1) * FONT_SCALE.step); }

