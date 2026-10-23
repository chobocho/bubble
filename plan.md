# Puzzle Bubble Clone — Implementation Plan

> Audience: an AI coding agent picking up this project from scratch.
> Language: this document is in English (agent-to-agent). Code comments and `history.md` must be written in **Korean (UTF-8)**; commit messages in **English** (Conventional Commits). Final reports to the human developer must be in **Korean**.

---

## 0. Goal & Acceptance Criteria

Build a browser-based Puzzle Bobble / Bust-a-Move clone in **TypeScript** with **200 stages**.

The task is done when all of the following hold:

1. `./build.sh` (run from repo root on a clean checkout) exits `0` and produces **exactly one file**: `release/index.html`.
2. `release/index.html` is fully self-contained: opening it via `file://` with no network works. No external `<script src>`, `<link href>`, images, fonts, or audio files.
3. The game contains exactly 200 playable stages, selectable from a stage-select screen, with progress saved in `localStorage`.
4. `npm run typecheck` and `npm test` pass with zero errors and zero warnings.
5. Core mechanics (aim, wall bounce, snap, match-3, floating drop, ceiling descent, win/lose) behave as specified in §3.

---

## 1. Current Repository State

- Only `LICENSE` (MIT) and one initial commit exist. Branch: `main`.
- Toolchain verified: Node v24.18.0, npm 11.20.0, npm registry reachable.

---

## 2. Tech Stack (decided)

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript `7.0.2`, `strict: true` | Requirement |
| Bundler | Vite `8.3.5` + `vite-plugin-singlefile` `2.3.4` | Inlines JS/CSS into one `index.html` |
| Tests | Vitest `5.0.5` | Native TS, shares Vite config |
| Script runner | tsx `4.23.15` | Runs `scripts/gen-stages.ts` |
| Rendering | Canvas 2D, no framework | Zero runtime deps, small output |
| Graphics | Procedurally drawn (radial-gradient circles) | No image assets needed |
| Audio | WebAudio synthesized SFX | No audio assets needed |

Pin **exact** versions in `package.json` (no `^`/`~`). No runtime dependencies — devDependencies only.

### Defaults for open questions (user has not overridden these)

- Special bubbles (stone/rainbow/bomb): **not included**. Classic rules only.
- Input: mouse + keyboard (`←` `→` aim, `Space`/`↑` fire, `Esc`/`P` pause) + touch (drag to aim, release to fire).
- UI text language: **English**.
- `release/` is **git-ignored** (build artifact).
- `build.sh` **runs typecheck and tests** before building.

If the user later changes any of these, follow the user.

---

## 3. Game Specification

### 3.1 Coordinate system & constants (`src/core/constants.ts`)

Logical canvas size **288 × 480**, scaled to fit the viewport (keep aspect ratio, multiply backing store by `devicePixelRatio`).

| Constant | Value | Notes |
|---|---|---|
| `R` (bubble radius) | 16 | diameter 32 |
| `COLS` | 8 | even rows: 8 cells, odd rows: 7 cells |
| `ROW_H` | `R * Math.sqrt(3)` ≈ 27.71 | vertical distance between row centers |
| `BOARD_LEFT` | 16 | wall thickness; board inner width = 256 |
| `BOARD_TOP` | 16 | top of row 0 (moves down with ceiling) |
| `MAX_ROWS` | 13 | |
| `DEADLINE_ROW` | 12 | a bubble occupying effective row ≥ 12 ⇒ game over |
| `SHOOTER_Y` | 440 | launcher center |
| `SHOT_SPEED` | 640 px/s | |
| `MIN_ANGLE` / `MAX_ANGLE` | 10° / 170° | measured from +x axis, upward |
| `COLLIDE_DIST` | `2R * 0.85` | slight forgiveness so shots slip through gaps |

Grid convention — **odd-row-shifted offset coordinates**:

- Cell `(row, col)`; even rows have `col ∈ [0, 7]`, odd rows have `col ∈ [0, 6]`.
- Center: `x = BOARD_LEFT + R + col * 2R + (row % 2 === 1 ? R : 0)`, `y = BOARD_TOP + ceilingOffset * ROW_H + R + row * ROW_H`.
- Neighbors (6): even row → `(r-1,c-1) (r-1,c) (r,c-1) (r,c+1) (r+1,c-1) (r+1,c)`; odd row → `(r-1,c) (r-1,c+1) (r,c-1) (r,c+1) (r+1,c) (r+1,c+1)`. Filter out-of-range.

> Note: when the ceiling descends, the row parity of the grid does **not** change. Only `ceilingOffset` increases; cell indices stay the same.

### 3.2 Board model (`src/core/board.ts`)

```ts
export type Color = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // index into PALETTE
export type Cell = Color | null;
export interface Board {
  cells: Cell[][];       // cells[row][col], ragged (8/7 alternating), MAX_ROWS rows
  ceilingOffset: number; // rows the ceiling has descended
}
```

Pure functions only (no DOM): `createBoard(rows: string[])`, `getCell`, `setCell`, `isValidCell`, `neighbors`, `cellToPixel`, `pixelToNearestCell`, `colorsPresent(board): Set<Color>`, `isEmpty(board)`.

### 3.3 Shooting & physics (`src/core/physics.ts`)

- Fixed-timestep simulation at **1/120 s**. Sub-step so movement per step ≤ `R / 2` (prevents tunneling).
- Walls: reflect `vx` when `x - R < BOARD_LEFT` or `x + R > BOARD_LEFT + 256`; clamp position back inside.
- Stop conditions:
  1. Ball center reaches `y - R <= ceilingY` (ceiling hit), or
  2. Distance to any occupied cell center `< COLLIDE_DIST`.
- On stop, **snap** to the nearest *empty, valid* cell among the cell under the ball and its neighbors. If the snapped cell is in a row ≥ `MAX_ROWS`, the game is lost.
- Expose `traceAimPath(board, angle, maxBounces = 2): Point[]` for the optional aim guide line (pure, tested).

### 3.4 Matching & dropping (`src/core/match.ts`)

- After snapping: flood fill (BFS) from the placed cell over same-color neighbors. If group size ≥ 3, remove the group.
- Then BFS from every occupied cell in row 0 through any color. Every occupied cell **not** reached is floating → remove and animate as falling.
- Complexity: both are O(cells) time and O(cells) space. Add this as a Korean comment.
- Return `{ popped: Cell[]; dropped: Cell[] }` (with positions) for rendering and scoring.

### 3.5 Shot queue

- `current` and `next` bubbles. New colors are drawn uniformly from `colorsPresent(board)`, using the stage RNG (seeded, deterministic for tests).
- After resolving a shot, if `current`'s color is no longer on the board, re-roll it. Do the same for `next`.

### 3.6 Ceiling descent

- Each stage has `dropInterval` (shots). After every `dropInterval` shots, `ceilingOffset += 1`.
- Show a warning (shake the board) during the final 2 shots before a drop.
- After every shot and every descent: if any occupied cell has `row + ceilingOffset >= DEADLINE_ROW`, the game is over.

### 3.7 Win / lose / score

- **Clear**: the board is empty after resolving a shot.
- **Game over**: deadline crossed (§3.6) or snap outside the grid.
- Score:
  - popped: `10` each
  - dropped: `10 * 2^min(droppedCount, 16)` for the shot (only if `droppedCount > 0`)
  - clear bonus: `1000 + max(0, 50 - shotsUsed) * 20`
- Persist the best score per stage.

### 3.8 Game state machine (`src/core/game.ts`)

```
Title → StageSelect → Playing{Aiming → Flying → Resolving → (Aiming | Cleared | GameOver)}
Playing ⇄ Paused
Cleared → (next stage | StageSelect)
GameOver → (retry | StageSelect)
```

`game.ts` must be DOM-free: it takes `update(dt, input)` and exposes read-only state for the renderer. This keeps it fully unit-testable.

---

## 4. Stages (200 total)

### 4.1 Data format (`src/stages/types.ts`)

```ts
export interface StageDef {
  id: number;           // 1..200, unique, contiguous
  world: number;        // 1..10 (20 stages each)
  colors: number;       // number of distinct colors used (3..8)
  dropInterval: number; // shots per ceiling descent
  rows: string[];       // even rows: 8 chars, odd rows: 7 chars
}
```

Row characters: `R G B Y P O C W` → color index 0..7 (red, green, blue, yellow, purple, orange, cyan, white). `.` is empty. A human can read and review this format directly.

### 4.2 Sources

- **Stages 1–10**: hand-designed tutorial stages in `src/stages/handmade.ts`. Teach in this order: basic matching (3 colors, few rows) → bank shots off walls → dropping clusters by cutting their support → ceiling pressure.
- **Stages 11–200**: generated by `src/stages/generator.ts` with a seeded PRNG (`mulberry32`, seed = `stageId * 2654435761 >>> 0`).
- `scripts/gen-stages.ts` merges both sources and writes `src/stages/stages.json` (pretty-printed, 2-space indent, trailing newline). **Commit the JSON.**
- `src/stages/index.ts` imports the JSON and exports `STAGES: readonly StageDef[]`.

### 4.3 Difficulty curve

| World | Stages | Colors | Initial rows | dropInterval |
|---|---|---|---|---|
| 1 | 1–20 | 3 | 4–5 | 10 |
| 2 | 21–40 | 4 | 5–6 | 9 |
| 3 | 41–60 | 4 | 5–6 | 9 |
| 4 | 61–80 | 5 | 6–7 | 8 |
| 5 | 81–100 | 5 | 6–7 | 8 |
| 6 | 101–120 | 6 | 7–8 | 7 |
| 7 | 121–140 | 6 | 7–8 | 7 |
| 8 | 141–160 | 7 | 8 | 6 |
| 9 | 161–180 | 7 | 8–9 | 6 |
| 10 | 181–200 | 8 | 9 | 5 |

Within a world, row count rises from the lower to the upper bound. Every 20th stage (20, 40, …, 200) is a "boss" stage: use the upper bound of rows and `dropInterval - 1`.

### 4.4 Generator patterns

Pick a pattern per stage via the RNG. Never use the same pattern twice in a row.

- `random-cluster`: fill cells so a neighbor's color is reused with probability ~0.55 (this makes groups form).
- `mirror`: generate the left half and mirror it (keep odd-row offset symmetry correct).
- `pyramid` / `inverted-pyramid`
- `stripes` (horizontal bands of color, 1–2 rows each)
- `diamond-holes`: full fill, then carve diamond-shaped empty regions
- `zigzag`
- `hanging-clusters`: a few thin "stems" from row 0 holding big blobs (rewards drops)

### 4.5 Post-processing & validation (must pass for every stage)

1. Remove floating cells (same BFS as §3.4). After this step, every cell is connected to row 0.
2. Exactly `colors` distinct colors appear; each appears ≥ 3 times. Repair by recoloring random cells if needed.
3. `rows.length <= DEADLINE_ROW - 3` (i.e. ≤ 9), so the player has at least 3 rows of slack at start.
4. Row 0 has ≥ 3 occupied cells.
5. No two stages have identical `rows`.
6. The board is not empty.

---

## 5. Rendering, Input, Audio, UI

- `src/render/renderer.ts`: draws walls, the board (radial-gradient bubbles with a white highlight), launcher with rotating arrow, dotted aim guide (up to 2 bounces on worlds 1–5; first segment only, no bounce preview, on worlds ≥ 6), next-bubble preview, score/stage HUD, deadline line, pop/fall particle animations. Pre-render each color's bubble sprite once to an offscreen canvas.
- `src/input/input.ts`: normalizes mouse/touch/keyboard into `{ aimAngle?: number; aimDelta: number; fire: boolean; pause: boolean }`. Convert pointer coordinates to logical canvas space.
- `src/audio/sfx.ts`: `fire`, `bounce`, `stick`, `pop`, `drop`, `ceiling`, `clear`, `gameover` via an `OscillatorNode` + `GainNode` envelope. Create the `AudioContext` lazily on first user gesture. Add a mute toggle (`M`) and persist it.
- `src/storage/progress.ts`: key `bubble.progress.v1` → `{ unlocked: number; best: Record<number, number>; muted: boolean }`. Wrap every access in try/catch and fall back to in-memory defaults (private mode, `file://` quirks).
- `src/ui/screens.ts`: Title, Stage Select (10 world tabs × 20 stage buttons; locked stages greyed out; best score shown), Pause overlay, Clear / Game Over panels. Draw everything on the canvas, or use minimal DOM overlays styled with inline CSS. Either way, everything must end up inside the single HTML file.
- Main loop (`src/main.ts`): `requestAnimationFrame` with a fixed-step accumulator (1/120 s, max 5 steps per frame). Pause automatically on `visibilitychange`.

---

## 6. Project Layout

```text
.gitignore                 # node_modules/, release/, coverage/
package.json
tsconfig.json
vite.config.ts
index.html                 # dev entry; <canvas id="game">, <script type="module" src="/src/main.ts">
build.sh
history.md
scripts/
  gen-stages.ts
  verify-release.mjs
src/
  main.ts
  core/constants.ts
  core/board.ts
  core/physics.ts
  core/match.ts
  core/game.ts
  core/rng.ts
  stages/types.ts
  stages/handmade.ts
  stages/generator.ts
  stages/stages.json
  stages/index.ts
  render/renderer.ts
  input/input.ts
  audio/sfx.ts
  storage/progress.ts
  ui/screens.ts
tests/
  board.test.ts
  physics.test.ts
  match.test.ts
  game.test.ts
  rng.test.ts
  stages.test.ts
  progress.test.ts
  release.test.ts          # optional; may live only in verify-release.mjs
```

### 6.1 `package.json` scripts

```json
{
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "gen:stages": "tsx scripts/gen-stages.ts",
    "build": "vite build",
    "verify:release": "node scripts/verify-release.mjs"
  }
}
```

### 6.2 `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'release',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  test: { environment: 'node' },
});
```

### 6.3 `build.sh`

```bash
#!/usr/bin/env bash
# 단일 index.html 릴리스 빌드 스크립트
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm ci
fi

npm run typecheck
npm test
npm run build
npm run verify:release

echo "OK: release/index.html"
```

`chmod +x build.sh`. Use LF line endings.

### 6.4 `scripts/verify-release.mjs`

Fail (exit 1) unless all of these hold:

- `release/` contains exactly one entry, `index.html`.
- The file contains no `<script ... src=`, no `<link ... href=`, no `url(http`, and no `import(` of a relative path.
- The file contains an inline `<script` with non-trivial length (> 10 KB).
- The file size is below 2 MB. Print the size.

---

## 7. Work Breakdown (one task = one commit, TDD each)

Each task follows: **Plan → RED (write failing tests and confirm they fail for the right reason, not a compile error) → GREEN (minimal implementation) → refactor → run the full suite → prepend a `history.md` entry (Korean) → commit.**

| # | Task | RED tests / checks | Commit |
|---|---|---|---|
| 1 | Scaffold: `package.json`, tsconfig, vite config, `index.html`, `build.sh`, `verify-release.mjs`, stub `main.ts` | `verify-release.mjs` fails with no `release/`; after build, `./build.sh` passes | `build: scaffold vite single-file typescript project` |
| 2 | `constants` + `board` (hex grid) | neighbors at corners/edges for even/odd rows; `cellToPixel`↔`pixelToNearestCell` round trip; out-of-range cells rejected; empty board | `feat(core): add hex grid board model` |
| 3 | `rng` | determinism for the same seed; range `[0,1)`; distinct seeds diverge | `feat(core): add seeded mulberry32 rng` |
| 4 | `match` | group of 2 not removed, 3 removed; chain spans parity rows; floating drop after support removed; empty board; full board; single cell | `feat(core): add match and floating-drop logic` |
| 5 | `physics` | straight shot hits ceiling and snaps to row 0; wall bounce mirrors angle; angle clamped at 10°/170°; fast-shot tunneling impossible; snap chooses the nearest empty cell; `traceAimPath` bounce points | `feat(core): add shot physics and snapping` |
| 6 | `game` state machine | clear when board emptied; game over at deadline; ceiling descends after `dropInterval` shots; next-color re-roll when a color vanishes; score formula; pause has no effect on simulation | `feat(core): add game state machine and scoring` |
| 7 | Stage types + handmade 1–10 + generator + `gen-stages` + `stages.json` | exactly 200 stages, ids 1..200; all §4.5 rules hold for every stage; difficulty table respected; `generate()` output equals committed `stages.json` (determinism / drift guard) | `feat(stages): add 200 stages with seeded generator` |
| 8 | `progress` storage | defaults when storage throws; unlock next on clear; best score only increases; corrupt JSON → defaults | `feat(storage): persist stage progress` |
| 9 | Renderer + input + screens + main loop | manual check via `npm run dev`; typecheck clean (rendering is not unit-tested) | `feat(ui): add canvas renderer, input and screens` |
| 10 | SFX + polish (particles, shake, mute) | typecheck + tests pass; manual check | `feat(audio): add synthesized sound effects` |
| 11 | Final release check | `./build.sh` on a clean clone (`git clean -xdf` in a scratch copy) succeeds; open `release/index.html` via `file://` | `chore(release): verify single-file build` (only if files changed) |

Do not start task N+1 until task N is committed with a green suite.

---

## 8. Conventions (mandatory)

- **Comments**: Korean, explaining *why* (intent, constraints, trade-offs). For non-trivial algorithms, state complexity, e.g. `// O(n) 시간, O(n) 공간`.
- **Encoding**: UTF-8 without BOM, LF line endings. After each edit, check that the Korean text is not mangled.
- **Edits**: prefer targeted patches over full-file rewrites.
- **Scope**: no unrequested refactors, reformatting, or dependency upgrades. If a requirement is ambiguous, ask the user.
- **Tests**: never delete or weaken a test to make it pass. Never report "tests pass" without running them.
- **`history.md`**: prepend (newest first). Each entry ≤ 12 lines / ≤ 800 chars, in Korean, using this format:

  ```markdown
  ### [YYYY-MM-DD HH:MM] 작업 요약
  - **기획:** ...
  - **TC:** 정상: ... / 엣지: ...
  - **개발:** file paths only (max 8, then `외 N개 파일`)
  - **검증:** 42 passed, 0 failed
  - **비고:** (omit if none)
  ```

  Use the real system time (`date '+%Y-%m-%d %H:%M'`). Never paste code, diffs, or test output. Never edit old entries. Rotate to `history/archive/history-YYYY-MM.md` when the file exceeds 30 entries / 40 KB. Read only the top of `history.md` (`head -c 4000`).
- **Commits**: English, Conventional Commits `<type>(<scope>): <subject>`. The body explains *why*. One task per commit. **Never `git push`** unless the user asks.
- **Reporting to the human**: Korean, using these sections: `## [Step N] 단계명` / `### 수행 내용` / `### 결과` / `### 다음 단계`.

---

## 9. Risks & Notes

- **Snap edge cases**: a shot grazing two bubbles can resolve to an occupied cell. Always search the candidate set for *empty* cells, and fall back to a BFS ring search.
- **Odd-row mirror symmetry**: mirroring an odd row (7 cells) maps `c → 6 - c`; an even row maps `c → 7 - c`.
- **TypeScript 7** (native compiler) is new. If an incompatibility with Vite/Vitest appears, pin TypeScript `5.x` instead. Record the reason in `history.md` 비고 and the commit body.
- **`file://` + `localStorage`**: some browsers isolate or disable storage for `file://`. Hence the try/catch fallback in §5.
- **AudioContext** must be created or resumed inside a user gesture. Otherwise browsers block audio.
- **Output size**: keep `release/index.html` small (target < 300 KB). `stages.json` (200 × ~10 short strings) is about 60 KB, which is acceptable.
