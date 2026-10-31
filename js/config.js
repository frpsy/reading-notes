// 책갈피 설정. firebaseConfig 는 공개되어도 되는 식별 정보이며, 데이터 보호는 Firestore 보안 규칙이 담당합니다.
// apiKey 를 비우면 이 브라우저에만 저장하는 체험 모드로 동작합니다.
// 책갈피 전용 Firebase 프로젝트(chaekgalpi-reading)를 씁니다. 다른 사이트와 데이터·규칙을 공유하지 않습니다.
export const firebaseConfig = {
  apiKey: "AIzaSyBDu8ehpieVaNn8sxsWKr5Ys_cUaqyYMlw",
  authDomain: "chaekgalpi-reading.firebaseapp.com",
  projectId: "chaekgalpi-reading",
  storageBucket: "chaekgalpi-reading.firebasestorage.app",
  messagingSenderId: "572544841494",
  appId: "1:572544841494:web:0a3dda20e6a1c5dbb0c237",
};

// 로그인을 허용하는 구글 계정. firestore.rules 의 이메일과 같아야 합니다.
export const allowedEmails = ["lgpsy83@gmail.com"];

export const siteTitle = "책갈피";
