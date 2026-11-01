// Same fixture and viewport for both revisions. Never connects to production Firebase.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve(process.env.DESIGN_ROOT || '.');
const baseline = process.env.DESIGN_BASELINE === '1';
const out = resolve(process.env.DESIGN_SCREENSHOT_DIR || 'design-screenshots', baseline ? 'before' : 'after');
await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  let p=new URL(req.url,'http://x').pathname;
  if(p.endsWith('/'))p+='index.html';
  const file=resolve(root,'.'+p);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'}).end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://localhost:${server.address().port}/`;
const book={id:'design',title:'실용주의 프로그래머',author:'데이비드 토머스 · 앤드루 헌트',createdAt:1,startDate:'2026-10-30',chapters:[
 {t:'실용주의 철학',lv:0,done:'2026-10-30',memo:'좋은 코드는 변화에 대응할 수 있는 코드다.'},
 {t:'실용주의 접근법',lv:0,done:null,memo:''},
 {t:'기본 도구와 더 나은 설계를 위한 질문들',lv:0,done:null,memo:''}
]};
const errors=[];
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  if(baseline&&name!=='chromium')continue;
  const browser=await engine.launch();
  try{
   const ctx=await browser.newContext({serviceWorkers:'block',locale:'ko-KR',timezoneId:'Asia/Seoul'});
   await ctx.route('**/js/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const firebaseConfig={apiKey:"test",projectId:"test"};export const allowedEmails=["owner@example.com"];'}));
   await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:`export * from ${JSON.stringify(url+'e2e/firebase-fixture.js')};`}));
   await ctx.addInitScript(b=>{if(!localStorage.getItem('e2e-books')){localStorage.setItem('e2e-signed-in','yes');localStorage.setItem('e2e-books',JSON.stringify({design:b}));}},book);
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   async function fits(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${label}: horizontal overflow`);}
   for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
    for(const width of baseline?[390,1280]:[320,375,390,430,768,1280]){
     await page.setViewportSize({width,height:900});
     for(const [route,ready,label] of [['#library','a.book','library'],['#book-design','.chapters','detail'],['#add','#f-title','form'],['#records','[data-act="export-json"]','records']]){
      await page.goto(url+route);await page.locator(ready).first().waitFor();await page.evaluate(()=>document.fonts.ready);
      if(!baseline)await fits(`${theme} ${width} ${label}`);
      if(name==='chromium'&&[390,1280].includes(width))await page.screenshot({path:`${out}/${label}-${theme}-${width}.png`,fullPage:false});
     }
    }
   }
   if(!baseline){
    await page.setViewportSize({width:320,height:844});await page.goto(url+'#library');
    await page.locator('input[data-act="search"]').waitFor(); // Search stays available for one book.
    await page.goto(url+'#book-design');await page.locator('.chapters').waitFor();
    assert.ok((await page.locator('.tgl').boundingBox()).height>=44,'remaining filter target');
    assert.ok((await page.locator('.memo-btn').first().boundingBox()).height>=44,'memo target');
    const title='LongChapterTitle'.repeat(13);
    await page.evaluate(title=>{const docs=JSON.parse(localStorage.getItem('e2e-books'));docs.design.chapters[0].t=title;localStorage.setItem('e2e-books',JSON.stringify(docs));},title);
    await page.reload();await page.locator('details.memos>summary').click();await fits('long memo heading');
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');await fits('200% text detail');
    await page.goto(url+'#library');await page.locator('a.book').waitFor();await fits('200% text library');
    await page.goto(url+'#add');await page.locator('#f-title').waitFor();await fits('200% text form');
    await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.goto(url+'#book-design');await page.locator('.chapters').waitFor();
    await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.__scrollBehavior=options?.behavior;return original.call(this,options);};});
    await page.locator('.memo-btn[data-act="memo"]').first().click();await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>window.__scrollBehavior),'auto','reduced motion is respected');
    await page.locator('textarea[data-act="memotext"]').fill('키보드로 기록한 메모');
    await page.locator('.memo-done').click();
    await page.locator('.ch-memo',{hasText:'키보드로 기록한 메모'}).waitFor();
    await page.locator('.ch.leaf .chk').nth(1).focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('.ch.leaf .chk').nth(1).getAttribute('aria-checked'),'true');
    console.log(`ok - ${name}: 6 widths, light/dark, four screens, long text, 200% text, touch targets, keyboard, reduced motion`);
   }
   await ctx.close();
  }finally{await browser.close();}
 }
 assert.deepEqual(errors,[]);
}finally{server.close();}
