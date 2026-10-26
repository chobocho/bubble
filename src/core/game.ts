// 한 스테이지 플레이 세션의 상태 머신. DOM 비의존 — update(dt, input) 만으로 진행되어 단위 테스트가 가능하다.
// Aiming → Flying → Resolving → (Aiming | Cleared | GameOver), 일시정지는 phase 와 별개의 플래그로 둔다.
import { type Board, type Color, colorsPresent, createBoard, isEmpty, setCell } from './board';
import { DEADLINE_ROW, MAX_ROWS } from './constants';
import { type PlacedCell, resolveShot } from './match';
import { clampAngle, createShot, type Shot, stepShot } from './physics';
import { mulberry32, type Rng, stageSeed } from './rng';

/** 게임 세션에 필요한 최소 스테이지 정보 (StageDef 가 구조적으로 만족한다) */
export interface GameStage {
  id: number;
  dropInterval: number;
  rows: string[];
}

export interface GameInput {
  /** 포인터 조준 시 절대 각도(라디안) */
  aimAngle?: number;
  /** 키보드 조준: +1 = 반시계(왼쪽), -1 = 시계(오른쪽) */
  aimDelta: number;
  /** 이번 프레임에 발사 요청이 있었는지 (엣지 트리거) */
  fire: boolean;
  /** 이번 프레임에 일시정지 토글 요청이 있었는지 (엣지 트리거) */
  pause: boolean;
}

export type GamePhase = 'aiming' | 'flying' | 'resolving' | 'cleared' | 'gameOver';

export type GameEvent =
  | { type: 'fire' }
  | { type: 'bounce' }
  | { type: 'stick'; row: number; col: number; color: Color }
  | { type: 'pop'; cells: PlacedCell[]; ceilingOffset: number }
  | { type: 'drop'; cells: PlacedCell[]; ceilingOffset: number }
  | { type: 'ceiling' }
  | { type: 'clear'; bonus: number }
  | { type: 'gameover' };

export interface GameOptions {
  /** 발사 색 RNG 시드 (기본: 스테이지 시드) */
  seed?: number;
  /** 테스트용: 초기 [current, next] 를 고정 */
  queue?: [Color, Color];
}

/** 키보드 조준 회전 속도 (rad/s) */
const AIM_SPEED = Math.PI * 0.6;
/** 팝/낙하 연출을 보여 주는 동안 다음 발사를 막는 시간 (초) */
const RESOLVE_TIME = 0.15;
/** 헬프로 가이드를 켜고 쏜 발의 점수 배율 */
export const HELP_SCORE_RATE = 0.1;

export function shotScore(popped: number, dropped: number): number {
  return popped * 10 + (dropped > 0 ? 10 * 2 ** Math.min(dropped, 16) : 0);
}

export function clearBonus(shotsUsed: number): number {
  return 1000 + Math.max(0, 50 - shotsUsed) * 20;
}

export class Game {
  readonly stage: GameStage;
  readonly board: Board;
  phase: GamePhase = 'aiming';
  paused = false;
  current: Color;
  next: Color;
  angle = Math.PI / 2;
  score = 0;
  shotsUsed = 0;
  shot: Shot | null = null;
  /** 헬프로 가이드를 켠 상태. 다음 1발에만 적용되고 발사 시 꺼진다. */
  helpActive = false;
  /** 지금 날아가는 샷이 헬프 가이드를 보고 쏜 것인지 (점수 배율 적용용) */
  private shotHelped = false;
  private shotsSinceDrop = 0;
  private resolveTimer = 0;
  private events: GameEvent[] = [];
  private readonly rng: Rng;

  constructor(stage: GameStage, opts: GameOptions = {}) {
    this.stage = stage;
    this.board = createBoard(stage.rows);
    this.rng = mulberry32(opts.seed ?? stageSeed(stage.id));
    this.current = opts.queue?.[0] ?? this.rollColor();
    this.next = opts.queue?.[1] ?? this.rollColor();
  }

  /** 다음 천장 하강까지 남은 샷 수 */
  get shotsUntilDrop(): number {
    return this.stage.dropInterval - this.shotsSinceDrop;
  }

  /** 하강 직전 마지막 2샷 동안 보드를 흔들어 경고한다 */
  get dropWarning(): boolean {
    return this.shotsUntilDrop <= 2 && (this.phase === 'aiming' || this.phase === 'flying');
  }

  /** 조준 가이드 표시 여부. 스테이지 1 은 항상, 이후 스테이지는 첫 발과 헬프 사용 시에만 보인다. */
  get guideVisible(): boolean {
    return this.stage.id === 1 || this.shotsUsed === 0 || this.helpActive;
  }

  /** 가이드가 숨겨진 조준 중에만 헬프를 켤 수 있다 */
  get canHelp(): boolean {
    return !this.paused && (this.phase === 'aiming' || this.phase === 'resolving') && !this.guideVisible;
  }

  /** 헬프 가이드를 켠다. 켰으면 true — 호출자가 이때만 헬프 횟수를 차감한다. */
  activateHelp(): boolean {
    if (!this.canHelp) return false;
    this.helpActive = true;
    return true;
  }

  /** 렌더러·효과음이 소비할 이벤트를 꺼내고 비운다 */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  update(dt: number, input: GameInput): void {
    const active = this.phase === 'aiming' || this.phase === 'flying' || this.phase === 'resolving';
    if (!active) return;
    if (input.pause) this.paused = !this.paused;
    if (this.paused) return;

    if (input.aimAngle !== undefined) this.angle = clampAngle(input.aimAngle);
    if (input.aimDelta !== 0) this.angle = clampAngle(this.angle + input.aimDelta * AIM_SPEED * dt);

    switch (this.phase) {
      case 'aiming':
        if (input.fire) this.fire();
        break;
      case 'flying':
        this.fly(dt);
        break;
      case 'resolving':
        this.resolveTimer -= dt;
        if (this.resolveTimer <= 0) this.phase = 'aiming';
        break;
    }
  }

  /** 보드에 남은 색 중에서 균등하게 뽑는다. 정렬해 두어 Set 순회 순서와 무관하게 결정적이다. */
  private rollColor(): Color {
    const colors = [...colorsPresent(this.board)].sort((a, b) => a - b);
    if (colors.length === 0) return 0;
    return colors[Math.floor(this.rng() * colors.length)];
  }

  private fire(): void {
    this.shot = createShot(this.angle, this.current);
    this.shotHelped = this.helpActive;
    this.helpActive = false;
    this.current = this.next;
    this.next = this.rollColor();
    this.shotsUsed++;
    this.phase = 'flying';
    this.events.push({ type: 'fire' });
  }

  private fly(dt: number): void {
    const shot = this.shot;
    if (!shot) return;
    const res = stepShot(this.board, shot, dt);
    if (res.bounced) this.events.push({ type: 'bounce' });
    if (!res.stopped || !res.snap) return;
    this.shot = null;
    const { row, col } = res.snap;
    if (row >= MAX_ROWS) {
      this.lose();
      return;
    }
    setCell(this.board, row, col, shot.color);
    this.events.push({ type: 'stick', row, col, color: shot.color });
    this.afterStick(row, col);
  }

  private afterStick(row: number, col: number): void {
    const { popped, dropped } = resolveShot(this.board, row, col);
    const offset = this.board.ceilingOffset;
    if (popped.length > 0) this.events.push({ type: 'pop', cells: popped, ceilingOffset: offset });
    if (dropped.length > 0) this.events.push({ type: 'drop', cells: dropped, ceilingOffset: offset });
    const gained = shotScore(popped.length, dropped.length);
    this.score += this.shotHelped ? Math.floor(gained * HELP_SCORE_RATE) : gained;

    if (isEmpty(this.board)) {
      const bonus = clearBonus(this.shotsUsed);
      this.score += bonus;
      this.phase = 'cleared';
      this.events.push({ type: 'clear', bonus });
      return;
    }
    if (this.crossedDeadline()) {
      this.lose();
      return;
    }
    this.shotsSinceDrop++;
    if (this.shotsSinceDrop >= this.stage.dropInterval) {
      this.shotsSinceDrop = 0;
      this.board.ceilingOffset++;
      this.events.push({ type: 'ceiling' });
      if (this.crossedDeadline()) {
        this.lose();
        return;
      }
    }

    const present = colorsPresent(this.board);
    if (!present.has(this.current)) this.current = this.rollColor();
    if (!present.has(this.next)) this.next = this.rollColor();
    this.phase = 'resolving';
    this.resolveTimer = RESOLVE_TIME;
  }

  private crossedDeadline(): boolean {
    const limit = DEADLINE_ROW - this.board.ceilingOffset;
    for (let r = Math.max(0, limit); r < MAX_ROWS; r++) {
      if (this.board.cells[r].some((c) => c !== null)) return true;
    }
    return false;
  }

  private lose(): void {
    this.phase = 'gameOver';
    this.events.push({ type: 'gameover' });
  }
}
