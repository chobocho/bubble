import { describe, expect, it } from 'vitest';
import { createBoard, isEmpty, rowLength } from '../src/core/board';
import { DEADLINE_ROW } from '../src/core/constants';
import { findFloating } from '../src/core/match';
import { HANDMADE } from '../src/stages/handmade';
import { buildStages, generateStages, PATTERNS, stageParams } from '../src/stages/generator';
import { STAGES } from '../src/stages/index';
import type { StageDef } from '../src/stages/types';

// plan.md §4.3 난이도 표 (world 1..10)
const TABLE = [
  { colors: 3, lo: 4, hi: 5, drop: 10 },
  { colors: 4, lo: 5, hi: 6, drop: 9 },
  { colors: 4, lo: 5, hi: 6, drop: 9 },
  { colors: 5, lo: 6, hi: 7, drop: 8 },
  { colors: 5, lo: 6, hi: 7, drop: 8 },
  { colors: 6, lo: 7, hi: 8, drop: 7 },
  { colors: 6, lo: 7, hi: 8, drop: 7 },
  { colors: 7, lo: 8, hi: 8, drop: 6 },
  { colors: 7, lo: 8, hi: 9, drop: 6 },
  { colors: 8, lo: 9, hi: 9, drop: 5 },
];

function colorCounts(s: StageDef): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of s.rows) for (const ch of row) if (ch !== '.') m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

describe('STAGES 구성', () => {
  it('정상: 정확히 200개, id 1..200 연속', () => {
    expect(STAGES).toHaveLength(200);
    STAGES.forEach((s, i) => expect(s.id).toBe(i + 1));
  });
  it('정상: 1~10 은 수제 스테이지', () => {
    expect(HANDMADE).toHaveLength(10);
    expect(STAGES.slice(0, 10)).toEqual(HANDMADE);
  });
  it('정상: 커밋된 stages.json 은 생성기 출력과 같다 (드리프트 방지)', () => {
    expect(buildStages()).toEqual(STAGES);
  });
  it('정상: 생성은 결정적이다', () => {
    expect(generateStages()).toEqual(generateStages());
  });
});

describe('§4.5 검증 규칙 (전 스테이지)', () => {
  for (const s of STAGES) {
    it(`stage ${s.id}`, () => {
      // 형식: 짝수 행 8자, 홀수 행 7자, 허용 문자만
      s.rows.forEach((row, r) => {
        expect(row).toHaveLength(rowLength(r));
        expect(row).toMatch(/^[RGBYPOCW.]+$/);
      });
      const board = createBoard(s.rows);
      // 6. 비어 있지 않음
      expect(isEmpty(board)).toBe(false);
      // 1. 떠 있는 셀 없음
      expect(findFloating(board)).toEqual([]);
      // 2. 정확히 colors 종류, 각 3개 이상
      const counts = colorCounts(s);
      expect(counts.size).toBe(s.colors);
      for (const n of counts.values()) expect(n).toBeGreaterThanOrEqual(3);
      // 3. 시작 시 3행 이상 여유
      expect(s.rows.length).toBeLessThanOrEqual(DEADLINE_ROW - 3);
      // 4. 0행 3개 이상
      expect([...s.rows[0]].filter((c) => c !== '.').length).toBeGreaterThanOrEqual(3);
      // 마지막 행이 비어 있지 않아야 rows.length 가 실제 초기 행 수와 일치한다
      expect(s.rows[s.rows.length - 1]).toMatch(/[^.]/);
    });
  }
  it('5. 서로 같은 rows 를 가진 스테이지가 없다', () => {
    const keys = new Set(STAGES.map((s) => s.rows.join('/')));
    expect(keys.size).toBe(STAGES.length);
  });
});

describe('§4.3 난이도 곡선', () => {
  it('정상: world/colors/dropInterval/행 수 범위가 표와 일치', () => {
    for (const s of STAGES) {
      const w = Math.ceil(s.id / 20);
      const t = TABLE[w - 1];
      const boss = s.id % 20 === 0;
      expect(s.world).toBe(w);
      expect(s.colors).toBe(t.colors);
      expect(s.dropInterval).toBe(boss ? t.drop - 1 : t.drop);
      expect(s.rows.length).toBeGreaterThanOrEqual(t.lo);
      expect(s.rows.length).toBeLessThanOrEqual(t.hi);
      if (boss) expect(s.rows.length).toBe(t.hi);
    }
  });
  it('정상: 월드 내 행 수는 감소하지 않는다 (생성 스테이지)', () => {
    for (const s of STAGES) {
      if (s.id <= 10 || s.id % 20 === 1) continue;
      expect(s.rows.length).toBeGreaterThanOrEqual(STAGES[s.id - 2].rows.length);
    }
  });
  it('엣지: stageParams 경계 (1, 20, 21, 200)', () => {
    expect(stageParams(1)).toMatchObject({ world: 1, colors: 3, rows: 4, dropInterval: 10 });
    expect(stageParams(20)).toMatchObject({ world: 1, colors: 3, rows: 5, dropInterval: 9 });
    expect(stageParams(21)).toMatchObject({ world: 2, colors: 4, rows: 5, dropInterval: 9 });
    expect(stageParams(200)).toMatchObject({ world: 10, colors: 8, rows: 9, dropInterval: 4 });
    expect(() => stageParams(0)).toThrow();
    expect(() => stageParams(201)).toThrow();
  });
});

describe('생성 패턴', () => {
  it('정상: 같은 패턴이 연속으로 나오지 않고, 모든 패턴이 쓰인다', () => {
    const gen = generateStages();
    expect(gen.map((g) => g.stage.id)).toEqual(Array.from({ length: 190 }, (_, i) => i + 11));
    for (let i = 1; i < gen.length; i++) expect(gen[i].pattern).not.toBe(gen[i - 1].pattern);
    expect(new Set(gen.map((g) => g.pattern))).toEqual(new Set(PATTERNS));
  });
});
