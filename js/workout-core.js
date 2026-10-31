// 운동 기록 순수 로직: 날짜별 푸쉬업·풀업·스쿼트 개수. 화면·저장과 분리해 테스트합니다.
export const KINDS = [
  { id: "push", name: "푸쉬업" },
  { id: "pull", name: "풀업" },
  { id: "squat", name: "스쿼트" },
];
const MAX = 9999;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dayShift(day, n) {
  const t = new Date(day + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// 저장된 값에서 올바른 날짜·종류·정수만 남깁니다.
export function normalizeRecords(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const day of Object.keys(raw)) {
    if (!DAY.test(day) || !raw[day] || typeof raw[day] !== "object") continue;
    const rec = {};
    for (const k of KINDS) {
      const v = raw[day][k.id];
      if (Number.isInteger(v) && v > 0) rec[k.id] = Math.min(v, MAX);
    }
    if (Object.keys(rec).length) out[day] = rec;
  }
  return out;
}

// 기록을 바꾼 새 객체를 돌려줍니다(0 이하가 되면 그 항목을 지웁니다).
export function addCount(recs, day, kind, delta) {
  const rec = Object.assign({}, recs[day]);
  const v = Math.max(0, Math.min(MAX, (rec[kind] || 0) + delta));
  if (v > 0) rec[kind] = v; else delete rec[kind];
  const out = Object.assign({}, recs);
  if (Object.keys(rec).length) out[day] = rec; else delete out[day];
  return out;
}

export function dayTotal(rec) {
  return KINDS.reduce((s, k) => s + ((rec && rec[k.id]) || 0), 0);
}

// 연속 기록 일수. 오늘 기록이 아직 없으면 어제부터 셉니다.
export function streak(recs, today) {
  let d = recs[today] ? today : dayShift(today, -1), n = 0;
  while (recs[d]) { n++; d = dayShift(d, -1); }
  return n;
}

// 오늘부터 거슬러 올라간 n일(오늘이 첫 칸).
export function recentDays(today, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(dayShift(today, -i));
  return out;
}
