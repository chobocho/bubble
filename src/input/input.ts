// 마우스·터치·키보드 입력을 논리 캔버스 좌표 기준의 프레임 단위 입력으로 정규화한다.
// 포인터를 놓은 위치(tap)를 발사로 볼지 버튼 클릭으로 볼지는 화면 상태를 아는 App 이 판단한다.
import type { Point } from '../core/board';
import { CANVAS_H, CANVAS_W, MAX_ANGLE, MIN_ANGLE, SHOOTER_X, SHOOTER_Y } from '../core/constants';

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FrameInput {
  /** 포인터가 조준 중일 때의 논리 좌표 (마우스는 hover, 터치는 누르고 있는 동안) */
  pointer?: Point;
  /** 키보드로 누르고 있는 조준 방향: +1 왼쪽, -1 오른쪽 */
  aimDelta: number;
  /** 이번 프레임에 새로 눌린 키 (KeyboardEvent.code, 자동 반복 제외) */
  keys: string[];
  /** 이번 프레임에 포인터를 놓은 위치들 */
  taps: Point[];
}

/** 발사대에서 포인터를 향하는 각도. 발사대 높이 이하에서는 좌/우 한계 각도로 고정해 갑자기 반대로 튀지 않게 한다. */
export function pointerToAngle(x: number, y: number): number {
  const dx = x - SHOOTER_X;
  const dy = SHOOTER_Y - y;
  if (dy <= 0) return dx > 0 ? MIN_ANGLE : dx < 0 ? MAX_ANGLE : Math.PI / 2;
  return Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, Math.atan2(dy, dx)));
}

export function clientToLogical(clientX: number, clientY: number, rect: RectLike): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_W,
    y: ((clientY - rect.top) / rect.height) * CANVAS_H,
  };
}

export function heldAimDelta(held: ReadonlySet<string>): number {
  return (held.has('ArrowLeft') ? 1 : 0) - (held.has('ArrowRight') ? 1 : 0);
}

/** 게임에서 쓰는 키 — 브라우저 기본 동작(스크롤 등)을 막는다 */
const CAPTURED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Escape', 'KeyP', 'KeyM', 'Tab']);

export class InputController {
  private readonly held = new Set<string>();
  private keys: string[] = [];
  private taps: Point[] = [];
  private pointer: Point | undefined;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat) this.keys.push(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    // 포커스를 잃으면 keyup 이 오지 않으므로 눌림 상태를 비운다
    window.addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pointer = this.toLogical(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // 일부 브라우저는 합성 이벤트에서 캡처를 거부한다 — 무시해도 동작에는 지장 없음
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      // 터치는 누르고 있는 동안에만 조준, 마우스는 hover 로도 조준
      if (e.pointerType === 'mouse' || e.buttons !== 0) this.pointer = this.toLogical(e);
    });
    canvas.addEventListener('pointerup', (e) => {
      const p = this.toLogical(e);
      this.taps.push(p);
      this.pointer = e.pointerType === 'mouse' ? p : undefined;
    });
    canvas.addEventListener('pointercancel', () => {
      this.pointer = undefined;
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.pointer = undefined;
    });
  }

  private toLogical(e: PointerEvent): Point {
    return clientToLogical(e.clientX, e.clientY, this.canvas.getBoundingClientRect());
  }

  /** 이번 프레임 입력을 꺼낸다. 엣지 입력(keys/taps)은 꺼내는 순간 비워진다. */
  poll(): FrameInput {
    const out: FrameInput = {
      pointer: this.pointer,
      aimDelta: heldAimDelta(this.held),
      keys: this.keys,
      taps: this.taps,
    };
    this.keys = [];
    this.taps = [];
    return out;
  }
}
