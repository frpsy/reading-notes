import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  escapeHtml, dnum, dstr, parseToc, tocText, isGroup, leavesOf, descLeaves, metrics,
  autoDates, toggleChapter, nextLeafIndex, activityByDate, currentStreak, longestStreak, heatmapWeeks, goalInfo, chartGeometry, normalizeBook, parseCatalogText,
  agoText,
} from "../js/core.js";

const book = (extra = {}) => Object.assign({
  id: "x", title: "t", author: "", totalPages: null, startDate: null, endDate: null, endAuto: false,
  goalDate: null, rating: 0, note: "", createdAt: 0, updatedAt: 0,
  chapters: parseToc("1부\n  1장\n  2장\n2부\n  3장\n  4장"),
}, extra);

test("escapeHtml", () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
});

test("날짜 변환", () => {
  assert.equal(dstr(dnum("2026-10-30")), "2026-10-30");
  assert.equal(dnum("2026-13-01") === null, false); // 월 범위는 Date.UTC 가 넘겨 처리
  assert.equal(dnum("abc"), null);
  assert.equal(agoText("2026-10-29", "2026-10-30"), "어제");
  assert.equal(agoText("2026-10-30", "2026-10-30"), "오늘");
  assert.equal(agoText("2026-10-20", "2026-10-30"), "10일 전");
});

test("목차: 들여쓰기·쪽수", () => {
  const it = parseToc("1부 시작 ........ 9\n  1장 왜 ........ 11\n  2장 무엇 … 27\n2부\n  3장\t45");
  assert.deepEqual(it.map((c) => [c.t, c.lv, c.p]), [
    ["1부 시작", 0, 9], ["1장 왜", 1, 11], ["2장 무엇", 1, 27], ["2부", 0, null], ["3장", 1, 45],
  ]);
});

test("목차: 번호 단계와 단계 점프 보정", () => {
  const it = parseToc("1 개요\n1.1 배경\n1.1.1 세부\n3.1.1.1.1 깊은");
  assert.deepEqual(it.map((c) => c.lv), [0, 1, 2, 3]);
  const jump = parseToc("가\n      나");
  assert.equal(jump[1].lv, 1);
});

test("목차 왕복", () => {
  const b = book();
  b.chapters[1].p = 11;
  const again = parseToc(tocText(b));
  assert.deepEqual(again.map((c) => [c.t, c.lv, c.p]), b.chapters.map((c) => [c.t, c.lv, c.p]));
});

test("묶음·읽을 단위", () => {
  const ch = book().chapters;
  assert.equal(isGroup(ch, 0), true);
  assert.equal(isGroup(ch, 1), false);
  assert.deepEqual(leavesOf(ch), [1, 2, 4, 5]);
  assert.deepEqual(descLeaves(ch, 3), [4, 5]);
});

test("체크·종료일 자동 입력/해제", () => {
  const b = book();
  toggleChapter(b, 0, "2026-10-01");
  assert.equal(b.startDate, "2026-10-01");
  assert.equal(b.endDate, null);
  toggleChapter(b, 3, "2026-10-05");
  assert.equal(b.endDate, "2026-10-05");
  assert.equal(b.endAuto, true);
  toggleChapter(b, 4, "2026-10-06"); // 하나 풀기
  assert.equal(b.endDate, null);
  assert.equal(b.endAuto, false);
});

test("수동 종료일은 해제해도 유지", () => {
  const b = book({ endDate: "2026-11-01", endAuto: false });
  toggleChapter(b, 1, "2026-10-01");
  autoDates(b);
  assert.equal(b.endDate, "2026-11-01");
});

test("진척·속도·예상일", () => {
  const b = book({ startDate: "2026-10-01" });
  toggleChapter(b, 1, "2026-10-02");
  const m = metrics(b, "2026-10-04");
  assert.equal(m.L, 4);
  assert.equal(m.D, 1);
  assert.equal(m.pct, 0.25);
  assert.equal(m.status, "reading");
  assert.equal(m.days, 4);
  assert.equal(m.etaIn, 12);
  assert.equal(m.etaStr, "2026-10-16");
  assert.equal(metrics(book(), "2026-10-04").status, "todo");
});

test("분량 기준 진행률", () => {
  const b = book({ totalPages: 100 });
  [10, 20, 50, 60].forEach((p, i) => { b.chapters[[1, 2, 4, 5][i]].p = p; });
  b.chapters[0].p = 10; b.chapters[3].p = 50;
  toggleChapter(b, 1, "2026-10-01");
  const m = metrics(b, "2026-10-02");
  assert.equal(m.pagesTotal, 91);
  assert.equal(m.pagesRead, 10);
  assert.ok(Math.abs(m.pagePct - 10 / 91) < 1e-9);
});

test("연속 stale 표시", () => {
  const b = book({ startDate: "2026-10-01" });
  toggleChapter(b, 1, "2026-10-02");
  assert.equal(metrics(b, "2026-10-08").stale, false);
  assert.equal(metrics(b, "2026-10-09").stale, true);
});

test("목표일 안내", () => {
  const b = book({ startDate: "2026-10-01", goalDate: "2026-10-20" });
  toggleChapter(b, 1, "2026-10-02");
  const m = metrics(b, "2026-10-04");
  const g = goalInfo(b, m, "2026-10-04");
  assert.match(g.text, /16일/);
  assert.equal(g.cmp.tone, "done");
  assert.equal(goalInfo(book(), m, "2026-10-04"), null);
});

test("누적 그래프 좌표", () => {
  const b = book({ startDate: "2026-10-01" });
  assert.equal(chartGeometry(b, metrics(b, "2026-10-04"), "2026-10-04"), null);
  toggleChapter(b, 1, "2026-10-02");
  const g = chartGeometry(b, metrics(b, "2026-10-04"), "2026-10-04");
  assert.ok(g.path.startsWith("M"));
  assert.equal(g.D, 1);
  assert.equal(g.today.show, true);
});

test("정규화", () => {
  const b = normalizeBook({ title: "a", chapters: [{ t: "x", lv: 5, done: "bad" }, { t: "" }], rating: 9, totalPages: -3 });
  assert.equal(b.chapters.length, 1);
  assert.equal(b.chapters[0].lv, 0);
  assert.equal(b.chapters[0].done, null);
  assert.equal(b.rating, 5);
  assert.equal(b.totalPages, null);
});

test("준비된 책 문안", () => {
  const c = parseCatalogText("제목: A\n저자: B\n쪽수: 120\n출처: S\n목차:\n1장 ........ 5\n  1.1 ........ 6\n");
  assert.equal(c.title, "A");
  assert.equal(c.totalPages, 120);
  assert.equal(parseToc(c.toc).length, 2);
});

test("catalog 파일이 모두 읽힘", () => {
  const idx = JSON.parse(fs.readFileSync(new URL("../catalog/index.json", import.meta.url)));
  assert.ok(idx.length >= 1);
  for (const x of idx) {
    const c = parseCatalogText(fs.readFileSync(new URL("../catalog/" + x.file, import.meta.url), "utf8"));
    const items = parseToc(c.toc);
    assert.ok(c.title && items.length > 5, x.file);
    if (items.some((i) => i.p != null)) assert.ok(items.every((i) => i.p != null), x.file + " 쪽수");
    const m = metrics({ chapters: items, totalPages: c.totalPages });
    assert.ok(m.L > 0, x.file + " 읽을 챕터 계산");
    if (items.every((i) => i.p != null)) assert.ok(m.pagesTotal > 0, x.file + " 분량 계산");
  }
});

test("이어 읽기: 다음 읽을 단위", () => {
  const b = book();
  assert.equal(nextLeafIndex(b), 1);
  toggleChapter(b, 1, "2026-10-01");
  assert.equal(nextLeafIndex(b), 2);
  toggleChapter(b, 0, "2026-10-02"); // 묶음 전체 체크
  assert.equal(nextLeafIndex(b), 4);
  toggleChapter(b, 3, "2026-10-02");
  assert.equal(nextLeafIndex(b), -1);
  assert.equal(nextLeafIndex({ chapters: [] }), -1);
});

test("독서 기록: 날짜별 집계·연속 일수", () => {
  const a = book(), b = book();
  toggleChapter(a, 1, "2026-10-27");
  toggleChapter(a, 2, "2026-10-28");
  toggleChapter(b, 1, "2026-10-28");
  toggleChapter(b, 2, "2026-10-30");
  const m = activityByDate([a, b]);
  assert.deepEqual(m, { "2026-10-27": 1, "2026-10-28": 2, "2026-10-30": 1 });
  assert.equal(currentStreak(m, "2026-10-30"), 1);
  assert.equal(currentStreak(m, "2026-10-31"), 1); // 오늘 기록이 없으면 어제부터
  assert.equal(currentStreak(m, "2026-11-02"), 0);
  assert.equal(currentStreak({ "2026-10-29": 1, "2026-10-30": 1 }, "2026-10-30"), 2);
  assert.equal(longestStreak(m), 2);
  assert.equal(longestStreak({}), 0);
});

test("히트맵: 주 단위 열·오늘 위치", () => {
  const m = { "2026-10-30": 2, "2026-10-26": 5 };
  const cols = heatmapWeeks(m, "2026-10-30", 12); // 2026-10-30 은 금요일
  assert.equal(cols.length, 12);
  assert.ok(cols.every((c) => c.length === 7));
  const last = cols[11];
  assert.equal(last[0].date, "2026-10-25"); // 일요일 시작
  assert.equal(last[5].date, "2026-10-30");
  assert.equal(last[5].count, 2);
  assert.equal(last[5].level, 2);
  assert.equal(last[1].level, 3);
  assert.equal(last[6].future, true);
  assert.equal(last[5].future, false);
});
