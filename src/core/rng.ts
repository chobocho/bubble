// 시드 기반 의사난수 생성기. 스테이지 생성과 발사 색 선택을 재현 가능하게 만들어 테스트를 결정적으로 유지한다.

/** [0, 1) 범위 실수를 반환하는 생성기 */
export type Rng = () => number;

/** mulberry32: 32비트 상태 하나로 충분히 고른 분포를 내는 작고 빠른 PRNG. 호출당 O(1). */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [0, n) 정수 */
export function randInt(rng: Rng, n: number): number {
  if (!(n >= 1)) throw new Error(`randInt: n 은 1 이상이어야 합니다 (${n})`);
  return Math.floor(rng() * Math.floor(n));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: 빈 배열');
  return arr[randInt(rng, arr.length)];
}

/** 스테이지 시드. 골든 비율 상수를 곱해 인접 id 의 시드가 비트 수준에서 멀리 떨어지게 한다. */
export function stageSeed(stageId: number): number {
  return (stageId * 2654435761) >>> 0;
}
