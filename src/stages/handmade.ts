// 튜토리얼용 수제 스테이지 1~10. 기본 매칭 → 벽 반사 → 지지대 끊어 떨어뜨리기 → 천장 압박 순으로 익히게 한다.
// 월드 1 난이도 표(3색, 4~5행, dropInterval 10)를 그대로 따른다.
import type { StageDef } from './types';

const world1 = (id: number, rows: string[]): StageDef => ({ id, world: 1, colors: 3, dropInterval: 10, rows });

export const HANDMADE: StageDef[] = [
  // 1~3: 기본 매칭 — 큰 같은 색 덩어리
  world1(1, [
    'RRRGGGBB',
    'RRGGGBB',
    '.RRGGBB.',
    '..RGB..',
  ]),
  world1(2, [
    'RRGGBBRR',
    'RGGBBRR',
    'RRGGBBRR',
    '.GGBBR.',
  ]),
  world1(3, [
    'BBRRGGBB',
    'BRRGGBB',
    'GGBBRRGG',
    'GBBRRGG',
  ]),
  // 4~5: 벽 반사 — 가운데 기둥이 직선 샷을 막아 양옆 아래 목표는 벽을 맞혀야 닿는다
  world1(4, [
    'GGBBBBGG',
    'G.BBB.G',
    'R..BB..R',
    'R.....R',
  ]),
  world1(5, [
    'RRBBBBGG',
    'R.BBB.G',
    'R..BB..G',
    'G.....R',
  ]),
  // 6~8: 떨어뜨리기 — 가는 줄기를 끊으면 아래 덩어리가 통째로 떨어진다
  world1(6, [
    'BB.RR.GG',
    'B..R..G',
    '..GBGB..',
    '..BGB..',
  ]),
  world1(7, [
    'RRR..BBB',
    '.R....B',
    '.GG..GG.',
    'GBG.GBG',
    '.BB..BB.',
  ]),
  world1(8, [
    'GGBRRBGG',
    'G.B.B.G',
    '..RRRR..',
    '.GBBBG.',
    '..GGGG..',
  ]),
  // 9~10: 천장 압박 — 빽빽한 보드라 하강 전에 빠르게 줄여야 한다
  world1(9, [
    'RRGGBBRR',
    'GGBBRRG',
    'BBRRGGBB',
    'RRGGBBR',
    'GGBBRRGG',
  ]),
  world1(10, [
    'BRRGGBBR',
    'BRGGBRR',
    'GBRRGBBG',
    'GBBRGGB',
    '.RGGBBR.',
  ]),
];
