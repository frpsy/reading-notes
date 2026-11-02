// 주요 독서 화면과 분리된 설정·책 찾기 화면입니다.
import { state } from "./state.js?v=45";
import { esc } from "./util.js?v=45";
import { catalogHtml } from "./catalog.js?v=45";
import { themeLabel } from "./prefs.js?v=45";

export function settingsView() {
  const account = state.userEmail ? '<p class="settings-detail">' + esc(state.userEmail) + '</p>' : '';
  return '<a class="back" href="#library">← 서재</a><h1 class="page">설정</h1>' +
    '<section class="settings-section"><h2 class="sec">화면</h2><div class="settings-item"><span>화면 테마</span><button class="btn sm" id="theme" type="button">' + themeLabel() + '</button></div></section>' +
    '<section class="settings-section"><h2 class="sec">독서 기록</h2>' +
    '<a class="settings-item settings-link" href="#activity"><span>독서 활동</span><span aria-hidden="true">›</span></a>' +
    '<a class="settings-item settings-link" href="#year"><span>연간 기록</span><span aria-hidden="true">›</span></a>' +
    '<a class="settings-item settings-link" href="#records"><span>기록 백업 · 휴지통</span><span aria-hidden="true">›</span></a></section>' +
    '<section class="settings-section"><h2 class="sec">계정</h2>' + account +
    (state.mode === 'firebase' ? '<button type="button" class="btn sm" data-act="logout">로그아웃</button>' : '') + '</section>';
}

export function catalogView() {
  return '<a class="back" href="#library">← 서재</a><div class="lib-head"><h1 class="page">책 찾기</h1><a class="btn primary" href="#add">직접 추가</a></div>' +
    '<p class="muted">준비된 책을 선택하여 서재에 담을 수 있습니다.</p>' + catalogHtml();
}
