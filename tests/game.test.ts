import { describe, expect, it } from 'vitest';
import { boardToRows, colorsPresent } from '../src/core/board';
import { MAX_ANGLE, MIN_ANGLE, STEP } from '../src/core/constants';
import { clearBonus, Game, type GameInput, type GameStage, HELP_SCORE_RATE, shotScore } from '../src/core/game';

const UP = Math.PI / 2;
const idle: GameInput = { aimDelta: 0, fire: false, pause: false };
const fireAt = (angle: number): GameInput => ({ aimAngle: angle, aimDelta: 0, fire: true, pause: false });
const stage = (rows: string[], dropInterval = 10): GameStage => ({ id: 1, dropInterval, rows });

/** 샷이 정착할 때까지 시뮬레이션을 돌린다 */
function settle(g: Game): void {
  for (let i = 0; i < 10_000 && (g.phase === 'flying' || g.phase === 'resolving'); i++) g.update(STEP, idle);
  if (g.phase === 'flying' || g.phase === 'resolving') throw new Error('정착하지 않음');
}
function shoot(g: Game, angle = UP): void {
  g.update(STEP, fireAt(angle));
  settle(g);
}

describe('shotScore / clearBonus', () => {
  it('정상: 점수 공식', () => {
    expect(shotScore(0, 0)).toBe(0);
    expect(shotScore(3, 0)).toBe(30);
    expect(shotScore(3, 1)).toBe(30 + 20);
    expect(shotScore(4, 5)).toBe(40 + 10 * 32);
    expect(clearBonus(1)).toBe(1000 + 49 * 20);
    expect(clearBonus(0)).toBe(2000);
  });
  it('엣지: 낙하 배수는 2^16 에서 상한, 보너스 하한은 1000', () => {
    expect(shotScore(0, 16)).toBe(10 * 2 ** 16);
    expect(shotScore(0, 40)).toBe(10 * 2 ** 16);
    expect(clearBonus(50)).toBe(1000);
    expect(clearBonus(999)).toBe(1000);
  });
});

describe('Game', () => {
  it('정상: 초기 상태는 조준, 큐 색은 보드에 있는 색', () => {
    const g = new Game(stage(['RG......']));
    expect(g.phase).toBe('aiming');
    expect(g.paused).toBe(false);
    const present = colorsPresent(g.board);
    expect(present.has(g.current)).toBe(true);
    expect(present.has(g.next)).toBe(true);
  });

  it('정상: 같은 시드는 같은 발사 색 수열', () => {
    const a = new Game(stage(['RGBY....']), { seed: 7 });
    const b = new Game(stage(['RGBY....']), { seed: 7 });
    expect([a.current, a.next]).toEqual([b.current, b.next]);
  });

  it('정상: 보드를 비우면 클리어 + 점수(팝 + 낙하 + 클리어 보너스)', () => {
    // R 두 개 아래 (1,3) 에 R 을 붙이면 3개 팝, 오른쪽에 매달린 B 2개는 낙하
    const g = new Game(stage(['...RR...', '....B..', '.....B..']), { queue: [0, 2] });
    const events: string[] = [];
    g.update(STEP, fireAt(UP));
    expect(g.phase).toBe('flying');
    expect(g.current).toBe(2);
    for (let i = 0; i < 10_000 && g.phase === 'flying'; i++) {
      g.update(STEP, idle);
      events.push(...g.drainEvents().map((e) => e.type));
    }
    expect(g.phase).toBe('cleared');
    expect(g.shotsUsed).toBe(1);
    expect(g.score).toBe(30 + 40 + clearBonus(1));
    expect(events).toEqual(expect.arrayContaining(['stick', 'pop', 'drop', 'clear']));
  });

  it('정상: 스테이지 1 은 가이드가 항상 보이고 헬프를 켤 수 없다', () => {
    const g = new Game(stage(['RGBY....']));
    expect(g.guideVisible).toBe(true);
    g.shotsUsed = 5;
    expect(g.guideVisible).toBe(true);
    expect(g.activateHelp()).toBe(false);
  });

  it('정상: 스테이지 2 부터는 첫 발에만 가이드가 보이고, 헬프는 1발만 유지된다', () => {
    const g = new Game({ id: 2, dropInterval: 10, rows: ['RGBY....', 'RGBY...'] });
    expect(g.guideVisible).toBe(true);
    expect(g.canHelp).toBe(false);
    shoot(g, Math.PI * 0.3);
    expect(g.phase).toBe('aiming');
    expect(g.guideVisible).toBe(false);
    expect(g.activateHelp()).toBe(true);
    expect(g.guideVisible).toBe(true);
    expect(g.activateHelp()).toBe(false); // 이미 켜져 있으면 다시 켜지지 않는다 (중복 차감 방지)
    shoot(g, Math.PI * 0.7);
    expect(g.helpActive).toBe(false);
    expect(g.guideVisible).toBe(false);
  });

  it('엣지: 비행 중·일시정지 중에는 헬프를 켤 수 없다', () => {
    const g = new Game({ id: 2, dropInterval: 10, rows: ['RGBY....'] });
    g.shotsUsed = 1;
    g.update(STEP, { ...idle, pause: true });
    expect(g.activateHelp()).toBe(false);
    g.update(STEP, { ...idle, pause: true });
    g.update(STEP, fireAt(UP));
    expect(g.phase).toBe('flying');
    expect(g.activateHelp()).toBe(false);
  });

  it('정상: 헬프로 쏜 발의 점수만 0.1배(버림), 클리어 보너스는 그대로', () => {
    const rows = ['...RR...', '....B..', '.....B..'];
    const helped = new Game({ id: 2, dropInterval: 10, rows }, { queue: [0, 2] });
    helped.shotsUsed = 1;
    expect(helped.activateHelp()).toBe(true);
    shoot(helped);
    expect(helped.phase).toBe('cleared');
    expect(helped.score).toBe(Math.floor((30 + 40) * HELP_SCORE_RATE) + clearBonus(2));

    const plain = new Game({ id: 2, dropInterval: 10, rows }, { queue: [0, 2] });
    plain.shotsUsed = 1;
    shoot(plain);
    expect(plain.score).toBe(30 + 40 + clearBonus(2));
  });

  it('정상: 클리어/게임오버 후에는 입력이 무시된다', () => {
    const g = new Game(stage(['...RR...']), { queue: [0, 0] });
    shoot(g);
    expect(g.phase).toBe('cleared');
    const score = g.score;
    g.update(STEP, fireAt(UP));
    expect(g.phase).toBe('cleared');
    expect(g.score).toBe(score);
  });

  it('정상: 데드라인 행에 붙으면 게임 오버', () => {
    // 0~11행을 R/G 줄무늬로 채우고 R 을 쏘면 12행에 붙는다 (이웃이 모두 G 라 팝 없음)
    const rows = Array.from({ length: 12 }, (_, i) => (i % 2 ? 'GGGGGGG' : 'RRRRRRRR'));
    const g = new Game(stage(rows), { queue: [0, 0] });
    const events: string[] = [];
    g.update(STEP, fireAt(UP));
    for (let i = 0; i < 10_000 && g.phase === 'flying'; i++) {
      g.update(STEP, idle);
      events.push(...g.drainEvents().map((e) => e.type));
    }
    expect(g.phase).toBe('gameOver');
    expect(events).toContain('gameover');
  });

  it('정상: dropInterval 샷마다 천장이 내려오고, 마지막 2샷 동안 경고', () => {
    const g = new Game(stage(['R......G'], 3), { queue: [0, 1] });
    expect(g.shotsUntilDrop).toBe(3);
    expect(g.dropWarning).toBe(false);
    shoot(g);
    expect(g.board.ceilingOffset).toBe(0);
    expect(g.shotsUntilDrop).toBe(2);
    expect(g.dropWarning).toBe(true);
    shoot(g);
    expect(g.board.ceilingOffset).toBe(0);
    shoot(g);
    expect(g.board.ceilingOffset).toBe(1);
    expect(g.shotsUntilDrop).toBe(3);
    expect(g.dropWarning).toBe(false);
  });

  it('엣지: 천장 하강으로 데드라인을 넘으면 게임 오버', () => {
    // 왼쪽 벽을 따라 0~11행까지 늘어진 기둥 + dropInterval 1
    const rows = Array.from({ length: 12 }, (_, i) => {
      const ch = i % 2 ? 'G' : 'R';
      return i % 2 ? ch + '......' : ch + '.......';
    });
    const g = new Game(stage(rows, 1), { queue: [0, 0] });
    shoot(g);
    expect(g.board.ceilingOffset).toBe(1);
    expect(g.phase).toBe('gameOver');
  });

  it('정상: 보드에서 사라진 색은 current/next 에서 다시 뽑는다', () => {
    const g = new Game(stage(['G..RR...']), { queue: [0, 0] });
    shoot(g);
    expect(boardToRows(g.board)).toEqual(['G.......']);
    expect(g.current).toBe(1);
    expect(g.next).toBe(1);
  });

  it('정상: 일시정지 중에는 시뮬레이션이 진행되지 않는다', () => {
    const g = new Game(stage(['...RR...']), { queue: [0, 0] });
    g.update(STEP, fireAt(UP));
    g.update(STEP, idle);
    const y = g.shot?.y;
    g.update(STEP, { ...idle, pause: true });
    expect(g.paused).toBe(true);
    for (let i = 0; i < 100; i++) g.update(1, { aimAngle: 0.3, aimDelta: 1, fire: true, pause: false });
    expect(g.shot?.y).toBe(y);
    expect(g.phase).toBe('flying');
    expect(g.angle).toBeCloseTo(UP);
    g.update(STEP, { ...idle, pause: true });
    expect(g.paused).toBe(false);
    g.update(STEP, idle);
    expect(g.shot?.y).toBeLessThan(y as number);
  });

  it('엣지: 조준 각도는 10°~170° 로 제한되고 aimDelta 로 회전한다', () => {
    const g = new Game(stage(['R.......']));
    g.update(STEP, { aimAngle: 0, aimDelta: 0, fire: false, pause: false });
    expect(g.angle).toBeCloseTo(MIN_ANGLE);
    g.update(STEP, { aimAngle: 4, aimDelta: 0, fire: false, pause: false });
    expect(g.angle).toBeCloseTo(MAX_ANGLE);
    g.update(STEP, { aimAngle: UP, aimDelta: 0, fire: false, pause: false });
    g.update(0.1, { aimDelta: 1, fire: false, pause: false });
    expect(g.angle).toBeGreaterThan(UP);
    for (let i = 0; i < 100; i++) g.update(0.1, { aimDelta: -1, fire: false, pause: false });
    expect(g.angle).toBeCloseTo(MIN_ANGLE);
  });

  it('엣지: 비행 중 추가 발사 입력은 무시된다', () => {
    const g = new Game(stage(['R......G']), { queue: [0, 1] });
    g.update(STEP, fireAt(UP));
    g.update(STEP, fireAt(UP));
    expect(g.shotsUsed).toBe(1);
  });
});
