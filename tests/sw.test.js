import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('서비스 워커 활성화는 이 앱의 이전 버전 캐시만 지움', async () => {
  const handlers = {}, deleted = [];
  const context = vm.createContext({URL, self:{addEventListener:(k,fn)=>handlers[k]=fn, clients:{claim:async()=>{}}}, caches:{keys:async()=>['chaekgalpi-reading-v1','chaekgalpi-reading-v2','other-site-v1','chaekgalpi-v1'],delete:async key=>deleted.push(key)}});
  vm.runInContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
  let result; handlers.activate({waitUntil:p=>result=p}); await result;
  assert.deepEqual(deleted,['chaekgalpi-reading-v1']);
});
