// 테마·글자 크기·접은 묶음을 기기에 기억합니다. 저장소를 못 써도 화면은 동작합니다.
import { state } from "./state.js?v=66";
import { FONT_SCALE, clampFontScale, stepFontScale } from "./core.js?v=66";

var THEME_TEXT = { auto: "테마 자동", light: "밝게", dark: "어둡게" };
var curTheme = "auto"; // 저장소를 못 써도 이번 화면에서는 순환되도록 변수로 들고 있습니다

function getTheme() { try { var t = localStorage.getItem("chaekgalpi-theme"); return THEME_TEXT[t] ? t : "auto"; } catch (e) { return "auto"; } }
function applyTheme(t) {
  var themeEl = document.getElementById("theme");
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  // 홈 화면 앱과 Safari 상단도 현재 화면의 배경색에 맞춥니다.
  var chromeColor = document.querySelector('meta[name="theme-color"]');
  if (chromeColor) chromeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (themeEl) {
    themeEl.textContent = THEME_TEXT[t];
    themeEl.setAttribute("aria-label", "화면 테마: " + THEME_TEXT[t] + " (누르면 바뀝니다)");
  }
}

// 글자 크기: 화면 전체 글자(rem)가 html 글자 크기에 비례하므로 배율만 바꿉니다. index.html 의 짧은 스크립트가 첫 화면 전에 같은 값을 적용합니다.
var curScale = FONT_SCALE.def;
function getFontScale() { try { return clampFontScale(localStorage.getItem("chaekgalpi-fontscale")); } catch (e) { return FONT_SCALE.def; } }
function applyFontScale(pct) {
  if (pct === FONT_SCALE.def) document.documentElement.style.removeProperty("font-size"); else document.documentElement.style.fontSize = pct + "%";
  var val = document.getElementById("fs-val"), down = document.getElementById("fs-down"), up = document.getElementById("fs-up"), reset = document.getElementById("fs-reset");
  if (val) val.textContent = pct + "%";
  if (down) down.disabled = pct <= FONT_SCALE.min;
  if (up) up.disabled = pct >= FONT_SCALE.max;
  if (reset) reset.disabled = pct === FONT_SCALE.def;
}
function setFontScale(pct) {
  curScale = clampFontScale(pct);
  try { if (curScale === FONT_SCALE.def) localStorage.removeItem("chaekgalpi-fontscale"); else localStorage.setItem("chaekgalpi-fontscale", String(curScale)); } catch (e) { /* 무시 */ }
  applyFontScale(curScale);
}
export function fontScaleState() { return { pct: curScale, atMin: curScale <= FONT_SCALE.min, atMax: curScale >= FONT_SCALE.max, isDefault: curScale === FONT_SCALE.def }; }

export function loadFolded() {
  try { return new Set(JSON.parse(localStorage.getItem("chaekgalpi-fold") || "[]")); } catch (e) { return new Set(); }
}
export function saveFolded() {
  try { localStorage.setItem("chaekgalpi-fold", JSON.stringify(Array.from(state.ui.folded))); } catch (e) { /* 무시 */ }
}

export function themeLabel() { return THEME_TEXT[curTheme]; }

export function initPrefs() {
  state.ui.folded = loadFolded();
  curTheme = getTheme();
  curScale = getFontScale();
  applyFontScale(curScale);
  document.addEventListener("click", function (event) {
    if (event.target.closest("#fs-down")) { setFontScale(stepFontScale(curScale, -1)); return; }
    if (event.target.closest("#fs-up")) { setFontScale(stepFontScale(curScale, 1)); return; }
    if (event.target.closest("#fs-reset")) { setFontScale(FONT_SCALE.def); return; }
    if (!event.target.closest("#theme")) return;
    var order = ["auto", "light", "dark"];
    curTheme = order[(order.indexOf(curTheme) + 1) % 3];
    try { localStorage.setItem("chaekgalpi-theme", curTheme); } catch (e) { /* 무시 */ }
    applyTheme(curTheme);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (curTheme === 'auto') applyTheme(curTheme);
  });
  applyTheme(curTheme);
}
