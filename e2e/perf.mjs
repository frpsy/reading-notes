// 대용량 데이터 성능 측정: 책 100권 · 챕터 5,000개 · 메모 1,000개 (테스트 전용 Firebase 대역 사용)
// 실행: npm run perf   (결과는 같은 조건에서 변경 전후를 비교하는 용도입니다)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}/`;

// 책 100권 × 챕터 50개 = 5,000개, 메모 1,000개(책마다 10개, 200자). 첫 책만 3,000챕터 한도 근처 측정용 큰 책을 따로 둡니다.
function makeBooks() {
  const docs = {};
  for (let n = 0; n < 100; n++) {
    const id = "perf" + n, chapters = [];
    for (let i = 0; i < 50; i++) chapters.push({ t: `${n + 1}권 ${i + 1}장 제목`, lv: i % 10 === 0 ? 0 : 1, p: i * 5 + 1, done: i < 25 ? "2026-10-" + String(1 + (i % 28)).padStart(2, "0") : null, memo: i % 5 === 1 ? "메모 ".repeat(66) : "" });
    docs[id] = { id, title: `성능 측정용 책 ${n + 1}`, author: "저자" + n, totalPages: 300, startDate: "2026-10-01", endDate: null, endAuto: false, goalDate: null, rating: 0, note: "", createdAt: n, updatedAt: n, chapters };
  }
  const big = [];
  for (let i = 0; i < 3000; i++) big.push({ t: "큰 책 " + (i + 1) + "장", lv: i % 20 === 0 ? 0 : 1, p: null, done: null, memo: i % 10 === 1 ? "긴 메모 ".repeat(40) : "" });
  docs.big = { id: "big", title: "큰 책(3,000챕터)", author: "", totalPages: null, startDate: null, endDate: null, endAuto: false, goalDate: null, rating: 0, note: "", createdAt: 999, updatedAt: 999, chapters: big };
  return docs;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
await ctx.route("**/js/config.js*", (route) => route.fulfill({ contentType: "text/javascript", body: 'export const firebaseConfig = {apiKey:"test",projectId:"test"}; export const allowedEmails = ["owner@example.com"];' }));
await ctx.route("https://www.gstatic.com/firebasejs/**", (route) => route.fulfill({ contentType: "text/javascript", body: "export * from " + JSON.stringify(base + "e2e/firebase-fixture.js") + ";" }));
const docs = makeBooks();
await ctx.addInitScript((d) => { if (!localStorage.getItem("e2e-books")) { localStorage.setItem("e2e-books", d); localStorage.setItem("e2e-signed-in", "yes"); } }, JSON.stringify(docs));
const page = await ctx.newPage();
const rows = [];
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

let t0 = Date.now();
await page.goto(base);
await page.locator("a.book").first().waitFor({ timeout: 60000 });
rows.push(["서재 첫 표시(100권, 로그인 상태)", Date.now() - t0, "ms"]);

// 서재 검색 입력 1회당 처리 시간
const search = [];
for (const ch of "성능측정") {
  const s = Date.now(); await page.locator('input[data-act="search"]').type(ch); search.push(Date.now() - s);
}
rows.push(["서재 검색 입력 1글자(중앙값)", median(search), "ms"]);
await page.locator('input[data-act="search"]').fill("");

// 큰 책 화면 열기와 메모 입력 지연
t0 = Date.now();
await page.goto(base + "#book-big");
await page.locator(".chapters .ch").first().waitFor();
rows.push(["큰 책(3,000챕터) 화면 표시", Date.now() - t0, "ms"]);
await page.locator('.memo-btn[data-act="memo"]').first().click();
const ta = page.locator('textarea[data-act="memotext"]').first();
await ta.waitFor();
const keyMs = await page.evaluate(async () => {
  const el = document.querySelector('textarea[data-act="memotext"]');
  const out = [];
  for (let i = 0; i < 20; i++) {
    el.value += "가";
    const s = performance.now();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    out.push(performance.now() - s);
  }
  return out;
});
rows.push(["큰 책 메모 입력 이벤트 처리(중앙값)", Math.round(median(keyMs) * 10) / 10, "ms"]);
const split = await page.evaluate(() => {
  const el = document.querySelector('textarea[data-act="memotext"]'), big = "x".repeat(450000), r = {};
  let s = performance.now(); for (let i = 0; i < 10; i++) localStorage.setItem("perf-probe", big + i); r.ls = (performance.now() - s) / 10; localStorage.removeItem("perf-probe");
  s = performance.now(); for (let i = 0; i < 10; i++) { el.style.height = "auto"; void el.scrollHeight; el.style.height = (100 + i) + "px"; } r.layout = (performance.now() - s) / 10;
  const box = document.getElementById("memos-box"), html = box.innerHTML;
  s = performance.now(); for (let i = 0; i < 10; i++) { box.innerHTML = html + "<!--" + i + "-->"; void box.offsetHeight; } r.memos = (performance.now() - s) / 10;
  return r;
});
rows.push(["  ㄴ localStorage 45만 자 쓰기", Math.round(split.ls * 10) / 10, "ms"]);
rows.push(["  ㄴ 입력란 높이 재계산(강제 레이아웃)", Math.round(split.layout * 10) / 10, "ms"]);
rows.push(["  ㄴ 메모 모아보기 다시 그리기", Math.round(split.memos * 10) / 10, "ms"]);
rows.push(["큰 책 메모 입력 이벤트 처리(최대)", Math.round(Math.max(...keyMs) * 10) / 10, "ms"]);
const pendingBytes = await page.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("chaekgalpi-pending")) n += localStorage.getItem(k).length; } return n; });
rows.push(["큰 책 전송 대기 기록 크기(UTF-16 글자 수)", pendingBytes, "자"]);

// 일반 책(50챕터) 메모 입력
await page.goto(base + "#book-perf0");
await page.locator('.memo-btn[data-act="memo"]').first().click();
await page.locator('textarea[data-act="memotext"]').first().waitFor();
const smallMs = await page.evaluate(() => {
  const el = document.querySelector('textarea[data-act="memotext"]'), out = [];
  for (let i = 0; i < 20; i++) { el.value += "가"; const s = performance.now(); el.dispatchEvent(new Event("input", { bubbles: true })); out.push(performance.now() - s); }
  return out;
});
rows.push(["일반 책(50챕터) 메모 입력 이벤트 처리(중앙값)", Math.round(median(smallMs) * 10) / 10, "ms"]);

for (const [k, v, u] of rows) console.log(`${k}\t${v}\t${u}`);
await browser.close(); server.close();
