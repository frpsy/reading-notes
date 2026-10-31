// 화면 갱신: 책 상세에서 체크를 누를 때 화면 전체를 지우고 다시 만들면 휴대폰에서 버벅이므로,
// 새로 만든 HTML 과 직전 HTML 을 비교해 달라진 덩어리(챕터는 한 줄 단위)만 바꿉니다.
// 바뀌지 않은 부분은 그대로 두므로 펼침 상태·입력 중인 글·스크롤이 유지됩니다.
var prev = null, prevKey = null;

function sigOf(el) {
  if (el.classList.contains('chapters')) return { kids: Array.from(el.children).map(function (k) { return k.outerHTML; }) };
  return { html: el.outerHTML };
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
      if (!!a.kids !== !!b.kids || cur.tagName !== nodes[i].tagName) { ok = false; break; }
    }
  }
  if (!ok) {
    view.replaceChildren.apply(view, Array.from(tpl.content.childNodes));
    prev = sigs; prevKey = key;
    return false;
  }
  for (var n = 0; n < sigs.length; n++) {
    var pa = prev[n], pb = sigs[n], live = view.children[n];
    if (pb.kids) {
      if (pa.kids.length !== pb.kids.length || live.children.length !== pb.kids.length) { live.replaceWith(nodes[n]); continue; }
      for (var j = 0; j < pb.kids.length; j++) if (pa.kids[j] !== pb.kids[j]) live.children[j].replaceWith(nodes[n].children[j]);
    } else if (pa.html !== pb.html) live.replaceWith(nodes[n]);
  }
  prev = sigs;
  return true;
}
