# 책갈피 — AI 작업 기준 (Claude·ChatGPT·Codex 공통 원본)

> 매 대화에 읽히는 파일이라 상시 규칙만 둔다. **화면·CSS·디자인을 바꿀 때는 먼저 `docs/ui-checklist.md`를 읽는다**(책 화면 디자인 기준과 UI 결함 예방 체크리스트).

## 구조
- 빌드 없는 정적 사이트(바닐라 JS ES 모듈). 외부 라이브러리는 Firebase SDK(gstatic CDN)와 구글 폰트만.
- 순수 로직 `js/core.js`(테스트 `tests/core.test.js`). 진입점 `js/app.js`는 그리기·이벤트 연결만, 전역 상태는 `js/state.js`의 `state` 하나.
- 모듈: `bus` 다시 그리기 · `sync`/`sync-core` 저장·병합 · `undo` · `session` 로그인·실시간 목록 · `prefs` · `router` · `catalog` · `util` · `patch` 부분 갱신 · `records` 휴지통·내보내기 · `actions` 책 화면 동작 · 화면 `view-common/library/settings/book/year/form`. 새 모듈은 `sw.js` `SHELL`과 이 목록에 추가한다.
- 저장소 접근은 `js/store.js`·`js/store-core.js`에서만. 허용 계정 로그인 전용(체험 모드 없음), 계정별 대기열은 localStorage, 실패를 숨기지 않고 트랜잭션으로 바뀐 항목만 병합.
- 데이터 `readingUsers/{uid}/books/{bookId}`. 구조를 바꾸면 `normalizeBook`·백업 형식·`firestore.rules.reading`(정본)·`rules-test/firestore.test.mjs`를 함께 고친다. Firebase 프로젝트는 전용 `chaekgalpi-reading`. 콘솔 규칙 게시는 사용자 승인 후에만.
- 사용자 입력은 `escapeHtml`, 오류 문구는 `friendlyError`(한국어).

## 책 추가
- 사용자가 책 이름만 말하면 공식 서점 목차를 찾아 `catalog/<이름>.txt`(제목/저자/쪽수/출처 머리말 + `목차:` 본문)와 `catalog/index.json`에 추가한다(책 id `c-파일이름`). 목차에 쪽수가 없으면 쪽수 줄 없이, 일부만 있으면 테스트가 실패한다.
- 기록 관리: JSON 백업·Markdown 메모 내려받기(가져오기 없음). 휴지통은 계정별 기기 보관 30일, 새 책 복구본으로 복원.

## 캐시 버전
- 화면 파일을 바꾸면 손으로 고치지 말고 `npm run bump -- js|css|all`로 `?v=`를 올린다(app.js·모든 import·modulepreload를 같은 번호로, 테스트가 확인). `style.css`에 `@import`를 두지 않는다. 새 파일은 `SHELL`과 배포 `cp` 줄 확인.

## 핵심 화면 원칙 (상세는 docs/ui-checklist.md)
- 책 상세에서 가장 중요한 것은 챕터 진도 체크다. 줄 어디를 눌러도 체크·취소, 팝업 없음, 깜박임 없음.
- 방금 저장·삭제한 책은 10초 동안 더 오래된 서버 응답으로 되돌리지 않는다(`state.recent`).
- 정상 저장 완료는 화면에 아무것도 남기지 않는다. 0.8초 넘는 저장·실패·오프라인·재시도만 보인다.
- 문구는 존댓말, 간결하게.

## 작업 방식
- `npm test`(UI 변경 시 `npm run e2e`, `e2e/design.mjs`, 규칙 변경 시 `npm run test:rules`) → feature 브랜치 → PR → squash 머지 → 배포 확인까지 묻지 않고 진행한다(사용자 허용). 실기기 iPhone 미확인은 미확인이라고 보고한다.
- `gh` GraphQL이 막힌 환경에서는 `gh api repos/frpsy/reading-notes/...` REST로 PR을 만든다.
