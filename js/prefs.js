// 테마와 접은 묶음을 기기에 기억합니다. 저장소를 못 써도 화면은 동작합니다.
import { state } from "./state.js?v=28";

var THEME_TEXT = { auto: "테마 자동", light: "밝게", dark: "어둡게" };
var curTheme = "auto"; // 저장소를 못 써도 이번 화면에서는 순환되도록 변수로 들고 있습니다

function getTheme() { try { var t = localStorage.getItem("chaekgalpi-theme"); return THEME_TEXT[t] ? t : "auto"; } catch (e) { return "auto"; } }
function applyTheme(t) {
  var themeEl = document.getElementById("theme");
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  themeEl.textContent = THEME_TEXT[t];
  themeEl.setAttribute("aria-label", "화면 테마: " + THEME_TEXT[t] + " (누르면 바뀝니다)");
}

export function loadFolded() {
  try { return new Set(JSON.parse(localStorage.getItem("chaekgalpi-fold") || "[]")); } catch (e) { return new Set(); }
}
export function saveFolded() {
  try { localStorage.setItem("chaekgalpi-fold", JSON.stringify(Array.from(state.ui.folded))); } catch (e) { /* 무시 */ }
}

export function initPrefs() {
  state.ui.folded = loadFolded();
  curTheme = getTheme();
  document.getElementById("theme").addEventListener("click", function () {
    var order = ["auto", "light", "dark"];
    curTheme = order[(order.indexOf(curTheme) + 1) % 3];
    try { localStorage.setItem("chaekgalpi-theme", curTheme); } catch (e) { /* 무시 */ }
    applyTheme(curTheme);
  });
  applyTheme(curTheme);
}
