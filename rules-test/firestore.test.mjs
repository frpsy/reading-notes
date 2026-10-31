// Firestore 보안 규칙 검증(에뮬레이터 전용). 운영 프로젝트에는 접속하지 않습니다.
// 실행: npm run test:rules  (Java 와 firebase-tools 필요. CI 는 workflow 에서 설치합니다)
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { normalizeBook } from '../js/core.js';

const fragment = readFileSync(new URL('../firestore.rules.reading', import.meta.url), 'utf8');
const rules = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n" + fragment + "\n  }\n}\n";
const OWNER = 'lgpsy83@gmail.com';
let env;

const book = (id = 'b1', extra = {}) => ({ ...normalizeBook({ id, title: '책', chapters: [{ t: '1장' }] }), ...extra });
const as = (uid, token) => env.authenticatedContext(uid, token).firestore();
const owner = () => as('alice', { email: OWNER, email_verified: true });
const ref = (db, uid = 'alice', id = 'b1') => doc(db, 'readingUsers', uid, 'books', id);

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-chaekgalpi', firestore: { rules, host, port: +port } });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => { await setDoc(ref(ctx.firestore()), book()); });
});

test('본인(허용 이메일·인증됨)은 읽기·목록·생성·수정·삭제 가능', async () => {
  const db = owner();
  await assertSucceeds(getDoc(ref(db)));
  await assertSucceeds(getDocs(collection(db, 'readingUsers', 'alice', 'books')));
  await assertSucceeds(setDoc(ref(db, 'alice', 'b2'), book('b2')));
  await assertSucceeds(updateDoc(ref(db), { note: '메모' }));
  await assertSucceeds(deleteDoc(ref(db)));
});

test('로그인하지 않으면 모두 거부', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(ref(db)));
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2')));
  await assertFails(deleteDoc(ref(db)));
});

test('다른 계정(uid 다름)은 남의 데이터를 읽거나 쓰지 못함', async () => {
  const other = as('mallory', { email: OWNER, email_verified: true }); // 같은 이메일이라도 uid가 다르면 거부
  await assertFails(getDoc(ref(other)));
  await assertFails(getDocs(collection(other, 'readingUsers', 'alice', 'books')));
  await assertFails(setDoc(ref(other, 'alice', 'b2'), book('b2')));
  await assertFails(deleteDoc(ref(other)));
});

test('허용되지 않은 이메일·인증 안 된 이메일은 자기 경로도 거부', async () => {
  const stranger = as('bob', { email: 'bob@example.com', email_verified: true });
  await assertFails(setDoc(ref(stranger, 'bob', 'b1'), book()));
  await assertFails(getDoc(ref(stranger, 'bob', 'b1')));
  const unverified = as('alice', { email: OWNER, email_verified: false });
  await assertFails(getDoc(ref(unverified)));
  await assertFails(setDoc(ref(unverified, 'alice', 'b2'), book('b2')));
});

test('형식이 맞지 않는 문서는 거부', async () => {
  const db = owner();
  await assertFails(setDoc(ref(db, 'alice', 'b2'), { ...book('b2'), extra: 1 }));        // 모르는 필드
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('다른id')));                       // 문서 id 불일치
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2', { title: '가'.repeat(201) })));
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2', { author: '가'.repeat(101) })));
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2', { note: '가'.repeat(20001) })));
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2', { rating: 6 })));
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2', { chapters: 'x' })));
  await assertFails(setDoc(ref(db, 'alice', 'b2'), book('b2', { chapters: Array.from({ length: 3001 }, () => ({ t: '장' })) })));
  await assertFails(updateDoc(ref(db), { title: 5 }));
});

test('경계값은 허용', async () => {
  const db = owner();
  await assertSucceeds(setDoc(ref(db, 'alice', 'b2'), book('b2', { title: '가'.repeat(200), author: '가'.repeat(100), note: '가'.repeat(20000), rating: 5 })));
});

test('규칙에 없는 다른 경로는 모두 거부', async () => {
  const db = owner();
  await assertFails(getDoc(doc(db, 'readingUsers', 'alice')));
  await assertFails(setDoc(doc(db, 'readingUsers', 'alice'), { a: 1 }));
  await assertFails(getDoc(doc(db, 'other', 'x')));
  await assertFails(setDoc(doc(db, 'readingUsers', 'alice', 'other', 'x'), { a: 1 }));
});

test('앱이 실제로 만드는 책 문서는 규칙을 통과', async () => {
  const db = owner(), b = book('b3');
  b.chapters = [{ t: '1부', lv: 0, p: 1, done: null, memo: '' }, { t: '1장', lv: 1, p: 3, done: '2026-10-31', memo: '메모' }];
  b.startDate = '2026-10-01'; b.goalDate = '2026-12-31'; b.createdAt = Date.now(); b.updatedAt = Date.now();
  assert.deepEqual(Object.keys(normalizeBook(b)).sort(), Object.keys(b).sort());
  await assertSucceeds(setDoc(ref(db, 'alice', 'b3'), normalizeBook(b)));
});
