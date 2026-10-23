// 진입점 스텁: 이후 태스크에서 게임 루프로 교체된다.
const canvas = document.getElementById('game');
if (canvas instanceof HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  canvas.width = 288;
  canvas.height = 480;
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText('Bubble Puzzle', 90, 240);
  }
}
