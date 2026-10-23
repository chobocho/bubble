// 스테이지 데이터 형식. 사람이 직접 읽고 검토할 수 있도록 행을 문자열로 저장한다.
// 행 문자: R G B Y P O C W → 색 인덱스 0..7, '.' 은 빈 칸. 짝수 행 8자, 홀수 행 7자.
export interface StageDef {
  /** 1..200, 중복 없이 연속 */
  id: number;
  /** 1..10 (월드당 20 스테이지) */
  world: number;
  /** 사용하는 서로 다른 색의 수 (3..8) */
  colors: number;
  /** 천장이 한 칸 내려오기까지의 샷 수 */
  dropInterval: number;
  rows: string[];
}
