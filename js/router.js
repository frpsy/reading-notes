// 주소(해시)를 화면 종류로 바꿉니다. 주소 형식은 #/<앱>/<화면> 입니다(예: #/reading/book-abc).
// 예전 주소(#library, #book-… 등)는 #/reading/… 으로 자동으로 바꿔 줍니다.
import { todayStr } from "./core.js?v=15";

var APP_DEFAULT = "reading";

// 예전 주소이면 새 주소로 바꾸고 true 를 돌려줍니다. 바뀐 뒤 hashchange 에서 다시 그려집니다.
export function redirectLegacy() {
  var h = location.hash;
  if (h.indexOf("#/") === 0) return false;
  location.replace("#/" + APP_DEFAULT + "/" + (h.replace(/^#/, "") || "library"));
  return true;
}

export function currentRoute() {
  var p = location.hash.replace(/^#\/?/, "").split("/");
  var app = p.length > 1 ? p[0] : APP_DEFAULT;
  var h = p.length > 1 ? p.slice(1).join("/") : p[0];
  var r = screenOf(h);
  r.app = app;
  return r;
}

function screenOf(h) {
  var m;
  if (h === "add") return { name: "form", id: null };
  if ((m = /^edit-(.+)$/.exec(h))) return { name: "form", id: m[1] };
  if ((m = /^book-(.+)$/.exec(h))) return { name: "book", id: m[1] };
  if (h === "year") return { name: "year", year: todayStr().slice(0, 4) };
  if ((m = /^year-(\d{4})$/.exec(h))) return { name: "year", year: m[1] };
  return { name: "library" };
}
