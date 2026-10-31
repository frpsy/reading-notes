// 책갈피 서비스 워커: 화면 파일을 기기에 보관해 오프라인에서도 앱이 열리게 합니다.
// 같은 출처 파일은 항상 네트워크를 먼저 확인하고(새 배포가 바로 반영됨), 연결이 없을 때만 보관본을 씁니다.
// 기록 데이터는 여기서 다루지 않습니다(Firestore 가 기기 저장을 따로 합니다).
const CACHE_PREFIX = "chaekgalpi-reading-";
const CACHE = CACHE_PREFIX + "v2";
const FB = "https://www.gstatic.com/firebasejs/10.12.2"; // js/store.js 의 FB 와 같아야 합니다
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "css/style.css", "js/app.js", "js/core.js", "js/store.js", "js/config.js",
  "js/store-core.js", "js/sync-core.js", "js/state.js", "js/bus.js", "js/util.js", "js/prefs.js", "js/sync.js", "js/undo.js",
  "js/session.js", "js/router.js", "js/catalog.js", "js/view-common.js", "js/view-library.js",
  "js/view-book.js", "js/view-year.js", "js/view-form.js", "js/patch.js",
  "icons/icon.svg", "icons/icon-192.png", "catalog/index.json",
];
const SDK = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((f) => `${FB}/${f}`);

// 같은 파일은 버전(?v=) 과 상관없이 한 칸에 최신본만 보관합니다.
function keyOf(url) {
  const u = new URL(url);
  u.search = ""; u.hash = "";
  return u.href;
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (p) => {
      const r = await fetch(p, { cache: "no-cache" });
      if (r.ok) await c.put(keyOf(new URL(p, self.registration.scope).href), r);
    }));
    await Promise.all(SDK.map((u) => c.add(u).catch(() => {}))); // SDK 는 실패해도 설치를 막지 않습니다
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  const key = req.mode === "navigate" ? keyOf(self.registration.scope) : keyOf(req.url);
  try {
    const r = await fetch(req, { cache: "no-cache" });
    if (r.ok) await c.put(key, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(key);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === "opaque") await c.put(req, r.clone());
  return r;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  // 버전이 박힌 Firebase SDK 와 글꼴 파일은 바뀌지 않으므로 보관본을 먼저 씁니다.
  if (req.url.startsWith(FB + "/") || url.hostname === "fonts.gstatic.com") { e.respondWith(cacheFirst(req)); return; }
  // 글꼴 목록 CSS 는 네트워크 우선, 없으면 보관본
  if (url.hostname === "fonts.googleapis.com") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try { const r = await fetch(req); if (r.ok) await c.put(req, r.clone()); return r; }
      catch (err) { const hit = await c.match(req); if (hit) return hit; throw err; }
    })());
  }
  // 그 밖(Firestore·로그인 통신 등)은 손대지 않습니다.
});
