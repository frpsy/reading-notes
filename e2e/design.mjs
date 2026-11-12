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
     for(const [route,ready,label] of [
      ['#library','a.book','library'],['#book-design','.chapters','detail'],
      ['#add','#f-title','form'],['#records','[data-act="export-json"]','records'],
      ...(baseline ? [] : [['#settings','#theme','settings'],['#activity','.activity-page','activity'],['#catalog','h1.page','catalog']])
     ]){
      await page.goto(url+route);await page.locator(ready).first().waitFor();await page.evaluate(()=>document.fonts.ready);
      if(!baseline){
       await fits(`${theme} ${width} ${label}`);
       // iOS 상단 제목·안전 영역·헤더 버튼 겹침 예방 불변식.
       const header=await page.locator('.top').boundingBox();
       const brand=await page.locator('.brand').boundingBox();
       const controls=await page.locator('.top-r').boundingBox();
       assert.ok(header&&brand&&controls,'header elements should have visible bounds');
       assert.ok(brand.x+brand.width<=controls.x+1 || brand.y+brand.height<=controls.y+1 || controls.y+controls.height<=brand.y+1,'header brand and controls must never overlap');
       const brandStyle=await page.locator('.brand').evaluate(el=>{
        const st=getComputedStyle(el);
        return {font:st.fontFamily,opacity:st.opacity,filter:st.filter,shadow:st.textShadow};
       });
       assert.equal(brandStyle.opacity,'1','header brand must remain opaque');
       assert.equal(brandStyle.filter,'none','header brand must not be blurred');
       assert.equal(brandStyle.shadow,'none','header brand must not use shadow');
       assert.ok(!/Noto Serif|Nanum Myeongjo/i.test(brandStyle.font),'small brand uses crisp sans font');
       if(name==='webkit'&&width<=600){
        const paddingTop=await page.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingTop));
        assert.ok(brand.y>=paddingTop-1,'WebKit brand must remain below its effective top padding');
        // Linux WebKit does not emulate iOS Safari chrome or Dynamic Island. Real iPhone verification remains required.
       }
       // iPhone 글자 크기: 입력칸은 16px 이상(미만이면 Safari 가 포커스 때 화면 확대), 보이는 글자는 12px 이상.
       if(width<=430){
         const small=await page.evaluate(()=>{
           const out=[];
           for(const e of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')){
             if(e.getBoundingClientRect().width&&parseFloat(getComputedStyle(e).fontSize)<16)out.push('control '+(e.id||e.dataset.act||e.tagName)+' '+getComputedStyle(e).fontSize);
           }
           const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
           while(n=w.nextNode()){
             const t=n.textContent.trim(),el=n.parentElement;if(!t||el.closest('script,style,svg'))continue;
             const r=el.getBoundingClientRect(),st=getComputedStyle(el);
             if(!r.width||!r.height||st.visibility==='hidden')continue;
             if(parseFloat(st.fontSize)<12)out.push('text '+el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0]+' '+st.fontSize+' "'+t.slice(0,12)+'"');
           }
           return out;
         });
         assert.deepEqual(small,[],`${name} ${theme} ${width} ${label}: text/controls below iPhone minimum`);
       }
       if(label==='library'){
        assert.equal(await page.locator('#sync[data-state="saved"]').isVisible(),false,'normal save status must not appear as top button');
        const resume=page.locator('a.resume');
        assert.equal(await resume.count(),1,'one recent reading card on home');
        assert.equal(await resume.getAttribute('href'),'#book-design','resume opens existing book route');
        assert.match(await resume.innerText(),/실용주의 프로그래머/);
        assert.match(await resume.innerText(),/33%/);
        const card=await resume.boundingBox(),search=await page.locator('.search').boundingBox();
        assert.ok(card&&card.height>=44&&card.y+card.height<=900,'resume visible without menu in first viewport');
        assert.ok(search&&card.y+card.height<=search.y+1,'resume precedes existing search');
        const contrast=await resume.evaluate(()=>{
          const root=getComputedStyle(document.documentElement);
          const rgb=(name)=>{const value=root.getPropertyValue(name).trim();if(!/^#[0-9a-f]{6}$/i.test(value))throw Error('Unsupported color '+name+': '+value);return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);};
          const lum=(c)=>c.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
          const bg=lum(rgb('--accent-soft'));
          return ['--ink','--muted','--accent'].map(k=>{const fg=lum(rgb(k));return [k,(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)];});
        });
        for(const [token,ratio] of contrast)assert.ok(ratio>=4.5,'resume '+token+' contrast >= 4.5: '+ratio);
       }
       if(label==='detail'){
        const compact=page.locator('.quick-insights');
        assert.equal(await compact.count(),1,'one compact statistics disclosure');
        assert.ok((await compact.locator('summary').innerText()).includes('시작'),'summary includes start date');
        assert.ok((await compact.locator('summary').boundingBox()).height>=44,'statistics touch target');
        const summary=await compact.boundingBox(),chapters=await page.locator('.chapters').boundingBox();
        assert.ok(summary.y+summary.height<chapters.y,'statistics precedes chapters');
        assert.equal(await page.locator('.ch-title .next-pill').count(),0,'next label not in chapter title');
        assert.equal(await page.locator('.ch.next .ch-meta .next-pill').count(),1,'next label beside page');
        const done=page.locator('.ch.leaf.done').first();
        const check=await done.locator('.chk').boundingBox(),title=await done.locator('.ch-title').boundingBox();
        assert.ok(Math.abs(check.y-title.y)<13,'checkbox aligned with title');
        if(width<=430){
          // 묶음 제목과 일반 챕터 제목은 같은 크기(굵기·배경으로만 구분), 메타 글자는 13px 이상.
          const sizes=await page.evaluate(()=>{const f=s=>{const e=document.querySelector(s);return e?parseFloat(getComputedStyle(e).fontSize):null;};return {leaf:f('.ch.leaf .ch-title'),group:f('.ch.group .ch-title'),pg:f('.ch-meta .pg'),date:f('.ch-date')};});
          if(sizes.group!==null)assert.equal(sizes.group,sizes.leaf,'group and leaf chapter titles share one size');
          assert.ok(sizes.leaf>=16.5,'chapter title is the largest list text: '+sizes.leaf);
          assert.ok(sizes.pg===null||sizes.pg>=13,'page meta >= 13px');
          assert.ok(sizes.date===null||sizes.date>=13,'date meta >= 13px');
        }
        assert.ok((await done.locator('.ch-memo .memo-tap').boundingBox()).height>=44,'note touch target');
        // 터치 영역: 눈에 보이는 크기는 작아도 누를 수 있는 범위(가상 요소 포함)는 44px 이상이어야 합니다.
        const hit=async(sel,label)=>{
          const box=await page.locator(sel).first().boundingBox();
          assert.ok(box,label+' visible');
          const area=await page.evaluate(([s])=>{
            const el=document.querySelector(s);el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();
            const cx=r.left+r.width/2,cy=r.top+r.height/2;
            const reach=(dx,dy)=>{let n=0;for(let d=0;d<=60;d++){const t=document.elementFromPoint(cx+dx*d,cy+dy*d);if(t&&(t===el||el.contains(t)))n=d;else break;}return n;};
            return {w:reach(-1,0)+reach(1,0),h:reach(0,-1)+reach(0,1)};
          },[sel]);
          assert.ok(area.w>=43&&area.h>=43,label+' touch area '+JSON.stringify(area));
        };
        await hit('.top .brand','brand');
        await hit('.back','back link');
        await hit('.panel.next .btn','next buttons');
        await hit('.ch-opt .chapter-options > summary','chapter options');
        await hit('.memos > summary','memo collection');
        await hit('.note-editor > summary','note editor');
        assert.equal(await page.locator('.head .by').evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('.by-author').forEach(n=>n.remove());return /[·]/.test(c.textContent);}),false,'status and pages are separated by gaps, not dots that can wrap');
        if(width<=430){
          const menuSummary=done.locator('.chapter-options > summary');
          await menuSummary.click();
          const panel=done.locator('.chapter-options-body'), date=panel.locator('input[type="date"]');
          const pop=await panel.boundingBox(), field=await date.boundingBox();
          assert.ok(pop&&field,'completed chapter date editor is visible');
          assert.ok(pop.width<=Math.min(240,width-24)+2,'mobile date popup fits screen');
          assert.ok(pop.height<155,'date menu has compact vertical spacing');
          assert.ok(field.height>=44,'date input keeps a usable touch target');
          assert.ok(field.x>=pop.x-1&&field.x+field.width<=pop.x+pop.width+1,'date field stays inside popup');
          await menuSummary.click();
        }
        if(width===390){
          await compact.locator('summary').click();
          assert.ok(await compact.locator('.insight-dates').isVisible(),'detail dates visible after expansion');
          const presets=page.locator('.goal-presets > button');
          assert.equal(await presets.count(),2,'only two date presets');
          for(const btn of await presets.all()) assert.ok((await btn.boundingBox()).height>=44,'date preset touch height');
          await compact.locator('summary').click();
        }
       }

       if(label==='library'){
        const a=await page.locator('.lib-head h1').boundingBox(), b=await page.locator('.lib-actions').boundingBox();
        assert.ok(a&&b, 'library heading and actions visible');
        assert.ok(a.y+a.height<=b.y+1 || a.x+a.width<=b.x+1, 'library heading and actions do not overlap');
        for(const button of await page.locator('.lib-actions .btn').all()){
         const box=await button.boundingBox();
         assert.ok(box&&box.height>=44, 'library action minimum touch height');
        }
       }
       if(label==='settings'){
        const links=page.locator('.settings-link');
        for(const link of await links.all()){
         const box=await link.boundingBox();
         assert.ok(box&&box.height>=44, 'settings row minimum touch height');
        }
        assert.ok((await page.locator('#theme').boundingBox()).height>=44,'theme action minimum touch height');
       }
      }
      if(name==='chromium'&&[390,1280].includes(width))await page.screenshot({path:`${out}/${label}-${theme}-${width}.png`,fullPage:false});
     }
    }
   }
   if(!baseline){
    await page.setViewportSize({width:390,height:844});await page.goto(url+'#library');
    await page.locator('a.resume').click();await page.locator('.chapters').waitFor();
    assert.equal(new URL(page.url()).hash,'#book-design','one tap opens reading detail');
    await page.setViewportSize({width:320,height:844});await page.goto(url+'#library');
    await page.locator('input[data-act="search"]').waitFor(); // Search stays available for one book.
    await page.goto(url+'#book-design');await page.locator('.chapters').waitFor();
    assert.ok((await page.locator('.tgl').boundingBox()).height>=44,'remaining filter target');
    assert.ok((await page.locator('.ch.leaf .memo-tap').first().boundingBox()).height>=44,'memo preview touch target');
    const title='LongChapterTitle'.repeat(13);
    await page.evaluate(title=>{const docs=JSON.parse(localStorage.getItem('e2e-books'));docs.design.chapters[0].t=title;localStorage.setItem('e2e-books',JSON.stringify(docs));},title);
    await page.reload();await page.locator('details.memos>summary').click();await fits('long memo heading');
    const fontBefore=await page.locator('.ch-title').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    const fontAfter=await page.locator('.ch-title').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(fontAfter>=fontBefore*1.9,'chapter text actually enlarges');await fits('200% text detail');
    await page.goto(url+'#library');await page.locator('a.book').waitFor();await fits('200% text library');
    await page.goto(url+'#add');await page.locator('#f-title').waitFor();await fits('200% text form');
    await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.goto(url+'#book-design');await page.locator('.chapters').waitFor();
    await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.__scrollBehavior=options?.behavior;return original.call(this,options);};});
    await page.locator('.ch.leaf .ch-memo .memo-preview').first().locator('summary').click();
     await page.locator('.ch.leaf .ch-memo .memo-edit-tap').first().click();await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>window.__scrollBehavior),'auto','reduced motion is respected');
    await page.locator('textarea[data-act="memotext"]').fill('키보드로 기록한 메모');
    await page.locator('.memo-done').click();
    await page.locator('.ch-memo',{hasText:'키보드로 기록한 메모'}).waitFor();
    await page.locator('.ch.leaf .chk').nth(1).focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('.ch.leaf .chk').nth(1).getAttribute('aria-checked'),'true');
    assert.equal(await page.getByRole('progressbar',{name:'읽은 챕터'}).getAttribute('aria-valuenow'),'2');
    // Build the second book only from the committed fixture, not an in-flight write.
    await page.waitForFunction(()=>{const b=JSON.parse(localStorage.getItem('e2e-books')).design;return b.chapters[0].memo==='키보드로 기록한 메모'&&!!b.chapters[1].done;});
    await page.goto(url+'#add');await page.locator('#f-submit').click();
    assert.equal(await page.locator('#f-title').getAttribute('aria-invalid'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'f-title');
    await page.locator('#f-title').fill('입력 안내 검증');
    assert.equal(await page.locator('#f-err').isVisible(),false);
    await page.locator('#f-submit').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'f-toc');
    assert.equal(await page.locator('#f-toc').getAttribute('aria-invalid'),'true');
    await page.locator('#f-toc').fill('첫 챕터');
    assert.equal(await page.locator('#f-toc').getAttribute('aria-invalid'),null);
    await page.locator('.toc-help>summary').click();
    assert.equal(await page.locator('.toc-help').getAttribute('open'),'');
    await page.evaluate(()=>{
      const docs=JSON.parse(localStorage.getItem('e2e-books'));
      docs.completed=structuredClone(docs.design);docs.completed.id='completed';docs.completed.title='완독 비교용';
      docs.completed.chapters.forEach(c=>c.done='2026-10-30');
      localStorage.setItem('e2e-books',JSON.stringify(docs));
    });
    await page.goto(url+'#library');await page.reload();await page.locator('a.book').first().waitFor();
    await page.locator('[data-act="search"]').fill('키보드로 기록한 메모');
    assert.equal(await page.locator('.memo-hits li').count(),2);
    await page.locator('[data-act="filter"][data-v="reading"]').click();
    assert.equal(await page.locator('.memo-hits li').count(),1,'memo search respects status filter');
    assert.equal(await page.locator('.remind').count(),0,'search is free of unrelated reminders');
    await page.locator('[data-act="search"]').fill('검색할 수 없는 단어');
    await page.locator('[data-act="reset-search"]').click();
    assert.equal(await page.locator('[data-act="search"]').inputValue(),'');
    assert.equal(await page.locator('[data-v="all"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.act),'search');
    await page.goto(url+'#settings');
    await page.locator('#theme').waitFor();
    await page.locator('#theme').click();
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#F7F6F2');
    await page.locator('#theme').click();
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#101617');
    await page.locator('#theme').click();await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(()=>document.querySelector('meta[name="theme-color"]').content==='#F7F6F2');
    // 책이 많은 서재: 세로로 넘치는 만큼 실제로 스크롤되고 가로 넘침이 없어야 합니다.
    await page.evaluate(()=>{
      const docs=JSON.parse(localStorage.getItem('e2e-books'));
      for(let i=0;i<14;i++){const b=structuredClone(docs.design);b.id='many'+i;b.title='스크롤 확인용 책 '+i;b.createdAt=100+i;if(i%3===0)b.chapters.forEach(c=>c.done=null),b.startDate=null;if(i%3===2)b.chapters.forEach(c=>c.done='2026-10-30');docs[b.id]=b;}
      localStorage.setItem('e2e-books',JSON.stringify(docs));
    });
    for(const [width,height] of [[390,844],[1280,800]]){
      await page.setViewportSize({width,height});
      await page.goto(url+'#library');await page.reload();await page.locator('a.book').nth(15).waitFor();
      await fits('many books '+width);
      const size=await page.evaluate(()=>({sh:document.documentElement.scrollHeight,ih:innerHeight,html:getComputedStyle(document.documentElement).overflowY,body:getComputedStyle(document.body).overflowY,pos:getComputedStyle(document.body).position}));
      assert.ok(size.sh>size.ih*2,`${name} ${width}: library is taller than the screen`);
      assert.equal(size.html,'visible');assert.equal(size.body,'visible');assert.equal(size.pos,'static');
      await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,700);
      await page.waitForFunction(()=>scrollY>=600,null,{timeout:5000});
      await page.waitForFunction(()=>{scrollTo(0,document.documentElement.scrollHeight);return scrollY+innerHeight>=document.documentElement.scrollHeight-2;});
      const last=await page.locator('a.book').last().boundingBox();
      assert.ok(last.y+last.height<=height,`${name} ${width}: last book is reachable above the bottom edge`);
      // 아래쪽 책을 열었다가 돌아오면 보던 위치로 돌아옵니다.
      await page.locator('a.book').last().scrollIntoViewIfNeeded();
      const y=await page.evaluate(()=>scrollY);
      await page.locator('a.book').last().click();await page.locator('.chapters').waitFor();
      await page.locator('a.back').click();await page.locator('a.book').first().waitFor();
      assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<=2,`${name} ${width}: scroll position restored`);
    }
    console.log(`ok - ${name}: 6 widths, light/dark, four screens, long text, 200% text, touch targets, keyboard, reduced motion`);
   }
   await ctx.close();
  }finally{await browser.close();}
 }
 assert.deepEqual(errors,[]);
}finally{server.close();}
