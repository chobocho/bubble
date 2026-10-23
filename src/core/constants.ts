// 게임 전역 상수. 모든 좌표는 논리 캔버스(288×480) 기준이며 렌더러가 화면에 맞춰 스케일한다.

export const CANVAS_W = 288;
export const CANVAS_H = 480;

/** 버블 반지름 (지름 32) */
export const R = 16;
/** 짝수 행 칸 수. 홀수 행은 반 칸 밀려 COLS - 1 칸이다. */
export const COLS = 8;
/** 육각 배치에서 행 중심 간 수직 거리 */
export const ROW_H = R * Math.sqrt(3);

/** 벽 두께. 보드 내부 폭은 COLS * 2R = 256 */
export const BOARD_LEFT = 16;
export const BOARD_WIDTH = COLS * 2 * R;
export const BOARD_RIGHT = BOARD_LEFT + BOARD_WIDTH;
/** 0행 상단 (천장이 내려오면 ceilingOffset * ROW_H 만큼 아래로 이동) */
export const BOARD_TOP = 16;

export const MAX_ROWS = 13;
/** 실효 행(row + ceilingOffset)이 이 값 이상인 버블이 있으면 게임 오버 */
export const DEADLINE_ROW = 12;

export const SHOOTER_X = BOARD_LEFT + BOARD_WIDTH / 2;
export const SHOOTER_Y = 440;
/** px/s */
export const SHOT_SPEED = 640;

const DEG = Math.PI / 180;
/** +x 축 기준 위쪽으로 잰 각도(라디안). 수평에 가까운 발사는 무한 반사를 유발하므로 제한한다. */
export const MIN_ANGLE = 10 * DEG;
export const MAX_ANGLE = 170 * DEG;

/** 충돌 판정 거리. 2R 보다 약간 작게 잡아 틈새로 빠져나가는 샷을 허용한다. */
export const COLLIDE_DIST = 2 * R * 0.85;

/** 고정 시뮬레이션 스텝 (초) */
export const STEP = 1 / 120;

/** 스테이지 문자열의 색 문자. 인덱스가 곧 Color 값이다. */
export const COLOR_CHARS = 'RGBYPOCW';
export const COLOR_NAMES = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'cyan', 'white'] as const;
export const PALETTE = [
  '#e8433f', // red
  '#3fbf4a', // green
  '#3f7fe8', // blue
  '#f2d23a', // yellow
  '#a64fe0', // purple
  '#f28a2e', // orange
  '#38d0d8', // cyan
  '#e9edf2', // white
] as const;
