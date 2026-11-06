import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bump } from '../scripts/bump-version.mjs';

function fixture(jsVersions = { a: 7, b: 7 }) {
  const root = mkdtempSync(join(tmpdir(), 'bump-'));
  mkdirSync(join(root, 'js'));
  writeFileSync(join(root, 'index.html'), [
    '<link rel="stylesheet" href="css/style.css?v=3">',
    `<link rel="modulepreload" href="js/b.js?v=${jsVersions.b}">`,
    `<script type="module" src="js/app.js?v=${jsVersions.a}"></script>`,
  ].join('\n'));
  writeFileSync(join(root, 'js', 'app.js'), `import { x } from "./b.js?v=${jsVersions.a}";\nimport * as s from './c.js?v=${jsVersions.a}';\n`);
  writeFileSync(join(root, 'js', 'b.js'), 'export const x = 1; // no imports\n');
  writeFileSync(join(root, 'js', 'c.js'), `import { x } from "./b.js?v=${jsVersions.a}";\n`);
  return root;
}
const read = (root, f) => readFileSync(join(root, f), 'utf8');

test('bump js: index.html 과 모든 모듈 import 의 번호를 함께 올리고 CSS 는 건드리지 않음 (작은따옴표 import 포함)', () => {
  const root = fixture();
  const r = bump(root, 'js');
  assert.deepEqual(r.js, { from: 7, to: 8, files: 3 });
  assert.equal(r.css, undefined);
  assert.match(read(root, 'index.html'), /js\/b\.js\?v=8/);
  assert.match(read(root, 'index.html'), /js\/app\.js\?v=8/);
  assert.match(read(root, 'index.html'), /css\/style\.css\?v=3/);
  assert.match(read(root, 'js/app.js'), /"\.\/b\.js\?v=8"/);
  assert.match(read(root, 'js/app.js'), /'\.\/c\.js\?v=8'/);
  assert.match(read(root, 'js/c.js'), /\.\/b\.js\?v=8/);
  assert.equal(read(root, 'js/b.js'), 'export const x = 1; // no imports\n');
});

test('bump css: style.css 번호만 올림', () => {
  const root = fixture();
  assert.deepEqual(bump(root, 'css').css, { from: 3, to: 4, files: 1 });
  assert.match(read(root, 'index.html'), /css\/style\.css\?v=4/);
  assert.match(read(root, 'index.html'), /js\/app\.js\?v=7/);
  assert.match(read(root, 'js/app.js'), /\?v=7/);
});

test('bump all 과 --dry(write:false): 둘 다 올리거나, 파일은 그대로 둔 채 결과만 계산', () => {
  const root = fixture();
  const before = read(root, 'index.html');
  const dry = bump(root, 'all', { write: false });
  assert.equal(dry.js.to, 8);
  assert.equal(dry.css.to, 4);
  assert.equal(read(root, 'index.html'), before);
  const done = bump(root, 'all');
  assert.equal(done.js.to, 8);
  assert.match(read(root, 'index.html'), /css\/style\.css\?v=4/);
});

test('번호가 이미 서로 다르면 일부만 올려 더 꼬이지 않도록 멈춤', () => {
  const root = fixture({ a: 7, b: 6 });
  const before = read(root, 'index.html');
  assert.throws(() => bump(root, 'js'), /서로 다릅니다/);
  assert.equal(read(root, 'index.html'), before);
});

test('잘못된 종류는 사용법 오류', () => {
  assert.throws(() => bump(fixture(), 'x'), /사용법/);
});

test('실제 저장소에서 bump all 을 미적용(dry)으로 계산하면 JS·CSS 번호가 각각 1씩 늘어남', () => {
  const root = new URL('..', import.meta.url).pathname;
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const js = Number(/js\/app\.js\?v=(\d+)/.exec(html)[1]);
  const css = Number(/css\/style\.css\?v=(\d+)/.exec(html)[1]);
  const r = bump(root, 'all', { write: false });
  assert.equal(r.js.to, js + 1);
  assert.equal(r.css.to, css + 1);
  assert.ok(r.js.files > 15, `JS 파일 수가 너무 적습니다: ${r.js.files}`);
});
