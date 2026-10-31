// 저장소 접근은 이 파일 한 곳에서만 합니다.
// Firebase(Firestore, 구글 로그인) 또는 localStorage(체험 모드).
import { firebaseConfig, allowedEmails } from "./config.js?v=12";

export const FB = "https://www.gstatic.com/firebasejs/10.12.2"; // 바꾸면 sw.js 의 FB 도 같이 바꿉니다
const LS_KEY = "chaekgalpi-v1";

export const firebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

let sdk = null, auth = null, db = null, uid = null;
let memLS = null;

async function load() {
  if (sdk) return sdk;
  const [app, au, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
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
export async function start(onState) {
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

export async function signIn() {
  const { au } = await load();
  await au.signInWithPopup(auth, new au.GoogleAuthProvider());
}

export async function signOut() {
  if (!sdk) return;
  await sdk.au.signOut(auth);
}

/* ---------- Firestore: readingUsers/{uid}/books/{id} ---------- */
function booksCol() { return sdk.fs.collection(db, "readingUsers", uid, "books"); }

export function watch(onList, onError) {
  return sdk.fs.onSnapshot(booksCol(), (snap) => {
    onList(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })), { fromCache: snap.metadata.fromCache, empty: snap.empty });
  }, onError);
}

export function save(book) {
  return sdk.fs.setDoc(sdk.fs.doc(db, "readingUsers", uid, "books", book.id), JSON.parse(JSON.stringify(book)));
}

export function remove(id) {
  return sdk.fs.deleteDoc(sdk.fs.doc(db, "readingUsers", uid, "books", id));
}

/* ---------- 체험 모드(localStorage) ---------- */
export function localList() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch (e) { return memLS || []; }
}

export function localWrite(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) { memLS = arr; }
}
