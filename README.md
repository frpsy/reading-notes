# 책갈피

책의 공식 목차를 넣고 챕터를 읽을 때마다 체크하며 독서 진도를 기록하는 웹 앱입니다.

## 기능

- 준비된 책 담기(`catalog/`)
- 챕터 체크 시 오늘 날짜 기록(날짜 수정 가능), 묶음 항목 일괄 체크, 챕터별 메모
- 시작일·종료일(전부 읽으면 자동)·목표 완독일, 진척 %, 분량(쪽수) 기준 %, 읽는 속도, 예상 완독일, 누적 그래프
- 서재 필터(읽는 중·읽을 예정·완독), 7일 넘게 기록 없음 표시, 평점·독서 메모
- 책 추가는 Claude에게 책 이름을 말해서만 합니다(공식 목차를 찾아 `catalog/` 에 추가 → 서재의 "담을 수 있는 책"에서 담기)

## 데이터와 로그인

구글 로그인(허용 계정만)으로 Firestore `readingUsers/{uid}/books/{id}` 에 저장하며, 어느 기기에서나 같은 기록을 봅니다. 로그인 없이 "체험하기"를 누르면 그 브라우저에만 저장됩니다.

### 한 번만 하는 설정

1. Firebase 콘솔(프로젝트 `parent-survey-d21e7`) > Firestore > 규칙에 `firestore.rules.reading` 의 블록을 추가해 게시합니다.
2. Authentication > 로그인 방법에서 Google 사용, 승인된 도메인에 `frpsy.github.io` 가 있는지 확인합니다.
3. 저장소 Settings > Pages > Source 를 **GitHub Actions** 로 바꿉니다. main 에 반영되면 테스트 후 자동 배포됩니다.

배포 주소: `https://frpsy.github.io/reading-notes/`

## 개발

```bash
npm test      # 단위 테스트 (Node 20+)
npm start     # http://localhost:8080
```

`js/config.js` 의 `apiKey` 를 비우면 로그인 없이 체험 모드로 확인할 수 있습니다(그 변경은 커밋하지 않습니다).
