// 진입점: 캔버스·입력·저장소·화면 상태를 연결하고 고정 스텝 루프를 돌린다.
import { STEP } from './core/constants';
import { type FrameInput, InputController } from './input/input';
import { Renderer } from './render/renderer';
import { STAGES } from './stages/index';
import { ProgressStore } from './storage/progress';
import { App } from './ui/screens';

/** 한 프레임에 처리할 최대 시뮬레이션 스텝. 탭이 오래 멈췄다 돌아와도 따라잡기 폭주를 막는다. */
const MAX_STEPS_PER_FRAME = 5;

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game 캔버스가 없습니다');

const renderer = new Renderer(canvas);
const input = new InputController(canvas);
const progress = new ProgressStore(() => window.localStorage);
const app = new App(progress, STAGES);

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.autoPause();
  last = performance.now();
});

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  acc += Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  // 스텝이 실제로 돌 때만 입력을 꺼낸다 — 그렇지 않으면 고주사율 화면에서 탭/키 엣지가 사라질 수 있다
  if (acc >= STEP) {
    const first = input.poll();
    // 엣지 입력(키·탭)은 첫 스텝에만 전달하고, 이후 스텝은 지속 입력(조준)만 받는다
    const rest: FrameInput = { pointer: first.pointer, aimDelta: first.aimDelta, keys: [], taps: [] };
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      app.update(STEP, steps === 0 ? first : rest);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  }
  app.draw(renderer);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
