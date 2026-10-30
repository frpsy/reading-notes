import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/core.js";

// 난수 기반 불변식 검사 (고정 시드라 결과가 항상 같음)
test("무작위 책에서 지표·그래프·토글 불변식 유지", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const ri = (n) => Math.floor(rnd() * n);
  const date = () => C.dstr(20000 + ri(400));
  for (let it = 0; it < 3000; it++) {
    const n = 1 + ri(12), ch = [];
    for (let i = 0; i < n; i++) ch.push({ t: "x" + i, lv: ri(4), p: rnd() < 0.5 ? null : ri(400), done: rnd() < 0.4 ? date() : null, memo: "" });
    let prev = -1;
    ch.forEach((c) => { if (c.lv > prev + 1) c.lv = prev + 1; prev = c.lv; });
    const b = {
      chapters: ch, totalPages: rnd() < 0.5 ? null : 100 + ri(400), startDate: rnd() < 0.5 ? null : date(),
      endDate: rnd() < 0.3 ? date() : null, endAuto: false, goalDate: rnd() < 0.5 ? null : date(),
    };
    const today = date();
    const m = C.metrics(b, today);
    assert.ok(m.L >= 1 && m.D <= m.L);
    assert.ok(m.pct >= 0 && m.pct <= 1);
    assert.ok(m.pagePct == null || (m.pagePct >= 0 && m.pagePct <= 1));
    assert.ok(m.rate == null || (Number.isFinite(m.rate) && m.rate > 0));
    assert.ok(m.days == null || m.days >= 1);
    const g = C.chartGeometry(b, m, today);
    if (g) assert.ok(!/NaN|Infinity/.test(g.path));
    const gi = C.goalInfo(b, m, today);
    if (gi) assert.ok(!/NaN|Infinity/.test(gi.text));
    const i = ri(n);
    C.toggleChapter(b, i, today);
    const once = JSON.stringify(b);
    C.autoDates(b);
    assert.equal(JSON.stringify(b), once, "autoDates 는 몇 번 실행해도 같아야 함");
    C.completeThrough(b, i, today);
    const nl = C.nextLeafIndex(b);
    assert.ok(nl === -1 || (!b.chapters[nl].done && !C.isGroup(b.chapters, nl)));
    const nb = C.normalizeBook(Object.assign({ id: "a", title: "t" }, JSON.parse(JSON.stringify(b))));
    assert.equal(JSON.stringify(C.normalizeBook(nb)), JSON.stringify(nb));
  }
});

test("이상한 목차 입력에도 빈 제목 없이 파싱", () => {
  const junk = ["", "   ", "\n\n", "....... 5", "1 ........ 5", "\t\t\t깊은 5", "a".repeat(5000), "1.1.1.1.1.1 x", "<img src=x onerror=1> ........ 12", "제1장   10\n   2절   11"];
  junk.forEach((j) => assert.ok(C.parseToc(j).every((x) => x.t)));
});
