// 앱 목록과 아래 탭 바. 새 앱은 APPS 에 한 줄을 추가합니다(id 는 주소 앞부분 #/<id>/ 와 같아야 합니다).
export var APPS = [
  { id: "reading", name: "독서", home: "#/reading/library" },
];

export function tabBarHtml(active) {
  return '<nav class="appbar" aria-label="앱 선택"><div class="appbar-in">' +
    APPS.map(function (a) {
      return '<a class="appbtn" href="' + a.home + '"' + (a.id === active ? ' aria-current="page"' : '') + '>' + a.name + '</a>';
    }).join("") + '</div></nav>';
}
