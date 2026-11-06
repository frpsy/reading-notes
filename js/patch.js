// 화면 갱신: 책 상세에서 체크를 누를 때 화면 전체를 지우고 다시 만들면 휴대폰에서 버벅이므로,
// 새로 만든 HTML 과 직전 HTML 을 비교해 달라진 덩어리(챕터는 한 줄 단위)만 바꿉니다.
// 바뀌지 않은 부분은 그대로 두므로 펼침 상태·입력 중인 글·스크롤이 유지됩니다.
var prev = null, prevKey = null;

function sigOf(el) {
  // 서재 검색칸은 사용자가 입력 중이므로 통째로 바꾸지 않고(커서·IME 유지) 값만 맞춥니다.
  if (el.tagName === 'INPUT' && el.classList.contains('search')) return { input: true };
  if (el.classList.contains('chapters') || el.classList.contains('books')) return { kids: Array.from(el.children).map(function (k) { return k.outerHTML; }), keyed: el.classList.contains('books') };
  return { html: el.outerHTML };
}

// 책 목록(.books): 줄 수가 달라져도(검색·필터) 같은 책(href)의 줄은 그대로 두고 바뀐 줄만 새로 만듭니다.
function reconcileBooks(live, fresh, prevKids) {
  var old = Array.from(live.children), reuse = new Map();
  old.forEach(function (el, j) { reuse.set(el.getAttribute('href'), { el: el, html: prevKids[j] }); });
  var next = fresh.map(function (f) {
    var hit = reuse.get(f.getAttribute('href'));
    return hit && hit.html === f.outerHTML ? hit.el : f;
  });
  var same = next.length === old.length && next.every(function (el, j) { return el === old[j]; });
  if (!same) live.replaceChildren.apply(live, next);
}

export function resetPatch() { prev = null; prevKey = null; }

// 같은 key(같은 화면)일 때만 부분 갱신합니다. 구조가 달라지면 전체를 바꿉니다.
export function patchView(view, html, key) {
  var tpl = document.createElement('template');
  tpl.innerHTML = html;
  var nodes = Array.from(tpl.content.children);
  var sigs = nodes.map(sigOf);
  var ok = prev && prevKey === key && prev.length === sigs.length && view.children.length === sigs.length;
  if (ok) {
    for (var i = 0; i < sigs.length; i++) {
      var a = prev[i], b = sigs[i], cur = view.children[i];
      if (!!a.kids !== !!b.kids || !!a.input !== !!b.input || cur.tagName !== nodes[i].tagName) { ok = false; break; }
    }
  }
  if (!ok) {
    view.replaceChildren.apply(view, Array.from(tpl.content.childNodes));
    prev = sigs; prevKey = key;
    return false;
  }
  for (var n = 0; n < sigs.length; n++) {
    var pa = prev[n], pb = sigs[n], live = view.children[n];
    if (pb.input) {
      if (live.value !== nodes[n].value) live.value = nodes[n].value;
    } else if (pb.kids && pb.keyed) {
      reconcileBooks(live, Array.from(nodes[n].children), pa.kids);
    } else if (pb.kids) {
      if (pa.kids.length !== pb.kids.length || live.children.length !== pb.kids.length) { live.replaceWith(nodes[n]); continue; }
      // replaceWith 는 새 줄을 원래 목록에서 떼어 내므로, 번호가 밀리지 않게 미리 배열로 잡아 둡니다.
      var fresh = Array.from(nodes[n].children), old = Array.from(live.children);
      for (var j = 0; j < pb.kids.length; j++) if (pa.kids[j] !== pb.kids[j]) old[j].replaceWith(fresh[j]);
    } else if (pa.html !== pb.html) live.replaceWith(nodes[n]);
  }
  prev = sigs;
  return true;
}
