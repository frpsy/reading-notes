// 컬렉션 저장소의 공통 부분입니다. Firebase 설정, 허용 계정, 컬렉션 이름을 받아 씁니다.
// 앱마다 경로만 다르고 로그인·실시간 목록·저장·체험 모드는 같은 방식으로 동작합니다.
// 사용자 데이터 경로: {userCollection}/{uid}/{itemCollection}/{id}

export function createStore(opts) {
  const { sdkBase, firebaseConfig, allowedEmails, userCollection, itemCollection, localKey } = opts;
  const firebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

  let sdk = null, auth = null, db = null, uid = null;
  let memLS = null;

  async function load() {
    if (sdk) return sdk;
    const [app, au, fs] = await Promise.all([
      import(`${sdkBase}/firebase-app.js`),
      import(`${sdkBase}/firebase-auth.js`),
      import(`${sdkBase}/firebase-firestore.js`),
    ]);
    const a = app.initializeApp(firebaseConfig);
    auth = au.getAuth(a);
    // 기기 저장(IndexedDB)을 켜서 오프라인에서도 기록을 보고 체크할 수 있게 합니다. 쓸 수 없는 브라우저는 메모리 캐시로 동작합니다.
    try {
      db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch (e) {
      db = fs.getFirestore(a);
    }
    sdk = { au, fs };
    return sdk;
  }

  // onState({state:"login"|"denied"|"ready"|"error", mode?, email?, message?})
  async function start(onState) {
    if (!firebaseConfigured) { onState({ state: "ready", mode: "local" }); return; }
    try {
      const { au } = await load();
      au.onAuthStateChanged(auth, async (u) => {
        if (!u) { uid = null; onState({ state: "login" }); return; }
        const email = String(u.email || "").toLowerCase();
        const ok = !u.isAnonymous && u.emailVerified && allowedEmails.map((e) => e.toLowerCase()).includes(email);
        if (!ok) {
          uid = null;
          try { await au.signOut(auth); } catch (e) { /* 무시 */ }
          onState({ state: "denied", email: u.email || "" });
          return;
        }
        uid = u.uid;
        onState({ state: "ready", mode: "firebase", email: u.email });
      });
    } catch (e) {
      onState({ state: "error", message: (e && e.message) || "Firebase를 불러오지 못했습니다." });
    }
  }

  async function signIn() {
    const { au } = await load();
    await au.signInWithPopup(auth, new au.GoogleAuthProvider());
  }

  async function signOut() {
    if (!sdk) return;
    await sdk.au.signOut(auth);
  }

  /* ---------- Firestore ---------- */
  function itemsCol() { return sdk.fs.collection(db, userCollection, uid, itemCollection); }
  function itemDoc(id) { return sdk.fs.doc(db, userCollection, uid, itemCollection, id); }

  function watch(onList, onError) {
    return sdk.fs.onSnapshot(itemsCol(), (snap) => {
      onList(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })), { fromCache: snap.metadata.fromCache, empty: snap.empty });
    }, onError);
  }

  function save(item) {
    return sdk.fs.setDoc(itemDoc(item.id), JSON.parse(JSON.stringify(item)));
  }

  function remove(id) {
    return sdk.fs.deleteDoc(itemDoc(id));
  }

  /* ---------- 체험 모드(localStorage) ---------- */
  function localList() {
    try { const r = localStorage.getItem(localKey); return r ? JSON.parse(r) : []; } catch (e) { return memLS || []; }
  }

  function localWrite(arr) {
    try { localStorage.setItem(localKey, JSON.stringify(arr)); } catch (e) { memLS = arr; }
  }

  return { firebaseConfigured, start, signIn, signOut, watch, save, remove, localList, localWrite };
}
