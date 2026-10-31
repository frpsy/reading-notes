import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { normalizeBook } from "../js/core.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("app.js 와 모듈 import 의 버전 번호가 같음", () => {
  const v = /js\/app\.js\?v=(\d+)/.exec(read("index.html"))[1];
  for (const f of ["js/app.js", "js/store.js"]) {
    const found = [...read(f).matchAll(/from "\.\/[\w-]+\.js(\?v=(\d+))?"/g)];
    assert.ok(found.length, f);
    for (const m of found) assert.equal(m[2], v, `${f}: ${m[0]} 에 ?v=${v} 가 필요합니다`);
  }
});

test("서비스 워커: SDK 버전 일치, 보관 파일 존재, 배포에 포함", () => {
  const sw = read("sw.js");
  const fb = (s) => /const FB = "([^"]+)"/.exec(s)[1];
  assert.equal(fb(sw), fb(read("js/store.js")));
  const shell = JSON.parse("[" + /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].replace(/,\s*$/, "") + "]");
  for (const p of shell) if (p !== "./") assert.ok(existsSync(new URL("../" + p, import.meta.url)), p);
  assert.match(read(".github/workflows/pages.yml"), /cp -r [^\n]*\bsw\.js\b/);
});

test("Firestore 규칙의 필드 목록이 normalizeBook 과 같음", () => {
  const list = /hasOnly\(\[([^\]]+)\]\)/.exec(read("firestore.rules.reading"))[1];
  const keys = list.split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual([...keys].sort(), Object.keys(normalizeBook({})).sort());
});

test("index.html 미리 받기(modulepreload): 앱 모듈 버전 일치, 파일 존재, SDK 버전 일치", () => {
  const html = read("index.html");
  const v = /js\/app\.js\?v=(\d+)/.exec(html)[1];
  const local = [...html.matchAll(/rel="modulepreload" href="(js\/[\w-]+\.js)\?v=(\d+)"/g)];
  assert.ok(local.length > 5);
  for (const [, file, ver] of local) { assert.equal(ver, v, file); assert.ok(existsSync(new URL("../" + file, import.meta.url)), file); }
  const fb = /const FB = "([^"]+)"/.exec(read("js/store.js"))[1];
  for (const [, url] of html.matchAll(/rel="modulepreload" href="(https:[^"]+)"/g)) assert.ok(url.startsWith(fb + "/"), url);
});
