// 화면 전체가 함께 쓰는 상태입니다. 다른 모듈은 이 객체를 통해서만 읽고 바꿉니다.
export const state = {
  books: new Map(),
  lastJson: new Map(),
  pending: new Map(),
  conflicts: new Set(),
  flushing: false,
  activeKey: null,
  flushTimer: null,
  recent: new Map(), // 방금 저장·삭제한 책 id → {t, deleted}. 이 시간 동안은 오래된 서버 응답으로 화면을 되돌리지 않음
  retryTimer: null,
  retryCount: 0,
  epoch: 0,
  mode: "pending",      // pending | firebase
  phase: "boot",        // boot | login | denied | error | app
  ready: false,
  readyTimer: null,
  unsub: null,
  authMsg: "",
  userEmail: "",
  ui: { filter: "all", q: "", onlyRemaining: false, openMemo: new Set(), memoOrig: new Map(), confirmDel: null, folded: new Set(), jump: null },
  undo: null,
  toastTimer: null,
  catalog: [],
  catalogFailed: false,
};
