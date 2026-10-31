import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/store-core.js";

test("설정의 apiKey 가 없으면 체험 모드로 바로 준비됨", async () => {
  const s = createStore({ sdkBase: "x", firebaseConfig: { apiKey: "" }, allowedEmails: [], userCollection: "u", itemCollection: "i", localKey: "k" });
  assert.equal(s.firebaseConfigured, false);
  const got = [];
  await s.start((st) => got.push(st));
  assert.deepEqual(got, [{ state: "ready", mode: "local" }]);
});

test("apiKey 가 있으면 Firebase 사용 가능으로 표시", () => {
  const s = createStore({ sdkBase: "x", firebaseConfig: { apiKey: "k" }, allowedEmails: [], userCollection: "u", itemCollection: "i", localKey: "k" });
  assert.equal(s.firebaseConfigured, true);
});
