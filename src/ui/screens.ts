// 화면 상태 머신: Title → StageSelect → Playing(일시정지/클리어/게임오버 오버레이 포함).
// 모든 UI 를 캔버스에 직접 그리고, 버튼 배치 함수를 그리기와 탭 판정이 공유해 둘이 어긋나지 않게 한다.
import type { Point } from '../core/board';
import { CANVAS_W } from '../core/constants';
import { Game, type GameEvent, type GameInput } from '../core/game';
import type { FrameInput } from '../input/input';
import { pointerToAngle } from '../input/input';
import { type Button, HUD_TOP, PAUSE_BUTTON, type Rect, Renderer, UI } from '../render/renderer';
import type { StageDef } from '../stages/types';
import type { ProgressStore } from '../storage/progress';

export type Screen = 'title' | 'select' | 'playing';

export interface AppHooks {
  /** 게임 이벤트 (효과음·파티클 연결용) */
  onGameEvent?(e: GameEvent): void;
  /** 화면 버튼/키 조작음 */
  onUiClick?(): void;
  /** 음소거 상태가 바뀌었을 때 */
  onMuteChange?(muted: boolean): void;
  /** 스테이지를 새로 시작할 때 (이전 판의 파티클 정리용) */
  onStageStart?(): void;
  /** 렌더러가 보드 위에 덧그릴 효과 (파티클 등) */
  drawEffects?(r: Renderer): void;
  /** 이번 프레임 보드 흔들림 오프셋 */
  shakeOffset?(time: number, warning: boolean): number;
}

const WORLDS = 10;
const PER_WORLD = 20;
const GRID_COLS = 4;
/** 월드 6 이상은 조준선의 반사 경로를 숨겨 난이도를 올린다 */
const FULL_GUIDE_MAX_WORLD = 5;

const FIRE_KEYS = new Set(['Space', 'ArrowUp']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const CONFIRM_KEYS = new Set(['Enter', 'Space']);

const inRect = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class App {
  screen: Screen = 'title';
  /** 스테이지 선택 화면에서 보고 있는 월드 */
  world = 1;
  /** 키보드 커서가 가리키는 스테이지 id */
  cursor = 1;
  game: Game | null = null;
  private resultSaved = false;
  private bestBefore = 0;
  private lastPointer: Point | undefined;
  private time = 0;
  private readonly progress: ProgressStore;
  private readonly stages: readonly StageDef[];
  private readonly hooks: AppHooks;

  constructor(progress: ProgressStore, stages: readonly StageDef[], hooks: AppHooks = {}) {
    this.progress = progress;
    this.stages = stages;
    this.hooks = hooks;
    const unlocked = Math.min(progress.get().unlocked, stages.length);
    this.cursor = unlocked;
    this.world = Math.ceil(unlocked / PER_WORLD);
  }

  get muted(): boolean {
    return this.progress.get().muted;
  }

  /** 탭 전환·창 최소화 시 자동 일시정지 */
  autoPause(): void {
    const g = this.game;
    if (this.screen === 'playing' && g && !g.paused && this.isActive(g)) g.update(0, this.pauseToggle());
  }

  update(dt: number, input: FrameInput): void {
    this.time += dt;
    if (input.keys.includes('KeyM')) this.toggleMute();
    switch (this.screen) {
      case 'title':
        this.updateTitle(input);
        break;
      case 'select':
        this.updateSelect(input);
        break;
      case 'playing':
        this.updatePlaying(dt, input);
        break;
    }
  }

  draw(r: Renderer): void {
    r.beginFrame();
    switch (this.screen) {
      case 'title':
        this.drawTitle(r);
        break;
      case 'select':
        this.drawSelect(r);
        break;
      case 'playing':
        this.drawPlaying(r);
        break;
    }
  }

  // ── 공통 ──────────────────────────────────────────────────

  private toggleMute(): void {
    const muted = !this.progress.get().muted;
    this.progress.setMuted(muted);
    this.hooks.onMuteChange?.(muted);
  }

  private muteButton(): Button {
    return { id: 'mute', x: CANVAS_W - 44, y: 8, w: 36, h: 22, label: this.muted ? 'OFF' : 'SND', enabled: true };
  }

  private hit(buttons: Button[], taps: Point[]): Button | undefined {
    for (const t of taps) {
      const b = buttons.find((btn) => btn.enabled && inRect(t, btn));
      if (b) return b;
    }
    return undefined;
  }

  private isActive(g: Game): boolean {
    return g.phase === 'aiming' || g.phase === 'flying' || g.phase === 'resolving';
  }

  private pauseToggle(): GameInput {
    return { aimDelta: 0, fire: false, pause: true };
  }

  private isUnlocked(id: number): boolean {
    return id >= 1 && id <= this.progress.get().unlocked;
  }

  // ── 타이틀 ────────────────────────────────────────────────

  private titleButtons(): Button[] {
    return [
      { id: 'play', x: CANVAS_W / 2 - 60, y: 300, w: 120, h: 40, label: 'PLAY', enabled: true, selected: true },
      this.muteButton(),
    ];
  }

  private updateTitle(input: FrameInput): void {
    const b = this.hit(this.titleButtons(), input.taps);
    if (b?.id === 'mute') {
      this.toggleMute();
      return;
    }
    if (b || input.keys.some((k) => CONFIRM_KEYS.has(k))) {
      this.hooks.onUiClick?.();
      this.screen = 'select';
    }
  }

  private drawTitle(r: Renderer): void {
    // 배경 장식 버블: 시간에 따라 천천히 흔들린다
    for (let i = 0; i < 14; i++) {
      const x = 24 + ((i * 53) % 240);
      const y = 60 + ((i * 97) % 200) + Math.sin(this.time * 1.2 + i) * 6;
      r.bubble(x, y, (i % 8) as 0, 12 + (i % 3) * 3, 0.35);
    }
    r.text('BUBBLE', CANVAS_W / 2, 150, 44, UI.accent);
    r.text('PUZZLE', CANVAS_W / 2, 196, 34, UI.text);
    r.text('200 stages', CANVAS_W / 2, 236, 12, UI.dim, 'center', '600');
    for (const b of this.titleButtons()) r.button(b);
    const blink = Math.floor(this.time * 2) % 2 === 0;
    if (blink) r.text('Tap or press Enter', CANVAS_W / 2, 370, 12, UI.dim, 'center', '600');
    r.text('← → aim · Space fire · P pause · M sound', CANVAS_W / 2, 440, 9, UI.dim, 'center', '500');
  }

  // ── 스테이지 선택 ──────────────────────────────────────────

  private selectButtons(): Button[] {
    const unlocked = this.progress.get().unlocked;
    const best = this.progress.get().best;
    const out: Button[] = [];
    // 월드 탭 2행 × 5
    for (let w = 1; w <= WORLDS; w++) {
      const i = w - 1;
      out.push({
        id: `world:${w}`,
        x: 16 + (i % 5) * 52,
        y: 52 + Math.floor(i / 5) * 28,
        w: 48,
        h: 24,
        label: `W${w}`,
        enabled: true,
        selected: w === this.world,
        locked: false,
      });
    }
    // 스테이지 4 × 5
    const first = (this.world - 1) * PER_WORLD + 1;
    for (let k = 0; k < PER_WORLD; k++) {
      const id = first + k;
      if (id > this.stages.length) break;
      const locked = id > unlocked;
      out.push({
        id: `stage:${id}`,
        x: 16 + (k % GRID_COLS) * 66,
        y: 128 + Math.floor(k / GRID_COLS) * 58,
        w: 58,
        h: 50,
        label: String(id),
        sub: locked ? '' : best[id] ? String(best[id]) : '-',
        enabled: !locked,
        locked,
        selected: id === this.cursor,
      });
    }
    out.push({ id: 'back', x: 16, y: 430, w: 80, h: 30, label: 'BACK', enabled: true });
    out.push(this.muteButton());
    return out;
  }

  private moveCursor(delta: number): void {
    this.cursor = Math.min(this.stages.length, Math.max(1, this.cursor + delta));
    this.world = Math.ceil(this.cursor / PER_WORLD);
  }

  private updateSelect(input: FrameInput): void {
    for (const k of input.keys) {
      if (k === 'ArrowLeft') this.moveCursor(-1);
      else if (k === 'ArrowRight') this.moveCursor(1);
      else if (k === 'ArrowUp') this.moveCursor(-GRID_COLS);
      else if (k === 'ArrowDown') this.moveCursor(GRID_COLS);
      else if (k === 'PageDown' || k === 'Tab') this.moveCursor(PER_WORLD - ((this.cursor - 1) % PER_WORLD));
      else if (k === 'PageUp') this.moveCursor(-((this.cursor - 1) % PER_WORLD) - PER_WORLD);
      else if (k === 'Escape') {
        this.screen = 'title';
        return;
      } else if (CONFIRM_KEYS.has(k) && this.isUnlocked(this.cursor)) {
        this.startStage(this.cursor);
        return;
      }
    }
    const b = this.hit(this.selectButtons(), input.taps);
    if (!b) return;
    if (b.id === 'mute') this.toggleMute();
    else if (b.id === 'back') this.screen = 'title';
    else if (b.id.startsWith('world:')) {
      this.world = Number(b.id.slice(6));
      this.cursor = (this.world - 1) * PER_WORLD + 1;
      this.hooks.onUiClick?.();
    } else if (b.id.startsWith('stage:')) {
      this.startStage(Number(b.id.slice(6)));
    }
  }

  private drawSelect(r: Renderer): void {
    r.text('SELECT STAGE', 16, 22, 16, UI.text, 'left');
    const s = this.stages[(this.world - 1) * PER_WORLD];
    if (s) r.text(`World ${this.world} · ${s.colors} colors`, CANVAS_W / 2, 116, 11, UI.dim, 'center', '600');
    for (const b of this.selectButtons()) r.button(b);
    r.text(`${this.progress.get().unlocked} / ${this.stages.length}`, CANVAS_W - 16, 445, 11, UI.dim, 'right', '600');
  }

  // ── 플레이 ────────────────────────────────────────────────

  private startStage(id: number): void {
    const stage = this.stages[id - 1];
    if (!stage) return;
    this.hooks.onUiClick?.();
    this.hooks.onStageStart?.();
    this.game = new Game(stage);
    this.cursor = id;
    this.world = Math.ceil(id / PER_WORLD);
    this.resultSaved = false;
    this.bestBefore = this.progress.get().best[id] ?? 0;
    this.lastPointer = undefined;
    this.screen = 'playing';
  }

  private toSelect(): void {
    this.hooks.onUiClick?.();
    this.game = null;
    this.screen = 'select';
  }

  private overlayButtons(g: Game): Button[] {
    const cx = CANVAS_W / 2;
    const mk = (id: string, label: string, i: number, selected = false): Button => ({
      id, label, x: cx - 70, y: 236 + i * 44, w: 140, h: 36, enabled: true, selected,
    });
    if (g.paused) return [mk('resume', 'RESUME', 0, true), mk('retry', 'RETRY', 1), mk('select', 'STAGES', 2)];
    if (g.phase === 'cleared') {
      const hasNext = g.stage.id < this.stages.length;
      return hasNext ? [mk('next', 'NEXT', 0, true), mk('select', 'STAGES', 1)] : [mk('select', 'STAGES', 0, true)];
    }
    if (g.phase === 'gameOver') return [mk('retry', 'RETRY', 0, true), mk('select', 'STAGES', 1)];
    return [];
  }

  private doOverlayAction(id: string, g: Game): void {
    switch (id) {
      case 'resume':
        g.update(0, this.pauseToggle());
        break;
      case 'retry':
        this.startStage(g.stage.id);
        break;
      case 'next':
        this.startStage(g.stage.id + 1);
        break;
      case 'select':
        this.toSelect();
        break;
    }
  }

  private updatePlaying(dt: number, input: FrameInput): void {
    const g = this.game;
    if (!g) {
      this.screen = 'select';
      return;
    }

    if (g.phase === 'cleared' && !this.resultSaved) {
      this.progress.recordClear(g.stage.id, g.score);
      this.resultSaved = true;
    }

    // 오버레이(일시정지/클리어/게임오버)가 떠 있으면 버튼과 확인 키만 받는다
    const overlay = this.overlayButtons(g);
    if (overlay.length > 0) {
      const b = this.hit(overlay, input.taps);
      if (b) return this.doOverlayAction(b.id, g);
      if (g.paused && input.keys.some((k) => PAUSE_KEYS.has(k))) return this.doOverlayAction('resume', g);
      if (input.keys.some((k) => CONFIRM_KEYS.has(k))) return this.doOverlayAction(overlay[0].id, g);
      if (!g.paused && input.keys.includes('Escape')) return this.toSelect();
      return;
    }

    const playTaps = input.taps.filter((t) => t.y < HUD_TOP);
    const pauseTapped = input.taps.some((t) => inRect(t, PAUSE_BUTTON));
    // 마우스를 캔버스에 올려 둔 채 키보드로 조준할 때 포인터가 매 프레임 각도를 덮어쓰지 않도록, 움직였을 때만 반영한다
    const p = input.pointer;
    const moved = p !== undefined && (this.lastPointer === undefined || p.x !== this.lastPointer.x || p.y !== this.lastPointer.y);
    this.lastPointer = p;
    const lastTap = playTaps[playTaps.length - 1];
    const aimPoint = lastTap ?? (moved && p && p.y < HUD_TOP ? p : undefined);

    const gi: GameInput = {
      aimAngle: aimPoint ? pointerToAngle(aimPoint.x, aimPoint.y) : undefined,
      aimDelta: input.aimDelta,
      fire: playTaps.length > 0 || input.keys.some((k) => FIRE_KEYS.has(k)),
      pause: pauseTapped || input.keys.some((k) => PAUSE_KEYS.has(k)),
    };
    g.update(dt, gi);
    for (const e of g.drainEvents()) this.hooks.onGameEvent?.(e);
  }

  private drawPlaying(r: Renderer): void {
    const g = this.game;
    if (!g) return;
    const world = Math.ceil(g.stage.id / PER_WORLD);
    const guide = world <= FULL_GUIDE_MAX_WORLD ? 2 : null;
    const shake = this.hooks.shakeOffset?.(this.time, g.dropWarning) ?? 0;
    r.playfield(g, this.time, guide, shake);
    this.hooks.drawEffects?.(r);
    r.hud(g.stage.id, g.score, g.shotsUntilDrop, g.dropWarning, this.time);

    const overlay = this.overlayButtons(g);
    if (overlay.length === 0) return;
    r.dim();
    const box: Rect = { x: 34, y: 120, w: CANVAS_W - 68, h: 120 + overlay.length * 44 };
    r.panel(box);
    if (g.paused) {
      r.text('PAUSED', CANVAS_W / 2, 170, 26, UI.text);
      r.text(`Stage ${g.stage.id}`, CANVAS_W / 2, 204, 12, UI.dim, 'center', '600');
    } else if (g.phase === 'cleared') {
      r.text('STAGE CLEAR!', CANVAS_W / 2, 152, 24, UI.accent);
      r.text(`Score ${g.score.toLocaleString('en-US')}`, CANVAS_W / 2, 186, 14, UI.text);
      const best = Math.max(this.bestBefore, g.score);
      const record = g.score > this.bestBefore;
      r.text(record ? 'NEW BEST!' : `Best ${best.toLocaleString('en-US')}`, CANVAS_W / 2, 210, 11, record ? UI.accent : UI.dim);
    } else {
      r.text('GAME OVER', CANVAS_W / 2, 160, 26, UI.danger);
      r.text(`Stage ${g.stage.id} · Score ${g.score.toLocaleString('en-US')}`, CANVAS_W / 2, 200, 12, UI.dim, 'center', '600');
    }
    for (const b of overlay) r.button(b);
  }
}

