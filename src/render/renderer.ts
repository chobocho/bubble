// Canvas 2D 렌더러. 이미지 에셋 없이 모든 그래픽을 절차적으로 그려 단일 HTML 에 담는다.
// 논리 좌표(288×480)로 그리고, 화면 비율을 유지하며 devicePixelRatio 를 곱한 백킹 스토어로 선명하게 출력한다.
import { type Color, cellToPixel, type Point } from '../core/board';
import {
  BOARD_LEFT, BOARD_RIGHT, BOARD_TOP, BOARD_WIDTH, CANVAS_H, CANVAS_W, DEADLINE_ROW, MAX_ROWS, PALETTE, R, ROW_H,
  SHOOTER_X, SHOOTER_Y,
} from '../core/constants';
import type { Game } from '../core/game';
import { traceAimPath } from '../core/physics';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Button extends Rect {
  id: string;
  label: string;
  sub?: string;
  enabled: boolean;
  selected?: boolean;
  locked?: boolean;
}

/** 하단 HUD 의 일시정지 버튼 영역 (App 의 탭 판정과 공유) */
export const PAUSE_BUTTON: Rect = { x: 250, y: 458, w: 38, h: 22 };
/** 하단 HUD 의 헬프(조준 가이드) 버튼 영역 */
export const HELP_BUTTON: Rect = { x: 184, y: 459, w: 58, h: 20 };
/** 하단 HUD 띠의 시작 y. 이 아래를 탭하면 발사로 보지 않는다. */
export const HUD_TOP = 458;

const NEXT_POS: Point = { x: 64, y: 444 };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const UI = {
  bg0: '#182038',
  bg1: '#0c101c',
  field: 'rgba(255,255,255,0.035)',
  wall0: '#5a6a8c',
  wall1: '#2c3550',
  text: '#f2f5fb',
  dim: '#8d97b3',
  accent: '#ffd34d',
  danger: '#ff5a5a',
  panel: 'rgba(14,18,32,0.92)',
  button: '#2f3b5e',
  buttonHi: '#4a5c90',
  locked: '#222a3d',
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** t ∈ [0,1] 만큼 target 색 쪽으로 섞는다 */
function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (a: number, z: number) => Math.round(a + (z - a) * t);
  return `rgb(${m(r, target[0])},${m(g, target[1])},${m(b, target[2])})`;
}

function create2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다');
  return ctx;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** 논리 좌표 → 백킹 스토어 픽셀 배율 */
  private pixelScale = 1;
  private sprites: HTMLCanvasElement[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = create2d(canvas);
    this.resize();
  }

  /** 뷰포트에 맞춰 비율 유지 스케일. 스프라이트도 새 배율로 다시 만들어 확대 시 흐려지지 않게 한다. */
  resize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.max(0.1, Math.min(vw / CANVAS_W, vh / CANVAS_H));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${Math.floor(CANVAS_W * scale)}px`;
    this.canvas.style.height = `${Math.floor(CANVAS_H * scale)}px`;
    this.canvas.width = Math.max(1, Math.round(CANVAS_W * scale * dpr));
    this.canvas.height = Math.max(1, Math.round(CANVAS_H * scale * dpr));
    this.pixelScale = this.canvas.width / CANVAS_W;
    this.buildSprites();
  }

  /** 색마다 버블 스프라이트를 한 번만 그려 두고 drawImage 로 재사용한다 (매 프레임 그라디언트 생성 비용 제거) */
  private buildSprites(): void {
    const px = Math.max(8, Math.ceil(2 * R * this.pixelScale));
    this.sprites = PALETTE.map((hex) => {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const g = create2d(c);
      const r = px / 2;
      const grad = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.08, r, r, r);
      grad.addColorStop(0, mix(hex, [255, 255, 255], 0.65));
      grad.addColorStop(0.5, hex);
      grad.addColorStop(1, mix(hex, [0, 0, 0], 0.5));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(r, r, r * 0.95, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(1, px * 0.03);
      g.strokeStyle = mix(hex, [0, 0, 0], 0.65);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.ellipse(r * 0.66, r * 0.55, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2);
      g.fill();
      return c;
    });
  }

  beginFrame(): void {
    const { ctx } = this;
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, UI.bg0);
    grad.addColorStop(1, UI.bg1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  bubble(x: number, y: number, color: Color, radius = R, alpha = 1): void {
    const { ctx } = this;
    if (alpha <= 0) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * Math.min(1, alpha);
    ctx.drawImage(this.sprites[color], x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = prev;
  }

  text(str: string, x: number, y: number, size: number, color: string = UI.text, align: CanvasTextAlign = 'center', weight = 'bold'): void {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  roundRect(r: Rect, radius: number, fill: string, stroke?: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  button(b: Button): void {
    const fill = b.locked ? UI.locked : b.selected ? UI.buttonHi : UI.button;
    this.roundRect(b, 6, fill, b.selected ? UI.accent : 'rgba(255,255,255,0.12)');
    const color = b.enabled ? UI.text : UI.dim;
    if (b.locked) {
      this.lock(b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 5 : 0));
    } else {
      this.text(b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 6 : 0), b.sub ? 15 : 13, color);
    }
    if (b.sub) this.text(b.sub, b.x + b.w / 2, b.y + b.h - 10, 9, b.locked ? UI.dim : UI.accent, 'center', '600');
  }

  /** 잠긴 스테이지 자물쇠 아이콘 (이모지 글꼴 의존을 피하려고 직접 그린다) */
  private lock(x: number, y: number): void {
    const { ctx } = this;
    ctx.strokeStyle = UI.dim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 3, 4.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = UI.dim;
    ctx.fillRect(x - 7, y - 3, 14, 10);
  }

  panel(r: Rect): void {
    this.roundRect(r, 10, UI.panel, 'rgba(255,255,255,0.18)');
  }

  dim(alpha = 0.55): void {
    this.ctx.fillStyle = `rgba(5,7,14,${alpha})`;
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── 플레이 화면 ─────────────────────────────────────────────

  /**
   * @param guideBounces 조준선이 보여 줄 벽 반사 횟수. null 이면 첫 구간만 그린다 (월드 6 이상), false 면 숨긴다.
   * @param shake 보드 흔들림 x 오프셋 (천장 하강 경고)
   */
  playfield(game: Game, time: number, guideBounces: number | null | false, shake: number): void {
    const { ctx } = this;
    const top = BOARD_TOP + game.board.ceilingOffset * ROW_H;

    ctx.fillStyle = UI.field;
    ctx.fillRect(BOARD_LEFT, 0, BOARD_WIDTH, CANVAS_H);
    this.walls();
    this.ceiling(top);
    this.deadline();

    if (guideBounces !== false && (game.phase === 'aiming' || game.phase === 'resolving')) {
      this.aimGuide(game, time, guideBounces);
    }

    ctx.save();
    ctx.translate(shake, 0);
    for (let r = 0; r < MAX_ROWS; r++) {
      const row = game.board.cells[r];
      for (let c = 0; c < row.length; c++) {
        const color = row[c];
        if (color === null) continue;
        const p = cellToPixel(r, c, game.board.ceilingOffset);
        this.bubble(p.x, p.y, color);
      }
    }
    ctx.restore();

    if (game.shot) this.bubble(game.shot.x, game.shot.y, game.shot.color);
    this.launcher(game);
  }

  private walls(): void {
    const { ctx } = this;
    for (const x of [0, BOARD_RIGHT]) {
      const grad = ctx.createLinearGradient(x, 0, x + BOARD_LEFT, 0);
      grad.addColorStop(0, UI.wall1);
      grad.addColorStop(0.5, UI.wall0);
      grad.addColorStop(1, UI.wall1);
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, BOARD_LEFT, CANVAS_H);
    }
  }

  /** 내려온 천장을 금속판으로 그린다. 판 아래 가장자리에 리벳을 찍어 하강을 눈에 띄게 한다. */
  private ceiling(top: number): void {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, top);
    grad.addColorStop(0, UI.wall1);
    grad.addColorStop(1, UI.wall0);
    ctx.fillStyle = grad;
    ctx.fillRect(BOARD_LEFT, 0, BOARD_WIDTH, top);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = BOARD_LEFT + 12; x < BOARD_RIGHT; x += 32) {
      ctx.beginPath();
      ctx.arc(x, top - 5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private deadline(): void {
    const { ctx } = this;
    // 실효 행이 DEADLINE_ROW 에 닿는 버블의 윗부분 높이. 천장과 무관하게 화면상 고정 위치다.
    const y = BOARD_TOP + R + DEADLINE_ROW * ROW_H - R * 0.6;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,90,90,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(BOARD_LEFT, y);
    ctx.lineTo(BOARD_RIGHT, y);
    ctx.stroke();
    ctx.restore();
  }

  private aimGuide(game: Game, time: number, guideBounces: number | null): void {
    const { ctx } = this;
    const pts = traceAimPath(game.board, game.angle, guideBounces ?? 0);
    const path = guideBounces === null ? pts.slice(0, 2) : pts;
    const spacing = 11;
    // 시간에 따라 점이 발사 방향으로 흘러가게 해 조준선임을 직관적으로 보여 준다
    let carry = (time * 40) % spacing;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = carry; d < len; d += spacing) {
        const t = d / len;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        // 발사대 근처 점은 버블과 겹치지 않게 생략
        if (Math.hypot(x - SHOOTER_X, y - SHOOTER_Y) < R + 4) continue;
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      carry = (carry - len) % spacing;
      if (carry < 0) carry += spacing;
    }
  }

  private launcher(game: Game): void {
    const { ctx } = this;
    // 받침
    ctx.fillStyle = UI.wall1;
    ctx.beginPath();
    ctx.arc(SHOOTER_X, SHOOTER_Y + 18, 26, Math.PI, 0);
    ctx.fill();
    // 회전 화살표
    ctx.save();
    ctx.translate(SHOOTER_X, SHOOTER_Y);
    ctx.rotate(-game.angle);
    ctx.fillStyle = UI.accent;
    ctx.beginPath();
    ctx.moveTo(R + 70, 0);
    ctx.lineTo(R + 54, -7);
    ctx.lineTo(R + 54, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(R - 2, -2, 58, 4);
    ctx.restore();

    if (game.phase === 'aiming' || game.phase === 'resolving') this.bubble(SHOOTER_X, SHOOTER_Y, game.current);
    if (game.phase !== 'cleared') {
      this.text('NEXT', NEXT_POS.x, NEXT_POS.y - 20, 9, UI.dim);
      this.bubble(NEXT_POS.x, NEXT_POS.y, game.next, R * 0.75);
    }
  }

  /**
   * @param helps 남은 헬프 횟수
   * @param help 헬프 버튼 상태: 'off' 사용 불가, 'ready' 사용 가능, 'on' 이번 발에 적용 중
   */
  hud(
    stageId: number, score: number, shotsUntilDrop: number, warning: boolean, time: number,
    helps: number, help: 'off' | 'ready' | 'on',
  ): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, HUD_TOP, CANVAS_W, CANVAS_H - HUD_TOP);
    const mid = HUD_TOP + (CANVAS_H - HUD_TOP) / 2;
    this.text(`STAGE ${stageId}`, 10, mid, 11, UI.text, 'left');
    this.text(score.toLocaleString('en-US'), CANVAS_W / 2, mid, 12, UI.accent);
    // 일시정지 버튼
    const p = PAUSE_BUTTON;
    ctx.fillStyle = UI.dim;
    ctx.fillRect(p.x + p.w / 2 - 5, p.y + 6, 3.5, p.h - 12);
    ctx.fillRect(p.x + p.w / 2 + 1.5, p.y + 6, 3.5, p.h - 12);
    this.button({
      ...HELP_BUTTON, id: 'help', label: `HELP ${helps}`, enabled: help !== 'off', selected: help === 'on',
    });
    // 천장 하강까지 남은 샷 (경고 시 깜빡임)
    const blink = warning && Math.floor(time * 6) % 2 === 0;
    this.text('DROP', 226, 432, 9, UI.dim);
    this.text(String(shotsUntilDrop), 226, 448, 15, warning ? (blink ? UI.danger : UI.text) : UI.text);
  }
}
