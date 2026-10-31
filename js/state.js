// 화면 전체가 함께 쓰는 상태입니다. 다른 모듈은 이 객체를 통해서만 읽고 바꿉니다.
export const state = {
  books: new Map(),
  lastJson: new Map(),
  pending: new Map(),
  conflicts: new Set(),
  flushing: false,
  activeKey: null,
  flushTimer: null,
  epoch: 0,
  mode: "pending",      // pending | firebase
  phase: "boot",        // boot | login | denied | error | app
  ready: false,
  readyTimer: null,
  unsub: null,
  authMsg: "",
  userEmail: "",
  ui: { filter: "all", q: "", onlyRemaining: false, openMemo: new Set(), confirmDel: null, folded: new Set() },
  undo: null,
  toastTimer: null,
  catalog: [],
  catalogFailed: false,
};
