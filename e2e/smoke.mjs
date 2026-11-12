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
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/reading-notes(?=\/)/, ""); // 배포 경로(/reading-notes/) 흉내
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
  catch (e) { failed = true; console.log("not ok -", name, "\n ", e.stack || e.message); }
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
  async function editNote(text) {
    await page.locator('#d-note').waitFor({state:'attached'});
    if (!(await page.locator('#d-note').isVisible())) {
      const preview = page.locator('.note-panel .memo-preview');
      if (await preview.count()) {
        if (!(await preview.evaluate(el => el.open))) await preview.locator('summary').click();
        await preview.locator('.memo-edit-tap').click();
      } else await page.locator('.note-editor > summary').click();
    }
    await page.fill('#d-note',text);
  }
  async function editChapterMemo(index=0, context=page) {
    const row=context.locator('.chapters > li.ch.leaf').nth(index);
    await row.waitFor();
    const preview=row.locator('.ch-memo .memo-preview');
    if (!(await preview.count())) {
      await row.locator('.chapter-options > summary').click();
      await row.locator('.chapter-options-body [data-act="memo"]').click();
      return;
    }
    if (!(await preview.evaluate(el => el.open))) await preview.locator('summary').click();
    await preview.locator('button.memo-edit-tap').click();
  }


  await step('로그인 화면: 작은 모바일과 확대 화면에서 가로 넘침 없음', async () => {
    await page.locator('[data-act="login"]').waitFor();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({width, height:844});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.ok((await page.locator('[data-act="login"]').boundingBox()).height >= 44);
      if (process.env.DESIGN_SCREENSHOT_DIR) {
        await mkdir(process.env.DESIGN_SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'welcome-' + width + '.png'),fullPage:true});
      }
    }
  });

  await step("로그인 실패는 한국어로 안내", async () => {
    await page.locator('[data-act="login"]').waitFor();
    await page.evaluate(() => { window.__loginFail = 'auth/popup-blocked'; });
    await page.click('[data-act="login"]');
    await view.getByText(/팝업 차단을 해제/).waitFor();
    assert.ok(!/Firebase: Error/.test(await view.innerText()));
    await page.evaluate(() => { window.__loginFail = null; });
  });

  await step("허용되지 않은 계정은 거부하고 데이터에 접근하지 않음", async () => {
    await page.evaluate(() => localStorage.setItem('e2e-email', 'stranger@example.com'));
    await page.click('[data-act="login"]');
    await view.getByText('stranger@example.com 계정은 이 앱을 쓸 수 없습니다.').waitFor();
    assert.equal(await view.locator('a.book').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('e2e-signed-in')), null, '즉시 로그아웃');
    await page.evaluate(() => localStorage.removeItem('e2e-email'));
  });

  await step("체험 버튼 없이 구글 로그인 후 시작", async () => {
    await page.locator('[data-act="login"]').waitFor();
    assert.equal(await page.locator('[data-act="trial"]').count(), 0);
    assert.equal(await page.locator('#sync-copy').isVisible(), false);
    await page.click('[data-act="login"]');
    await view.getByText("내 서재").waitFor();
    assert.equal(await page.locator('#sync-copy').isVisible(), false);
  });

  await step("설정 화면: 테마·계정·기록 관리 분리", async () => {
    await page.goto(base + '#settings');
    await view.getByRole('heading', {name:'설정'}).waitFor();
    assert.equal(await page.locator('#theme').isVisible(), true);
    assert.equal(await view.locator('[data-act="logout"]').count(), 1);
    assert.equal(await view.locator('a[href="#records"]').count(), 1);
    const before = await page.locator('#theme').innerText();
    await page.locator('#theme').click();
    assert.notEqual(await page.locator('#theme').innerText(), before);
    await page.reload();
    assert.notEqual(await page.locator('#theme').innerText(), before, '테마 설정 유지');
    await page.goto(base + '#settings');
    await page.locator('#fs-up').click();
    await page.locator('#fs-up').click();
    assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), '110%');
    assert.equal(await page.locator('#fs-val').innerText(), '110%');
    await page.reload();
    await page.locator('#fs-val').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), '110%', '글자 크기 유지');
    assert.equal(await page.locator('#fs-val').innerText(), '110%');
    await page.locator('#fs-reset').click();
    assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), '');
    assert.equal(await page.locator('#fs-reset').isDisabled(), true);
    await page.goto(base + '#library');
    assert.equal(await view.locator('[data-act="logout"]').count(), 0);
    assert.equal(await view.locator('#theme').count(), 0);
    assert.equal(await view.locator('a[href="#records"]').count(), 0);
    assert.equal(await view.locator('[data-act="catadd"]').count(), 0);
  });

  await step('정상 저장 상태의 상단 버튼은 표시하지 않고, 동기화 상태는 유지', async () => {
    await page.goto(base + '#library');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    assert.equal(await page.locator('#sync').isVisible(), false);
    assert.equal(await page.locator('#settings-link').isVisible(), true);
  });

  await step("준비된 책 담기: 독서 예정에 추가하고 독서 시작은 하지 않음", async () => {
    await page.goto(base + '#catalog');
    await page.locator('[data-act="catadd"]').first().click();
    await page.waitForURL(/#library$/);
    const added = view.locator('a.book').first();
    await added.waitFor();
    assert.equal(await page.locator('[data-act="filter"][data-v="todo"]').getAttribute('aria-pressed'), 'true', '독서 예정 목록이 바로 보임');
    assert.equal(await added.locator('.chip.todo').innerText(), '독서 예정');
    assert.equal(await added.locator('.book-next').count(), 0, '시작 전에는 이어 읽기 안내 없음');
    const key = (await added.getAttribute('href')).slice('#book-'.length);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('e2e-books'))[id], key);
    assert.equal(saved.startDate, null, '책 담기로 시작일을 기록하지 않음');
    assert.equal(saved.endDate, null);
    assert.equal(saved.goalDate, null);
    assert.ok(saved.chapters.every(c => c.done == null), '챕터 모두 미완료');
  });

  await step("챕터 체크 → 알림창 없이 반영, 다시 누르면 취소", async () => {
    await view.locator("a.book").first().click();
    await page.waitForURL(/#book-/);
    assert.equal(await page.locator('.head .chip.todo').innerText(), '독서 예정', '책을 열기만 하면 독서 시작하지 않음');
    const prog = view.locator(".prog .of");
    const before = await prog.textContent();
    await page.click('[data-act="nextdone"]');
    assert.equal(await page.locator('.head .chip.reading').innerText(), '읽는 중', '첫 챕터 완료 시에만 읽는 중');
    assert.notEqual(await prog.textContent(), before);
    assert.equal(await page.locator('#toast').isVisible(), false, '체크할 때 알림창이 뜨지 않음');
    await page.locator('.ch.leaf .chk[aria-checked="true"]').last().click(); // 다시 누르면 취소
    assert.equal(await prog.textContent(), before);
    assert.equal(await page.locator('#toast').isVisible(), false, '취소할 때도 알림창이 뜨지 않음');
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
    await page.locator('.chapter-options').first().locator('summary').press('Escape');
    assert.equal(await page.locator('.chapter-options').first().getAttribute('open'), null);
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
    assert.equal(await page.locator('.library-insights').count(), 0);
    // 첫 화면 우선 요소가 책 목록에서 '이어서 읽기' 카드로 바뀌었습니다.
    assert.equal(await page.locator('a.resume').count(), 1);
    assert.ok(await page.locator('a.resume').evaluate(el => el.getBoundingClientRect().top < 400));
    assert.ok(await page.locator('a.book').first().evaluate(el => el.getBoundingClientRect().top < window.innerHeight));
    assert.equal(await page.locator('.heat').isVisible(), false);
    if (process.env.DESIGN_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'library-mobile.png')});
    await page.setViewportSize({width:320,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (process.env.DESIGN_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'library-320.png')});
    await page.setViewportSize({width:390,height:844});
    await page.click('#settings-link');
    await view.getByText('설정', {exact:true}).first().waitFor();
    await page.click('a[href="#activity"]');
    await page.locator('.heat').waitFor({state:'visible'});
    await page.goto(base + '#library');
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
    await editChapterMemo();
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
    await page.locator('button.memo-done').click(); // 저장하면 자동으로 닫힘
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0);
    if (!(await page.locator("details.memos[open]").count())) await page.locator("details.memos > summary").click(); // 다시 그리면 접힘
    await page.locator("details.memos[open] li", { hasText: "다시 쓴 메모" }).waitFor();
    assert.equal(await page.locator("button.memo-btn", { hasText: "메모 닫기" }).count(), 0);
  });

  await step("연간 기록", async () => {
    await page.goto(base + "#library");
    await page.goto(base + '#settings');
    await page.click('a.settings-link[href="#year"]');
    await view.getByText("년 독서 기록").waitFor();
    assert.equal(await view.locator(".months .mo").count(), 12);
  });

  await step('메모 입력 직후 포커스 이동 없이 새로고침해도 복구', async () => {
    await page.goto(base + '#library');
    await view.locator('a.book', {hasText:'제목 <img'}).click();
    await editNote( '입력 직후에도 남는 메모');
    const pending = await page.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('chaekgalpi-pending-v1:')).length);
    assert.ok(pending > 0);
    await page.reload();
    await page.locator('#d-note').waitFor({state:'attached'});
    assert.equal(await page.locator('#d-note').inputValue(), '입력 직후에도 남는 메모');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
  });

  await step('두 탭의 서로 다른 챕터 변경을 모두 보존', async () => {
    const other = await ctx.newPage();
    await other.goto(page.url());
    await other.locator('#d-note').waitFor({state:'attached'});
    await page.evaluate(() => { window.__writeDelay = 300; });
    await editChapterMemo();
    await page.locator('textarea[data-act="memotext"]').first().fill('첫 탭의 메모');
    await editChapterMemo(1,other);
    await other.locator('textarea[data-act="memotext"]').fill('둘째 탭의 메모');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await other.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.reload();
    await view.getByText('첫 탭의 메모', {exact:true}).first().waitFor();
    await view.getByText('둘째 탭의 메모', {exact:true}).first().waitFor();
    await other.close();
  });

  await step('오프라인 입력은 기기에 보관하고 재연결 시 자동 전송', async () => {
    await ctx.setOffline(true);
    await editNote( '오프라인에서 쓴 메모');
    await page.locator('#sync[data-state="offline"]').waitFor();
    await ctx.setOffline(false);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.reload();
    await page.locator('#d-note').waitFor({state:'attached'});
    assert.equal(await page.locator('#d-note').inputValue(), '오프라인에서 쓴 메모');
  });

  await step('일시 오류는 한국어로 안내하고 자동으로 다시 보내 저장', async () => {
    await page.evaluate(() => { window.__transientFailures = 1; });
    await editNote( '자동 재시도 확인');
    await page.locator('#sync[data-state="error"]').waitFor();
    const msg = await page.locator('#sync-detail').innerText();
    assert.match(msg, /서버에 연결하지 못했습니다.*자동으로 다시 보냅니다/);
    assert.ok(!/client is offline/.test(msg), '영문 원문 미노출');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached', timeout: 10000 });
    const saved = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('e2e-books'))).some(b => b.note === '자동 재시도 확인'));
    assert.ok(saved);
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
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
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
    await editNote( '저장 공간 복구 후 남는 메모');
    await page.locator('#sync[data-state="error"]').waitFor();
    assert.match(await page.locator('#sync-detail').innerText(), /창을 닫지 말고/);
    await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
    await page.click('#sync');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.reload(); await page.locator('#d-note').waitFor({state:'attached'});
    assert.equal(await page.locator('#d-note').inputValue(), '저장 공간 복구 후 남는 메모');
  });

  await step('로컬 보관 실패 시 책 삭제를 확정하지 않고 기록을 유지', async () => {
    const originalUrl = page.url();
    const id = originalUrl.split('#book-')[1];
    assert.ok(id, '책 상세 화면이어야 함');
    await page.evaluate(() => {
      window.__quotaSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) {
        if (k.startsWith('chaekgalpi-pending-v1:')) throw new DOMException('quota','QuotaExceededError');
        return window.__quotaSet.call(this,k,v);
      };
    });
    try {
      await page.locator('.book-menu > summary').click();
      await page.click('[data-act="del"]');
      await page.click('[data-act="delyes"]');
      await page.locator('#sync[data-state="error"]').waitFor();
      assert.equal(page.url(), originalUrl, '보관 실패 시 책 상세에서 나가면 안 됨');
      assert.ok(await page.locator('.chapters > li.leaf').count() > 0, '챕터 기록이 남아야 함');
      assert.equal(await page.evaluate(id => !!JSON.parse(localStorage.getItem('e2e-books'))[id], id), true);
    } finally {
      await page.evaluate(() => { Storage.prototype.setItem = window.__quotaSet; });
    }
    await page.reload();
    await page.locator('.chapters > li.leaf').first().waitFor();
    assert.equal(page.url(), originalUrl);
  });

  await step('목차에서 기록 있는 챕터 제목을 바꾸면 저장 전 경고, 확인해야 저장', async () => {
    const id = page.url().split('#book-')[1];
    const leaf = await page.evaluate(id => {
      const docs = JSON.parse(localStorage.getItem('e2e-books')), ch = docs[id].chapters;
      const i = ch.findIndex(c => c.done || c.memo); return i < 0 ? null : ch[i].t;
    }, id);
    assert.ok(leaf, '기록 있는 챕터가 있어야 함');
    await page.goto(page.url().replace(/#.*/, '#edit-' + id));
    const toc = await page.locator('#f-toc').inputValue();
    await page.fill('#f-toc', toc.replace(leaf, leaf + ' (바꾼 제목)'));
    await page.click('#f-submit');
    await page.locator('#f-lost', { hasText: leaf }).waitFor();
    assert.equal(await page.locator('#f-submit').innerText(), '기록 삭제하고 저장');
    assert.match(page.url(), /#edit-/, '경고만 보이고 저장되지 않음');
    await page.locator('#f-toc').press('End'); await page.locator('#f-toc').type(' ');
    assert.equal(await page.locator('#f-lost').isVisible(), false, '목차를 다시 고치면 경고 초기화');
    await page.click('a.btn[href="#book-' + id + '"]');
    await page.waitForURL(/#book-/);
    const kept = await page.evaluate(([id, t]) => JSON.parse(localStorage.getItem('e2e-books'))[id].chapters.some(c => c.t === t), [id, leaf]);
    assert.ok(kept, '취소하면 원래 기록 유지');
  });

  await step('메모 입력창에 저장 상태 문구가 없고, 보관 실패는 상단에 알림', async () => {
    await editChapterMemo();
    const ta = page.locator('textarea[data-act="memotext"]').first();
    await ta.fill('보관 확인');
    assert.equal(await page.locator('[data-memo-saved]').count(), 0);
    assert.ok(!/저장|보관/.test(await page.locator('.memo-foot').innerText()), '입력창 아래에 저장·보관 문구가 없음: ' + await page.locator('.memo-foot').innerText());
    assert.equal(await page.locator('[data-memo-count]').innerText(), '5/2000');
    await page.evaluate(() => { window.__realSet = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k.startsWith('chaekgalpi-pending')) throw new Error('quota'); return window.__realSet.call(this, k, v); }; });
    await ta.fill('보관 실패');
    await page.locator('#sync[data-state="error"]').waitFor();
    assert.match(await page.locator('#sync-detail').innerText(), /기기에 보관하지 못했습니다/);
    await page.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
    await ta.fill('보관 확인');
    await page.locator('button.memo-done').click();
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
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
    if (await page.locator('#f-lost').isVisible()) await page.click('#f-submit'); // 첫 챕터 기록이 있으면 삭제 경고를 확인
    await page.locator('#sync[data-state="error"]').waitFor();
    assert.equal(await page.locator('#sync-copy').isVisible(), true);
    await page.click('#sync-copy');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    assert.equal(await page.locator('#sync-copy').isVisible(), false);
    const result = await page.evaluate(id => {
      const docs = JSON.parse(localStorage.getItem('e2e-books'));
      return { original:docs[id].chapters[0].t, copies:Object.entries(docs).filter(([k])=>k!==id).map(([,b])=>b.chapters[0].t) };
    }, id);
    assert.equal(result.original, '다른 기기의 목차');
    assert.ok(result.copies.includes('이 기기의 목차'));
  });

  await step('모바일 메모: 펼쳐 읽은 본문을 다시 눌러 편집·글자 수·자동 늘어남', async () => {
    await page.setViewportSize({width:390,height:844});
    await editChapterMemo();
    // 메모 편집 진입 후 챕터 옵션이 남아 있으면 미리보기 탭을 가로막습니다.
    assert.equal(await page.locator('.chapter-options[open]').count(), 0, '메모 편집 시 챕터 옵션은 닫혀야 함');
    const ta = page.locator('textarea[data-act="memotext"]').first();
    const h0 = (await ta.boundingBox()).height;
    await ta.fill('짧은 메모');
    assert.equal(await page.locator('[data-memo-count]').innerText(), '5/2000');
    await ta.fill(Array.from({length:30}, (_, i) => '줄 ' + i).join('\n'));
    assert.ok((await ta.boundingBox()).height > h0);
    await ta.fill('짧은 메모');
    await page.locator('button.memo-done').click();
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0);
    assert.equal(await page.locator('.ch.leaf .memo-btn.has').count(),0,'기록된 메모에는 연필 버튼을 표시하지 않음');
    await page.locator('.chapters .memo-tap').first().click();
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(),0,'첫 탭은 읽기만 펼침');
    await page.locator('.chapters .memo-edit-tap').first().click();
    assert.equal(await page.locator('textarea[data-act="memotext"]').first().inputValue(), '짧은 메모');
    await page.locator('button.memo-done').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  });

  await step('메모를 모두 지우면 되돌리기로 복구', async () => {
    await editChapterMemo();
    const ta = page.locator('textarea[data-act="memotext"]').first();
    await ta.fill('지울 메모'); await page.locator('button.memo-done').click();
    await editChapterMemo();
    await page.locator('textarea[data-act="memotext"]').first().fill('');
    await page.locator('button.memo-done').click();
    await page.locator('#toast', { hasText: '메모를 지웠습니다' }).waitFor();
    await page.click('[data-undo]');
    await page.locator('.memo-tap', { hasText: '지울 메모' }).waitFor();
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
  });

  await step('서재 메모 검색 → 해당 챕터로 이동, 뒤로 가면 서재 스크롤 복원', async () => {
    const id = page.url().split('#book-')[1];
    await page.goto(page.url().replace(/#.*/, '#library'));
    await page.locator('input[data-act="search"]').fill('지울');
    await page.locator('.memo-hits a', { hasText: '지울 메모' }).click();
    await page.waitForURL(new RegExp('#book-' + id));
    await page.locator('.ch.flash .memo-tap', { hasText: '지울 메모' }).waitFor();
    await page.goto(page.url().replace(/#.*/, '#library'));
    await page.locator('input[data-act="search"]').fill('');
    await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 400); });
    await page.waitForTimeout(100);
    await page.evaluate(() => document.querySelector('a.book').click()); // 스크롤을 건드리지 않고 누름(사용자가 보던 자리 그대로)
    await page.waitForURL(/#book-/);
    await page.goBack();
    await page.waitForURL(/#library/);
    await page.waitForFunction(() => Math.abs(window.scrollY - 400) < 5);
    await page.evaluate(() => { document.body.style.minHeight = ''; });
  });

  await step('이어 읽기의 위치 버튼은 다음 챕터로 스크롤', async () => {
    await page.locator('a.book').first().click();
    await page.waitForURL(/#book-/);
    await page.click('.next-act a[data-act="jump"]');
    await page.locator('.ch.flash .chip.reading').waitFor();
  });

  await step('긴 메모 미리보기·펼치기·접기와 원문 보존', async () => {
    const long = '🙂 긴 메모의 앞부분입니다. '.repeat(15) + '\n마지막 문장 <img src=x onerror="window.__xss=1">';
    await editChapterMemo();
    await page.locator('textarea[data-act="memotext"]').first().fill(long);
    await page.locator('button.memo-done').first().click();
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    const preview = page.locator('.chapters .ch-memo .memo-preview').first();
    assert.ok((await preview.locator('.memo-excerpt').boundingBox()).height < 80, '목록 메모는 2줄 미리보기');
    assert.equal(await preview.locator('.memo-text').textContent(), long, '원문은 그대로');
    const checked = await page.locator('.ch.leaf .chk').first().getAttribute('aria-checked');
    await preview.locator('summary').click();
    assert.equal(await preview.locator('.memo-text').innerText(), long);
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0, '펼쳐 읽기는 편집을 열지 않음');
    assert.equal(await page.locator('.ch.leaf .chk').first().getAttribute('aria-checked'), checked, '메모를 펼쳐도 진도 불변');
    await preview.locator('summary').click();
    await editChapterMemo();
    assert.equal(await page.locator('textarea[data-act="memotext"]').first().inputValue(), long);
    await page.locator('button.memo-done').click();
    await page.locator('details.memos > summary').click();
    const collected = page.locator('details.memos .memo-preview').first();
    assert.equal(await collected.locator('.memo-text').isVisible(), false);
    await collected.locator('summary').click();
    assert.equal(await collected.locator('.memo-text').innerText(), long);
    await editNote( long);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.reload();
    await page.locator('.note-editor').waitFor({state:'attached'});
    assert.equal(await page.locator('#d-note').isVisible(), false);
    await editNote(long);
    assert.equal(await page.locator('#d-note').inputValue(), long);
    await page.locator('.note-editor > summary').click();
    assert.equal(await page.locator('#d-note').isVisible(), false);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (process.env.DESIGN_SCREENSHOT_DIR) {
      await page.locator('.ch-memo').first().scrollIntoViewIfNeeded();
      await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'memo-compact-mobile.png'),fullPage:false});
      await page.emulateMedia({colorScheme:'dark'});
      await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'memo-compact-dark.png'),fullPage:false});
      await page.emulateMedia({colorScheme:'light'});
    }
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await view.locator('img').count(), 0);
  });

  await step('펼친 메모의 앞쪽 빈 줄 제거·원문 보존·본문 밀착', async () => {
    await editChapterMemo();
    const original = '첫 문장\n다음 문장';
    await page.locator('textarea[data-act="memotext"]').first().fill(original);
    await page.locator('button.memo-done').first().click();
    const preview = page.locator('.ch-memo .memo-preview').first();
    await preview.locator('summary').click();
    const display = preview.locator('.memo-edit-tap');
    assert.equal(await display.innerText(),'첫 문장\n다음 문장','읽기 화면의 문단 유지');
    const bounds = await Promise.all([preview.locator('summary').boundingBox(),display.boundingBox()]);
    assert.ok(bounds[1].y-bounds[0].y-bounds[0].height <= 8,'접기 라벨과 본문 사이 빈 공간 방지');
    await display.click();
    assert.equal(await page.locator('textarea[data-act="memotext"]').first().inputValue(),original,'편집 시 내부 줄바꿈 원문 보존');
    await page.locator('button.memo-done').first().click();
  });

  await step('같은 제목의 책을 추가하면 기존 책을 알려 주고 한 번 더 확인', async () => {
    await page.goto(page.url().replace(/#.*/, '#library'));
    const title = (await view.locator('a.book .book-title').first().innerText()).replace(/\s*예시$/, '').trim();
    const before = await view.locator('a.book').count();
    await page.goto(page.url().replace(/#.*/, '#add'));
    await page.fill('#f-title', ' ' + title + ' ');
    await page.fill('#f-toc', '1장');
    await page.click('#f-submit');
    await page.locator('#f-lost', { hasText: '같은 제목의 책' }).waitFor();
    assert.equal(await page.locator('#f-submit').innerText(), '그래도 추가');
    assert.match(page.url(), /#add/);
    await page.fill('#f-title', title + ' 2');
    assert.equal(await page.locator('#f-lost').isVisible(), false, '제목을 고치면 경고 초기화');
    await page.goto(page.url().replace(/#.*/, '#library'));
    assert.equal(await view.locator('a.book').count(), before);
  });

  await step('다크 모드: 본문·보조 글자·입력란 대비', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book').first().click();
    await page.waitForURL(/#book-/);
    await page.locator('.chapters .ch-title').first().waitFor();
    await page.locator('#d-rating').waitFor({ state: 'attached' });
    const r = await page.evaluate(() => {
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const bg = getComputedStyle(document.body).backgroundColor;
      const pick = (sel, prop = 'color') => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
      return { scheme: matchMedia('(prefers-color-scheme: dark)').matches, body: ratio(getComputedStyle(document.body).color, bg), muted: ratio(pick('.count') || pick('.pg') || pick('.by'), bg),
        title: ratio(pick('.ch-title'), bg), field: ratio(pick('#d-rating', 'borderTopColor'), pick('.note-panel', 'backgroundColor')) };
    });
    assert.ok(r.scheme);
    assert.ok(r.body >= 4.5 && r.title >= 4.5 && r.muted >= 4.5, JSON.stringify(r));
    assert.ok(r.field >= 3, '입력란 테두리 ' + r.field);
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await step('배포 하위 경로(/reading-notes/)에서도 같은 기록으로 동작', async () => {
    const sub = await ctx.newPage();
    await sub.goto(base + 'reading-notes/');
    await sub.locator('#view a.book').first().waitFor();
    await sub.locator('#view a.book').first().click();
    await sub.waitForURL(/\/reading-notes\/#book-/);
    await sub.locator('.chapters .ch').first().waitFor();
    assert.equal(new URL(sub.url()).pathname, '/reading-notes/');
    await sub.close();
  });

  await step('챕터 제목을 눌러도 체크·해제(누르는 영역 확대)', async () => {
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book').first().click();
    await page.waitForURL(/#book-/);
    const row = page.locator('.ch.next');
    const title = await row.locator('.ch-hit').innerText();
    await row.locator('.ch-hit').click();
    const li = page.locator('.ch.leaf', { has: page.locator('.ch-hit', { hasText: title.replace(/\s*다음$/, '') }) }).first();
    assert.equal(await li.locator('.chk').getAttribute('aria-checked'), 'true');
    await li.locator('.ch-hit').click();
    assert.equal(await li.locator('.chk').getAttribute('aria-checked'), 'false');
    // 회귀 방지: CSS 후반의 모바일 미디어쿼리가 체크 버튼을 다시 축소하지 못하도록
    // 각 화면 너비에서 실제 계산된 렌더링 크기를 검증합니다.
    const originalViewport = page.viewportSize();
    try {
      for (const width of [320, 375, 390, 430, 600, 601, 768]) {
        await page.setViewportSize({ width, height: 844 });
        for (const selector of ['.ch.leaf .chk', '.ch.group .chk']) {
          const checks = page.locator(selector);
          if (!(await checks.count())) continue;
          const box = await checks.first().boundingBox();
          assert.ok(box && box.width >= 32 && box.height >= 32,
            `${width}px ${selector}: 체크 버튼의 실제 크기는 최소 32×32px이어야 합니다 (현재 ${box?.width}×${box?.height}px)`);
        }
      }
    } finally {
      await page.setViewportSize(originalViewport);
    }
  });

  await step('메모 삭제 버튼: 내용 삭제 후 닫힘, 되돌리기로 복구', async () => {
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book').first().click();
    await page.waitForURL(/#book-/);
    await editChapterMemo();
    await page.locator('textarea[data-act="memotext"]').first().fill('삭제할 메모');
    await page.locator('button.memo-done').click();
    await page.locator('.memo-tap', { hasText: '삭제할 메모' }).waitFor();
    await editChapterMemo();
    await page.click('button.memo-del');
    assert.equal(await page.locator('textarea[data-act="memotext"]').count(), 0);
    assert.equal(await page.locator('.memo-tap', { hasText: '삭제할 메모' }).count(), 0);
    await page.locator('#toast', { hasText: '메모를 삭제했습니다' }).waitFor();
    await page.click('[data-undo]');
    await page.locator('.memo-tap', { hasText: '삭제할 메모' }).waitFor();
    await editChapterMemo();
    await page.click('button.memo-del');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    const left = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('e2e-books'))).some(b => b.chapters.some(c => c.memo === '삭제할 메모')));
    assert.equal(left, false, '서버에도 삭제됨');
  });

  await step('체크할 때 바뀐 줄만 갱신(나머지 줄·펼침 상태는 그대로)', async () => {
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book').first().click();
    await page.waitForURL(/#book-/);
    await page.locator('.ch.leaf .chk').first().waitFor();
    const n = await page.locator('.ch.leaf').count();
    assert.ok(n >= 3);
    await page.evaluate(() => { document.querySelectorAll('.chapters > li').forEach((li, i) => { li.__mark = 'm' + i; }); document.querySelector('a.back').dataset.keep = '1'; });
    const idx = await page.evaluate(() => { const lis = [...document.querySelectorAll('.chapters > li')]; return lis.findIndex(li => li.classList.contains('next')); });
    assert.ok(idx >= 0, '다음 챕터 줄이 있어야 함');
    await page.click('[data-act="nextdone"]');
    await page.locator('.ch.leaf .chk[aria-checked="true"]').first().waitFor();
    const kept = await page.evaluate(() => [...document.querySelectorAll('.chapters > li')].map(li => li.__mark || null));
    assert.equal(kept[idx], null, '체크한 줄은 새로 그려짐');
    const same = kept.filter((m, i) => m && i !== idx).length;
    assert.ok(same >= 1, '바뀌지 않은 줄은 그대로 유지: ' + JSON.stringify(kept));
    assert.equal(await page.evaluate(() => document.querySelector('a.back').dataset.keep), '1', '바뀌지 않은 위쪽 영역도 그대로');
  });

  await step('묶음 책에서 여러 줄이 한꺼번에 바뀌어도 줄이 중복·뒤섞이지 않음(화면 = 새로 그린 결과)', async () => {
    await page.goto(page.url().replace(/#.*/, '#add'));
    await page.fill('#f-title', '묶음 점검용 책');
    const toc = [1, 2, 3, 4].map(g => g + '부 그룹\n' + [1, 2, 3, 4, 5].map(i => '  ' + g + '부 ' + i + '장').join('\n')).join('\n');
    await page.fill('#f-toc', toc);
    await page.click('#f-submit');
    await page.waitForURL(/#book-/);
    await page.locator('.chapters > li.leaf').first().waitFor();
    const id = page.url().split('#book-')[1];
    const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('.chapters > li')].map(li => (li.querySelector('.ch-title') || {}).textContent.replace(/\s*다음$/, '').trim() + ':' + li.querySelector('.chk').getAttribute('aria-checked')));
    const expectedRows = () => page.evaluate(async (id) => {
      const v = '?v=' + /app\.js\?v=(\d+)/.exec(document.querySelector('script[src*="app.js"]').src)[1];
      const { bookView } = await import('/js/view-book.js' + v);
      const t = document.createElement('template'); t.innerHTML = bookView(id);
      return [...t.content.querySelectorAll('.chapters > li')].map(li => (li.querySelector('.ch-title') || {}).textContent.replace(/\s*다음$/, '').trim() + ':' + li.querySelector('.chk').getAttribute('aria-checked'));
    }, id);
    for (const act of ['leaf', 'leaf', 'group', 'next', 'leaf', 'fold', 'again']) {
      if (act === 'leaf') await page.locator('.chapters > li.leaf .chk').nth(1).click();
      if (act === 'group') await page.locator('.chapters > li.group .chk').nth(1).click();
      if (act === 'next') await page.click('[data-act="nextdone"]');
      if (act === 'fold') await page.locator('.fold-btn').first().click();
      if (act === 'again') await page.locator('.chapters > li.leaf .chk[aria-checked="true"]').first().click();
      await page.waitForTimeout(150);
      assert.deepEqual(await rowsOf(), await expectedRows(), act + ' 뒤 줄이 새로 그린 결과와 다름');
    }
  });

  await step('목표 완독일 2주·4주 프리셋과 직접 입력 및 저장', async () => {
    const stats = page.locator('.quick-insights');
    if (!(await stats.evaluate(el => el.open))) await stats.locator('summary').click();
    const presets = page.locator('.goal-presets > button');
    assert.equal(await presets.count(), 2, '정확히 두 개의 프리셋');
    assert.deepEqual(await presets.allInnerTexts(), ['2주 후','4주 후']);
    const expected = days => page.evaluate(days => {
      const now = new Date(), day = new Date(now.getFullYear(),now.getMonth(),now.getDate());
      day.setDate(day.getDate() + days);
      const pad = n => String(n).padStart(2,'0');
      return day.getFullYear() + '-' + pad(day.getMonth()+1) + '-' + pad(day.getDate());
    },days);
    await presets.nth(0).click();
    assert.equal(await page.locator('#d-goal').inputValue(), await expected(14));
    assert.equal(await presets.nth(0).getAttribute('aria-pressed'),'true');
    await presets.nth(1).click();
    assert.equal(await page.locator('#d-goal').inputValue(), await expected(28));
    assert.equal(await presets.nth(1).getAttribute('aria-pressed'),'true');
    assert.equal(await presets.nth(0).getAttribute('aria-pressed'),'false');
    await page.locator('#d-goal').fill('2027-01-01');
    await page.locator('#d-goal').dispatchEvent('change');
    assert.equal(await page.locator('#d-goal').inputValue(),'2027-01-01');
    assert.equal(await page.locator('.goal-presets [aria-pressed="true"]').count(),0);
    await page.waitForTimeout(900);
    await page.reload();
    await page.locator('.quick-insights summary').click();
    assert.equal(await page.locator('#d-goal').inputValue(),'2027-01-01','수동 입력 목표일은 새로고침 후 유지');
  });

  await step('장만 보기(전체 접기)와 전부 보기(전체 펼치기): 기기 상태 보존·개별 접기 호환', async () => {
    await page.setViewportSize({width:390,height:844});
    const all = page.locator('[data-act="foldall"]');
    assert.equal(await all.count(),1,'그룹이 있는 책에는 전체 접기 버튼이 하나');
    await all.click();
    assert.equal(await all.innerText(),'전체 펼치기');
    assert.equal(await page.locator('.chapters > li.leaf').count(),0,'접으면 장 제목만 표시');
    assert.equal(await page.locator('.chapters > li.group').count(),4,'상위 장은 표시');
    await page.reload();
    await page.locator('.chapters > li.group').first().waitFor();
    assert.equal(await page.locator('.chapters > li.leaf').count(),0,'접기 상태는 새로고침 후에도 유지');
    await all.click();
    assert.equal(await all.innerText(),'전체 접기');
    assert.equal(await page.locator('.chapters > li.leaf').count(),20,'펼치면 모든 하위 챕터 표시');
    await page.locator('.chapters > li.group .fold-btn').first().click();
    assert.ok((await page.locator('.chapters > li.leaf').count())<20,'개별 접기 유지');
    await all.click();
    assert.equal(await page.locator('.chapters > li.leaf').count(),0,'부분적으로 접혀 있어도 전체 접기');
    await all.click();
    assert.equal(await page.locator('.chapters > li.leaf').count(),20,'개별 접기 상태까지 모두 해제');
    await page.locator('[data-act="remaining"]').click();
    assert.equal(await page.locator('[data-act="foldall"]').count(),1,'남은 챕터 필터에서도 접기 제어 유지');
    await page.locator('[data-act="remaining"]').click();
  });

  await step('체크·읽음 표시·취소 때 알림창이 뜨지 않고, 줄의 빈 곳을 눌러도 체크됨', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book', { hasText: '묶음 점검용 책' }).click();
    await page.waitForURL(/#book-/);
    await page.click('[data-act="nextdone"]');
    assert.equal(await page.locator('#toast').isVisible(), false);
    const before = await page.locator('.chapters > li.leaf .chk[aria-checked="true"]').count();
    const li = page.locator('.chapters > li.leaf:not(.done)').first();
    const bb = await li.boundingBox();
    await page.mouse.click(bb.x + bb.width - 80, bb.y + bb.height - 8); // 쪽수 줄 오른쪽 빈 곳
    assert.equal(await page.locator('.chapters > li.leaf .chk[aria-checked="true"]').count(), before + 1, '빈 곳을 눌러도 체크');
    assert.equal(await page.locator('#toast').isVisible(), false);
    await page.locator('.chapters > li.leaf.done').first().locator('.ch-hit').click();
    assert.equal(await page.locator('.chapters > li.leaf .chk[aria-checked="true"]').count(), before, '다시 누르면 취소');
    assert.equal(await page.locator('#toast').isVisible(), false);
    // 메모 삭제 되돌리기 알림창은 좁은 화면에서도 한 줄 막대
    await editChapterMemo();
    await page.locator('textarea[data-act="memotext"]').first().fill('알림창 확인');
    await page.locator('button.memo-done').click();
    await editChapterMemo();
    await page.click('button.memo-del');
    const box = await page.locator('#toast').boundingBox();
    assert.ok(box.height < 72 && box.width > 330 && box.x >= 0 && box.x + box.width <= 390, '알림창 ' + JSON.stringify(box));
    await page.click('[data-undo]');
  });

  await step('빠른 저장에서는 상단 저장 표시가 바뀌지 않고(깜박임 없음), 오래 걸리면 저장 중… 표시', async () => {
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book', { hasText: '묶음 점검용 책' }).click();
    await page.waitForURL(/#book-/);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.evaluate(() => { window.__syncTexts = []; new MutationObserver(() => window.__syncTexts.push(document.getElementById('sync').textContent)).observe(document.getElementById('sync'), { childList: true, characterData: true, subtree: true }); });
    await page.locator('.chapters > li.leaf .chk').first().click();
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.waitForTimeout(1000);
    assert.ok(!(await page.evaluate(() => window.__syncTexts)).includes('저장 중…'), '빠른 저장에서 저장 중… 이 깜박이지 않음');
    await page.evaluate(() => { window.__writeDelay = 1500; window.__syncTexts = []; });
    await page.locator('.chapters > li.leaf .chk').first().click();
    await page.locator('#sync', { hasText: '저장 중…' }).waitFor({ timeout: 3000 });
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached', timeout: 8000 });
    await page.evaluate(() => { window.__writeDelay = 0; });
  });

  await step('서버 응답이 늦거나 오래된 내용이 먼저 와도 체크·해제가 한 번만 바뀜(깜박임 없음)', async () => {
    await page.goto(page.url().replace(/#.*/, '#library'));
    await view.locator('a.book', { hasText: '묶음 점검용 책' }).click();
    await page.waitForURL(/#book-/);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    await page.locator('.chapters > li.leaf .chk').first().waitFor();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__realisticSnapshots = true;
      window.__seq = []; window.__rows = 0;
      const chk = () => { const c = document.querySelector('.chapters > li.leaf .chk'); return c ? c.getAttribute('aria-checked') : '-'; };
      window.__chk = chk;
      new MutationObserver((ms) => { const v = chk(); const last = window.__seq[window.__seq.length - 1]; if (last !== v) window.__seq.push(v); ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.matches && n.matches('.chapters > li')) window.__rows++; })); })
        .observe(document.getElementById('view'), { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
    });
    const first = page.locator('.chapters > li.leaf .chk').first();
    for (const [i, want] of [[0, 'true'], [1, 'false'], [2, 'true'], [3, 'false']]) {
      await page.evaluate(() => { window.__seq = [window.__chk()]; window.__rows = 0; });
      await first.click();
      await page.waitForTimeout(1200);
      const seq = await page.evaluate(() => window.__seq);
      assert.deepEqual(seq, [want === 'true' ? 'false' : 'true', want], '누른 ' + (i + 1) + '번째 변화 순서가 한 번에 끝나야 함: ' + JSON.stringify(seq));
      const rows = await page.evaluate(() => window.__rows);
      assert.ok(rows <= 3, '한 번 누를 때 새로 그려진 줄 ' + rows);
    }
    // 빠르게 연타: 눌린 횟수만큼만 뒤집혀야 하고 마지막 상태가 유지됨
    await page.evaluate(() => { window.__seq = [window.__chk()]; });
    for (let k = 0; k < 5; k++) { await first.click(); await page.waitForTimeout(90); }
    await page.waitForTimeout(1500);
    const seq = await page.evaluate(() => window.__seq);
    assert.equal(seq.length, 6, '5번 누르면 5번만 바뀜: ' + JSON.stringify(seq));
    assert.equal(await first.getAttribute('aria-checked'), 'true');
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    const ui = Number(/(\d+)\s*\//.exec(await page.locator('.reading-progress .of').innerText())[1]); // 접힌 묶음과 무관한 '읽은 수 / 전체'
    const server = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('e2e-books'))).find(b => b.title === '묶음 점검용 책').chapters.filter(c => c.done).length);
    assert.equal(server, ui, '화면과 서버의 체크 수가 같음(화면 ' + ui + ', 서버 ' + server + ')');
    await first.click(); // 원래대로
    await page.waitForTimeout(800);
  });

  await step('저장 직후에도 다른 기기의 새 변경은 반영되고, 삭제한 책은 되살아나지 않음', async () => {
    await page.evaluate(() => { window.__realisticSnapshots = true; });
    // 다른 기기의 변경(더 최신 updatedAt)을 흉내: 저장 직후 7번째 줄에 완료일을 넣음
    await page.locator('.chapters > li.leaf .chk').first().click();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const docs = JSON.parse(localStorage.getItem('e2e-books'));
      const b = Object.values(docs).find(x => x.title === '묶음 점검용 책');
      b.chapters[8].done = '2026-10-29'; b.updatedAt = Date.now() + 5000;
      localStorage.setItem('e2e-books', JSON.stringify(docs));
      window.dispatchEvent(new StorageEvent('storage', { key: 'e2e-books' }));
    });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.chapters > li.leaf .chk[aria-checked="true"]').count() >= 2, true, '다른 기기의 변경도 반영됨');
    // 되돌려 두기
    await page.evaluate(() => { const docs = JSON.parse(localStorage.getItem('e2e-books')); const b = Object.values(docs).find(x => x.title === '묶음 점검용 책'); b.chapters.forEach(c => { c.done = null; }); b.updatedAt = Date.now() + 8000; localStorage.setItem('e2e-books', JSON.stringify(docs)); window.dispatchEvent(new StorageEvent('storage', { key: 'e2e-books' })); });
    await page.waitForTimeout(800);
    // 책을 삭제해도 오래된 응답이 다시 살리지 않음
    await page.evaluate(() => { window.__realisticSnapshots = true; });
    await page.locator('.book-menu > summary').click();
    await page.click('[data-act="del"]');
    await page.evaluate(() => {
      window.__resurrected = false;
      new MutationObserver(() => { if (/묶음 점검용 책/.test(document.getElementById('view').innerText) && location.hash === '#library') window.__resurrected = true; })
        .observe(document.getElementById('view'), { childList: true, subtree: true });
    });
    await page.click('[data-act="delyes"]');
    await page.waitForURL(/#library/);
    await page.waitForTimeout(1500);
    assert.equal(await view.locator('a.book', { hasText: '묶음 점검용 책' }).count(), 0, '삭제한 책이 되살아나지 않음');
    assert.equal(await page.evaluate(() => window.__resurrected), false, '삭제한 책이 잠깐이라도 다시 나타나지 않음');
    await page.evaluate(() => { window.__realisticSnapshots = false; });
  });

  await step('휴지통은 새로고침 뒤에도 남고 삭제한 책을 새 복구본으로 보존', async () => {
    await page.goto(base + '#records');
    await page.locator('.trash-list').waitFor();
    const item = page.locator('.trash-list li', {hasText:'묶음 점검용 책'}).first();
    await page.reload();
    await item.locator('[data-act="trash-restore"]').click();
    await page.waitForURL(/#book-/);
    assert.match(await page.locator('.head h1').innerText(), /묶음 점검용 책.*복구본/);
    assert.ok(await page.locator('.ch.leaf').count() > 0);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
  });

  await step('메모 삭제의 6초 되돌리기가 지나도 휴지통에서 복구', async () => {
    await editChapterMemo();
    await page.locator('textarea[data-act="memotext"]').fill('휴지통에서 찾을 메모 🙂 <태그>');
    await page.click('button.memo-del');
    await page.waitForTimeout(6100);
    assert.equal(await page.locator('#toast').isVisible(),false);
    await page.goto(base + '#records');
    const entry = page.locator('.trash-list li',{hasText:'휴지통에서 찾을 메모'}).first();
    await entry.locator('[data-act="trash-restore"]').click();
    await page.waitForURL(/#book-/);
    await page.locator('.ch-memo', {hasText:'휴지통에서 찾을 메모 🙂 <태그>'}).waitFor();
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
  });

  await step('검색어 공백 무시 강조·백업과 Markdown 원문 보존', async () => {
    await page.goto(base + '#library');
    await page.locator('[data-act="search"]').fill('찾 을 메 모');
    await page.locator('.memo-hit-t mark',{hasText:'찾을 메모'}).first().waitFor();
    await page.goto(base + '#records');
    const jsonEvent = page.waitForEvent('download');
    await page.click('[data-act="export-json"]');
    const jsonDownload = await jsonEvent;
    const data = JSON.parse(await readFile(await jsonDownload.path(),'utf8'));
    assert.equal(data.format,'chaekgalpi'); assert.equal(data.version,1);
    assert.ok(data.books.some(b => b.chapters.some(c => c.memo === '휴지통에서 찾을 메모 🙂 <태그>')));
    assert.equal(data.books.length,await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('e2e-books'))).length));
    const mdEvent = page.waitForEvent('download');
    await page.click('[data-act="export-md"]');
    const mdDownload = await mdEvent;
    assert.match(await readFile(await mdDownload.path(),'utf8'), /휴지통에서 찾을 메모 🙂 <태그>/);
    for (const width of [320,390,1280]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    if (process.env.DESIGN_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.DESIGN_SCREENSHOT_DIR,'records.png'),fullPage:true});
  });

  await step('책 추가 보관 실패 시 입력을 보존하고 재시도 가능', async () => {
    await page.goto(base + '#add');
    await page.locator('#f-title').fill('보관 실패 재시도 책');
    await page.locator('#f-toc').fill('1장. 시작\n2장. 마침');
    await page.evaluate(() => {
      window.__quotaSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) {
        if (k.startsWith('chaekgalpi-pending-v1:')) throw new DOMException('quota','QuotaExceededError');
        return window.__quotaSet.call(this,k,v);
      };
    });
    try {
      await page.click('#f-submit');
      await page.locator('#f-err:visible').waitFor();
      assert.match(page.url(), /#add$/, '보관 실패 시 폼을 떠나면 안 됨');
      assert.equal(await page.locator('#f-title').inputValue(), '보관 실패 재시도 책');
    } finally {
      await page.evaluate(() => { Storage.prototype.setItem = window.__quotaSet; });
    }
    await page.click('#f-submit');
    await page.waitForURL(/#book-/);
    await page.locator('#sync[data-state="saved"]').waitFor({state:'attached'});
    assert.equal(await page.locator('.chapters > li.leaf').count(), 2);
  });

  await step('직접 책 추가도 시작일을 비워 독서 예정으로 등록', async () => {
    await page.goto(base + '#add');
    assert.equal(await page.locator('#f-start').inputValue(), '', '새 책의 시작일은 기본 공란');
    await page.locator('#f-title').fill('예정으로 담는 새 책');
    await page.locator('#f-toc').fill('제1장 시작\n제2장 다음');
    await page.locator('#f-submit').click();
    await page.waitForURL(/#book-/);
    assert.equal(await page.locator('.head .chip.todo').innerText(), '독서 예정');
    await page.locator('.quick-insights > summary').click();
    assert.equal(await page.locator('#d-start').inputValue(), '', '독서 시작일 공란 유지');
  });

  await step('직접 추가한 책은 책 찾기에서 다시 담기지 않음(중복 방지)', async () => {
    await page.goto(base + '#catalog');
    const row = view.locator('div.book', { has: page.locator('[data-act="catadd"]') }).first();
    await row.waitFor();
    const title = (await row.locator('.book-title').innerText()).trim();
    const addable = await view.locator('[data-act="catadd"]').count();
    await page.goto(base + '#add');
    await page.fill('#f-title', title);
    await page.fill('#f-toc', '1장\n2장');
    await page.click('#f-submit');
    await page.waitForURL(/#book-/);
    const id = page.url().split('#book-')[1];
    await page.goto(base + '#catalog');
    const owned = view.locator('div.book', { hasText: title });
    await owned.locator('a.btn', { hasText: '서재에 있음' }).waitFor();
    assert.equal(await owned.locator('[data-act="catadd"]').count(), 0, '이미 있는 책에는 담기 버튼이 없음');
    assert.equal(await owned.locator('a.btn').getAttribute('href'), '#book-' + id);
    assert.equal(await view.locator('[data-act="catadd"]').count(), addable - 1);
    await page.goto(base + '#library'); await page.reload();
    await view.locator('a.book').first().waitFor();
    assert.equal(await view.locator('a.book .book-title', { hasText: title }).count(), 1, '서재에는 한 권만');
  });

  await step('책 추가 버튼을 연달아 눌러도 한 권만 추가', async () => {
    await page.goto(base + '#library'); await page.reload();
    await view.locator('a.book').first().waitFor();
    const before = await view.locator('a.book').count();
    await page.goto(base + '#add');
    await page.fill('#f-title', '연타 확인용 책');
    await page.fill('#f-toc', '1장');
    await page.evaluate(() => { const f = document.getElementById('bookForm'); for (let i = 0; i < 3; i++) f.requestSubmit(); });
    await page.waitForURL(/#book-/);
    await page.goto(base + '#library'); await page.reload();
    await view.locator('a.book').first().waitFor();
    assert.equal(await view.locator('a.book').count(), before + 1);
  });

  await step('필터 탭을 누르면 누른 탭에 포커스가 남음', async () => {
    await page.goto(base + '#library');
    await page.locator('[data-act="filter"][data-v="todo"]').click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.v), 'todo');
    await page.locator('[data-act="filter"][data-v="all"]').click();
  });

  await step("화면 오류 없음", async () => { assert.deepEqual(errors, []); });
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
