// 스테이지 11~200 시드 기반 생성기. 같은 코드·시드면 항상 같은 결과가 나오므로 stages.json 드리프트를 테스트로 잡을 수 있다.
// 생성 순서: 난이도 파라미터 → 패턴으로 배치/색칠 → 떠 있는 셀 제거 → 색 수 보정 → 검증 (실패 시 같은 RNG 로 재시도).
import { type Board, type Color, boardToRows, createBoard, getCell, neighbors, rowLength } from '../core/board';
import { DEADLINE_ROW, MAX_ROWS } from '../core/constants';
import { findFloating } from '../core/match';
import { mulberry32, pick, randInt, type Rng, stageSeed } from '../core/rng';
import { HANDMADE } from './handmade';
import type { StageDef } from './types';

export const PATTERNS = [
  'random-cluster',
  'mirror',
  'pyramid',
  'inverted-pyramid',
  'stripes',
  'diamond-holes',
  'zigzag',
  'hanging-clusters',
] as const;
export type PatternName = (typeof PATTERNS)[number];

export interface StageParams {
  world: number;
  colors: number;
  rows: number;
  dropInterval: number;
  boss: boolean;
}

export interface GeneratedStage {
  stage: StageDef;
  pattern: PatternName;
}

/** plan.md §4.3 난이도 표 */
const WORLD_TABLE: ReadonlyArray<{ colors: number; lo: number; hi: number; drop: number }> = [
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

export const STAGE_COUNT = 200;
const STAGES_PER_WORLD = 20;
const FIRST_GENERATED = HANDMADE.length + 1;
const MAX_ATTEMPTS = 200;

export function stageParams(id: number): StageParams {
  if (!Number.isInteger(id) || id < 1 || id > STAGE_COUNT) throw new Error(`잘못된 스테이지 id: ${id}`);
  const world = Math.ceil(id / STAGES_PER_WORLD);
  const t = WORLD_TABLE[world - 1];
  const i = (id - 1) % STAGES_PER_WORLD;
  const boss = i === STAGES_PER_WORLD - 1;
  // 월드 안에서 하한 → 상한으로 계단식 증가. 보스는 항상 상한 + 하강 간격 1 감소.
  const rows = boss ? t.hi : t.lo + Math.floor((i * (t.hi - t.lo + 1)) / STAGES_PER_WORLD);
  return { world, colors: t.colors, rows, dropInterval: boss ? t.drop - 1 : t.drop, boss };
}

// ── 그리드 보조 함수 ───────────────────────────────────────────────

/** 보드 중심 기준 가로 위치 (반 칸 = 1 단위, -7..7). 패턴 모양을 행 패리티와 무관하게 정의하는 데 쓴다. */
function xOffset(row: number, col: number): number {
  return 2 * col + (row % 2) - 7;
}

/** odd-r offset → axial 변환 후 육각 거리 */
function hexDist(r1: number, c1: number, r2: number, c2: number): number {
  const q1 = c1 - (r1 - (r1 & 1)) / 2;
  const q2 = c2 - (r2 - (r2 & 1)) / 2;
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function forEachCell(n: number, fn: (row: number, col: number) => void): void {
  for (let r = 0; r < n; r++) for (let c = 0; c < rowLength(r); c++) fn(r, c);
}

function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 이미 칠해진 이웃 색을 확률 p 로 재사용해 같은 색 덩어리가 생기게 한다 */
function clusterColor(board: Board, row: number, col: number, palette: readonly Color[], rng: Rng, p = 0.55): Color {
  const near: Color[] = [];
  for (const nb of neighbors(row, col)) {
    const c = getCell(board, nb.row, nb.col);
    if (c !== null) near.push(c);
  }
  if (near.length > 0 && rng() < p) return pick(rng, near);
  return pick(rng, palette);
}

/** 점유 마스크대로 행 우선 순서로 군집 색을 칠한다 */
function fillMask(board: Board, n: number, mask: (r: number, c: number) => boolean, palette: readonly Color[], rng: Rng): void {
  forEachCell(n, (r, c) => {
    if (mask(r, c)) board.cells[r][c] = clusterColor(board, r, c, palette, rng);
  });
}

// ── 패턴 ─────────────────────────────────────────────────────────

type PatternFn = (board: Board, n: number, palette: readonly Color[], rng: Rng) => void;

const patternFns: Record<PatternName, PatternFn> = {
  'random-cluster': (board, n, palette, rng) => {
    fillMask(board, n, (r) => r === 0 || rng() < 0.9, palette, rng);
  },

  // 왼쪽 절반을 만들고 좌우 반전. 짝수 행 c → 7-c, 홀수 행 c → 6-c (반 칸 밀림 때문에 행 길이 기준으로 뒤집는다).
  mirror: (board, n, palette, rng) => {
    forEachCell(n, (r, c) => {
      const m = rowLength(r) - 1 - c;
      if (c > m) return;
      if (r !== 0 && rng() >= 0.88) return;
      const color = clusterColor(board, r, c, palette, rng);
      board.cells[r][c] = color;
      board.cells[r][m] = color;
    });
  },

  // 위가 넓고 아래로 좁아지는 역삼각형(천장에 매달린 피라미드)
  pyramid: (board, n, palette, rng) => {
    const hw = (r: number) => 7 - (r * 6) / (n - 1) + 0.01;
    fillMask(board, n, (r, c) => Math.abs(xOffset(r, c)) <= hw(r), palette, rng);
  },

  // 위가 좁고 아래로 넓어지는 모양. 행당 폭 증가를 반 칸 남짓으로 제한해 대각 연결이 유지된다.
  'inverted-pyramid': (board, n, palette, rng) => {
    const hw = (r: number) => 3 + (r * 4) / (n - 1) + 0.01;
    fillMask(board, n, (r, c) => Math.abs(xOffset(r, c)) <= hw(r), palette, rng);
  },

  // 1~2행 두께의 가로 띠. 0행 외에는 약간의 구멍을 뚫는다.
  stripes: (board, n, palette, rng) => {
    const order = shuffled(rng, palette);
    let band = 0;
    for (let r = 0; r < n; ) {
      const h = 1 + randInt(rng, 2);
      const color = order[band % order.length];
      for (let rr = r; rr < Math.min(n, r + h); rr++) {
        for (let c = 0; c < rowLength(rr); c++) if (rr === 0 || rng() < 0.92) board.cells[rr][c] = color;
      }
      r += h;
      band++;
    }
  },

  // 가득 채운 뒤 마름모(육각 거리 반경) 모양 구멍을 1~3개 뚫는다
  'diamond-holes': (board, n, palette, rng) => {
    fillMask(board, n, () => true, palette, rng);
    const holes = 1 + randInt(rng, 3);
    for (let h = 0; h < holes; h++) {
      const hr = 2 + randInt(rng, Math.max(1, n - 3));
      const hc = randInt(rng, rowLength(hr));
      const radius = n >= 7 ? 1 + randInt(rng, 2) : 1;
      forEachCell(n, (r, c) => {
        if (hexDist(r, c, hr, hc) <= radius) board.cells[r][c] = null;
      });
    }
  },

  // 행마다 한 칸씩 좌우로 꺾이는 두 개의 띠 (좌우 대칭 위상)
  zigzag: (board, n, palette, rng) => {
    const phase = randInt(rng, 8);
    const center = (r: number) => {
      const t = (r + phase) % 8; // 0..7 삼각파: -4 → 4 → -4
      return t <= 4 ? -4 + 2 * t : 12 - 2 * t;
    };
    fillMask(
      board,
      n,
      (r, c) => {
        const x = xOffset(r, c);
        return Math.abs(x - center(r)) <= 3 || Math.abs(x + center(r)) <= 3;
      },
      palette,
      rng,
    );
  },

  // 0행에서 가는 줄기가 내려와 큰 덩어리를 붙들고 있는 모양 — 줄기를 끊어 떨어뜨리는 플레이를 유도
  'hanging-clusters': (board, n, palette, rng) => {
    fillMask(board, n, (r) => r === 0, palette, rng);
    const blobRow = n - 2;
    const stems = n >= 7 ? 3 : 2;
    const xs = shuffled(rng, [-5, -2, 1, 4]).slice(0, stems);
    for (const sx of xs) {
      const stemColor = pick(rng, palette);
      // 줄기: 행마다 목표 x 에 가장 가까운 셀을 골라 세로로 이어 붙인다 (인접 행 x 차이 1 → 항상 이웃)
      for (let r = 1; r <= blobRow - 2; r++) {
        let best = 0;
        for (let c = 1; c < rowLength(r); c++) {
          if (Math.abs(xOffset(r, c) - sx) < Math.abs(xOffset(r, best) - sx)) best = c;
        }
        board.cells[r][best] = stemColor;
      }
      // 덩어리: 줄기 끝 바로 아래를 중심으로 육각 반경 1
      const br = blobRow;
      let bc = 0;
      for (let c = 1; c < rowLength(br); c++) {
        if (Math.abs(xOffset(br, c) - sx) < Math.abs(xOffset(br, bc) - sx)) bc = c;
      }
      forEachCell(n, (r, c) => {
        if (r > 0 && hexDist(r, c, br, bc) <= 1 && board.cells[r][c] === null) {
          board.cells[r][c] = clusterColor(board, r, c, palette, rng, 0.7);
        }
      });
    }
  },
};

// ── 후처리와 검증 ──────────────────────────────────────────────────

function countColors(board: Board): Map<Color, number> {
  const m = new Map<Color, number>();
  for (const row of board.cells) for (const c of row) if (c !== null) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/**
 * 팔레트 밖 색을 팔레트 색으로 바꾸고, 3개 미만인 색은 여유 있는 색(4개 이상)의 셀을 무작위로 골라 다시 칠한다.
 * 점유 여부는 바꾸지 않으므로 연결성·행 수 조건에 영향이 없다. 실패하면 false.
 */
function repairColors(board: Board, palette: readonly Color[], rng: Rng): boolean {
  const allowed = new Set(palette);
  const cells: { r: number; c: number }[] = [];
  forEachCell(MAX_ROWS, (r, c) => {
    const v = board.cells[r][c];
    if (v === null) return;
    if (!allowed.has(v)) board.cells[r][c] = pick(rng, palette);
    cells.push({ r, c });
  });
  if (cells.length < palette.length * 3) return false;
  for (const target of palette) {
    let counts = countColors(board);
    while ((counts.get(target) ?? 0) < 3) {
      const donors = cells.filter(({ r, c }) => {
        const v = board.cells[r][c] as Color;
        return v !== target && (counts.get(v) ?? 0) > 3;
      });
      if (donors.length === 0) return false;
      const d = pick(rng, donors);
      board.cells[d.r][d.c] = target;
      counts = countColors(board);
    }
  }
  return true;
}

/** §4.5 규칙 위반 목록 (빈 배열이면 통과) */
export function validateStage(s: StageDef): string[] {
  const errors: string[] = [];
  let board: Board;
  try {
    board = createBoard(s.rows);
  } catch (e) {
    return [(e as Error).message];
  }
  if (findFloating(board).length > 0) errors.push('떠 있는 셀');
  const counts = countColors(board);
  if (counts.size !== s.colors) errors.push(`색 수 ${counts.size} != ${s.colors}`);
  for (const [c, n] of counts) if (n < 3) errors.push(`색 ${c} 개수 ${n} < 3`);
  if (s.rows.length > DEADLINE_ROW - 3) errors.push(`행 수 ${s.rows.length} > ${DEADLINE_ROW - 3}`);
  if (s.rows.length === 0 || [...s.rows[0]].filter((ch) => ch !== '.').length < 3) errors.push('0행 3개 미만');
  if (s.rows.length > 0 && !/[^.]/.test(s.rows[s.rows.length - 1])) errors.push('마지막 행이 비어 있음');
  return errors;
}

function generateOne(id: number, pattern: PatternName, rng: Rng, taken: Set<string>): StageDef {
  const p = stageParams(id);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const palette = shuffled(rng, [0, 1, 2, 3, 4, 5, 6, 7] as Color[]).slice(0, p.colors);
    const board = createBoard([]);
    patternFns[pattern](board, p.rows, palette, rng);
    for (const { row, col } of findFloating(board)) board.cells[row][col] = null;
    if (!repairColors(board, palette, rng)) continue;
    const rows = boardToRows(board);
    if (rows.length !== p.rows) continue;
    const stage: StageDef = { id, world: p.world, colors: p.colors, dropInterval: p.dropInterval, rows };
    const key = rows.join('/');
    if (taken.has(key) || validateStage(stage).length > 0) continue;
    taken.add(key);
    return stage;
  }
  throw new Error(`스테이지 ${id} 생성 실패 (${pattern})`);
}

/**
 * 스테이지 11~200 을 순서대로 생성한다. 직전 스테이지와 같은 패턴은 고르지 않는다.
 * 각 스테이지는 자기 시드의 RNG 만 쓰므로, 한 스테이지 수정이 다른 스테이지 결과를 흔들지 않는다
 * (단, 패턴 연속 금지 규칙 때문에 직전 패턴에는 의존한다).
 */
export function generateStages(): GeneratedStage[] {
  const taken = new Set(HANDMADE.map((s) => s.rows.join('/')));
  const out: GeneratedStage[] = [];
  let prev: PatternName | null = null;
  for (let id = FIRST_GENERATED; id <= STAGE_COUNT; id++) {
    const rng = mulberry32(stageSeed(id));
    const pattern: PatternName = pick(rng, PATTERNS.filter((x) => x !== prev));
    out.push({ stage: generateOne(id, pattern, rng, taken), pattern });
    prev = pattern;
  }
  return out;
}

/** 수제 1~10 + 생성 11~200 을 합친 전체 스테이지 */
export function buildStages(): StageDef[] {
  return [...HANDMADE, ...generateStages().map((g) => g.stage)];
}
