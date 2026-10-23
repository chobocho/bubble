// 발사체 이동, 벽 반사, 충돌, 스냅 처리. DOM 비의존 순수 로직.
import { type Board, type CellPos, type Color, type Point, cellToPixel, getCell, isValidCell, neighbors, pixelToNearestCell, rowLength } from './board';
import {
  BOARD_LEFT, BOARD_RIGHT, BOARD_TOP, COLLIDE_DIST, MAX_ANGLE, MAX_ROWS, MIN_ANGLE, R, ROW_H,
  SHOOTER_X, SHOOTER_Y, SHOT_SPEED, STEP,
} from './constants';

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: Color;
}
export interface StepResult {
  stopped: boolean;
  /** 이번 스텝 중 벽에 한 번 이상 반사했는지 (효과음용) */
  bounced: boolean;
  /** 멈췄을 때 붙을 셀. row >= MAX_ROWS 이면 그리드 밖 = 패배 */
  snap?: CellPos;
}
export interface SimResult {
  snap: CellPos;
  bounces: number;
  stopX: number;
  stopY: number;
}

const MIN_X = BOARD_LEFT + R;
const MAX_X = BOARD_RIGHT - R;
/** 서브스텝당 최대 이동 거리. R/2 이하로 잘라야 COLLIDE_DIST 안쪽을 건너뛰는 터널링이 생기지 않는다. */
const MAX_SUBSTEP_DIST = R / 2;

export function clampAngle(angle: number): number {
  if (Number.isNaN(angle)) return Math.PI / 2;
  return Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, angle));
}

export function createShot(angle: number, color: Color): Shot {
  const a = clampAngle(angle);
  return { x: SHOOTER_X, y: SHOOTER_Y, vx: Math.cos(a) * SHOT_SPEED, vy: -Math.sin(a) * SHOT_SPEED, color };
}

export function ceilingY(board: Board): number {
  return BOARD_TOP + board.ceilingOffset * ROW_H;
}

/** 점유 셀 중 COLLIDE_DIST 안에 있는 것이 있는지. 최대 98셀 선형 탐색 O(cells). */
function collides(board: Board, x: number, y: number): boolean {
  for (let r = 0; r < MAX_ROWS; r++) {
    const row = board.cells[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === null) continue;
      const p = cellToPixel(r, c, board.ceilingOffset);
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < COLLIDE_DIST * COLLIDE_DIST) return true;
    }
  }
  return false;
}

/**
 * 공이 멈춘 위치에서 붙을 빈 셀을 고른다.
 * 1) 공 아래 셀과 그 이웃 중 비어 있는 가장 가까운 셀
 * 2) 후보가 모두 점유돼 있으면(두 버블 사이를 스칠 때 발생) 전체 빈 셀 중 가장 가까운 셀로 폴백
 * 공 아래 셀이 MAX_ROWS 이상이면 그대로 돌려줘 호출자가 패배로 처리한다.
 */
export function findSnapCell(board: Board, x: number, y: number): CellPos {
  const under = pixelToNearestCell(x, y, board.ceilingOffset);
  if (under.row >= MAX_ROWS) return under;
  const isFree = (p: CellPos) => isValidCell(p.row, p.col) && getCell(board, p.row, p.col) === null;
  let candidates = [under, ...neighbors(under.row, under.col)].filter(isFree);
  if (candidates.length === 0) {
    candidates = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < rowLength(r); c++) if (board.cells[r][c] === null) candidates.push({ row: r, col: c });
    }
  }
  if (candidates.length === 0) return { row: MAX_ROWS, col: 0 };
  let best = candidates[0];
  let bestD = Infinity;
  for (const p of candidates) {
    const c = cellToPixel(p.row, p.col, board.ceilingOffset);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** 발사체를 dt 만큼 진행시킨다 (shot 을 직접 변경). 이동 거리를 R/2 이하 서브스텝으로 나눠 터널링을 막는다. */
export function stepShot(board: Board, shot: Shot, dt: number): StepResult {
  const dist = Math.hypot(shot.vx, shot.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP_DIST));
  const h = dt / n;
  const top = ceilingY(board);
  let bounced = false;
  for (let i = 0; i < n; i++) {
    shot.x += shot.vx * h;
    shot.y += shot.vy * h;
    // 벽을 넘은 만큼 거울 반사시켜 위치를 보드 안으로 되돌린다 (단순 클램프보다 궤적 예측선과 잘 일치).
    if (shot.x < MIN_X) {
      shot.x = 2 * MIN_X - shot.x;
      shot.vx = Math.abs(shot.vx);
      bounced = true;
    } else if (shot.x > MAX_X) {
      shot.x = 2 * MAX_X - shot.x;
      shot.vx = -Math.abs(shot.vx);
      bounced = true;
    }
    if (shot.y - R <= top) {
      shot.y = top + R;
      return { stopped: true, bounced, snap: findSnapCell(board, shot.x, shot.y) };
    }
    if (collides(board, shot.x, shot.y)) {
      return { stopped: true, bounced, snap: findSnapCell(board, shot.x, shot.y) };
    }
  }
  return { stopped: false, bounced };
}

/** 고정 스텝으로 발사를 끝까지 시뮬레이션한다 (테스트·AI 용). */
export function simulateShot(board: Board, angle: number, color: Color = 0, maxTime = 30): SimResult {
  const shot = createShot(angle, color);
  let bounces = 0;
  for (let t = 0; t < maxTime; t += STEP) {
    const res = stepShot(board, shot, STEP);
    if (res.bounced) bounces++;
    if (res.stopped && res.snap) return { snap: res.snap, bounces, stopX: shot.x, stopY: shot.y };
  }
  throw new Error('simulateShot: 시간 초과');
}

/** 광선 p + d·t 가 중심 c, 반지름 rad 원에 처음 닿는 t (없으면 Infinity). d 는 단위 벡터. */
function rayCircle(px: number, py: number, dx: number, dy: number, cx: number, cy: number, rad: number): number {
  const fx = px - cx;
  const fy = py - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - rad * rad;
  if (c < 0) return 0; // 이미 원 안
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

/**
 * 조준 보조선. 발사점에서 시작해 벽 반사 지점들과 끝점(천장/버블 충돌 또는 maxBounces 초과 시 다음 벽)을 반환한다.
 * 해석적 광선 추적이라 세그먼트당 O(cells), 전체 O(maxBounces · cells).
 */
export function traceAimPath(board: Board, angle: number, maxBounces = 2): Point[] {
  const a = clampAngle(angle);
  let px = SHOOTER_X;
  let py = SHOOTER_Y;
  let dx = Math.cos(a);
  const dy = -Math.sin(a);
  const top = ceilingY(board) + R;
  const points: Point[] = [{ x: px, y: py }];
  for (let bounce = 0; ; bounce++) {
    const tWall = dx > 0 ? (MAX_X - px) / dx : dx < 0 ? (MIN_X - px) / dx : Infinity;
    const tCeil = (top - py) / dy;
    let tHit = Infinity;
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < board.cells[r].length; c++) {
        if (board.cells[r][c] === null) continue;
        const p = cellToPixel(r, c, board.ceilingOffset);
        tHit = Math.min(tHit, rayCircle(px, py, dx, dy, p.x, p.y, COLLIDE_DIST));
      }
    }
    const t = Math.min(tWall, tCeil, tHit);
    px += dx * t;
    py += dy * t;
    points.push({ x: px, y: py });
    if (t !== tWall || bounce >= maxBounces) return points;
    dx = -dx;
  }
}
