// 주소(해시)를 화면 종류로 바꿉니다.
import { todayStr } from "./core.js?v=27";

export function currentRoute() {
  var h = location.hash.replace(/^#/, ""), m;
  if (h === "add") return { name: "form", id: null };
  if ((m = /^edit-(.+)$/.exec(h))) return { name: "form", id: m[1] };
  if ((m = /^book-(.+)$/.exec(h))) return { name: "book", id: m[1] };
  if (h === "year") return { name: "year", year: todayStr().slice(0, 4) };
  if ((m = /^year-(\d{4})$/.exec(h))) return { name: "year", year: m[1] };
  return { name: "library" };
}
