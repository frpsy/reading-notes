# 책갈피 — 작업 규칙

- 빌드 단계 없는 정적 사이트(바닐라 JS ES 모듈). 외부 라이브러리는 Firebase SDK(gstatic CDN)와 구글 폰트만 씁니다.
- 순수 로직은 `js/core.js`, 검증은 `tests/core.test.js`. 화면 코드는 `js/app.js` (DOM만 다룸).
- 저장소 접근은 `js/store.js` 한 곳에서만. Firebase 설정(apiKey)이 비어 있으면 localStorage 체험 모드.
- 화면에 넣는 사용자 입력은 반드시 `escapeHtml` 을 거칩니다.
- 데이터는 Firestore `readingUsers/{uid}/books/{bookId}`. 구조를 바꾸면 `normalizeBook`, 백업 형식, `firestore.rules.reading` 을 함께 고칩니다.
- 준비된 책은 `catalog/*.txt` (제목/저자/쪽수/출처 머리말 + `목차:` 아래 본문) 와 `catalog/index.json`. 새 책은 공식 서점 목차를 확인해 출처를 적습니다. 목차에 쪽수가 없으면 쪽수 줄 없이 장·항목만 적습니다. 쪽수가 일부만 있으면 `npm test` 가 실패합니다.
- Firebase 프로젝트는 책갈피 전용 `chaekgalpi-reading` 입니다(다른 사이트와 공유하지 않습니다). 규칙은 `firestore.rules.reading` 이 정본이며 콘솔과 함께 고칩니다.
- 변경 후 `npm test` 통과 확인 → feature 브랜치 → PR → squash 머지. 묻지 않고 끝까지 진행하고 배포까지 확인 후 보고합니다.
- 문구는 존댓말, 간결하게. CSS를 바꾸면 `index.html` 의 `style.css?v=N` 번호를 올립니다. JS를 바꾸면 `app.js?v=N` 과 `app.js`·`store.js` 의 import `?v=N` 을 같은 번호로 함께 올립니다(테스트가 확인).
- `sw.js` 는 화면 파일을 오프라인용으로 보관합니다(같은 출처는 네트워크 우선). 새 파일을 추가하면 `SHELL` 목록과 배포 `cp` 줄을 확인합니다.

- 책 추가는 직접 목차 붙여넣기(책 추가 화면) 또는 `catalog/` 준비된 책 담기입니다. 백업 기능은 두지 않습니다. 새 준비된 책은 `catalog/` 에 문안과 index.json 항목을 추가하면 서재의 "담을 수 있는 책"에 나타납니다(책 id는 `c-파일이름`).
