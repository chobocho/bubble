// 브라우저 없이 UI 경로를 실행해 보는 스모크 테스트.
// 캔버스 2D 컨텍스트를 아무 호출이나 받아 주는 가짜로 바꿔, 렌더링/화면 전환 코드의 런타임 오류와 상태 전이를 검증한다.
import { beforeAll, describe, expect, it } from 'vitest';
import type { FrameInput } from '../src/input/input';
import type { Renderer as RendererT } from '../src/render/renderer';
import { STAGES } from '../src/stages/index';
import { type KeyValueStorage, ProgressStore } from '../src/storage/progress';
import type { App as AppT } from '../src/ui/screens';

function fakeCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
function fakeCanvas(): HTMLCanvasElement {
  return { width: 0, height: 0, style: {}, getContext: () => fakeCtx() } as unknown as HTMLCanvasElement;
}

let Renderer: typeof RendererT;
let App: typeof AppT;

beforeAll(async () => {
  Object.assign(globalThis, {
    window: { innerWidth: 360, innerHeight: 640, devicePixelRatio: 2 },
    document: { createElement: () => fakeCanvas() },
  });
  ({ Renderer } = await import('../src/render/renderer'));
  ({ App } = await import('../src/ui/screens'));
});

class Mem implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const none: FrameInput = { aimDelta: 0, keys: [], taps: [] };
const keys = (...k: string[]): FrameInput => ({ ...none, keys: k });
const tap = (x: number, y: number): FrameInput => ({ ...none, taps: [{ x, y }] });

function setup() {
  const store = new ProgressStore(() => new Mem());
  const app = new App(store, STAGES);
  const r = new Renderer(fakeCanvas());
  const step = (input: FrameInput = none) => {
    app.update(1 / 120, input);
    app.draw(r);
  };
  return { app, store, step };
}

describe('App 스모크', () => {
  it('정상: 타이틀 → 선택 → 플레이 → 일시정지/재개 → 선택 화면 복귀', () => {
    const { app, step } = setup();
    step();
    expect(app.screen).toBe('title');
    step(keys('Enter'));
    expect(app.screen).toBe('select');
    step(keys('Enter'));
    expect(app.screen).toBe('playing');
    expect(app.game?.stage.id).toBe(1);
    step(keys('KeyP'));
    expect(app.game?.paused).toBe(true);
    step();
    step(keys('KeyP'));
    expect(app.game?.paused).toBe(false);
    app.autoPause();
    expect(app.game?.paused).toBe(true);
    step(tap(144, 236 + 2 * 44 + 10)); // STAGES 버튼
    expect(app.screen).toBe('select');
  });

  it('정상: 스테이지 1 을 끝까지 플레이하면 클리어 또는 게임오버 오버레이가 그려진다', () => {
    const { app, store, step } = setup();
    step(keys('Enter'));
    step(keys('Enter'));
    const g = app.game;
    expect(g).not.toBeNull();
    // 각도를 바꿔 가며 계속 발사 (마우스 탭)
    for (let i = 0; i < 20_000 && g && (g.phase !== 'cleared' && g.phase !== 'gameOver'); i++) {
      const x = 40 + ((i * 37) % 210);
      step(i % 30 === 0 ? tap(x, 120) : none);
    }
    expect(['cleared', 'gameOver']).toContain(g?.phase);
    step();
    step();
    if (g?.phase === 'cleared') {
      expect(store.get().unlocked).toBe(2);
      expect(store.get().best[1]).toBe(g.score);
      step(keys('Enter'));
      expect(app.game?.stage.id).toBe(2);
    } else {
      step(keys('Enter'));
      expect(app.game?.stage.id).toBe(1);
      expect(app.game?.phase).toBe('aiming');
    }
  });

  it('엣지: 잠긴 스테이지는 탭/Enter 로 시작할 수 없다', () => {
    const { app, step } = setup();
    step(keys('Enter'));
    step(keys('ArrowRight'));
    expect(app.cursor).toBe(2);
    step(keys('Enter'));
    expect(app.screen).toBe('select');
    step(tap(16 + 66 + 10, 128 + 10)); // 스테이지 2 버튼
    expect(app.screen).toBe('select');
  });

  it('엣지: 월드 탭·커서 이동·음소거 토글', () => {
    const { app, store, step } = setup();
    step(keys('Enter'));
    step(tap(16 + 2 * 52 + 5, 52 + 5)); // W3
    expect(app.world).toBe(3);
    expect(app.cursor).toBe(41);
    step(keys('ArrowUp'));
    expect(app.cursor).toBe(37);
    expect(app.world).toBe(2);
    step(keys('PageDown'));
    expect(app.cursor).toBe(41);
    step(keys('KeyM'));
    expect(store.get().muted).toBe(true);
    step(keys('Escape'));
    expect(app.screen).toBe('title');
  });

  it('정상: 월드 6 이상(조준선 첫 구간만)과 마지막 스테이지도 그려진다', () => {
    const store = new ProgressStore(() => new Mem());
    for (let id = 1; id < 200; id++) store.recordClear(id, 1);
    const app = new App(store, STAGES);
    const r = new Renderer(fakeCanvas());
    expect(app.cursor).toBe(200);
    app.update(1 / 120, keys('Enter'));
    app.update(1 / 120, keys('Enter'));
    expect(app.game?.stage.id).toBe(200);
    for (let i = 0; i < 10; i++) {
      app.update(1 / 120, i === 0 ? tap(100, 100) : none);
      app.draw(r);
    }
  });
});
