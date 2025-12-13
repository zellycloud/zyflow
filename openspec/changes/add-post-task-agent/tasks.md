# Tasks

## Group 1: 기반 구조

- [ ] task-1-1: Post-Task 타입 정의 (`mcp-server/post-task-types.ts`)
  - TaskCategory, TaskType, ModelTier, CLI 타입 정의
  - PostTaskConfig, PostTaskResult 인터페이스
  - TriggerType, TriggerConfig 타입 정의
  - files: `mcp-server/post-task-types.ts`

- [ ] task-1-2: CLI 모델 매핑 설정 (`mcp-server/cli-models.ts`)
  - claude, gemini, qwen, openai CLI별 모델 매핑
  - 작업별 기본 모델 티어 정의
  - files: `mcp-server/cli-models.ts`

- [ ] task-1-3: Post-Task Runner 엔진 (`mcp-server/post-task-runner.ts`)
  - 카테고리/개별 작업 실행 로직
  - 모델 선택 로직
  - 결과 수집 및 리포트 생성 호출
  - files: `mcp-server/post-task-runner.ts`

## Group 2: Code Quality 작업

- [ ] task-2-1: lint-fix 구현
  - `npm run lint -- --format json` 실행 및 결과 파싱
  - `eslint --fix` 자동 수정
  - 수정 불가능한 오류 AI 분석
  - files: `mcp-server/tasks/lint-fix.ts`

- [ ] task-2-2: type-check 구현
  - `tsc --noEmit` 실행 및 오류 파싱
  - 누락된 import 자동 추가
  - 타입 불일치 수정안 제시
  - files: `mcp-server/tasks/type-check.ts`

- [ ] task-2-3: dead-code 감지 구현
  - `ts-prune` 미사용 export 감지
  - `depcheck` 미사용 의존성 감지
  - 신뢰도 점수 계산
  - files: `mcp-server/tasks/dead-code.ts`

- [ ] task-2-4: todo-cleanup 구현
  - 코드 내 TODO/FIXME 스캔
  - Git 히스토리로 해결 여부 판단
  - 해결된 TODO 자동 제거
  - files: `mcp-server/tasks/todo-cleanup.ts`

- [ ] task-2-5: refactor-suggest 구현
  - 코드 복잡도 분석
  - 중복 코드 감지
  - 리팩토링 제안 리포트 생성
  - files: `mcp-server/tasks/refactor-suggest.ts`

## Group 3: Testing 작업

- [ ] task-3-1: test-fix 구현
  - 테스트 실행 및 실패 수집
  - 실패 원인 분류 (assertion, type, mock, environment)
  - 수정안 제시 및 적용
  - files: `mcp-server/tasks/test-fix.ts`

- [ ] task-3-2: test-gen 구현
  - 새/변경 파일 감지 (git diff)
  - 테스트 없는 파일 식별
  - 함수 시그니처 기반 테스트 자동 생성
  - vitest/jest 프레임워크 자동 감지
  - files: `mcp-server/tasks/test-gen.ts`

- [ ] task-3-3: e2e-expand 구현
  - 현재 E2E 커버리지 분석
  - 커버되지 않은 라우트/페이지 식별
  - Playwright 테스트 자동 생성
  - files: `mcp-server/tasks/e2e-expand.ts`

- [ ] task-3-4: coverage-fix 구현
  - 커버리지 리포트 분석
  - 커버리지 부족 영역 식별
  - 타겟 테스트 생성
  - files: `mcp-server/tasks/coverage-fix.ts`

- [ ] task-3-5: snapshot-update 구현
  - 스냅샷 실패 분석
  - 이전/현재 차이 비교
  - 의도된 변경 vs 버그 판단
  - 확인 후 스냅샷 업데이트
  - files: `mcp-server/tasks/snapshot-update.ts`

- [ ] task-3-6: flaky-detect 구현
  - 반복 실행으로 불안정 테스트 감지
  - 실패 패턴 분석 (타이밍, 상태, 비결정성)
  - 수정안 제시 (waitFor, mock 격리 등)
  - files: `mcp-server/tasks/flaky-detect.ts`

## Group 4: Quarantine 시스템

- [ ] task-4-1: Quarantine Manager 구현
  - `.quarantine/{date}/` 디렉토리 관리
  - manifest.json 생성/업데이트
  - 파일 이동 로직
  - files: `mcp-server/quarantine-manager.ts`

- [ ] task-4-2: 격리 복구 기능
  - 원본 경로로 파일 복구
  - manifest에 restoredAt 기록
  - 충돌 시 처리 로직
  - files: `mcp-server/quarantine-manager.ts`

- [ ] task-4-3: 격리 만료 정책
  - 30일 이상 격리 파일 감지
  - 삭제 확인 프롬프트
  - 자동 정리 옵션
  - files: `mcp-server/quarantine-manager.ts`

## Group 5: CI/CD 작업

- [ ] task-5-1: ci-fix 구현
  - `gh run list --status failure` 실패 워크플로우 조회
  - `gh run view --log-failed` 로그 분석
  - 실패 원인 분류 (dependency, test, build, environment)
  - files: `mcp-server/tasks/ci-fix.ts`

- [ ] task-5-2: dep-audit 구현
  - `npm audit --json` 실행
  - 심각도별 분류
  - `npm audit fix` 자동 패치 (non-breaking만)
  - files: `mcp-server/tasks/dep-audit.ts`

- [ ] task-5-3: bundle-check 구현
  - 빌드 후 번들 크기 분석
  - 이전 빌드와 비교
  - 급격한 증가 시 원인 분석
  - files: `mcp-server/tasks/bundle-check.ts`

## Group 6: Production 작업

- [ ] task-6-1: sentry-triage 구현
  - Sentry API로 이슈 조회
  - 스택트레이스 파싱 및 코드 위치 찾기
  - 수정안 제시 (분석만, 자동 수정 안 함)
  - files: `mcp-server/tasks/sentry-triage.ts`

- [ ] task-6-2: security-audit 구현
  - Supabase CLI로 로그 조회
  - 보안 패턴 분석 (인증 실패, 비정상 접근)
  - 경고 리포트 생성
  - files: `mcp-server/tasks/security-audit.ts`

- [ ] task-6-3: api-validate 구현
  - API 응답 스키마 검증
  - TypeScript 타입과 실제 응답 비교
  - 불일치 리포트 생성
  - files: `mcp-server/tasks/api-validate.ts`

## Group 7: Trigger 시스템

- [ ] task-7-1: Trigger 타입 및 설정 로더
  - `.zyflow/triggers.json` 스키마 정의
  - 설정 파일 로드/파싱
  - 기본값 설정
  - files: `mcp-server/trigger-config.ts`

- [ ] task-7-2: Git Hook 트리거 구현
  - husky 또는 .git/hooks 스크립트 생성
  - pre-commit, pre-push, post-commit, post-merge 지원
  - 훅 설치/제거 명령
  - files: `mcp-server/triggers/git-hooks.ts`

- [ ] task-7-3: Scheduler 트리거 구현
  - node-cron 기반 스케줄러
  - cron 표현식 파싱
  - 스케줄러 시작/중지
  - files: `mcp-server/triggers/scheduler.ts`

- [ ] task-7-4: Event 트리거 구현
  - GitHub CI 상태 polling
  - Sentry 이슈 polling
  - 이벤트 감지 시 작업 실행
  - files: `mcp-server/triggers/event-listener.ts`

- [ ] task-7-5: Trigger Router 구현
  - 트리거 → 작업 매핑
  - 중복 실행 방지 (dedup)
  - 실행 큐 관리
  - files: `mcp-server/trigger-router.ts`

## Group 8: 리포트 시스템

- [ ] task-8-1: Report Generator 구현
  - `.zyflow/reports/post-task/` 디렉토리 관리
  - JSON 리포트 생성
  - Markdown 리포트 생성
  - files: `mcp-server/report-generator.ts`

- [ ] task-8-2: 리포트 조회 API
  - 리포트 목록 조회
  - 특정 리포트 상세 조회
  - files: `server/routes/reports.ts`

## Group 9: MCP 도구

- [ ] task-9-1: post_task_run MCP 도구
  - 통합 실행 도구 구현
  - 파라미터: category, tasks, cli, model
  - files: `mcp-server/post-task-tools.ts`

- [ ] task-9-2: quarantine MCP 도구들
  - quarantine_list: 격리 파일 목록
  - quarantine_restore: 격리 복구
  - quarantine_delete: 격리 파일 삭제
  - files: `mcp-server/post-task-tools.ts`

- [ ] task-9-3: trigger MCP 도구들
  - post_task_setup_hooks: Git hook 설치
  - post_task_start_scheduler: 스케줄러 시작
  - post_task_trigger_status: 트리거 상태 조회
  - files: `mcp-server/post-task-tools.ts`

- [ ] task-9-4: 기존 MCP 서버에 통합
  - index.ts에 post-task 도구 등록
  - files: `mcp-server/index.ts`

## Group 10: 테스트 및 문서

- [ ] task-10-1: Post-Task 작업 단위 테스트
  - 각 작업별 테스트 케이스
  - 모킹 전략 정의
  - files: `mcp-server/__tests__/post-task.test.ts`

- [ ] task-10-2: Testing 작업 단위 테스트
  - test-fix, test-gen, e2e-expand 등 테스트
  - files: `mcp-server/__tests__/testing-tasks.test.ts`

- [ ] task-10-3: Quarantine 시스템 테스트
  - 격리/복구/삭제 테스트
  - 엣지 케이스 처리
  - files: `mcp-server/__tests__/quarantine.test.ts`

- [ ] task-10-4: Trigger 시스템 테스트
  - Git hook, scheduler, event listener 테스트
  - files: `mcp-server/__tests__/triggers.test.ts`

- [ ] task-10-5: CLAUDE.md 업데이트
  - Post-Task Agent 사용법 추가
  - MCP 도구 설명 추가
  - 트리거 설정 가이드 추가
  - files: `CLAUDE.md`
