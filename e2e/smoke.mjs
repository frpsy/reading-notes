// 테스트 전용 Firebase 대역으로 로그인·저장 복구·주요 화면을 검증합니다.
// 실행: npm run e2e (Playwright 필요. CI 는 workflow 에서 설치합니다)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "access-control-allow-origin":"*" }).end(body);
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
  await ctx.route('**/js/config.js*', route => route.fulfill({contentType:'text/javascript',body:'export const firebaseConfig = {apiKey:"test",projectId:"test"}; export const allowedEmails = ["owner@example.com"];'}));
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({contentType:'text/javascript',body:'export * from ' + JSON.stringify(base + 'e2e/firebase-fixture.js') + ';'}));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const view = page.locator("#view");

  await step("체험 버튼 없이 구글 로그인 후 시작", async () => {
    await page.locator('[data-act="login"]').waitFor();
    assert.equal(await page.locator('[data-act="trial"]').count(), 0);
    assert.equal(await page.locator('#sync-copy').isVisible(), false);
    await page.click('[data-act="login"]');
    await view.getByText("내 서재").waitFor();
    assert.equal(await page.locator('#sync-copy').isVisible(), false);
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
    await view.locator(".prog .of").waitFor();
    assert.equal(await view.locator(".prog .of").textContent(), after);
  });

  await step('책과 기록 우선 배치·접힌 통계·책 설정 메뉴', async () => {
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('.book-insights').getAttribute('open'), null);
    assert.equal(await page.locator('#d-start').isVisible(), false);
    assert.ok(await page.locator('.chapters').evaluate(el => el.getBoundingClientRect().top < window.innerHeight));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.locator('.book-menu > summary').click();
    assert.equal(await page.locator('a[href^="#edit-"]').isVisible(), true);
    await page.locator('.book-menu > summary').press('Escape');
    assert.equal(await page.locator('a[href^="#edit-"]').isVisible(), false);
    const options = page.locator('.chapter-options').first();
    assert.equal(await options.locator('input[type=date]').isVisible(), false);
    await options.locator('summary').click();
    assert.equal(await options.locator('input[type=date]').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await options.locator('input[type=date]').fill('2026-10-30');
    await options.locator('input[type=date]').press('Tab');
    assert.equal(await page.locator('.chapter-options').first().getAttribute('open'), '');
    await page.locator('.chapter-options').first().locator('summary').click();
    await page.locator('.book-insights > summary').click();
    assert.equal(await page.locator('#d-start').isVisible(), true);
    await page.locator('.book-insights > summary').click();
    if (process.env.DESIGN_SCREENSHOT_DIR) {
      await page.evaluate(() => window.scrollTo(0,0));
      await mkdir(process.env.DESIGN_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'detail-mobile.png')});
    }
    await page.goto(base + '#library');
    await view.locator('a.book').first().waitFor();
    assert.equal(await page.locator('.library-insights').getAttribute('open'), null);
    assert.ok(await page.locator('a.book').first().evaluate(el => el.getBoundingClientRect().top < 400));
    assert.equal(await page.locator('.heat').isVisible(), false);
    if (process.env.DESIGN_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'library-mobile.png')});
    await page.locator('.library-insights > summary').click();
    assert.equal(await page.locator('.heat').isVisible(), true);
    await page.setViewportSize({width:1280,height:900});
    if (process.env.DESIGN_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'library-desktop.png')});
    await page.emulateMedia({colorScheme:'dark'});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (process.env.DESIGN_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'library-dark.png')});
    await page.emulateMedia({colorScheme:'light'});
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
    await page.locator('.memo-btn[data-act="memo"]').first().click();
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
    await page.locator("details.memos > summary").click();
    await page.locator("details.memos li", { hasText: "<img src=x" }).waitFor();
    await page.locator('textarea[data-act="memotext"]').fill("다시 쓴 메모");
    await page.locator('button.memo-btn.save', { hasText: "메모 저장" }).click(); // 저장하면 자동으로 닫힘
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0);
    if (!(await page.locator("details.memos[open]").count())) await page.locator("details.memos > summary").click(); // 다시 그리면 접힘
    await page.locator("details.memos[open] li", { hasText: "다시 쓴 메모" }).waitFor();
    assert.equal(await page.locator("button.memo-btn", { hasText: "메모 닫기" }).count(), 0);
  });

  await step("연간 기록", async () => {
    await page.goto(base + "#library");
    if (!(await page.locator('.library-insights[open]').count())) await page.locator('.library-insights > summary').click();
    await page.click('a.s[href="#year"]');
    await view.getByText("년 독서 기록").waitFor();
    assert.equal(await view.locator(".months .mo").count(), 12);
  });

  await step('메모 입력 직후 포커스 이동 없이 새로고침해도 복구', async () => {
    await page.goto(base + '#library');
    await view.locator('a.book', {hasText:'제목 <img'}).click();
    await page.fill('#d-note', '입력 직후에도 남는 메모');
    const pending = await page.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('chaekgalpi-pending-v1:')).length);
    assert.ok(pending > 0);
    await page.reload();
    await page.locator('#d-note').waitFor();
    assert.equal(await page.locator('#d-note').inputValue(), '입력 직후에도 남는 메모');
    await page.locator('#sync[data-state="saved"]').waitFor();
  });

  await step('두 탭의 서로 다른 챕터 변경을 모두 보존', async () => {
    const other = await ctx.newPage();
    await other.goto(page.url());
    await other.locator('#d-note').waitFor();
    await page.evaluate(() => { window.__writeDelay = 300; });
    await page.locator('.memo-btn[data-act="memo"]').first().click();
    await page.locator('textarea[data-act="memotext"]').first().fill('첫 탭의 메모');
    await other.locator('.memo-btn[data-act="memo"]').nth(1).click();
    await other.locator('textarea[data-act="memotext"]').fill('둘째 탭의 메모');
    await page.locator('#sync[data-state="saved"]').waitFor();
    await other.locator('#sync[data-state="saved"]').waitFor();
    await page.reload();
    await view.getByText('첫 탭의 메모', {exact:true}).first().waitFor();
    await view.getByText('둘째 탭의 메모', {exact:true}).first().waitFor();
    await other.close();
  });

  await step('오프라인 입력은 기기에 보관하고 재연결 시 자동 전송', async () => {
    await ctx.setOffline(true);
    await page.fill('#d-note', '오프라인에서 쓴 메모');
    await page.locator('#sync[data-state="offline"]').waitFor();
    await ctx.setOffline(false);
    await page.locator('#sync[data-state="saved"]').waitFor();
    await page.reload();
    await page.locator('#d-note').waitFor();
    assert.equal(await page.locator('#d-note').inputValue(), '오프라인에서 쓴 메모');
  });

  await step('삭제 실패 기록을 보관하고 버튼으로 다시 삭제', async () => {
    await page.evaluate(() => { window.__failWrites = true; });
    await page.locator('.book-menu > summary').click();
    await page.click('[data-act="del"]');
    await page.click('[data-act="delyes"]');
    await page.locator('#sync[data-state="error"]').waitFor();
    const count = await page.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('chaekgalpi-pending-v1:')).length);
    assert.ok(count > 0);
    await page.evaluate(() => { window.__failWrites = false; });
    await page.click('#sync');
    await page.locator('#sync[data-state="saved"]').waitFor();
    assert.equal(await view.locator('a.book', {hasText:'제목 <img'}).count(), 0);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('chaekgalpi-pending-v1:')).length), 0);
  });

  await step('저장 공간 부족을 표시하고 공간 확보 후 재시도', async () => {
    await view.locator('a.book').first().click();
    await page.evaluate(() => {
      window.__originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) {
        if (k.startsWith('chaekgalpi-pending-v1:')) throw new DOMException('quota','QuotaExceededError');
        return window.__originalSetItem.call(this,k,v);
      };
    });
    await page.fill('#d-note', '저장 공간 복구 후 남는 메모');
    await page.locator('#sync[data-state="error"]').waitFor();
    assert.match(await page.locator('#sync-detail').innerText(), /창을 닫지 말고/);
    await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
    await page.click('#sync');
    await page.locator('#sync[data-state="saved"]').waitFor();
    await page.reload(); await page.locator('#d-note').waitFor();
    assert.equal(await page.locator('#d-note').inputValue(), '저장 공간 복구 후 남는 메모');
  });

  await step('동시 목차 충돌은 원본을 보존하고 새 책으로 복구', async () => {
    const id = page.url().split('#book-')[1];
    await page.locator('.book-menu > summary').click();
    await page.click('a[href="#edit-' + id + '"]');
    const toc = await page.locator('#f-toc').inputValue();
    await page.evaluate(id => {
      const docs = JSON.parse(localStorage.getItem('e2e-books'));
      docs[id].chapters[0].t = '다른 기기의 목차';
      localStorage.setItem('e2e-books',JSON.stringify(docs));
    }, id);
    await page.fill('#f-toc', '이 기기의 목차\n' + toc.split('\n').slice(1).join('\n'));
    await page.click('#bookForm button[type="submit"]');
    await page.locator('#sync[data-state="error"]').waitFor();
    assert.equal(await page.locator('#sync-copy').isVisible(), true);
    await page.click('#sync-copy');
    await page.locator('#sync[data-state="saved"]').waitFor();
    assert.equal(await page.locator('#sync-copy').isVisible(), false);
    const result = await page.evaluate(id => {
      const docs = JSON.parse(localStorage.getItem('e2e-books'));
      return { original:docs[id].chapters[0].t, copies:Object.entries(docs).filter(([k])=>k!==id).map(([,b])=>b.chapters[0].t) };
    }, id);
    assert.equal(result.original, '다른 기기의 목차');
    assert.ok(result.copies.includes('이 기기의 목차'));
  });

  await step('모바일 메모: 눌러서 수정·글자 수·자동 늘어남·완료 버튼', async () => {
    await page.setViewportSize({width:390,height:844});
    await page.locator('.memo-btn[data-act="memo"]').first().click();
    const ta = page.locator('textarea[data-act="memotext"]').first();
    const h0 = (await ta.boundingBox()).height;
    await ta.fill('짧은 메모');
    assert.equal(await page.locator('[data-memo-count]').innerText(), '5/2000');
    await ta.fill(Array.from({length:30}, (_, i) => '줄 ' + i).join('\n'));
    assert.ok((await ta.boundingBox()).height > h0);
    await ta.fill('짧은 메모');
    await page.locator('button.memo-done').click();
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0);
    await page.locator('.memo-tap').first().click();
    assert.equal(await page.locator('textarea[data-act="memotext"]').first().inputValue(), '짧은 메모');
    await page.locator('button.memo-done').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  });

  await step('긴 메모 미리보기·펼치기·접기와 원문 보존', async () => {
    const long = '🙂 긴 메모의 앞부분입니다. '.repeat(15) + '\n마지막 문장 <img src=x onerror="window.__xss=1">';
    await page.locator('.memo-btn[data-act="memo"]').first().click();
    await page.locator('textarea[data-act="memotext"]').first().fill(long);
    await page.locator('button.memo-btn.save').first().click();
    await page.locator('#sync[data-state="saved"]').waitFor();
    const preview = page.locator('.chapters .memo-preview').first();
    assert.equal(await preview.locator('.memo-text').isVisible(), false);
    assert.ok((await preview.locator('.memo-excerpt').innerText()).endsWith('…'));
    await preview.locator('summary').click();
    assert.equal(await preview.locator('.memo-text').innerText(), long);
    await preview.locator('summary').press('Enter');
    assert.equal(await preview.locator('.memo-text').isVisible(), false);
    await page.locator('details.memos > summary').click();
    const collected = page.locator('details.memos .memo-preview').first();
    assert.equal(await collected.locator('.memo-text').isVisible(), false);
    await collected.locator('summary').click();
    assert.equal(await collected.locator('.memo-text').innerText(), long);
    await page.fill('#d-note', long);
    await page.locator('#sync[data-state="saved"]').waitFor();
    await page.reload();
    await page.locator('.note-editor').waitFor();
    assert.equal(await page.locator('#d-note').isVisible(), false);
    await page.locator('.note-editor > summary').click();
    assert.equal(await page.locator('#d-note').inputValue(), long);
    await page.locator('.note-editor > summary').click();
    assert.equal(await page.locator('#d-note').isVisible(), false);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await view.locator('img').count(), 0);
  });

  await step("화면 오류 없음", async () => { assert.deepEqual(errors, []); });
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
