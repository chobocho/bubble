import { describe, expect, it } from 'vitest';
import { CANVAS_H } from '../src/core/constants';
import { Effects } from '../src/render/effects';

const cells = (n: number) => Array.from({ length: n }, (_, i) => ({ row: 0, col: i % 8, color: 0 as const }));

describe('Effects', () => {
  it('정상: pop 이벤트는 파티클을 만들고 수명이 지나면 사라진다', () => {
    const fx = new Effects(1);
    fx.handle({ type: 'pop', cells: cells(3), ceilingOffset: 0 });
    expect(fx.count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 120; i++) fx.update(1 / 60);
    expect(fx.count).toBe(0);
  });
  it('정상: drop 이벤트의 버블은 아래로 떨어져 화면 밖에서 제거된다', () => {
    const fx = new Effects(1);
    fx.handle({ type: 'drop', cells: cells(2), ceilingOffset: 2 });
    expect(fx.count).toBe(2);
    fx.update(0.05);
    expect(fx.count).toBe(2);
    for (let i = 0; i < 600 && fx.count > 0; i++) fx.update(1 / 60);
    expect(fx.count).toBe(0);
    expect(fx.lowestY).toBeLessThanOrEqual(CANVAS_H + 64);
  });
  it('엣지: 관련 없는 이벤트·빈 셀 목록은 파티클을 만들지 않는다', () => {
    const fx = new Effects(1);
    fx.handle({ type: 'fire' });
    fx.handle({ type: 'pop', cells: [], ceilingOffset: 0 });
    fx.handle({ type: 'drop', cells: [], ceilingOffset: 0 });
    expect(fx.count).toBe(0);
  });
  it('엣지: clear 는 모든 효과를 지운다', () => {
    const fx = new Effects(1);
    fx.handle({ type: 'pop', cells: cells(5), ceilingOffset: 0 });
    fx.handle({ type: 'ceiling' });
    fx.clear();
    expect(fx.count).toBe(0);
    expect(fx.shakeOffset(1.234, false)).toBe(0);
  });
  it('정상: 경고 중에는 흔들림이 있고 진폭은 제한된다', () => {
    const fx = new Effects(1);
    expect(fx.shakeOffset(0.5, false)).toBe(0);
    let maxAbs = 0;
    for (let t = 0; t < 2; t += 0.01) maxAbs = Math.max(maxAbs, Math.abs(fx.shakeOffset(t, true)));
    expect(maxAbs).toBeGreaterThan(0.5);
    expect(maxAbs).toBeLessThanOrEqual(3);
  });
  it('정상: 천장 하강 직후 강한 흔들림이 시간에 따라 감쇠한다', () => {
    const fx = new Effects(1);
    fx.handle({ type: 'ceiling' });
    const early = Math.max(...[0.01, 0.02, 0.03, 0.04].map((t) => Math.abs(fx.shakeOffset(t, false))));
    expect(early).toBeGreaterThan(1);
    for (let i = 0; i < 60; i++) fx.update(1 / 60);
    expect(fx.shakeOffset(5.01, false)).toBe(0);
  });
  it('엣지: 같은 시드는 같은 파티클 배치', () => {
    const a = new Effects(42);
    const b = new Effects(42);
    a.handle({ type: 'pop', cells: cells(4), ceilingOffset: 0 });
    b.handle({ type: 'pop', cells: cells(4), ceilingOffset: 0 });
    a.update(0.1);
    b.update(0.1);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});
