# 책갈피 — 작업 규칙

- 빌드 단계 없는 정적 사이트(바닐라 JS ES 모듈). 외부 라이브러리는 Firebase SDK(gstatic CDN)와 구글 폰트만 씁니다.
- 순수 로직은 `js/core.js`, 검증은 `tests/core.test.js`.
- 화면 코드는 기능별 모듈로 나뉩니다. `js/app.js` 는 진입점(그리기·이벤트 연결)만 맡고, 전역 상태는 `js/state.js` 의 `state` 객체 하나에만 둡니다. 다른 모듈은 `state.` 으로 읽고 바꿉니다.
  - `bus.js`(다시 그리기 연결), `sync.js`(저장), `sync-core.js`(순수 변경 병합), `undo.js`(메모 삭제 되돌리기 알림), `session.js`(로그인·실시간 목록), `prefs.js`(테마·접기), `router.js`(해시 주소), `catalog.js`(준비된 책), `util.js`(작은 도우미), `patch.js`(화면 부분 갱신)
  - 화면 조각: `view-common.js`, `view-library.js`, `view-book.js`, `view-year.js`, `view-form.js`
  - 새 모듈을 추가하면 `sw.js` 의 `SHELL` 목록에 넣고, 이 파일 모듈 목록도 함께 고칩니다. 모듈 import 의 `?v=` 는 `index.html` 의 app.js 버전과 같아야 합니다.
- 저장소 접근은 `js/store.js` 와 `js/store-core.js` 에서만 합니다. 로그인한 허용 계정만 사용하며 Firebase 설정이 없으면 오류를 표시합니다. 체험 모드는 제공하지 않습니다. 계정별 변경 대기열은 localStorage에 즉시 보관하며 실패를 숨기지 않습니다. 기존 Firestore 문서 구조를 유지하고 트랜잭션으로 변경한 항목만 병합합니다.
- 화면에 넣는 사용자 입력은 반드시 `escapeHtml` 을 거칩니다.
- 데이터는 Firestore `readingUsers/{uid}/books/{bookId}`. 구조를 바꾸면 `normalizeBook`, 백업 형식, `firestore.rules.reading` 을 함께 고칩니다.
- 준비된 책은 `catalog/*.txt` (제목/저자/쪽수/출처 머리말 + `목차:` 아래 본문) 와 `catalog/index.json`. 새 책은 공식 서점 목차를 확인해 출처를 적습니다. 목차에 쪽수가 없으면 쪽수 줄 없이 장·항목만 적습니다. 쪽수가 일부만 있으면 `npm test` 가 실패합니다.
- 규칙을 바꾸면 `rules-test/firestore.test.mjs` 에뮬레이터 테스트(`npm run test:rules`, CI `rules` 잡)를 함께 고칩니다. 콘솔 게시는 사용자 승인 후에만 합니다.
- 사용자에게 보이는 오류 문구는 `friendlyError`(core.js)를 거쳐 한국어로 바꿉니다.
- Firebase 프로젝트는 책갈피 전용 `chaekgalpi-reading` 입니다(다른 사이트와 공유하지 않습니다). 규칙은 `firestore.rules.reading` 이 정본이며 콘솔과 함께 고칩니다.
- 변경 후 `npm test` 통과 확인 → feature 브랜치 → PR → squash 머지. 묻지 않고 끝까지 진행하고 배포까지 확인 후 보고합니다.
- 디자인 기준(사용자 지정): 사용자 입장에서 만든다. **책 상세에서 가장 중요한 것은 챕터 진도 체크**다. 체크 버튼·챕터 제목(눌러도 체크)이 가장 크고 누르기 쉬워야 하며, 메모·날짜·옵션은 보조 요소로 작게 둔다(목록의 메모는 2줄 미리보기). 새 요소가 진도 목록을 밀어내거나 가리지 않게 한다. **챕터 체크·취소에는 팝업·알림창을 띄우지 않는다**(사용자 지정). 줄의 어느 곳을 눌러도 체크되고, 취소는 다시 누르면 된다. 누를 때 깜박이지 않게 한다: 기본 탭 강조는 끄고(`-webkit-tap-highlight-color:transparent`), 호버 효과는 `@media (hover:hover)` 안에만 둔다. 상단 저장 표시는 0.8초 넘게 걸릴 때만 '저장 중…'으로 바뀐다. 서버 응답은 순서가 뒤바뀌거나 늦을 수 있으므로, 방금 저장·삭제한 책은 10초 동안 더 오래된 응답으로 화면을 되돌리지 않는다(`state.recent`, `session.js` onSnap). 이 동작은 e2e의 `__realisticSnapshots`(오래된 응답 먼저 도착) 단계가 지킨다.
- 문구는 존댓말, 간결하게. CSS를 바꾸면 `index.html` 의 `style.css?v=N` 번호를 올립니다. JS를 바꾸면 `app.js?v=N`, 모든 모듈 import, `index.html` 의 `modulepreload` 의 `?v=N` 을 같은 번호로 함께 올립니다(테스트가 확인).
- `sw.js` 는 화면 파일을 오프라인용으로 보관합니다(같은 출처는 네트워크 우선). 새 파일을 추가하면 `SHELL` 목록과 배포 `cp` 줄을 확인합니다.

- 책 추가는 직접 목차 붙여넣기(책 추가 화면) 또는 `catalog/` 준비된 책 담기입니다. 백업 기능은 두지 않습니다. 새 준비된 책은 `catalog/` 에 문안과 index.json 항목을 추가하면 서재의 "담을 수 있는 책"에 나타납니다(책 id는 `c-파일이름`).
