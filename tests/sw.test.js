import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('서비스 워커 활성화는 이 앱의 이전 버전 캐시만 지움', async () => {
  const handlers = {}, deleted = [];
  const context = vm.createContext({URL, self:{addEventListener:(k,fn)=>handlers[k]=fn, clients:{claim:async()=>{}}}, caches:{keys:async()=>['chaekgalpi-reading-v1','chaekgalpi-reading-v2','other-site-v1','chaekgalpi-v1'],delete:async key=>deleted.push(key)}});
  vm.runInContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
  let result; handlers.activate({waitUntil:p=>result=p}); await result;
  assert.deepEqual(deleted,['chaekgalpi-reading-v1','chaekgalpi-reading-v2']);
});

test('서비스 워커: ?v= 가 붙은 화면 파일은 재확인을 강제하지 않고, 주소가 고정된 파일은 서버에 확인함', async () => {
  const handlers = {}, calls = [];
  const cache = { put: async () => {}, match: async () => undefined };
  const context = vm.createContext({
    URL,
    self: { addEventListener: (k, fn) => handlers[k] = fn, location: { origin: 'https://x.test' }, registration: { scope: 'https://x.test/app/' } },
    caches: { open: async () => cache },
    fetch: async (req, opts) => { calls.push({ url: req.url, opts }); return { ok: true, clone() { return this; } }; },
  });
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), context);
  async function run(url, mode = 'cors') {
    let p; handlers.fetch({ request: { method: 'GET', url, mode }, respondWith: (x) => { p = x; } }); await p;
    return calls[calls.length - 1];
  }
  assert.equal((await run('https://x.test/app/js/app.js?v=52')).opts, undefined);
  assert.equal((await run('https://x.test/app/css/style.css?v=48')).opts, undefined);
  assert.equal(JSON.stringify((await run('https://x.test/app/catalog/index.json')).opts), '{"cache":"no-cache"}');
  assert.equal(JSON.stringify((await run('https://x.test/app/', 'navigate')).opts), '{"cache":"no-cache"}');
  assert.equal(JSON.stringify((await run('https://x.test/app/index.html?v=3', 'navigate')).opts), '{"cache":"no-cache"}');
});
