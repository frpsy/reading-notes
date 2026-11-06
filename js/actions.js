// 책 화면의 사용자 동작(메모·접기·목표일·입력 저장). app.js 는 이벤트를 받아 여기로 넘기기만 합니다.
// DOM 은 root(#view)를 인자로 받아 읽으며, 상태는 state 로만 바꿉니다.
import { state } from "./state.js?v=52";
import { render } from "./bus.js?v=52";
import { saveFolded } from "./prefs.js?v=52";
import { persist } from "./sync.js?v=52";
import { offerUndo } from "./undo.js?v=52";
import { preserve } from "./records.js?v=52";
import { refreshMemos } from "./view-book.js?v=52";
import { metrics as calcMetrics, isGroup, autoDates, dnum, dstr, todayStr } from "./core.js?v=52";

const memoSelector = (i) => 'textarea[data-act="memotext"][data-i="' + i + '"]';

// 메모 입력란은 글 길이에 맞게 늘어난다(화면 높이의 60%까지)
export function growMemo(ta, force) {
  // 글이 넘칠 때만 늘립니다(입력마다 높이를 다시 재면 큰 책에서 느려짐). 열 때와 글이 크게 줄었을 때만 다시 잽니다.
  const len = ta.value.length, last = +(ta.dataset.len || 0);
  ta.dataset.len = len;
  if (!force && len >= last && ta.scrollHeight <= ta.clientHeight) return;
  if (!force && len < last && last - len < 200) return;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight + 2, Math.max(96, Math.round((window.visualViewport?.height || window.innerHeight) * 0.6))) + "px";
}

// 챕터 메모 편집 시작/저장: 닫혀 있으면 입력창을 열고, 열려 있으면 입력한 글을 저장하고 닫습니다.
export function toggleMemoEditor(b, i, root) {
  const k = b.id + ":" + i;
  if (state.ui.openMemo.has(k)) {
    // 열려 있으면 '메모 저장': 입력한 글을 저장하고 자동으로 닫습니다.
    const ta0 = root.querySelector(memoSelector(i)), ch0 = b.chapters[i];
    if (ta0 && (ch0.memo || "") !== ta0.value.trim()) { ch0.memo = ta0.value.trim(); persist(b); }
    state.ui.openMemo.delete(k);
    const orig = state.ui.memoOrig.get(k) || ""; state.ui.memoOrig.delete(k);
    if (orig && !ch0.memo) {
      // 메모를 모두 지우면 바로 저장되므로, 잠시 되돌릴 기회를 줍니다.
      const bid = b.id;
      offerUndo("메모를 지웠습니다", function () {
        const bb = state.books.get(bid); if (!bb || !bb.chapters[i] || bb.chapters[i].memo) return;
        bb.chapters[i].memo = orig; persist(bb); render();
      });
    }
  } else { state.ui.openMemo.add(k); state.ui.memoOrig.set(k, b.chapters[i].memo || ""); }
  render();
  if (state.ui.openMemo.has(k)) {
    const ta = root.querySelector(memoSelector(i));
    if (ta) {
      growMemo(ta, true); ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      // 키보드가 올라온 뒤에도 입력란이 보이도록 화면 가운데로
      setTimeout(function () { if (document.activeElement === ta) ta.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, 300);
    }
  }
}

// 메모 내용을 지우고 입력창을 닫습니다. 실수는 '되돌리기'로 복구합니다.
export function deleteMemo(b, i, root) {
  const dk = b.id + ":" + i, dch = b.chapters[i];
  const dta = root.querySelector(memoSelector(i));
  const before = (dta ? dta.value.trim() : "") || dch.memo || state.ui.memoOrig.get(dk) || "";
  if (before && !preserve(b, "memo", i, before)) return;
  const previousMemo = dch.memo;
  dch.memo = "";
  if (!persist(b)) { dch.memo = previousMemo; state.localFailed.delete(b.id); return; }
  state.ui.openMemo.delete(dk); state.ui.memoOrig.delete(dk);
  if (before) {
    const dbid = b.id;
    offerUndo("메모를 삭제했습니다", function () {
      const bb = state.books.get(dbid); if (!bb || !bb.chapters[i] || bb.chapters[i].memo) return;
      bb.chapters[i].memo = before; persist(bb); render();
    });
  }
  render();
}

// 모든 묶음 접기/펼치기: 하나라도 펼쳐져 있으면 모두 접고, 모두 접혀 있으면 모두 펼칩니다.
export function foldAll(b) {
  const keys = b.chapters.map(function (_, i) { return isGroup(b.chapters, i) ? b.id + ":" + i : null; }).filter(Boolean);
  if (!keys.length) return;
  const expandAll = keys.every(function (key) { return state.ui.folded.has(key); });
  keys.forEach(function (key) { if (expandAll) state.ui.folded.delete(key); else state.ui.folded.add(key); });
  saveFolded(); render();
}

export function toggleFold(b, i) {
  const key = b.id + ":" + i;
  if (state.ui.folded.has(key)) state.ui.folded.delete(key); else state.ui.folded.add(key);
  saveFolded(); render();
}

// 목표 완독일을 오늘부터 2주/4주 뒤로 맞춥니다.
export function setGoalPreset(b, weeks) {
  if (weeks !== 2 && weeks !== 4) return;
  b.goalDate = dstr(dnum(todayStr()) + weeks * 7);
  persist(b); render();
}

// 독서 메모(note)가 비워질 때 원문을 보관하기 위해 처음 포커스를 받을 때의 값을 기억합니다.
const noteOriginal = new WeakMap();
export function rememberNote(el) { noteOriginal.set(el, el.value); }

// 독서 메모·챕터 메모 입력: 기기에 즉시 보관(저장 상태는 상단 표시가 알림).
export function saveTypedText(b, el, act) {
  if (act === "note") {
    if (!el.value.trim() && b.note && !preserve(b, "note", -1, noteOriginal.get(el) || b.note)) { el.value = b.note; return; }
    b.note = el.value; persist(b); return;
  }
  const i = +el.dataset.i, oldMemo = b.chapters[i].memo;
  if (!el.value.trim() && oldMemo && !preserve(b, "memo", i, state.ui.memoOrig.get(b.id + ":" + el.dataset.i) || oldMemo)) { el.value = oldMemo; return; }
  b.chapters[i].memo = el.value.trim(); refreshMemos(b);
  growMemo(el);
  // 입력창에는 저장 상태를 보여 주지 않습니다. 보관·저장에 실패하면 상단 저장 표시와 안내가 알려 줍니다.
  persist(b);
  const row = el.closest(".memo-row"), cnt = row && row.querySelector("[data-memo-count]");
  if (cnt) cnt.textContent = Array.from(el.value).length + "/2000";
}

// 책 정보 입력칸(날짜·평점 등)이 바뀌었을 때의 저장.
export function applyFieldChange(b, act, el) {
  switch (act) {
    case "start": b.startDate = el.value || null; persist(b); render(); break;
    case "end": b.endDate = calcMetrics(b).status === "done" ? (el.value || null) : null; b.endAuto = false; persist(b); render(); break;
    case "goal": b.goalDate = el.value || null; persist(b); render(); break;
    case "chdate": b.chapters[+el.dataset.i].done = el.value || null; autoDates(b); persist(b); render(); break;
    case "memotext": break; // input에서 기기에 즉시 보관
    case "rating": b.rating = parseInt(el.value, 10) || 0; persist(b); break;
    case "note": break; // input에서 기기에 즉시 보관
  }
}
