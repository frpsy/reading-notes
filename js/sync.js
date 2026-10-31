// 기록 저장: 바꾼 책을 350ms 뒤에 저장소에 올리고, 상단의 저장 상태를 맞춥니다.
import * as store from "./store.js?v=18";
import { state } from "./state.js?v=18";

var SYNC_TEXT = { pending: "연결 중…", saved: "저장됨", saving: "저장 중…", error: "저장 실패 · 다시 시도", local: "이 브라우저에만 저장", offline: "오프라인 · 기기에 보관 중" };

export function setSync(s, msg) {
  var syncEl = document.getElementById("sync");
  // 오프라인에서 쓴 기록은 기기(IndexedDB)에 남아 있다가 연결되면 자동으로 올라갑니다.
  if (s === "saving" && state.mode === "firebase" && navigator.onLine === false) { s = "offline"; msg = "연결되면 자동으로 저장합니다."; }
  syncEl.dataset.state = s;
  syncEl.textContent = SYNC_TEXT[s];
  syncEl.title = msg || (s === "local" ? "체험 모드: 이 브라우저에만 저장합니다." : "");
}
export function okState() { return state.mode === "local" ? "local" : "saved"; }

function backendSet(id, doc) {
  if (state.mode === "firebase") return store.save(doc);
  store.localWrite(Array.from(state.books.values())); return Promise.resolve();
}
function backendDel(id) {
  if (state.mode === "firebase") return store.remove(id);
  store.localWrite(Array.from(state.books.values())); return Promise.resolve();
}

export function persist(b) {
  b.updatedAt = Date.now();
  state.lastJson.set(b.id, JSON.stringify(b));
  state.dirty.add(b.id);
  setSync("saving");
  clearTimeout(state.timers.get(b.id));
  state.timers.set(b.id, setTimeout(function () { flush(b.id); }, 350));
}
export function flush(id) {
  if (state.inflight.has(id)) { state.timers.set(id, setTimeout(function () { flush(id); }, 200)); return; }
  var b = state.books.get(id);
  if (!b) { state.dirty.delete(id); return; }
  state.inflight.add(id);
  var json = JSON.stringify(b);
  backendSet(id, JSON.parse(json)).then(function () {
    state.inflight.delete(id);
    if (JSON.stringify(state.books.get(id)) !== json) { flush(id); return; }
    state.dirty.delete(id);
    if (!state.dirty.size && !state.inflight.size) setSync(okState());
  }).catch(function (e) {
    state.inflight.delete(id);
    setSync("error", (e && e.message) || "");
  });
}
export function removeBook(id) {
  state.books.delete(id); state.lastJson.delete(id); state.dirty.delete(id);
  clearTimeout(state.timers.get(id));
  backendDel(id).then(function () { if (!state.dirty.size && !state.inflight.size) setSync(okState()); })
    .catch(function (e) { setSync("error", (e && e.message) || ""); });
}

export function initSync() {
  function onNet() { if (state.phase === "app" && state.mode === "firebase" && (state.dirty.size || state.inflight.size)) setSync("saving"); }
  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);
  var syncEl = document.getElementById("sync");
  syncEl.addEventListener("click", function () {
    if (syncEl.dataset.state === "error") { state.dirty.forEach(function (id) { flush(id); }); setSync("saving"); }
  });
}
