import { describe, expect, it } from 'vitest';
import { cellToPixel, createBoard, setCell } from '../src/core/board';
import {
  BOARD_LEFT, BOARD_RIGHT, BOARD_TOP, COLLIDE_DIST, MAX_ANGLE, MAX_ROWS, MIN_ANGLE, R, ROW_H,
  SHOOTER_X, SHOOTER_Y, SHOT_SPEED,
} from '../src/core/constants';
import { clampAngle, createShot, findSnapCell, simulateShot, stepShot, traceAimPath } from '../src/core/physics';

const DEG = Math.PI / 180;

describe('clampAngle / createShot', () => {
  it('엣지: 각도는 10°~170° 로 제한된다', () => {
    expect(clampAngle(0)).toBeCloseTo(MIN_ANGLE);
    expect(clampAngle(-1)).toBeCloseTo(MIN_ANGLE);
    expect(clampAngle(Math.PI)).toBeCloseTo(MAX_ANGLE);
    expect(clampAngle(90 * DEG)).toBeCloseTo(90 * DEG);
    expect(clampAngle(Number.NaN)).toBeCloseTo(90 * DEG);
  });
  it('정상: 발사 속도는 SHOT_SPEED, 위쪽(-y) 방향', () => {
    const s = createShot(5 * DEG, 2);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(SHOT_SPEED);
    expect(Math.atan2(-s.vy, s.vx)).toBeCloseTo(MIN_ANGLE);
    expect(s.x).toBe(SHOOTER_X);
    expect(s.y).toBe(SHOOTER_Y);
    expect(s.color).toBe(2);
  });
});

describe('stepShot / simulateShot', () => {
  it('정상: 빈 보드에 수직 발사하면 천장에 닿아 0행에 스냅', () => {
    const r = simulateShot(createBoard([]), 90 * DEG);
    expect(r.snap.row).toBe(0);
    expect(Math.abs(cellToPixel(0, r.snap.col).x - SHOOTER_X)).toBeLessThanOrEqual(R);
    expect(r.bounces).toBe(0);
  });
  it('정상: 천장이 내려오면 해당 높이에서 멈추고 0행에 스냅', () => {
    const b = createBoard([]);
    b.ceilingOffset = 3;
    const r = simulateShot(b, 90 * DEG);
    expect(r.snap.row).toBe(0);
    expect(r.stopY).toBeGreaterThanOrEqual(BOARD_TOP + 3 * ROW_H + R - 1);
  });
  it('정상: 벽 반사는 각도를 대칭으로 뒤집는다', () => {
    const b = createBoard([]);
    const s = createShot(60 * DEG, 0);
    let bounced = false;
    for (let i = 0; i < 1000 && !bounced; i++) bounced = stepShot(b, s, 1 / 120).bounced;
    expect(bounced).toBe(true);
    expect(s.vx).toBeLessThan(0);
    expect(Math.atan2(-s.vy, s.vx)).toBeCloseTo(120 * DEG);
    expect(s.x + R).toBeLessThanOrEqual(BOARD_RIGHT + 1e-9);
  });
  it('정상: 벽 반사 후 반대편 열에 도달한다', () => {
    const r = simulateShot(createBoard([]), 60 * DEG);
    expect(r.bounces).toBe(1);
    expect(r.snap.row).toBe(0);
    expect(r.snap.col).toBe(3);
  });
  it('엣지: 큰 dt 로도 터널링하지 않는다', () => {
    const b = createBoard([]);
    setCell(b, 5, 3, 1); // 발사대 바로 위 경로의 버블 (홀수 행이라 x = 144)
    const s = createShot(90 * DEG, 0);
    const res = stepShot(b, s, 1.0); // 한 번에 640px 이동 요청
    expect(res.stopped).toBe(true);
    const target = cellToPixel(5, 3);
    expect(s.y).toBeGreaterThan(target.y);
    expect(Math.hypot(s.x - target.x, s.y - target.y)).toBeLessThan(COLLIDE_DIST);
    expect(Math.hypot(s.x - target.x, s.y - target.y)).toBeGreaterThan(COLLIDE_DIST - R / 2 - 1e-9);
    expect(res.snap?.row).toBe(6);
  });
  it('엣지: 수평에 가까운 각도도 결국 멈춘다 (각도 제한)', () => {
    const r = simulateShot(createBoard([]), 0);
    expect(r.snap.row).toBe(0);
    expect(r.bounces).toBeGreaterThan(2);
  });
  it('엣지: 그리드 아래에서 멈추면 MAX_ROWS 이상 행으로 스냅 (패배 판정용)', () => {
    const b = createBoard([]);
    setCell(b, MAX_ROWS - 1, 3, 0);
    const r = simulateShot(b, 90 * DEG);
    expect(r.snap.row).toBeGreaterThanOrEqual(MAX_ROWS);
  });
});

describe('findSnapCell', () => {
  it('정상: 공 아래 셀이 비어 있으면 그 셀', () => {
    const b = createBoard(['RRRRRRRR']);
    const p = cellToPixel(1, 2);
    expect(findSnapCell(b, p.x, p.y)).toEqual({ row: 1, col: 2 });
  });
  it('정상: 공 아래 셀이 점유돼 있으면 가장 가까운 빈 이웃', () => {
    const b = createBoard(['RRRRRRRR', 'RRR.RRR']);
    // (1,2) 위치(점유)에서 오른쪽 아래로 치우친 좌표 → 비어 있는 (2,3) 이 가장 가깝다
    const p = cellToPixel(1, 2);
    expect(findSnapCell(b, p.x + 6, p.y + 6)).toEqual({ row: 2, col: 3 });
    // 오른쪽으로 치우치면 빈 (1,3)
    expect(findSnapCell(b, p.x + 14, p.y)).toEqual({ row: 1, col: 3 });
  });
  it('엣지: 후보가 모두 점유돼 있으면 전체에서 가장 가까운 빈 셀로 폴백', () => {
    const rows = ['RRRRRRRR', 'RRRRRRR', 'RRRRRRRR', 'RRRRRRR'];
    const b = createBoard(rows);
    const p = cellToPixel(1, 3);
    const snap = findSnapCell(b, p.x, p.y);
    expect(snap.row).toBe(4);
  });
});

describe('traceAimPath', () => {
  it('정상: 빈 보드 60° — 오른쪽 벽 반사 후 천장', () => {
    const pts = traceAimPath(createBoard([]), 60 * DEG);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: SHOOTER_X, y: SHOOTER_Y });
    expect(pts[1].x).toBeCloseTo(BOARD_RIGHT - R);
    expect(pts[1].y).toBeCloseTo(SHOOTER_Y - ((BOARD_RIGHT - R - SHOOTER_X) / 0.5) * Math.sin(60 * DEG));
    expect(pts[2].y).toBeCloseTo(BOARD_TOP + R);
  });
  it('정상: maxBounces=0 이면 첫 벽에서 끝난다', () => {
    const pts = traceAimPath(createBoard([]), 30 * DEG, 0);
    expect(pts).toHaveLength(2);
    expect(pts[1].x).toBeCloseTo(BOARD_RIGHT - R);
  });
  it('정상: 왼쪽 반사 경로는 좌우 대칭', () => {
    const a = traceAimPath(createBoard([]), 60 * DEG);
    const b = traceAimPath(createBoard([]), 120 * DEG);
    expect(b).toHaveLength(a.length);
    a.forEach((p, i) => {
      expect(b[i].x).toBeCloseTo(2 * SHOOTER_X - p.x);
      expect(b[i].y).toBeCloseTo(p.y);
    });
  });
  it('정상: 버블에 막히면 충돌 지점에서 끝난다', () => {
    const b = createBoard([]);
    setCell(b, 5, 3, 1);
    const pts = traceAimPath(b, 90 * DEG);
    expect(pts).toHaveLength(2);
    expect(pts[1].y).toBeCloseTo(cellToPixel(5, 3).y + COLLIDE_DIST);
  });
  it('정상: 시뮬레이션 정지 지점과 궤적 끝점이 가깝다', () => {
    const b = createBoard(['RGBYRGBY', 'RGBYRGB']);
    for (const deg of [35, 60, 75, 100, 140]) {
      const pts = traceAimPath(b, deg * DEG, 10);
      const sim = simulateShot(b, deg * DEG);
      const end = pts[pts.length - 1];
      expect(Math.hypot(end.x - sim.stopX, end.y - sim.stopY)).toBeLessThan(R / 2 + 1);
    }
  });
  it('엣지: 벽 좌표는 보드 내부에 있다', () => {
    for (const p of traceAimPath(createBoard([]), 20 * DEG, 5)) {
      expect(p.x).toBeGreaterThanOrEqual(BOARD_LEFT + R - 1e-9);
      expect(p.x).toBeLessThanOrEqual(BOARD_RIGHT - R + 1e-9);
    }
  });
});
