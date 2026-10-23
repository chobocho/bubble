// WebAudio 합성 효과음. 오디오 파일 없이 OscillatorNode + GainNode 엔벨로프로 만들어 단일 HTML 에 담는다.
// 브라우저 자동재생 정책 때문에 AudioContext 는 첫 사용자 제스처(unlock) 안에서만 만들거나 resume 한다.

export type SfxName = 'fire' | 'bounce' | 'stick' | 'pop' | 'drop' | 'ceiling' | 'clear' | 'gameover';

export interface Tone {
  /** 시작 주파수 (Hz) */
  freq: number;
  /** 끝 주파수 — 지정하면 지수 램프로 미끄러진다 */
  to?: number;
  /** 길이 (초) */
  dur: number;
  /** 최대 음량 (0..0.5, 여러 음이 겹쳐도 클리핑되지 않도록 낮게 유지) */
  gain: number;
  type: OscillatorType;
  /** 효과음 시작 기준 지연 (초) */
  delay?: number;
}

export const SFX: Record<SfxName, Tone[]> = {
  fire: [{ freq: 520, to: 880, dur: 0.09, gain: 0.12, type: 'square' }],
  bounce: [{ freq: 300, to: 220, dur: 0.05, gain: 0.1, type: 'triangle' }],
  stick: [{ freq: 180, to: 120, dur: 0.07, gain: 0.16, type: 'sine' }],
  pop: [
    { freq: 660, to: 990, dur: 0.08, gain: 0.14, type: 'triangle' },
    { freq: 990, to: 1320, dur: 0.08, gain: 0.1, type: 'triangle', delay: 0.05 },
  ],
  drop: [{ freq: 700, to: 140, dur: 0.35, gain: 0.12, type: 'sawtooth' }],
  ceiling: [
    { freq: 110, to: 70, dur: 0.25, gain: 0.25, type: 'square' },
    { freq: 90, to: 55, dur: 0.25, gain: 0.2, type: 'sine', delay: 0.04 },
  ],
  clear: [
    { freq: 523.25, dur: 0.12, gain: 0.14, type: 'square' },
    { freq: 659.25, dur: 0.12, gain: 0.14, type: 'square', delay: 0.12 },
    { freq: 783.99, dur: 0.12, gain: 0.14, type: 'square', delay: 0.24 },
    { freq: 1046.5, dur: 0.3, gain: 0.14, type: 'square', delay: 0.36 },
  ],
  gameover: [
    { freq: 392, to: 370, dur: 0.22, gain: 0.14, type: 'triangle' },
    { freq: 330, to: 311, dur: 0.22, gain: 0.14, type: 'triangle', delay: 0.24 },
    { freq: 262, to: 131, dur: 0.6, gain: 0.14, type: 'triangle', delay: 0.48 },
  ],
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/** AudioContext 중 실제로 쓰는 부분 — 테스트에서 가짜를 주입하기 위함 */
export interface AudioContextLike {
  state: AudioContextState;
  currentTime: number;
  destination: AudioNode;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

/** 지수 램프는 0 을 목표로 할 수 없으므로 사실상 무음인 작은 값까지 내린다 */
const SILENT = 0.0001;
const ATTACK = 0.005;

export class Sfx {
  muted = false;
  private ctx: AudioContextLike | null = null;
  private failed = false;
  private readonly factory: () => AudioContextLike | null;

  constructor(factory: () => AudioContextLike | null) {
    this.factory = factory;
  }

  /** 사용자 제스처 핸들러 안에서 호출한다. 최초 1회 컨텍스트를 만들고, 일시정지 상태면 resume 한다. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        this.ctx = this.factory();
        if (!this.ctx) {
          this.failed = true;
          return;
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    } catch {
      // 오디오를 지원하지 않거나 정책상 막힌 환경 — 소리 없이 게임은 계속된다
      this.failed = true;
      this.ctx = null;
    }
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (this.muted || !ctx || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      for (const t of SFX[name]) {
        const start = now + (t.delay ?? 0);
        const end = start + t.dur;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = t.type;
        osc.frequency.setValueAtTime(t.freq, start);
        if (t.to !== undefined) osc.frequency.exponentialRampToValueAtTime(t.to, end);
        // 짧은 어택 후 지수 감쇠 — 시작/끝에서 딸깍 소리가 나지 않게 한다
        gain.gain.setValueAtTime(SILENT, start);
        gain.gain.linearRampToValueAtTime(t.gain, start + ATTACK);
        gain.gain.exponentialRampToValueAtTime(SILENT, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(end + 0.02);
      }
    } catch {
      // 재생 실패는 게임 진행에 영향을 주지 않도록 무시한다
    }
  }
}
