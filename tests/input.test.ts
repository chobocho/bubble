import { describe, expect, it } from 'vitest';
import { CANVAS_H, CANVAS_W, MAX_ANGLE, MIN_ANGLE, SHOOTER_X, SHOOTER_Y } from '../src/core/constants';
import { clientToLogical, heldAimDelta, pointerToAngle } from '../src/input/input';

describe('pointerToAngle', () => {
  it('정상: 발사대 바로 위는 90°, 좌상단은 90° 초과', () => {
    expect(pointerToAngle(SHOOTER_X, 100)).toBeCloseTo(Math.PI / 2);
    expect(pointerToAngle(SHOOTER_X - 100, SHOOTER_Y - 100)).toBeCloseTo((3 * Math.PI) / 4);
    expect(pointerToAngle(SHOOTER_X + 100, SHOOTER_Y - 100)).toBeCloseTo(Math.PI / 4);
  });
  it('엣지: 발사대 높이 이하에서는 좌우에 따라 한계 각도로 고정', () => {
    expect(pointerToAngle(SHOOTER_X + 50, SHOOTER_Y)).toBeCloseTo(MIN_ANGLE);
    expect(pointerToAngle(SHOOTER_X + 50, SHOOTER_Y + 30)).toBeCloseTo(MIN_ANGLE);
    expect(pointerToAngle(SHOOTER_X - 50, SHOOTER_Y + 30)).toBeCloseTo(MAX_ANGLE);
    expect(pointerToAngle(SHOOTER_X, SHOOTER_Y + 30)).toBeCloseTo(Math.PI / 2);
  });
});

describe('clientToLogical', () => {
  it('정상: 스케일된 캔버스 좌표를 논리 좌표로 변환', () => {
    const rect = { left: 10, top: 20, width: CANVAS_W * 2, height: CANVAS_H * 2 };
    expect(clientToLogical(10, 20, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToLogical(10 + CANVAS_W, 20 + CANVAS_H, rect)).toEqual({ x: CANVAS_W / 2, y: CANVAS_H / 2 });
  });
  it('엣지: 크기 0 인 rect 는 원점', () => {
    expect(clientToLogical(50, 50, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('heldAimDelta', () => {
  it('정상: ← 는 +1(왼쪽 회전), → 는 -1, 동시 입력은 0', () => {
    expect(heldAimDelta(new Set(['ArrowLeft']))).toBe(1);
    expect(heldAimDelta(new Set(['ArrowRight']))).toBe(-1);
    expect(heldAimDelta(new Set(['ArrowLeft', 'ArrowRight']))).toBe(0);
    expect(heldAimDelta(new Set())).toBe(0);
  });
});
