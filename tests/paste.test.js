// 서점 페이지 붙여넣기 인식(parseBookPaste·tidyToc). 실제 페이지 구조를 줄여 만든 예시입니다.
import test from "node:test";
import assert from "node:assert/strict";
import { parseBookPaste, tidyToc, parseToc, leavesOf, isGroup } from "../js/core.js";

const yes24 = [
  "본문 바로가기", "로그인", "회원가입", "카트", "국내도서", ">", "자연과학",
  "소득공제 강력추천 메디컬 사이언스-09",
  "STRESS 스트레스 당신을 병들게 하는 스트레스의 모든 것 [ 양장 ]",
  "로버트 M. 새폴스키 저/이지윤, 이재담 역 | 사이언스북스 | 2008년 11월 28일 | 원제 : Why zebras don't get ulcers",
  "평균 별점9.7 (21)", "정가\t33,000원", "카트에 넣기", "바로구매",
  "STRESS 스트레스", "도서정보", "품목정보", "발행일\t2008년 11월 28일",
  "쪽수, 무게, 크기\t760쪽 | 1,010g | 142*214*40mm", "ISBN13\t9788983712325", "ISBN10\t8983712325",
  "책소개", "스트레스의 모든 것!", "목차", "머리말", "1. 스트레스와 당신", "2. 스트레스와 뇌",
  "3. 스트레스와 심장", "주(註)", "더 읽을거리", "화보 판권", "접어보기", "저자 소개 (3명)", "저 : 로버트 M. 새폴스키",
].join("\n");

test("YES24 상품 페이지: 제목·저자·출판사·쪽수·ISBN·목차", () => {
  const r = parseBookPaste(yes24);
  assert.equal(r.title, "스트레스");
  assert.equal(r.author, "로버트 M. 새폴스키");
  assert.equal(r.publisher, "사이언스북스");
  assert.equal(r.pages, 760);
  assert.equal(r.isbn, "9788983712325");
  assert.deepEqual(r.toc.split("\n"), ["머리말", "1. 스트레스와 당신", "2. 스트레스와 뇌", "3. 스트레스와 심장", "주(註)", "더 읽을거리"]);
  assert.deepEqual(r.found, ["title", "author", "publisher", "pages", "isbn", "toc"]);
});

test("YES24 부·장 목차: 절 목록 줄은 빼고 장을 부 아래로 들여씀", () => {
  const text = [
    "아주 작은 습관의 힘 (50만 부 기념 스페셜 에디션) 최고의 변화는 어떻게 만들어지는가",
    "제임스 클리어 저/이한이 역 | 비즈니스북스 | 2019년 02월 26일 | 원제 : ATOMIC HABITS",
    "카트에 넣기", "아주 작은 습관의 힘 (50만 부 기념 스페셜 에디션)", "도서정보",
    "쪽수, 무게, 크기\t360쪽 | 626g | 152*225*20mm",
    "목차", "Prologue 새로운 삶의 시작", "인생의 나락에서 빠져나오다 ｜ 놀랍고도 엄청난 변화들", "",
    "Part 1. 아주 작은 습관이 만드는 극적인 변화", "Chapter 01. 평범했던 선수들은 어떻게 세계 최고가 되었을까",
    "매일 1퍼센트씩 달라졌을 뿐인데 ｜ 낙담의 골짜기를 견뎌라", "", "Chapter 02. 정체성, 사람을 움직이는 가장 큰 비밀", "습관은 자존감이다", "",
    "Part 2. 첫 번째 법칙, 분명해야 달라진다", "Chapter 03. 인생은 생각하는 만큼 바뀐다", "좋은 습관 vs. 나쁜 습관", "",
    "Epilogue 100번만 반복하면 그게 당신의 무기가 된다", "부록 1 사람들의 행동에 관한 18가지 진실", "주석", "접어보기",
  ].join("\n");
  const r = parseBookPaste(text);
  assert.equal(r.title, "아주 작은 습관의 힘");
  assert.equal(r.author, "제임스 클리어");
  assert.equal(r.pages, 360);
  const ch = parseToc(r.toc);
  assert.deepEqual(ch.map((c) => "  ".repeat(c.lv) + c.t), [
    "Prologue 새로운 삶의 시작",
    "Part 1. 아주 작은 습관이 만드는 극적인 변화",
    "  Chapter 01. 평범했던 선수들은 어떻게 세계 최고가 되었을까",
    "  Chapter 02. 정체성, 사람을 움직이는 가장 큰 비밀",
    "Part 2. 첫 번째 법칙, 분명해야 달라진다",
    "  Chapter 03. 인생은 생각하는 만큼 바뀐다",
    "Epilogue 100번만 반복하면 그게 당신의 무기가 된다",
    "부록 1 사람들의 행동에 관한 18가지 진실",
    "주석",
  ]);
  assert.equal(ch.filter((c, i) => isGroup(ch, i)).length, 2);
  assert.equal(leavesOf(ch).length, 7);
});

test("교보문고: 저자·출판사가 줄마다 나뉜 형식, 부제는 제목에서 뺌", () => {
  const text = ["국내도서", "자기계발", "자기관리/처세", "아주 작은 습관의 힘(50만 부 기념 스페셜 에디션)", "", "최고의 변화는 어떻게 만들어지는가", "",
    "국내도서", "16,200원", "eBook", "11,340원", "제임스 클리어", "저자(글)", "이한이", "번역", "비즈니스북스", "·", "2019년 02월 26일",
    "기본정보", "ISBN\t", "9791162540640", "", "쪽수/크기\t", "360쪽 | 152 * 225 mm"].join("\n");
  const r = parseBookPaste(text);
  assert.equal(r.title, "아주 작은 습관의 힘");
  assert.equal(r.author, "제임스 클리어");
  assert.equal(r.publisher, "비즈니스북스");
  assert.equal(r.pages, 360);
  assert.equal(r.isbn, "9791162540640");
});

test("알라딘: 제목 : 부제 | 시리즈, 지은이·옮긴이 줄", () => {
  const r = parseBookPaste(["로그인", "스트레스 : 당신을 병들게 하는 스트레스의 모든 것  | 메디컬 사이언스 9",
    "로버트 M. 새폴스키 (지은이),이재담,이지윤 (옮긴이)사이언스북스2008-11-28원제 : Why Zebras Don't Get Ulcers", "760쪽, 153*224mm, 1290g", "ISBN : 9788983712325"].join("\n"));
  assert.equal(r.title, "스트레스");
  assert.equal(r.author, "로버트 M. 새폴스키");
  assert.equal(r.publisher, "사이언스북스");
  assert.equal(r.pages, 760);
  assert.equal(r.toc, "");
});

test("목차만 붙여 넣으면 들여쓰기와 쪽수를 그대로 둠, 상품 페이지가 아닌 웹 화면은 목차로 쓰지 않음", () => {
  const plain = "1부. 시작하기 ........ 9\n  1장. 왜 읽는가 ........ 11\n  2장. 무엇을 읽는가 ........ 27\n2부. 깊이 읽기 ........ 45";
  const r = parseBookPaste(plain);
  assert.equal(r.toc, plain);
  assert.deepEqual(r.found, ["toc"]);
  assert.equal(parseToc(r.toc)[1].p, 11);
  const web = parseBookPaste("로그인\n회원가입\n신상품순\n[도서] 닥터 골렘\nCopyright © YES24");
  assert.equal(web.toc, "");
  assert.deepEqual(web.found, []);
  assert.deepEqual(parseBookPaste("").found, []);
});

test("tidyToc: 표시 없는 평범한 목록은 손대지 않음", () => {
  assert.equal(tidyToc("서문\n첫째 이야기\n둘째 이야기"), "서문\n첫째 이야기\n둘째 이야기");
});

test("목차만 붙여 넣으면 장 아래 소제목·'|' 줄도 지우지 않음(서점 페이지에서만 소개 줄 정리)", () => {
  const plain = "1장 습관의 힘\n습관이란 무엇인가\n작은 변화\n2장 정체성\n정체성 기반 습관 | 질문\n3장 환경\n에필로그";
  const r = parseBookPaste(plain);
  assert.equal(parseToc(r.toc).length, 7);
  assert.equal(r.toc, plain);
});

test("목차 끝 줄의 'N쪽'을 책 전체 쪽수로 읽지 않음, 목차 쪽수로는 인식", () => {
  const plain = "프롤로그 ........ 7\n1장 시작 ........ 13\n2장 중간 ........ 45\n3장 끝 ........ 120쪽";
  const r = parseBookPaste(plain);
  assert.equal(r.pages, null);
  assert.deepEqual(r.found, ["toc"]);
  const items = parseToc(r.toc);
  assert.equal(items[3].t, "3장 끝");
  assert.equal(items[3].p, 120);
  assert.equal(parseToc("머리말 ....... p.5\n본문  12p")[0].p, 5);
  assert.equal(parseToc("머리말 ....... p.5\n본문  12p")[1].p, 12);
  // 숫자로 끝나는 평범한 제목은 그대로 둡니다.
  assert.equal(parseToc("1장 2026")[0].t, "1장 2026");
});
