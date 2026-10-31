// 여러 화면에서 쓰는 작은 도우미입니다.
import { escapeHtml, fmtDate, agoText } from "./core.js?v=36";

export function esc(s) { return escapeHtml(s); }
export function fmt(s) { return fmtDate(s); }
export function ago(s) { return agoText(s); }
export function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
