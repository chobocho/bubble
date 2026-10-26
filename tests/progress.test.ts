import { describe, expect, it } from 'vitest';
import {
  defaultProgress, type KeyValueStorage, loadProgress, MAX_HELPS, ProgressStore, recordClear, saveProgress, STORAGE_KEY,
  useHelp,
} from '../src/storage/progress';

class MemStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}
const throwing: KeyValueStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
};

describe('recordClear', () => {
  it('정상: 클리어하면 다음 스테이지가 열리고 최고 점수가 기록된다', () => {
    const p = recordClear(defaultProgress(), 1, 500);
    expect(p.unlocked).toBe(2);
    expect(p.best[1]).toBe(500);
  });
  it('정상: 최고 점수는 증가만 한다', () => {
    let p = recordClear(defaultProgress(), 1, 500);
    p = recordClear(p, 1, 300);
    expect(p.best[1]).toBe(500);
    p = recordClear(p, 1, 900);
    expect(p.best[1]).toBe(900);
  });
  it('엣지: 이전 스테이지 재클리어는 unlocked 를 낮추지 않는다', () => {
    let p = recordClear(defaultProgress(), 1, 1);
    p = recordClear(p, 2, 1);
    p = recordClear(p, 1, 1);
    expect(p.unlocked).toBe(3);
  });
  it('엣지: 마지막 스테이지 클리어는 200 을 넘지 않는다', () => {
    const p = recordClear({ ...defaultProgress(), unlocked: 200 }, 200, 10);
    expect(p.unlocked).toBe(200);
  });
  it('엣지: 원본 객체를 변경하지 않는다', () => {
    const base = defaultProgress();
    recordClear(base, 1, 100);
    expect(base).toEqual(defaultProgress());
  });
});

describe('헬프 횟수', () => {
  it('정상: 3회 클리어마다 +1 (재클리어 포함)', () => {
    let p = { ...defaultProgress(), helps: 0 };
    p = recordClear(p, 1, 1);
    p = recordClear(p, 1, 1);
    expect(p.helps).toBe(0);
    p = recordClear(p, 1, 1);
    expect(p).toMatchObject({ helps: 1, clears: 3 });
    for (let i = 0; i < 3; i++) p = recordClear(p, 2, 1);
    expect(p.helps).toBe(2);
  });
  it('엣지: 최대 3 을 넘지 않는다', () => {
    let p = defaultProgress();
    for (let i = 0; i < 9; i++) p = recordClear(p, 1, 1);
    expect(p.helps).toBe(MAX_HELPS);
  });
  it('정상: 사용하면 1 감소, 0 이면 그대로', () => {
    const p = useHelp(defaultProgress());
    expect(p.helps).toBe(2);
    const empty = { ...defaultProgress(), helps: 0 };
    expect(useHelp(empty)).toBe(empty);
  });
  it('정상: ProgressStore.useHelp 은 저장소에 반영되고 0 이면 false', () => {
    const s = new MemStorage();
    const store = new ProgressStore(() => s);
    expect(store.useHelp()).toBe(true);
    expect(store.useHelp()).toBe(true);
    expect(store.useHelp()).toBe(true);
    expect(store.useHelp()).toBe(false);
    expect(new ProgressStore(() => s).get().helps).toBe(0);
  });
});

describe('loadProgress / saveProgress', () => {
  it('정상: 기본값', () => {
    expect(defaultProgress()).toEqual({ unlocked: 1, best: {}, muted: false, helps: 3, clears: 0 });
  });
  it('정상: 저장 후 불러오면 같다', () => {
    const s = new MemStorage();
    const p = { unlocked: 5, best: { 1: 100, 4: 2000 }, muted: true, helps: 1, clears: 7 };
    expect(saveProgress(p, s)).toBe(true);
    expect(JSON.parse(s.data.get(STORAGE_KEY) as string)).toEqual(p);
    expect(loadProgress(s)).toEqual(p);
  });
  it('엣지: 저장소가 없거나 예외를 던지면 기본값', () => {
    expect(loadProgress(null)).toEqual(defaultProgress());
    expect(loadProgress(throwing)).toEqual(defaultProgress());
    expect(saveProgress(defaultProgress(), throwing)).toBe(false);
    expect(saveProgress(defaultProgress(), null)).toBe(false);
  });
  it('엣지: 손상된 JSON 은 기본값', () => {
    const s = new MemStorage();
    for (const bad of ['{', 'null', '42', '"x"', '[]']) {
      s.data.set(STORAGE_KEY, bad);
      expect(loadProgress(s)).toEqual(defaultProgress());
    }
  });
  it('엣지: 잘못된 필드는 정리된다', () => {
    const s = new MemStorage();
    s.data.set(STORAGE_KEY, JSON.stringify({
      unlocked: 999, best: { 1: 50, 0: 10, 201: 5, 3: -4, 7: 'x', 8: 12.7 }, muted: 'yes', helps: 9, clears: -2,
    }));
    expect(loadProgress(s)).toEqual({ unlocked: 200, best: { 1: 50, 8: 12 }, muted: false, helps: 3, clears: 0 });
    s.data.set(STORAGE_KEY, JSON.stringify({ helps: -1, clears: 4.9 }));
    expect(loadProgress(s)).toMatchObject({ helps: 0, clears: 4 });
    s.data.set(STORAGE_KEY, JSON.stringify({ helps: '2', clears: 'x' }));
    expect(loadProgress(s)).toMatchObject({ helps: 3, clears: 0 });
    s.data.set(STORAGE_KEY, JSON.stringify({ unlocked: -3, best: null }));
    expect(loadProgress(s)).toEqual(defaultProgress());
    s.data.set(STORAGE_KEY, JSON.stringify({ unlocked: 2.5 }));
    expect(loadProgress(s).unlocked).toBe(2);
  });
});

describe('ProgressStore', () => {
  it('정상: 클리어/음소거가 저장소에 반영된다', () => {
    const s = new MemStorage();
    const store = new ProgressStore(() => s);
    store.recordClear(1, 700);
    store.setMuted(true);
    expect(new ProgressStore(() => s).get()).toEqual({ unlocked: 2, best: { 1: 700 }, muted: true, helps: 3, clears: 1 });
  });
  it('엣지: 저장소 접근 자체가 예외여도 메모리에서 동작한다', () => {
    const store = new ProgressStore(() => { throw new Error('denied'); });
    expect(store.get()).toEqual(defaultProgress());
    store.recordClear(1, 10);
    expect(store.get().unlocked).toBe(2);
    store.setMuted(true);
    expect(store.get().muted).toBe(true);
  });
  it('엣지: 쓰기만 실패해도 메모리 상태는 유지된다', () => {
    const store = new ProgressStore(() => throwing);
    store.recordClear(3, 10);
    expect(store.get().best[3]).toBe(10);
  });
});
