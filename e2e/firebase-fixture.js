// E2E 서버에서만 제공하는 Firebase 대역입니다. 배포 파일에는 포함하지 않습니다.
let authCallback = null;
const listeners = new Set();
const read = () => JSON.parse(localStorage.getItem('e2e-books') || '{}');
const user = () => localStorage.getItem('e2e-signed-in') ? { uid:'test-user', email:localStorage.getItem('e2e-email') || 'owner@example.com', emailVerified:true } : null;
const snapshot = () => {
  const docs = Object.entries(read()).map(([id,value]) => ({id,data:()=>value}));
  return {docs,empty:!docs.length,metadata:{fromCache:false}};
};
function notify() { for (const fn of listeners) fn(snapshot()); }
window.addEventListener('storage', e => { if(e.key === 'e2e-books') notify(); });
export const initializeApp = () => ({});
export const getAuth = () => ({});
export const initializeFirestore = () => ({});
export const getFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export function onAuthStateChanged(_, fn) { authCallback = fn; queueMicrotask(()=>fn(user())); }
export class GoogleAuthProvider {}
export async function signInWithPopup() {
  if (window.__loginFail) throw Object.assign(Error('Firebase: Error (' + window.__loginFail + ').'), { code: window.__loginFail });
  localStorage.setItem('e2e-signed-in','yes'); await authCallback(user());
}
export async function signOut() { localStorage.removeItem('e2e-signed-in'); await authCallback(null); }
export const collection = () => ({});
export const doc = (_, ...path) => path.at(-1);
export function onSnapshot(_, fn) { listeners.add(fn); queueMicrotask(()=>fn(snapshot())); return ()=>listeners.delete(fn); }
export async function getDocs() { return snapshot(); }
export async function deleteDoc(id) {
  if (window.__failWrites) throw Error('테스트 저장 실패');
  const before = localStorage.getItem('e2e-books');
  const docs = read(); delete docs[id]; localStorage.setItem('e2e-books',JSON.stringify(docs));
  if (window.__realisticSnapshots) {
    const old = JSON.parse(before || '{}');
    const oldSnap = () => { const d = Object.entries(old).map(([k,value]) => ({id:k,data:()=>value})); return {docs:d,empty:!d.length,metadata:{fromCache:false}}; };
    setTimeout(() => { for (const fn of listeners) fn(oldSnap()); }, window.__staleAfter ?? 20);
    setTimeout(notify, window.__freshAfter ?? 250);
  } else notify();
}
export async function runTransaction(_, fn) {
  if (window.__failWrites) throw Error('테스트 저장 실패');
  if (window.__transientFailures > 0) { window.__transientFailures--; throw Object.assign(Error('Failed to get document because the client is offline.'), { code: 'unavailable' }); }
  if (window.__writeDelay) await new Promise(r=>setTimeout(r,window.__writeDelay));
  return navigator.locks.request('e2e-firestore', async () => {
    const docs = read();
    await fn({get:async id=>({exists:()=>!!docs[id],data:()=>structuredClone(docs[id])}),set:(id,value)=>{ docs[id]=value; }});
    const before = localStorage.getItem('e2e-books');
    localStorage.setItem('e2e-books',JSON.stringify(docs));
    if (window.__realisticSnapshots) {
      // 실제 서버처럼: 커밋 직후 잠깐은 이전 내용이 먼저 오고, 그 뒤에 새 내용이 옵니다(리스너 지연 흉내).
      const old = JSON.parse(before || '{}');
      const oldSnap = () => { const d = Object.entries(old).map(([id,value]) => ({id,data:()=>value})); return {docs:d,empty:!d.length,metadata:{fromCache:false}}; };
      setTimeout(() => { for (const fn of listeners) fn(oldSnap()); }, window.__staleAfter ?? 20);
      setTimeout(notify, window.__freshAfter ?? 250);
    } else notify();
  });
}
