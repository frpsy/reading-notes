import test from "node:test";
import assert from "node:assert/strict";
import { addCount, streak, normalizeRecords, recentDays, dayShift, dayTotal } from "../js/workout-core.js";

test("개수 더하기: 0 아래로 내려가면 항목과 그날 기록이 지워짐", () => {
  let r = addCount({}, "2026-10-31", "push", 5);
  assert.deepEqual(r, { "2026-10-31": { push: 5 } });
  r = addCount(r, "2026-10-31", "pull", 3);
  assert.equal(dayTotal(r["2026-10-31"]), 8);
  r = addCount(r, "2026-10-31", "push", -99);
  assert.deepEqual(r, { "2026-10-31": { pull: 3 } });
  r = addCount(r, "2026-10-31", "pull", -3);
  assert.deepEqual(r, {});
});

test("원본을 바꾸지 않고 상한 9999 를 지킴", () => {
  const a = { "2026-10-31": { push: 9990 } };
  const b = addCount(a, "2026-10-31", "push", 100);
  assert.equal(a["2026-10-31"].push, 9990);
  assert.equal(b["2026-10-31"].push, 9999);
});

test("연속 일수: 오늘이 비어 있으면 어제부터, 하루 건너뛰면 끊김", () => {
  const recs = { "2026-10-29": { push: 1 }, "2026-10-30": { push: 1 } };
  assert.equal(streak(recs, "2026-10-31"), 2);
  recs["2026-10-31"] = { squat: 2 };
  assert.equal(streak(recs, "2026-10-31"), 3);
  assert.equal(streak({ "2026-10-27": { push: 1 } }, "2026-10-31"), 0);
});

test("날짜 계산: 달·해 경계", () => {
  assert.equal(dayShift("2026-11-01", -1), "2026-10-31");
  assert.equal(dayShift("2026-01-01", -1), "2025-12-31");
  assert.deepEqual(recentDays("2026-10-31", 3), ["2026-10-31", "2026-10-30", "2026-10-29"]);
});

test("저장값 정리: 잘못된 날짜·종류·소수·음수는 버림", () => {
  const out = normalizeRecords({
    "2026-10-31": { push: 5, pull: 1.5, squat: -2, bad: 3 },
    "nope": { push: 1 },
    "2026-10-30": "x",
  });
  assert.deepEqual(out, { "2026-10-31": { push: 5 } });
  assert.deepEqual(normalizeRecords(null), {});
});
