// 다시 그리기 연결입니다. app.js 가 그리기 함수를 등록하고, 다른 모듈은 render() 만 부릅니다.
var renderer = function () {};
export function setRenderer(fn) { renderer = fn; }
export function render() { renderer(); }
