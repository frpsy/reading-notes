// 여러 화면이 함께 쓰는 조각(표지, 칩, 로그인 화면 등)입니다.
import { state } from "./state.js?v=29";
import { esc, hue } from "./util.js?v=29";

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
  if (state.phase === "denied" || state.phase === "error") {
    return '<div class="login"><h1>책갈피</h1><p class="err">' + esc(state.authMsg) + '</p>' +
      '<button type="button" class="btn primary" data-act="login">다른 구글 계정으로 로그인</button>' + '</div>';
  }
  return '<div class="login"><h1>책갈피</h1><p class="muted">읽은 책의 목차와 진도를 기록하는 개인 독서 노트입니다. 구글 계정으로 로그인하면 어느 기기에서나 같은 기록을 봅니다.</p>' +
    (state.authMsg ? '<p class="err">' + esc(state.authMsg) + '</p>' : '') +
    '<button type="button" class="btn primary" data-act="login">구글로 로그인</button>' + '</div>';
}
