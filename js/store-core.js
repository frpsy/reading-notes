// 컬렉션 저장소의 공통 부분입니다. Firebase 설정, 허용 계정, 컬렉션 이름을 받아 씁니다.
// 로그인한 사용자의 Firestore와 계정별 전송 대기 기록만 다룹니다.
// 사용자 데이터 경로: {userCollection}/{uid}/{itemCollection}/{id}

export function createStore(opts) {
  const { sdkBase, firebaseConfig, allowedEmails, userCollection, itemCollection, merge, validate } = opts;
  const firebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

  let sdk = null, auth = null, db = null, uid = null;
  let listCallback = null;
  const importSdk = opts.importSdk || (url => import(url));
  const storage = () => opts.storage || localStorage;
  const owner = globalThis.crypto.randomUUID();
  let releaseOwner = null;
  const locks = globalThis.navigator?.locks;
  const ownerLock = user => 'chaekgalpi-owner:' + firebaseConfig.projectId + ':' + user + ':';
  async function claimOwner(user) {
    if (!locks) return;
    await new Promise((resolve, reject) => {
      locks.request(ownerLock(user) + owner, async () => {
        if (uid !== user) { resolve(); return; }
        const held = new Promise(r => { releaseOwner = r; });
        resolve(); await held;
      }).catch(reject);
    });
  }

  async function load() {
    if (sdk) return sdk;
    const [app, au, fs] = await Promise.all([
      importSdk(`${sdkBase}/firebase-app.js`),
      importSdk(`${sdkBase}/firebase-auth.js`),
      importSdk(`${sdkBase}/firebase-firestore.js`),
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
    if (!firebaseConfigured) { onState({ state: "error", message: "로그인 설정을 확인해 주세요." }); return; }
    try {
      const { au } = await load();
      au.onAuthStateChanged(auth, async (u) => {
        if (releaseOwner) { releaseOwner(); releaseOwner = null; }
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
        try { await claimOwner(uid); }
        catch (e) { uid = null; onState({ state: 'error', message: '기기 보관함을 열지 못했습니다. 새로고침해 주세요.' }); return; }
        if (uid !== u.uid) return;
        onState({ state: "ready", mode: "firebase", email: u.email });
      });
    } catch (e) {
      onState({ state: "error", message: "로그인 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요." });
    }
  }

  async function signIn() {
    if (!firebaseConfigured) throw new Error("로그인 설정을 확인해 주세요.");
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
    const user = requireUser();
    listCallback = onList;
    return sdk.fs.onSnapshot(itemsCol(), (snap) => {
      if (uid !== user) return;
      onList(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })), { fromCache: snap.metadata.fromCache, empty: snap.empty });
    }, e => { if (uid === user) onError(e); });
  }

  function requireUser() { if (!uid) throw new Error('로그인이 필요합니다.'); return uid; }
  function prefix(user = requireUser()) { return 'chaekgalpi-pending-v1:' + firebaseConfig.projectId + ':' + user + ':'; }
  function writePending(record) {
    record.owner = owner;
    try { storage().setItem(prefix() + record.key, JSON.stringify(record)); }
    catch (e) { throw new Error('기기에 변경을 보관하지 못했습니다. 저장 공간을 확보한 뒤 다시 시도해 주세요.'); }
  }
  async function readPending() {
    const user = requireUser();
    async function read() {
      const active = locks ? new Set((await locks.query()).held.map(x => x.name)) : new Set();
      if (uid !== user) return [];
      const p = prefix(user), records = [], ls = storage();
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (!key.startsWith(p)) continue;
        const record = JSON.parse(ls.getItem(key));
        if (!record || !record.key || key !== p + record.key || !['save', 'delete'].includes(record.kind) || !record.id || (record.kind === 'save' && (!record.item || record.item.id !== record.id))) throw new Error('기기에 보관된 변경을 읽지 못했습니다. 저장 데이터를 지우지 말고 확인해 주세요.');
        if (record.owner !== owner && active.has(ownerLock(user) + record.owner)) continue;
        record.owner = owner;
        ls.setItem(key, JSON.stringify(record));
        records.push(record);
      }
      return records.sort((a, b) => a.key.localeCompare(b.key));
    }
    return locks ? locks.request(prefix(user), read) : read();
  }
  async function sendPending(record) {
    const user = requireUser(), key = prefix(user) + record.key;
    const ref = itemDoc(record.id); // 비동기 작업 전에 계정 경로를 고정합니다.
    async function send() {
      if (uid !== user) throw new Error('계정이 변경되었습니다.');
      if (!storage().getItem(key)) return; // 다른 탭이 먼저 전송한 변경
      if (record.kind === 'delete') await sdk.fs.deleteDoc(ref);
      else await sdk.fs.runTransaction(db, async tx => {
        if (uid !== user) throw new Error('계정이 변경되었습니다.');
        const snap = await tx.get(ref);
        const next = merge(snap.exists() ? snap.data() : null, record.base, record.item);
        const error = validate(next); if (error) throw new Error(error);
        tx.set(ref, next);
      });
      storage().removeItem(key);
    }
    // 같은 브라우저의 여러 탭이 복구 대기 기록을 중복 전송하지 않게 직렬화합니다.
    if (globalThis.navigator?.locks) return navigator.locks.request(prefix(user), send);
    return send();
  }
  function discardPending(record) { storage().removeItem(prefix() + record.key); }
  async function refresh() {
    if (!uid || !listCallback) return;
    const user = uid, callback = listCallback;
    const snap = await sdk.fs.getDocs(itemsCol());
    if (uid === user) callback(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })), { fromCache: snap.metadata.fromCache, empty: snap.empty });
  }

  return { firebaseConfigured, start, signIn, signOut, watch, writePending, readPending, sendPending, discardPending, refresh };
}
