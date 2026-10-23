// 매칭(같은 색 3개 이상 제거)과 떠 있는 버블 낙하 판정.
// 두 BFS 모두 O(cells) 시간, O(cells) 공간 — 셀 수가 최대 98개라 매 샷마다 돌려도 부담이 없다.
import { type Board, type CellPos, type Color, getCell, neighbors, rowLength } from './board';
import { MAX_ROWS } from './constants';

export interface PlacedCell extends CellPos {
  color: Color;
}
export interface ShotResult {
  popped: PlacedCell[];
  dropped: PlacedCell[];
}

const key = (row: number, col: number): number => row * 16 + col;

/** (row, col) 에서 시작하는 같은 색 연결 그룹. 시작 셀이 비어 있으면 빈 배열. O(cells) 시간/공간. */
export function findGroup(board: Board, row: number, col: number): CellPos[] {
  const color = getCell(board, row, col);
  if (color === null) return [];
  const seen = new Set<number>([key(row, col)]);
  const queue: CellPos[] = [{ row, col }];
  // 배열 + 읽기 인덱스로 큐를 구현해 shift() 의 O(n) 비용을 피한다.
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors(queue[i].row, queue[i].col)) {
      const k = key(n.row, n.col);
      if (!seen.has(k) && getCell(board, n.row, n.col) === color) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return queue;
}

/** 0행(천장)에서 색과 무관하게 도달할 수 없는 점유 셀 목록. O(cells) 시간/공간. */
export function findFloating(board: Board): CellPos[] {
  const seen = new Set<number>();
  const queue: CellPos[] = [];
  for (let c = 0; c < rowLength(0); c++) {
    if (getCell(board, 0, c) !== null) {
      seen.add(key(0, c));
      queue.push({ row: 0, col: c });
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors(queue[i].row, queue[i].col)) {
      const k = key(n.row, n.col);
      if (!seen.has(k) && getCell(board, n.row, n.col) !== null) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  const floating: CellPos[] = [];
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < rowLength(r); c++) {
      if (getCell(board, r, c) !== null && !seen.has(key(r, c))) floating.push({ row: r, col: c });
    }
  }
  return floating;
}

function removeCells(board: Board, cells: CellPos[]): PlacedCell[] {
  return cells.map(({ row, col }) => {
    const color = board.cells[row][col] as Color;
    board.cells[row][col] = null;
    return { row, col, color };
  });
}

/**
 * 방금 붙은 셀 기준으로 매칭과 낙하를 처리하고 보드를 직접 변경한다.
 * 매칭이 없어도 낙하 판정은 항상 수행한다 — 스냅 예외 상황에서 공중에 붙은 버블이 남지 않도록.
 */
export function resolveShot(board: Board, row: number, col: number): ShotResult {
  const group = findGroup(board, row, col);
  const popped = group.length >= 3 ? removeCells(board, group) : [];
  const dropped = removeCells(board, findFloating(board));
  return { popped, dropped };
}
