// 여러 화면이 함께 쓰는 조각(표지, 칩, 로그인 화면 등)입니다.
import { state } from "./state.js?v=34";
import { esc, hue } from "./util.js?v=34";

export var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export var DASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
export var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
export var DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
export var ST = { reading: '읽는 중', done: '완독', todo: '읽을 예정' };

export function coverHtml(b, lg) {
  var ch = (b.title || '?').trim().charAt(0) || '?';
  return '<span class="cover' + (lg ? ' lg' : '') + '" style="--h:' + hue(b.title || '') + '" aria-hidden="true">' + esc(ch) + '</span>';
}
export function chipHtml(m) { return '<span class="chip ' + m.status + '">' + ST[m.status] + '</span>'; }
export function loadingView() { return '<p class="muted">불러오는 중…</p>'; }
export function notFound() { return '<p>이 책을 찾을 수 없습니다.</p><p><a href="#library">서재로 돌아가기</a></p>'; }

// 읽는 속도 문구: 소수 첫째 자리까지, 끝의 .0 은 뺍니다
export function paceText(rate) {
  var r1 = function (x) { return String(Math.round(x * 10) / 10) };
  return rate >= 1 ? '하루 ' + r1(rate) + '챕터' : '챕터당 ' + r1(1 / rate) + '일';
}

export function loginView() {
  return '<section class="login" aria-labelledby="welcome-title"><div class="login-intro"><p class="eyebrow">나만의 독서 노트 · 책갈피</p><h1 id="welcome-title">읽고, 남기고,<br>나의 것으로.</h1><p class="muted">한 챕터씩 쌓이는 읽기의 기록.<br>목차로 진도를 확인하고, 오래 간직할 생각을 남겨 보세요.</p></div>' +
    (state.authMsg ? '<p class="err" role="alert">' + esc(state.authMsg) + '</p>' : '') +
    '<button type="button" class="btn primary" data-act="login">' + (state.phase === "denied" ? '다른 구글 계정으로 로그인' : state.phase === "error" ? '다시 로그인' : '구글로 로그인') + '</button><p class="login-caption">허용된 구글 계정으로 로그인하면 기기마다 같은 기록을 봅니다.</p>' +
    '<div class="login-preview" aria-label="독서 기록 예시"><div class="preview-label"><span>이렇게 기록해 보세요</span><span>예시</span></div><div class="preview-book"><span class="preview-cover" aria-hidden="true">책</span><div class="preview-body"><strong>나의 첫 독서 기록</strong><p>10개 챕터 중 4개를 읽었어요 · 40%</p><div class="preview-track" aria-hidden="true"><span></span></div></div></div><div class="preview-chapter"><span class="preview-check" aria-hidden="true">✓</span><span>오늘 읽은 챕터를 체크하고</span></div><p class="preview-note">마음에 남은 문장과 나의 생각을 함께 남겨요.</p></div></section>';
}
