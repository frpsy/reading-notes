// 운동 탭: 오늘의 푸쉬업·풀업·스쿼트 개수를 누르며 기록합니다. 지금은 이 기기에만 저장합니다(localStorage).
import { todayStr } from "./core.js?v=16";
import { KINDS, addCount, dayTotal, streak, recentDays, normalizeRecords } from "./workout-core.js?v=16";

const KEY = "chaekgalpi-workout-v1";
let recs = load();

function load() {
  try { return normalizeRecords(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(recs)); } catch (e) { /* 저장소를 못 쓰는 환경은 이번 접속에만 유지 */ }
}

function btn(kind, d) {
  return '<button class="btn sm wk-b" type="button" data-act="wk" data-k="' + kind + '" data-d="' + d + '" data-i="' + kind + d + '">' + (d > 0 ? "+" : "−") + Math.abs(d) + "</button>";
}

export function workoutView() {
  const today = todayStr(), rec = recs[today] || {};
  const rows = KINDS.map(function (k) {
    return '<div class="wk-row"><span class="wk-name">' + k.name + '</span><b class="wk-n">' + (rec[k.id] || 0) + "</b>" +
      '<span class="wk-btns">' + btn(k.id, -1) + btn(k.id, 1) + btn(k.id, 5) + btn(k.id, 10) + "</span></div>";
  }).join("");
  const days = recentDays(today, 7).map(function (d) {
    const r = recs[d];
    return "<tr><td>" + d.slice(5).replace("-", "/") + "</td>" + KINDS.map(function (k) { return "<td>" + ((r && r[k.id]) || "·") + "</td>"; }).join("") + "<td>" + (r ? dayTotal(r) : "·") + "</td></tr>";
  }).join("");
  return '<div class="lib-head"><h1 class="page">오늘의 운동</h1></div>' +
    '<p class="wk-meta">' + today + " · 연속 " + streak(recs, today) + "일</p>" +
    '<div class="panel wk">' + rows + "</div>" +
    '<h2 class="wk-h">최근 7일</h2>' +
    '<table class="wk-tbl"><thead><tr><th>날짜</th>' + KINDS.map(function (k) { return "<th>" + k.name + "</th>"; }).join("") + "<th>합계</th></tr></thead><tbody>" + days + "</tbody></table>" +
    '<p class="wk-note">이 기기에만 저장됩니다. 기기를 바꾸면 기록이 따라가지 않습니다.</p>';
}

// 운동 버튼을 눌렀을 때 호출합니다. 처리했으면 true.
export function workoutAct(el) {
  if (el.dataset.act !== "wk") return false;
  if (!KINDS.some(function (k) { return k.id === el.dataset.k; })) return false;
  const d = parseInt(el.dataset.d, 10);
  if (!d) return false;
  recs = addCount(recs, todayStr(), el.dataset.k, d);
  save();
  return true;
}
