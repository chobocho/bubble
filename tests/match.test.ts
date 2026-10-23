import { describe, expect, it } from 'vitest';
import { boardToRows, createBoard, isEmpty } from '../src/core/board';
import { findFloating, findGroup, resolveShot } from '../src/core/match';

const pos = (a: { row: number; col: number }[]) =>
  a.map((p) => `${p.row},${p.col}`).sort();

describe('findGroup', () => {
  it('정상: 같은 색 연결 그룹을 찾는다 (패리티가 다른 행에 걸친 체인)', () => {
    // (0,3) - (1,3) - (2,4) 는 짝/홀/짝 행에 걸친 대각 체인
    const b = createBoard(['GGGR.GGG', 'GGGRGGG', 'GGGGRGGG']);
    expect(pos(findGroup(b, 0, 3))).toEqual(['0,3', '1,3', '2,4']);
  });
  it('엣지: 빈 셀에서 시작하면 빈 그룹', () => {
    expect(findGroup(createBoard(['........']), 0, 0)).toEqual([]);
    expect(findGroup(createBoard([]), 5, 5)).toEqual([]);
  });
  it('엣지: 고립된 단일 셀', () => {
    expect(pos(findGroup(createBoard(['R.......']), 0, 0))).toEqual(['0,0']);
  });
});

describe('findFloating', () => {
  it('정상: 0행과 연결되지 않은 셀만 반환', () => {
    // (2,0) 은 (1,0) 이 비어서 떠 있다
    const b = createBoard(['RR......', '.R.....', 'B.......']);
    expect(pos(findFloating(b))).toEqual(['2,0']);
  });
  it('엣지: 빈 보드 / 가득 찬 보드는 떠 있는 셀 없음', () => {
    expect(findFloating(createBoard([]))).toEqual([]);
    const full = Array.from({ length: 13 }, (_, i) => (i % 2 ? 'RGBYPOC' : 'RGBYPOCW'));
    expect(findFloating(createBoard(full))).toEqual([]);
  });
});

describe('resolveShot', () => {
  it('정상: 같은 색 2개는 제거되지 않는다', () => {
    const b = createBoard(['RR......']);
    const r = resolveShot(b, 0, 1);
    expect(r.popped).toEqual([]);
    expect(r.dropped).toEqual([]);
    expect(boardToRows(b)).toEqual(['RR......']);
  });
  it('정상: 같은 색 3개는 제거되고 색 정보가 담긴다', () => {
    const b = createBoard(['RRRB....']);
    const r = resolveShot(b, 0, 2);
    expect(pos(r.popped)).toEqual(['0,0', '0,1', '0,2']);
    expect(r.popped.every((p) => p.color === 0)).toBe(true);
    expect(boardToRows(b)).toEqual(['...B....']);
  });
  it('정상: 지지대를 제거하면 매달린 덩어리가 떨어진다', () => {
    // 0행 R 3개 제거 → (1,0) 의 R 이 이어져 있어 4개 pop, 그 아래 BBG 는 지지를 잃고 낙하
    const b = createBoard([
      'RRR.....',
      'R......',
      'BB......',
      '.G.....',
    ]);
    const r = resolveShot(b, 1, 0);
    expect(pos(r.popped)).toEqual(['0,0', '0,1', '0,2', '1,0']);
    expect(pos(r.dropped)).toEqual(['2,0', '2,1', '3,1']);
    expect(r.dropped.find((d) => d.row === 3)?.color).toBe(1);
    expect(isEmpty(b)).toBe(true);
  });
  it('정상: 다른 경로로 천장에 붙은 셀은 떨어지지 않는다', () => {
    const b = createBoard([
      'RRR...BB',
      '.G....B',
      'GG....B.',
    ]);
    const r = resolveShot(b, 0, 0);
    expect(r.popped).toHaveLength(3);
    // G 덩어리는 (0,1)/(0,2) 에 붙어 있었으므로 낙하, B 열은 유지
    expect(pos(r.dropped)).toEqual(['1,1', '2,0', '2,1']);
    expect(boardToRows(b)).toEqual(['......BB', '......B', '......B.']);
  });
  it('엣지: 매칭이 없어도 떠 있는 셀은 정리된다', () => {
    const b = createBoard(['R.......', '.......', '.B......']);
    const r = resolveShot(b, 0, 0);
    expect(r.popped).toEqual([]);
    expect(pos(r.dropped)).toEqual(['2,1']);
  });
  it('엣지: 빈 셀을 기준으로 해결하면 아무 일도 없다', () => {
    const b = createBoard([]);
    expect(resolveShot(b, 0, 0)).toEqual({ popped: [], dropped: [] });
  });
  it('엣지: 가득 찬 단색 보드는 전부 제거된다', () => {
    const full = Array.from({ length: 13 }, (_, i) => (i % 2 ? 'BBBBBBB' : 'BBBBBBBB'));
    const b = createBoard(full);
    const r = resolveShot(b, 12, 4);
    expect(r.popped).toHaveLength(7 * 8 + 6 * 7);
    expect(r.dropped).toEqual([]);
    expect(isEmpty(b)).toBe(true);
  });
});
