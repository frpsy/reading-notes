#!/usr/bin/env node
// 화면 파일 주소의 ?v=번호 를 한 번에 올립니다. (개발용 도구이며 배포 파일에는 포함하지 않습니다.)
//   npm run bump -- js     JS 를 고쳤을 때: index.html 의 js/*.js 주소(app.js·modulepreload)와 js/*.js 의 모든 import
//   npm run bump -- css    CSS 를 고쳤을 때: index.html 의 css/style.css 주소
//   npm run bump -- all    둘 다
//   --dry                  파일을 바꾸지 않고 결과만 보여 줍니다
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const JS_IN_HTML = /(js\/[\w-]+\.js\?v=)(\d+)/g;
const JS_IMPORT = /(from\s+["']\.\/[\w-]+\.js\?v=)(\d+)/g;
const CSS_IN_HTML = /(css\/style\.css\?v=)(\d+)/g;

function current(html, re, label) {
  const m = re.exec(html);
  if (!m) throw new Error(`index.html 에서 ${label} 의 ?v= 번호를 찾지 못했습니다`);
  return Number(m[1]);
}

// root 폴더의 파일을 읽어 올린 결과를 계산합니다. write=true 일 때만 파일을 씁니다.
export function bump(root, kind, { write = true } = {}) {
  if (!["js", "css", "all"].includes(kind)) throw new Error("사용법: bump js | css | all");
  const htmlPath = join(root, "index.html");
  let html = readFileSync(htmlPath, "utf8");
  const result = {};
  const edits = []; // [경로, 새 내용]

  if (kind === "js" || kind === "all") {
    const from = current(html, /js\/app\.js\?v=(\d+)/, "js/app.js");
    const to = from + 1;
    // 번호가 서로 다른 채로 시작했다면 일부만 올리면 더 꼬이므로 멈춥니다.
    const seen = new Set([...html.matchAll(JS_IN_HTML)].map((m) => m[2]));
    const files = readdirSync(join(root, "js")).filter((f) => f.endsWith(".js"));
    const sources = new Map(files.map((f) => [f, readFileSync(join(root, "js", f), "utf8")]));
    for (const src of sources.values()) for (const m of src.matchAll(JS_IMPORT)) seen.add(m[2]);
    if (seen.size > 1) throw new Error(`JS 버전 번호가 이미 서로 다릅니다(${[...seen].join(", ")}). 먼저 맞춘 뒤 다시 실행하세요`);
    html = html.replace(JS_IN_HTML, (_, p) => p + to);
    let changed = 0;
    for (const [f, src] of sources) {
      const next = src.replace(JS_IMPORT, (_, p) => p + to);
      if (next !== src) { edits.push([join(root, "js", f), next]); changed++; }
    }
    result.js = { from, to, files: changed + 1 }; // +1 은 index.html
  }

  if (kind === "css" || kind === "all") {
    const from = current(html, /css\/style\.css\?v=(\d+)/, "css/style.css");
    html = html.replace(CSS_IN_HTML, (_, p) => p + (from + 1));
    result.css = { from, to: from + 1, files: 1 };
  }

  edits.push([htmlPath, html]);
  if (write) for (const [path, text] of edits) writeFileSync(path, text);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const kind = args.find((a) => !a.startsWith("--"));
  try {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const r = bump(root, kind, { write: !dry });
    for (const [k, v] of Object.entries(r)) console.log(`${k.toUpperCase()}: ?v=${v.from} → ?v=${v.to} (파일 ${v.files}개)${dry ? " [미적용]" : ""}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
