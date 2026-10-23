import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randInt, stageSeed } from '../src/core/rng';

describe('mulberry32', () => {
  it('정상: 참조 구현과 동일한 값을 낸다', () => {
    const g = mulberry32(42);
    expect([g(), g(), g()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
    expect(mulberry32(0)()).toBe(0.26642920868471265);
  });
  it('정상: 같은 시드는 같은 수열', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('정상: 값은 [0, 1) 범위', () => {
    const g = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = g();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('엣지: 서로 다른 시드는 갈라진다', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const sa = Array.from({ length: 10 }, a);
    const sb = Array.from({ length: 10 }, b);
    expect(sa).not.toEqual(sb);
  });
  it('엣지: 32비트 초과/음수 시드도 결정적으로 동작한다', () => {
    expect(mulberry32(2 ** 32 + 5)()).toBe(mulberry32(5)());
    const v = mulberry32(-1)();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe('randInt / pick / stageSeed', () => {
  it('정상: randInt 는 [0, n) 정수를 고르게 낸다', () => {
    const g = mulberry32(99);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[randInt(g, 3)]++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
  it('엣지: randInt(n<=0) 은 예외', () => {
    const g = mulberry32(1);
    expect(() => randInt(g, 0)).toThrow();
    expect(() => randInt(g, -2)).toThrow();
    expect(randInt(g, 1)).toBe(0);
  });
  it('엣지: 빈 배열 pick 은 예외', () => {
    expect(() => pick(mulberry32(1), [])).toThrow();
    expect(pick(mulberry32(1), ['a'])).toBe('a');
  });
  it('정상: stageSeed 는 plan 공식(id * 2654435761 >>> 0)', () => {
    expect(stageSeed(1)).toBe(2654435761);
    expect(stageSeed(200)).toBe((200 * 2654435761) >>> 0);
    expect(new Set(Array.from({ length: 200 }, (_, i) => stageSeed(i + 1))).size).toBe(200);
  });
});
