// 팝·낙하 파티클과 보드 흔들림. 게임 코어 이벤트만 보고 동작하므로 게임 규칙과 분리돼 있다.
import { cellToPixel, type Color } from '../core/board';
import { CANVAS_H, R } from '../core/constants';
import type { GameEvent } from '../core/game';
import { mulberry32, type Rng } from '../core/rng';
import type { Renderer } from './renderer';

interface Particle {
  kind: 'pop' | 'spark' | 'fall';
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: Color;
  /** 남은 수명 (초). 낙하 버블은 화면 밖으로 나갈 때 제거하므로 Infinity */
  life: number;
  maxLife: number;
}

const GRAVITY = 1400;
const POP_LIFE = 0.22;
const SPARK_LIFE = 0.45;
const SPARKS_PER_POP = 4;
/** 천장 하강 직후 강한 흔들림 지속 시간 (초) */
const BUMP_TIME = 0.35;
const BUMP_AMP = 4;
/** 하강 경고 중 잔떨림 진폭 (px) */
const WARN_AMP = 1.5;

export class Effects {
  private particles: Particle[] = [];
  private bump = 0;
  private readonly rng: Rng;

  /** 파티클 방향 난수는 시드 고정 — 렌더 결과를 재현 가능하게 해 테스트한다 */
  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  get count(): number {
    return this.particles.length;
  }

  /** 살아 있는 파티클 중 가장 아래 y (디버그·테스트용) */
  get lowestY(): number {
    return this.particles.reduce((m, p) => Math.max(m, p.y), -Infinity);
  }

  handle(e: GameEvent): void {
    switch (e.type) {
      case 'pop':
        for (const c of e.cells) {
          const p = cellToPixel(c.row, c.col, e.ceilingOffset);
          this.particles.push({ kind: 'pop', x: p.x, y: p.y, vx: 0, vy: 0, color: c.color, life: POP_LIFE, maxLife: POP_LIFE });
          for (let i = 0; i < SPARKS_PER_POP; i++) {
            const a = this.rng() * Math.PI * 2;
            const s = 60 + this.rng() * 120;
            this.particles.push({
              kind: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
              color: c.color, life: SPARK_LIFE, maxLife: SPARK_LIFE,
            });
          }
        }
        break;
      case 'drop':
        for (const c of e.cells) {
          const p = cellToPixel(c.row, c.col, e.ceilingOffset);
          this.particles.push({
            kind: 'fall', x: p.x, y: p.y, vx: (this.rng() - 0.5) * 120, vy: -80 - this.rng() * 120,
            color: c.color, life: Infinity, maxLife: Infinity,
          });
        }
        break;
      case 'ceiling':
        this.bump = BUMP_TIME;
        break;
      default:
        break;
    }
  }

  /** O(파티클 수). 제거는 뒤에서부터 swap-pop 대신 filter 로 — 프레임당 수십 개라 단순함을 택했다. */
  update(dt: number): void {
    this.bump = Math.max(0, this.bump - dt);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === 'pop') continue;
      if (p.kind === 'fall') p.vy += GRAVITY * dt;
      else p.vy += GRAVITY * 0.25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < CANVAS_H + R * 2);
  }

  clear(): void {
    this.particles = [];
    this.bump = 0;
  }

  /** 보드 x 흔들림. 하강 경고 중엔 잔떨림, 하강 직후엔 감쇠하는 큰 흔들림. */
  shakeOffset(time: number, warning: boolean): number {
    let x = 0;
    if (warning) x += Math.sin(time * 45) * WARN_AMP;
    if (this.bump > 0) x += Math.sin(time * 60) * BUMP_AMP * (this.bump / BUMP_TIME);
    return x;
  }

  /** 테스트용 상태 사본 */
  snapshot(): Array<Pick<Particle, 'kind' | 'x' | 'y'>> {
    return this.particles.map(({ kind, x, y }) => ({ kind, x, y }));
  }

  draw(r: Renderer): void {
    const { ctx } = r;
    for (const p of this.particles) {
      if (p.kind === 'pop') {
        const t = 1 - p.life / p.maxLife;
        r.bubble(p.x, p.y, p.color, R * (1 + t * 0.5), 1 - t);
      } else if (p.kind === 'fall') {
        r.bubble(p.x, p.y, p.color);
      } else {
        const t = p.life / p.maxLife;
        ctx.globalAlpha = t;
        r.bubble(p.x, p.y, p.color, 3 + 2 * t);
        ctx.globalAlpha = 1;
      }
    }
  }
}
