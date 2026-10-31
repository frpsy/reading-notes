// 스터디 탭: 스터디 홈(별도 사이트)을 이 셸 안에 보여 줍니다. 아래 탭 바는 그대로 남습니다.
export const STUDY_URL = "https://frpsy.github.io/study_joohankim/";

export function studyView() {
  return '<div class="lib-head"><h1 class="page">스터디 홈</h1><a class="btn sm" href="' + STUDY_URL + '" target="_blank" rel="noopener">새 창으로 열기</a></div>' +
    '<iframe class="embed" src="' + STUDY_URL + '" title="스터디 홈"></iframe>';
}
