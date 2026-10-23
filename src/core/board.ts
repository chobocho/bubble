// 육각 그리드 보드 모델. DOM 에 의존하지 않는 순수 함수만 둔다 (단위 테스트 대상).
// 좌표계: 홀수 행이 오른쪽으로 반 칸 밀린 offset 좌표. 천장이 내려와도 행 패리티는 바뀌지 않는다.
import { BOARD_LEFT, BOARD_TOP, COLOR_CHARS, COLS, MAX_ROWS, R, ROW_H } from './constants';

export type Color = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Cell = Color | null;
export interface Board {
  /** cells[row][col], 짝수 행 8칸 / 홀수 행 7칸의 들쭉날쭉한 배열, MAX_ROWS 행 */
  cells: Cell[][];
  /** 천장이 내려온 행 수 */
  ceilingOffset: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface CellPos {
  row: number;
  col: number;
}

export function rowLength(row: number): number {
  return row % 2 === 0 ? COLS : COLS - 1;
}

export function isValidCell(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < MAX_ROWS &&
    col >= 0 &&
    col < rowLength(row)
  );
}

// 짝수 행은 위/아래 행에서 (c-1, c), 홀수 행은 (c, c+1) 이 대각 이웃이다.
const EVEN_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0],
];
const ODD_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1],
];

export function neighbors(row: number, col: number): CellPos[] {
  const deltas = row % 2 === 0 ? EVEN_DELTAS : ODD_DELTAS;
  const out: CellPos[] = [];
  for (const [dr, dc] of deltas) {
    const r = row + dr;
    const c = col + dc;
    if (isValidCell(r, c)) out.push({ row: r, col: c });
  }
  return out;
}

export function cellToPixel(row: number, col: number, ceilingOffset = 0): Point {
  return {
    x: BOARD_LEFT + R + col * 2 * R + (row % 2 === 1 ? R : 0),
    y: BOARD_TOP + ceilingOffset * ROW_H + R + row * ROW_H,
  };
}

/**
 * 픽셀 좌표에 가장 가까운 셀 중심을 찾는다. 열은 행 길이로 클램프하고, 행은 0 미만만 클램프한다
 * (MAX_ROWS 이상을 돌려주면 호출자가 "그리드 밖 스냅 = 패배"를 판정할 수 있다).
 * 행 추정값 주변 3개 행 후보만 비교하므로 O(1).
 */
export function pixelToNearestCell(x: number, y: number, ceilingOffset = 0): CellPos {
  const approxRow = Math.round((y - BOARD_TOP - ceilingOffset * ROW_H - R) / ROW_H);
  let best: CellPos = { row: 0, col: 0 };
  let bestD = Infinity;
  for (let row = Math.max(0, approxRow - 1); row <= Math.max(0, approxRow + 1); row++) {
    const shift = row % 2 === 1 ? R : 0;
    const rawCol = Math.round((x - BOARD_LEFT - R - shift) / (2 * R));
    const col = Math.min(rowLength(row) - 1, Math.max(0, rawCol));
    const p = cellToPixel(row, col, ceilingOffset);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { row, col };
    }
  }
  return best;
}

function emptyRow(row: number): Cell[] {
  return new Array<Cell>(rowLength(row)).fill(null);
}

export function charToCell(ch: string): Cell {
  if (ch === '.') return null;
  const i = COLOR_CHARS.indexOf(ch);
  if (i < 0 || ch.length !== 1) throw new Error(`잘못된 셀 문자: '${ch}'`);
  return i as Color;
}

export function cellToChar(cell: Cell): string {
  return cell === null ? '.' : COLOR_CHARS[cell];
}

export function createBoard(rows: string[]): Board {
  if (rows.length > MAX_ROWS) throw new Error(`행 수 초과: ${rows.length} > ${MAX_ROWS}`);
  const cells: Cell[][] = [];
  for (let r = 0; r < MAX_ROWS; r++) {
    if (r >= rows.length) {
      cells.push(emptyRow(r));
      continue;
    }
    const line = rows[r];
    if (line.length !== rowLength(r)) {
      throw new Error(`${r}행 길이 오류: ${line.length} (기대값 ${rowLength(r)})`);
    }
    cells.push(Array.from(line, charToCell));
  }
  return { cells, ceilingOffset: 0 };
}

/** 보드를 스테이지 문자열 형식으로 직렬화한다. 끝쪽의 빈 행은 생략한다. */
export function boardToRows(board: Board): string[] {
  const rows = board.cells.map((row) => row.map(cellToChar).join(''));
  while (rows.length > 0 && !/[^.]/.test(rows[rows.length - 1])) rows.pop();
  return rows;
}

export function cloneBoard(board: Board): Board {
  return { cells: board.cells.map((row) => row.slice()), ceilingOffset: board.ceilingOffset };
}

export function getCell(board: Board, row: number, col: number): Cell {
  return isValidCell(row, col) ? board.cells[row][col] : null;
}

export function setCell(board: Board, row: number, col: number, cell: Cell): void {
  if (!isValidCell(row, col)) throw new Error(`범위 밖 셀: (${row}, ${col})`);
  board.cells[row][col] = cell;
}

export function colorsPresent(board: Board): Set<Color> {
  const set = new Set<Color>();
  for (const row of board.cells) for (const c of row) if (c !== null) set.add(c);
  return set;
}

export function isEmpty(board: Board): boolean {
  return board.cells.every((row) => row.every((c) => c === null));
}
