// 독서 앱의 저장소입니다. 공통 부분은 store-core.js, 여기서는 독서 앱 경로만 정합니다.
// 저장소 접근은 이 파일과 store-core.js 에서만 합니다.
// Firebase(Firestore, 구글 로그인)와 로그인 계정의 전송 대기열.
import { firebaseConfig, allowedEmails } from "./config.js?v=36";
import { mergeBookChanges } from "./sync-core.js?v=36";
import { validateBook } from "./core.js?v=36";
import { createStore } from "./store-core.js?v=36";

export const FB = "https://www.gstatic.com/firebasejs/10.12.2"; // 바꾸면 sw.js 의 FB 도 같이 바꿉니다

// 독서 앱 데이터: readingUsers/{uid}/books/{id}
const reading = createStore({
  sdkBase: FB,
  firebaseConfig,
  allowedEmails,
  userCollection: "readingUsers",
  itemCollection: "books",
  merge: mergeBookChanges,
  validate: validateBook,
});

export const firebaseConfigured = reading.firebaseConfigured;
export const start = reading.start;
export const signIn = reading.signIn;
export const signOut = reading.signOut;
export const watch = reading.watch;
export const writePending = reading.writePending;
export const readPending = reading.readPending;
export const sendPending = reading.sendPending;
export const discardPending = reading.discardPending;
export const refresh = reading.refresh;
