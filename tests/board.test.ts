import { describe, expect, it } from 'vitest';
import {
  boardToRows,
  cellToPixel,
  colorsPresent,
  createBoard,
  getCell,
  isEmpty,
  isValidCell,
  neighbors,
  pixelToNearestCell,
  rowLength,
  setCell,
} from '../src/core/board';
import { BOARD_LEFT, BOARD_TOP, MAX_ROWS, R, ROW_H } from '../src/core/constants';

const sortPos = (a: { row: number; col: number }[]) =>
  [...a].sort((p, q) => p.row - q.row || p.col - q.col);

describe('rowLength / isValidCell', () => {
  it('정상: 짝수 행 8칸, 홀수 행 7칸', () => {
    expect(rowLength(0)).toBe(8);
    expect(rowLength(1)).toBe(7);
    expect(rowLength(12)).toBe(8);
  });
  it('엣지: 범위 밖 셀은 거부한다', () => {
    expect(isValidCell(0, 0)).toBe(true);
    expect(isValidCell(0, 7)).toBe(true);
    expect(isValidCell(1, 6)).toBe(true);
    expect(isValidCell(1, 7)).toBe(false);
    expect(isValidCell(0, 8)).toBe(false);
    expect(isValidCell(-1, 0)).toBe(false);
    expect(isValidCell(0, -1)).toBe(false);
    expect(isValidCell(MAX_ROWS - 1, 0)).toBe(true);
    expect(isValidCell(MAX_ROWS, 0)).toBe(false);
    expect(isValidCell(0.5, 0)).toBe(false);
  });
});

describe('neighbors', () => {
  it('정상: 짝수 행 내부 셀은 6개 이웃', () => {
    expect(sortPos(neighbors(2, 3))).toEqual(
      sortPos([
        { row: 1, col: 2 }, { row: 1, col: 3 },
        { row: 2, col: 2 }, { row: 2, col: 4 },
        { row: 3, col: 2 }, { row: 3, col: 3 },
      ]),
    );
  });
  it('정상: 홀수 행 내부 셀은 6개 이웃', () => {
    expect(sortPos(neighbors(1, 3))).toEqual(
      sortPos([
        { row: 0, col: 3 }, { row: 0, col: 4 },
        { row: 1, col: 2 }, { row: 1, col: 4 },
        { row: 2, col: 3 }, { row: 2, col: 4 },
      ]),
    );
  });
  it('엣지: 좌상단 모서리 (0,0)', () => {
    expect(sortPos(neighbors(0, 0))).toEqual([{ row: 0, col: 1 }, { row: 1, col: 0 }]);
  });
  it('엣지: 우상단 모서리 (0,7)', () => {
    expect(sortPos(neighbors(0, 7))).toEqual([{ row: 0, col: 6 }, { row: 1, col: 6 }]);
  });
  it('엣지: 짝수 행 좌측 벽 (2,0)', () => {
    expect(sortPos(neighbors(2, 0))).toEqual([
      { row: 1, col: 0 }, { row: 2, col: 1 }, { row: 3, col: 0 },
    ]);
  });
  it('엣지: 홀수 행 우측 벽 (1,6)', () => {
    expect(sortPos(neighbors(1, 6))).toEqual(
      sortPos([
        { row: 0, col: 6 }, { row: 0, col: 7 }, { row: 1, col: 5 },
        { row: 2, col: 6 }, { row: 2, col: 7 },
      ]),
    );
  });
  it('엣지: 마지막 행은 아래 이웃이 없다', () => {
    const last = MAX_ROWS - 1;
    expect(neighbors(last, 3).every((p) => p.row < MAX_ROWS)).toBe(true);
    expect(neighbors(last, 3)).toHaveLength(4);
  });
  it('엣지: 이웃 관계는 대칭이다', () => {
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < rowLength(r); c++) {
        for (const n of neighbors(r, c)) {
          expect(neighbors(n.row, n.col)).toContainEqual({ row: r, col: c });
        }
      }
    }
  });
});

describe('cellToPixel / pixelToNearestCell', () => {
  it('정상: 셀 중심 좌표 공식', () => {
    expect(cellToPixel(0, 0)).toEqual({ x: BOARD_LEFT + R, y: BOARD_TOP + R });
    const p = cellToPixel(1, 0);
    expect(p.x).toBe(BOARD_LEFT + 2 * R);
    expect(p.y).toBeCloseTo(BOARD_TOP + R + ROW_H);
    expect(cellToPixel(0, 0, 2).y).toBeCloseTo(BOARD_TOP + 2 * ROW_H + R);
  });
  it('정상: 모든 유효 셀에서 왕복 변환이 일치한다 (천장 오프셋 포함)', () => {
    for (const off of [0, 3]) {
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < rowLength(r); c++) {
          const { x, y } = cellToPixel(r, c, off);
          expect(pixelToNearestCell(x, y, off)).toEqual({ row: r, col: c });
          // 반지름 안쪽 약간 어긋난 좌표도 같은 셀로 스냅
          expect(pixelToNearestCell(x + R * 0.4, y - R * 0.4, off)).toEqual({ row: r, col: c });
        }
      }
    }
  });
  it('엣지: 보드 밖 좌표는 가장 가까운 열로 클램프', () => {
    expect(pixelToNearestCell(-100, BOARD_TOP + R)).toEqual({ row: 0, col: 0 });
    expect(pixelToNearestCell(1000, BOARD_TOP + R)).toEqual({ row: 0, col: 7 });
    expect(pixelToNearestCell(BOARD_LEFT + R, -50)).toEqual({ row: 0, col: 0 });
  });
  it('엣지: 그리드 아래 좌표는 MAX_ROWS 이상의 행을 돌려준다', () => {
    const y = BOARD_TOP + R + MAX_ROWS * ROW_H;
    expect(pixelToNearestCell(BOARD_LEFT + R, y).row).toBe(MAX_ROWS);
  });
});

describe('createBoard / getCell / setCell', () => {
  it('정상: 문자열 행을 파싱한다', () => {
    const b = createBoard(['RGBYPOCW', 'R.....G']);
    expect(b.ceilingOffset).toBe(0);
    expect(b.cells).toHaveLength(MAX_ROWS);
    expect(b.cells[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(b.cells[1]).toEqual([0, null, null, null, null, null, 1]);
    expect(b.cells[2]).toHaveLength(8);
    expect(b.cells[3]).toHaveLength(7);
    expect(getCell(b, 1, 6)).toBe(1);
    expect(boardToRows(b)).toEqual(['RGBYPOCW', 'R.....G']);
  });
  it('엣지: 빈 입력은 빈 보드', () => {
    const b = createBoard([]);
    expect(isEmpty(b)).toBe(true);
    expect(colorsPresent(b).size).toBe(0);
    expect(boardToRows(b)).toEqual([]);
  });
  it('엣지: 잘못된 문자/길이/행 수는 예외', () => {
    expect(() => createBoard(['RGBXPOCW'])).toThrow();
    expect(() => createBoard(['RGB'])).toThrow();
    expect(() => createBoard(['RGBYPOCW', 'RGBYPOCW'])).toThrow();
    expect(() => createBoard(Array.from({ length: MAX_ROWS + 1 }, (_, i) => (i % 2 ? '.......' : '........')))).toThrow();
  });
  it('엣지: 범위 밖 getCell 은 null, setCell 은 예외', () => {
    const b = createBoard(['R.......']);
    expect(getCell(b, -1, 0)).toBeNull();
    expect(getCell(b, 1, 7)).toBeNull();
    expect(() => setCell(b, 1, 7, 0)).toThrow();
    setCell(b, 0, 0, null);
    expect(isEmpty(b)).toBe(true);
    setCell(b, 5, 2, 3);
    expect(isEmpty(b)).toBe(false);
    expect(colorsPresent(b)).toEqual(new Set([3]));
  });
  it('정상: colorsPresent 는 존재하는 색만 모은다', () => {
    const b = createBoard(['RR..BB..', '.......', '....Y...']);
    expect(colorsPresent(b)).toEqual(new Set([0, 2, 3]));
  });
  it('정상: boardToRows 는 끝의 빈 행을 잘라낸다', () => {
    const b = createBoard(['R.......', '.......', '........']);
    expect(boardToRows(b)).toEqual(['R.......']);
  });
});
