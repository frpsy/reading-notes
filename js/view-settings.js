// 주요 독서 화면과 분리된 설정·책 찾기 화면입니다.
import { state } from "./state.js?v=65";
import { esc } from "./util.js?v=65";
import { catalogHtml } from "./catalog.js?v=65";
import { themeLabel, fontScaleState } from "./prefs.js?v=65";

// 글자 크기 조절: 눌러 바로 전체 화면에 적용하고 이 기기에 저장합니다(5% 단위).
function fontScaleItem() {
  const f = fontScaleState();
  return '<div class="settings-item"><span>글자 크기</span><div class="fs-ctl" role="group" aria-label="글자 크기 조절">' +
    '<button class="btn sm" id="fs-down" type="button" aria-label="글자 작게"' + (f.atMin ? ' disabled' : '') + '>−</button>' +
    '<output class="fs-val" id="fs-val" aria-live="polite">' + f.pct + '%</output>' +
    '<button class="btn sm" id="fs-up" type="button" aria-label="글자 크게"' + (f.atMax ? ' disabled' : '') + '>+</button></div></div>' +
    '<p class="settings-detail fs-note">화면 전체 글자 크기가 바로 바뀌며 이 기기에만 저장됩니다. <button class="btn sm" id="fs-reset" type="button"' + (f.isDefault ? ' disabled' : '') + '>기본값(100%)</button></p>';
}

export function settingsView() {
  const account = state.userEmail ? '<p class="settings-detail">' + esc(state.userEmail) + '</p>' : '';
  return '<a class="back" href="#library">← 서재</a><h1 class="page">설정</h1>' +
    '<section class="settings-section"><h2 class="sec">화면</h2><div class="settings-item"><span>화면 테마</span><button class="btn sm" id="theme" type="button">' + themeLabel() + '</button></div>' +
    fontScaleItem() + '</section>' +
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
