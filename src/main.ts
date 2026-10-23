// 진입점: 캔버스·입력·저장소·화면 상태를 연결하고 고정 스텝 루프를 돌린다.
import { type AudioContextLike, Sfx, type SfxName } from './audio/sfx';
import { STEP } from './core/constants';
import type { GameEvent } from './core/game';
import { type FrameInput, InputController } from './input/input';
import { Effects } from './render/effects';
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
const effects = new Effects(Date.now() >>> 0);

// 구형 Safari 는 webkitAudioContext 만 제공한다
type AudioCtor = new () => AudioContextLike;
const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
const sfx = new Sfx(() => {
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
});
sfx.muted = progress.get().muted;
// 자동재생 정책: 첫 사용자 제스처 안에서 AudioContext 를 만들거나 resume 해야 소리가 난다
const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

const EVENT_SFX: Record<GameEvent['type'], SfxName> = {
  fire: 'fire',
  bounce: 'bounce',
  stick: 'stick',
  pop: 'pop',
  drop: 'drop',
  ceiling: 'ceiling',
  clear: 'clear',
  gameover: 'gameover',
};

const app = new App(progress, STAGES, {
  onGameEvent(e) {
    sfx.play(EVENT_SFX[e.type]);
    effects.handle(e);
  },
  onUiClick: () => sfx.play('bounce'),
  onMuteChange(muted) {
    sfx.muted = muted;
  },
  onStageStart: () => effects.clear(),
  drawEffects: (r) => effects.draw(r),
  shakeOffset: (time, warning) => effects.shakeOffset(time, warning),
});

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
      effects.update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  }
  app.draw(renderer);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
