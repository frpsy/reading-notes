// 책갈피 설정. firebaseConfig 는 공개되어도 되는 식별 정보이며, 데이터 보호는 Firestore 보안 규칙이 담당합니다.
// apiKey 를 비우면 이 브라우저에만 저장하는 체험 모드로 동작합니다.
// 프로젝트는 parent-survey 와 같은 Firebase 프로젝트를 함께 씁니다(데이터 경로는 readingUsers/ 로 분리).
export const firebaseConfig = {
  apiKey: "AIzaSyB7VsDdAy_lTPwwlQ2QCImdYSYKwhVyQ1k",
  authDomain: "parent-survey-d21e7.firebaseapp.com",
  projectId: "parent-survey-d21e7",
  storageBucket: "parent-survey-d21e7.firebasestorage.app",
  messagingSenderId: "754087097956",
  appId: "1:754087097956:web:5beb1e8d56cff487d59171",
};

// 로그인을 허용하는 구글 계정. firestore.rules 의 이메일과 같아야 합니다.
export const allowedEmails = ["lgpsy83@gmail.com"];

export const siteTitle = "책갈피";
