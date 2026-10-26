### [2026-10-27 01:10] 발사대 화살표 길이 2/3로 조정
- **기획:** 4배 확장 후 너무 길다는 피드백 → 현재 길이의 2/3(72px → 48px)
- **TC:** 렌더링 상수 변경이라 신규 테스트 없음, 기존 회귀 확인
- **개발:** src/render/renderer.ts (몸통 58→34px, 머리 16px·폭 14px 유지)
- **검증:** 337 passed, 0 failed / typecheck 0 errors

### [2026-10-27 01:04] 발사대 화살표 길이 4배 확장
- **기획:** 발사대 회전 화살표가 너무 짧아 방향 파악이 어려움 → 전체 길이 약 4배(18px → 72px)
- **TC:** 렌더링 상수 변경이라 신규 테스트 없음, 기존 회귀 확인
- **개발:** src/render/renderer.ts (몸통 8→58px, 머리 12→16px·폭 12→14px)
- **검증:** 337 passed, 0 failed / typecheck 0 errors
- **비고:** 브라우저 미확인 — 실제 화면에서 길이 수동 확인 필요

### [2026-10-27 00:36] 조준 가이드 제한과 헬프 기능 추가
- **기획:** 스테이지 2부터 가이드는 각 판 첫 발에만 표시. 헬프(버튼/H 키)로 다음 1발 동안 가이드 표시(월드 6+도 반사 경로까지), 그 발 점수만 0.1배(버림). 헬프는 3회 시작, 클리어 3회마다(재클리어 포함) +1, 최대 3, localStorage 저장
- **TC:** 정상: 스테이지 1 상시 가이드·2판+ 첫 발만·헬프 1발 유지·0.1배 점수(클리어 보너스 유지)·3회 클리어마다 +1·사용 시 차감/저장 / 엣지: 최대 3 상한·0회 사용 불가·중복 켜기 미차감·비행/일시정지 중 불가·HUD 탭 미발사·손상된 helps/clears 정리
- **개발:** src/core/game.ts, src/storage/progress.ts, src/render/renderer.ts, src/ui/screens.ts, tests/game.test.ts, tests/progress.test.ts, tests/screens.test.ts, README.md
- **검증:** 337 passed, 0 failed / typecheck 0 errors / build.sh OK (53.7 KB)
- **비고:** 환경에 브라우저가 없어 HUD 버튼 배치는 가짜 캔버스 스모크 테스트로만 확인 — 실제 화면 수동 확인 필요

### [2026-10-26 02:04] README 작성
- **기획:** 플레이 방법·조작·점수 규칙과 개발/빌드 절차를 처음 보는 사람도 알 수 있게 정리
- **TC:** 문서 작업이라 단위 테스트 없음, 조작 키·점수식·Node 요구 버전을 코드와 대조해 확인
- **개발:** README.md
- **검증:** 327 passed, 0 failed (기존 테스트 회귀 없음)

### [2026-10-23 06:39] 단일 파일 릴리스 최종 검증
- **기획:** plan.md 태스크 11 — 깨끗한 클론(git clean -xdf)에서 build.sh 전체 실행으로 수용 기준 확인
- **TC:** 정상: npm ci→typecheck→test→build→verify-release 통과 / 엣지: 빌드된 인라인 스크립트를 가짜 DOM 에서 실행해 런타임 오류 없음 확인
- **개발:** history.md (코드 변경 없음)
- **검증:** 327 passed, 0 failed / build.sh exit 0 / release/index.html 52.5 KB 단일 파일
- **비고:** 환경에 브라우저가 없어 file:// 실제 열기는 미확인 — 사용자 수동 확인 필요

### [2026-10-23 06:38] 합성 효과음과 파티클·흔들림·음소거 추가
- **기획:** plan.md 태스크 10 — WebAudio 오실레이터 효과음 8종(첫 제스처에 지연 생성), 팝/낙하 파티클, 하강 경고·하강 흔들림, M 키 음소거 저장
- **TC:** 정상: 효과음 테이블 유효성·unlock 1회 생성·파티클 수명/낙하 제거·경고/하강 흔들림 감쇠 / 엣지: 제스처 전 미생성·음소거·컨텍스트 생성 실패/미지원·빈 이벤트·clear·시드 재현성
- **개발:** src/audio/sfx.ts, src/render/effects.ts, src/main.ts, src/ui/screens.ts, tests/sfx.test.ts, tests/effects.test.ts
- **검증:** 327 passed, 0 failed / typecheck 0 errors / build.sh OK (52.5 KB)

### [2026-10-23 06:35] 캔버스 렌더러·입력·화면·메인 루프 구현
- **기획:** plan.md 태스크 9 — 절차적 버블 스프라이트, 마우스/터치/키보드 정규화, 타이틀/선택/일시정지/결과 화면, 1/120s 고정 스텝 루프
- **TC:** 정상: 포인터 각도·좌표 변환·키 조준 방향·화면 전환·클리어 시 해금 / 엣지: 발사대 아래 포인터·0 크기 rect·잠긴 스테이지·월드 6+ 조준선
- **개발:** src/input/input.ts, src/render/renderer.ts, src/ui/screens.ts, src/main.ts, tests/input.test.ts, tests/screens.test.ts
- **검증:** 314 passed, 0 failed / typecheck 0 errors / verify-release OK (48.8 KB)
- **비고:** 환경에 브라우저가 없어 수동 확인 대신 가짜 캔버스 스모크 테스트로 대체. 그리디 AI 시뮬레이션 193/200 클리어

### [2026-10-23 06:29] 스테이지 진행도 저장 구현
- **기획:** plan.md 태스크 8 — bubble.progress.v1 키에 해금/최고 점수/음소거 저장, 모든 접근 try/catch + 메모리 폴백
- **TC:** 정상: 다음 스테이지 해금·최고 점수 증가만·저장/불러오기 왕복·스토어 반영 / 엣지: 저장소 없음/예외·손상 JSON·잘못된 필드 정리·200 상한·재클리어 시 해금 유지·원본 불변
- **개발:** src/storage/progress.ts, tests/progress.test.ts
- **검증:** 304 passed, 0 failed / typecheck 0 errors

### [2026-10-23 06:28] 200개 스테이지(수제 10 + 시드 생성 190) 추가
- **기획:** plan.md 태스크 7 — 튜토리얼 1~10 수제, 11~200 은 8개 패턴 시드 생성 + 낙하 제거·색 보정·검증 후 stages.json 커밋
- **TC:** 정상: 200개 연속 id·난이도 표·월드 내 행 수 증가·패턴 연속 금지·생성 결정성·JSON 드리프트 / 엣지: 전 스테이지 §4.5 규칙·중복 rows·stageParams 경계(0, 201)
- **개발:** src/stages/types.ts, src/stages/handmade.ts, src/stages/generator.ts, src/stages/index.ts, src/stages/stages.json, scripts/gen-stages.ts, tests/stages.test.ts
- **검증:** 291 passed, 0 failed / typecheck 0 errors
- **비고:** 수제 스테이지도 월드 1 표(3색, 4~5행, 간격 10)를 따름. stages.json 약 44KB

### [2026-10-23 06:24] 게임 상태 머신과 점수 계산 구현
- **기획:** plan.md 태스크 6 — 조준→비행→정리→(조준|클리어|게임오버) 플레이 세션, 일시정지 플래그, 이벤트 큐
- **TC:** 정상: 클리어·점수 공식·데드라인 게임오버·천장 하강/경고·사라진 색 재추첨·시드 결정성 / 엣지: 낙하 배수 상한·보너스 하한·하강 후 게임오버·일시정지 중 정지·각도 제한·비행 중 재발사
- **개발:** src/core/game.ts, tests/game.test.ts
- **검증:** 82 passed, 0 failed / typecheck 0 errors
- **비고:** Title/StageSelect 화면 전환은 DOM 의존이 있어 태스크 9 의 ui/screens.ts 에서 처리

### [2026-10-23 06:21] 발사 물리와 스냅 처리 구현
- **기획:** plan.md 태스크 5 — R/2 서브스텝 이동·거울 벽 반사·천장/버블 충돌·빈 셀 스냅·해석적 조준선
- **TC:** 정상: 수직 발사 0행 스냅·천장 하강·반사 각도 대칭·반사 후 착지 열·조준선 반사점/충돌점 / 엣지: 10°/170° 제한·NaN·큰 dt 터널링·그리드 밖 스냅·후보 전부 점유 시 폴백
- **개발:** src/core/physics.ts, tests/physics.test.ts
- **검증:** 69 passed, 0 failed / typecheck 0 errors

### [2026-10-23 06:19] 매칭 및 낙하 판정 로직 구현
- **기획:** plan.md 태스크 4 — 같은 색 3개 이상 BFS 제거 후 천장 미연결 셀 낙하, O(cells) 시간/공간
- **TC:** 정상: 2개 유지·3개 제거·짝/홀 행 체인·지지대 제거 낙하·다른 경로 연결 유지 / 엣지: 빈 보드·가득 찬 보드·단일 셀·매칭 없이 낙하 정리
- **개발:** src/core/match.ts, tests/match.test.ts
- **검증:** 51 passed, 0 failed / typecheck 0 errors

### [2026-10-23 06:18] 시드 기반 mulberry32 난수 생성기 추가
- **기획:** plan.md 태스크 3 — 스테이지 생성·발사 색 선택을 재현 가능하게 하는 PRNG 와 보조 함수
- **TC:** 정상: 참조 구현 일치·동일 시드 동일 수열·[0,1) 범위·균등 분포·stageSeed 공식 / 엣지: 다른 시드 발산·32비트 초과/음수 시드·n<=0·빈 배열
- **개발:** src/core/rng.ts, tests/rng.test.ts
- **검증:** 39 passed, 0 failed / typecheck 0 errors

### [2026-10-23 06:17] 육각 그리드 보드 모델 구현
- **기획:** plan.md 태스크 2 — 상수와 홀수 행 offset 좌표계 기반 순수 함수 보드 모델
- **TC:** 정상: 6방향 이웃·좌표 공식·전 셀 왕복 변환·파싱/직렬화 / 엣지: 모서리·벽·마지막 행·범위 밖·빈 보드·잘못된 문자/길이
- **개발:** src/core/constants.ts, src/core/board.ts, tests/board.test.ts
- **검증:** 30 passed, 0 failed / typecheck 0 errors

### [2026-10-23 06:15] Vite 단일 파일 TypeScript 프로젝트 스캐폴딩
- **기획:** plan.md 태스크 1 — Vite + singlefile 빌드, build.sh, 릴리스 검증 스크립트 구성
- **TC:** 정상: 인라인 단일 HTML 통과 / 엣지: 디렉터리 없음·빈 폴더·추가 파일·외부 src/href·url(http·동적 import·10KB 이하·2MB 이상
- **개발:** package.json, tsconfig.json, vite.config.ts, index.html, build.sh, scripts/verify-release.mjs, src/main.ts, tests/release.test.ts
- **검증:** 10 passed, 0 failed / typecheck 0 errors
- **비고:** TS 7.0.2 는 android-arm64 네이티브 바이너리가 없어 plan §9 대로 5.9.3 고정. 스텁 main.ts 로는 인라인 스크립트 10KB 기준 미달 → 태스크 9 이후 build.sh 통과 예정

### [2026-10-23 06:05] 퍼즐 버블 클론 구현 계획서(plan.md) 작성
- **기획:** 다른 AI 에이전트가 바로 착수할 수 있도록 TypeScript + Vite 단일 HTML 빌드, 200 스테이지 설계를 문서화
- **TC:** 해당 없음(문서 작업) — 섹션 구성, UTF-8/LF, 깨진 문자 여부만 점검
- **개발:** plan.md, history.md
- **검증:** CRLF 0건, U+FFFD 0건
- **비고:** 미확정 항목(특수 버블, UI 언어 등)은 plan.md §2 기본값으로 명시, 사용자 변경 시 갱신 필요
