// 화면 스모크 테스트: 체험 모드로 실제 브라우저에서 주요 흐름과 XSS 방어를 확인합니다.
// 실행: npm run e2e (Playwright 필요. CI 는 workflow 에서 설치합니다)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = new URL("..", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}/`;

const XSS = '<img src=x onerror="window.__xss=1">';
const browser = await chromium.launch();
let failed = false;
async function step(name, fn) {
  try { await fn(); console.log("ok -", name); }
  catch (e) { failed = true; console.log("not ok -", name, "\n ", e.message.split("\n")[0]); }
}

try {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const view = page.locator("#view");

  await step("체험 모드 시작", async () => {
    await page.click('[data-act="trial"]');
    await view.getByText("내 서재").waitFor();
  });

  await step("준비된 책 담기", async () => {
    await page.locator('[data-act="catadd"]').first().click();
    await view.locator("a.book").first().waitFor();
  });

  await step("챕터 체크 → 되돌리기", async () => {
    await view.locator("a.book").first().click();
    await page.waitForURL(/#book-/);
    const prog = view.locator(".prog .of");
    const before = await prog.textContent();
    await page.click('[data-act="nextdone"]');
    assert.notEqual(await prog.textContent(), before);
    await page.click("[data-undo]");
    assert.equal(await prog.textContent(), before);
  });

  await step("새로고침해도 기록 유지", async () => {
    await page.click('[data-act="nextdone"]');
    await page.waitForTimeout(600); // 저장 지연(350ms) 대기
    const after = await view.locator(".prog .of").textContent();
    await page.reload();
    await page.click('[data-act="trial"]').catch(() => {});
    await view.locator(".prog .of").waitFor();
    assert.equal(await view.locator(".prog .of").textContent(), after);
  });

  await step("제목·목차·메모의 HTML 은 글자로만 표시", async () => {
    await page.goto(base + "#add");
    await page.fill("#f-title", "제목 " + XSS);
    await page.fill("#f-author", XSS);
    await page.fill("#f-toc", "1장 " + XSS + "\n2장 <script>window.__xss=2</script>");
    await page.click('#bookForm button[type="submit"]');
    await page.waitForURL(/#book-/);
    // 이스케이프가 빠지면 이 글자가 그대로 나오지 않아 시간 초과로 실패합니다.
    await view.locator("h1", { hasText: "제목 <img src=x" }).waitFor({ timeout: 5000 });
    await page.locator('[data-act="memo"]').first().click();
    await page.fill('textarea[data-act="memotext"]', XSS);
    await page.locator("h1").click();
    await page.goto(base + "#library");
    await view.locator("a.book").first().waitFor();
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await view.locator("img").count(), 0);
  });

  await step("서재 검색(입력 중 커서 유지)", async () => {
    await page.goto(base + "#library");
    const q = page.locator('input[data-act="search"]');
    await q.fill("인생");
    await page.keyboard.type("의");
    assert.equal(await q.inputValue(), "인생의");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), "search");
    assert.equal(await view.locator("a.book").count(), 1);
    await q.fill("없는책제목");
    await view.getByText("검색 결과가 없습니다.").waitFor();
    await q.fill("");
  });

  await step("메모 모아보기", async () => {
    await view.locator("a.book", { hasText: "제목 <img" }).click();
    await page.locator("details.memos summary").click();
    await page.locator("details.memos li", { hasText: "<img src=x" }).waitFor();
    await page.locator('textarea[data-act="memotext"]').fill("다시 쓴 메모");
    await page.locator('button.memo-btn.save', { hasText: "메모 저장" }).click(); // 저장하면 자동으로 닫힘
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0);
    if (!(await page.locator("details.memos[open]").count())) await page.locator("details.memos summary").click(); // 다시 그리면 접힘
    await page.locator("details.memos[open] li", { hasText: "다시 쓴 메모" }).waitFor();
    assert.equal(await page.locator("button.memo-btn", { hasText: "메모 닫기" }).count(), 0);
  });

  await step("연간 기록", async () => {
    await page.goto(base + "#library");
    await page.click('a.s[href="#year"]');
    await view.getByText("년 독서 기록").waitFor();
    assert.equal(await view.locator(".months .mo").count(), 12);
  });

  await step("화면 오류 없음", async () => { assert.deepEqual(errors, []); });
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
