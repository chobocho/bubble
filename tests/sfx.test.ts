import { describe, expect, it } from 'vitest';
import { type AudioContextLike, SFX, SFX_NAMES, Sfx } from '../src/audio/sfx';

class FakeParam {
  calls: string[] = [];
  value = 0;
  setValueAtTime() { this.calls.push('set'); return this; }
  linearRampToValueAtTime() { this.calls.push('lin'); return this; }
  exponentialRampToValueAtTime() { this.calls.push('exp'); return this; }
}
class FakeCtx implements AudioContextLike {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {} as AudioNode;
  oscillators = 0;
  resumed = 0;
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  createOscillator() {
    this.oscillators++;
    return { type: 'sine', frequency: new FakeParam(), connect: (n: unknown) => n, start() {}, stop() {} } as unknown as OscillatorNode;
  }
  createGain() {
    return { gain: new FakeParam(), connect: (n: unknown) => n } as unknown as GainNode;
  }
}

describe('SFX 테이블', () => {
  it('정상: 8개 효과음이 모두 정의되고 파라미터가 유효하다', () => {
    expect([...SFX_NAMES].sort()).toEqual(['bounce', 'ceiling', 'clear', 'drop', 'fire', 'gameover', 'pop', 'stick']);
    for (const name of SFX_NAMES) {
      expect(SFX[name].length).toBeGreaterThan(0);
      for (const t of SFX[name]) {
        expect(t.freq).toBeGreaterThan(0);
        expect(t.dur).toBeGreaterThan(0);
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.5);
        expect(t.delay ?? 0).toBeGreaterThanOrEqual(0);
        if (t.to !== undefined) expect(t.to).toBeGreaterThan(0);
      }
    }
  });
});

describe('Sfx', () => {
  it('엣지: 사용자 제스처(unlock) 전에는 AudioContext 를 만들지 않는다', () => {
    let created = 0;
    const sfx = new Sfx(() => { created++; return new FakeCtx(); });
    sfx.play('pop');
    expect(created).toBe(0);
  });
  it('정상: unlock 은 컨텍스트를 한 번만 만들고 resume 한다', () => {
    let created = 0;
    const ctx = new FakeCtx();
    const sfx = new Sfx(() => { created++; return ctx; });
    sfx.unlock();
    sfx.unlock();
    expect(created).toBe(1);
    expect(ctx.resumed).toBeGreaterThanOrEqual(1);
    sfx.play('clear');
    expect(ctx.oscillators).toBe(SFX.clear.length);
  });
  it('엣지: 음소거 중에는 소리를 내지 않는다', () => {
    const ctx = new FakeCtx();
    const sfx = new Sfx(() => ctx);
    sfx.unlock();
    sfx.muted = true;
    sfx.play('fire');
    expect(ctx.oscillators).toBe(0);
    sfx.muted = false;
    sfx.play('fire');
    expect(ctx.oscillators).toBe(SFX.fire.length);
  });
  it('엣지: 컨텍스트 생성이 실패해도 예외 없이 무음으로 동작한다', () => {
    const sfx = new Sfx(() => { throw new Error('no audio'); });
    expect(() => { sfx.unlock(); sfx.play('pop'); }).not.toThrow();
  });
  it('엣지: 팩토리가 null 이면(미지원 브라우저) 무음', () => {
    const sfx = new Sfx(() => null);
    expect(() => { sfx.unlock(); sfx.play('pop'); }).not.toThrow();
  });
});
