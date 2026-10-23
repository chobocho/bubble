// 스테이지 진행도 저장. file:// 나 사생활 보호 모드에서는 localStorage 접근 자체가 예외를 던지거나
// 저장이 실패할 수 있으므로, 모든 접근을 try/catch 로 감싸고 실패 시 메모리 상태로 계속 동작한다.

export interface Progress {
  /** 플레이 가능한 최대 스테이지 id (1..STAGE_LIMIT) */
  unlocked: number;
  /** 스테이지 id → 최고 점수 */
  best: Record<number, number>;
  muted: boolean;
}

/** Storage 중 실제로 쓰는 부분만 — 테스트에서 가짜 저장소를 넣기 쉽게 한다 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'bubble.progress.v1';
const STAGE_LIMIT = 200;

export function defaultProgress(): Progress {
  return { unlocked: 1, best: {}, muted: false };
}

/** 저장된 값을 신뢰하지 않고 필드별로 검증해 정상 범위만 남긴다 (사용자가 직접 수정했거나 손상된 경우 대비) */
function sanitize(raw: unknown): Progress {
  const p = defaultProgress();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return p;
  const o = raw as Record<string, unknown>;
  if (typeof o.unlocked === 'number' && Number.isFinite(o.unlocked)) {
    p.unlocked = Math.min(STAGE_LIMIT, Math.max(1, Math.floor(o.unlocked)));
  }
  if (typeof o.best === 'object' && o.best !== null && !Array.isArray(o.best)) {
    for (const [k, v] of Object.entries(o.best as Record<string, unknown>)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > STAGE_LIMIT) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      p.best[id] = Math.floor(v);
    }
  }
  if (typeof o.muted === 'boolean') p.muted = o.muted;
  return p;
}

export function loadProgress(storage: KeyValueStorage | null): Progress {
  if (!storage) return defaultProgress();
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text === null ? defaultProgress() : sanitize(JSON.parse(text));
  } catch {
    return defaultProgress();
  }
}

/** 저장 성공 여부를 반환한다. 실패해도 호출자는 메모리 상태로 계속 진행하면 된다. */
export function saveProgress(p: Progress, storage: KeyValueStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** 클리어 반영 (원본 불변). 다음 스테이지 해금, 최고 점수는 증가만 한다. */
export function recordClear(p: Progress, stageId: number, score: number): Progress {
  const prevBest = p.best[stageId] ?? 0;
  return {
    ...p,
    unlocked: Math.max(p.unlocked, Math.min(STAGE_LIMIT, stageId + 1)),
    best: { ...p.best, [stageId]: Math.max(prevBest, score) },
  };
}

/** 메모리 상태를 기준으로 두고 변경 시마다 저장소에 베스트 에포트로 기록한다 */
export class ProgressStore {
  private state: Progress;
  private readonly storage: KeyValueStorage | null;

  constructor(getStorage: () => KeyValueStorage | null) {
    let storage: KeyValueStorage | null = null;
    try {
      // window.localStorage 프로퍼티 접근만으로도 SecurityError 가 날 수 있다
      storage = getStorage();
    } catch {
      storage = null;
    }
    this.storage = storage;
    this.state = loadProgress(storage);
  }

  get(): Progress {
    return this.state;
  }

  recordClear(stageId: number, score: number): void {
    this.state = recordClear(this.state, stageId, score);
    saveProgress(this.state, this.storage);
  }

  setMuted(muted: boolean): void {
    this.state = { ...this.state, muted };
    saveProgress(this.state, this.storage);
  }
}
