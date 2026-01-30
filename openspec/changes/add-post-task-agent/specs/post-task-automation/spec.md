# post-task-automation Specification

## Purpose

작업 완료 후 자동으로 코드 품질 점검, CI/CD 오류 수정, 프로덕션 모니터링을 수행하는 Post-Task Agent 시스템을 제공합니다.

## ADDED Requirements

### Requirement: Post-Task Runner

시스템은 카테고리별 점검 작업을 실행할 수 있어야 합니다(SHALL).

#### Scenario: 전체 점검 실행
- **GIVEN** 프로젝트에서 Post-Task Agent가 설정되어 있을 때
- **WHEN** `post_task_run({ category: 'all' })`을 실행하면
- **THEN** 모든 카테고리의 점검 작업이 순차적으로 실행됩니다
- **AND** 각 작업의 결과가 리포트로 저장됩니다

#### Scenario: 특정 카테고리 실행
- **GIVEN** Post-Task Agent가 설정되어 있을 때
- **WHEN** `post_task_run({ category: 'code-quality' })`를 실행하면
- **THEN** code-quality 카테고리의 작업만 실행됩니다 (lint-fix, type-check, dead-code, todo-cleanup)

#### Scenario: 개별 작업 실행
- **GIVEN** Post-Task Agent가 설정되어 있을 때
- **WHEN** `post_task_run({ tasks: ['lint-fix', 'type-check'] })`를 실행하면
- **THEN** 지정된 작업만 실행됩니다

---

### Requirement: Model Selection

시스템은 작업별로 적절한 AI 모델을 선택할 수 있어야 합니다(SHALL).

#### Scenario: 기본 모델 사용
- **GIVEN** 모델이 지정되지 않았을 때
- **WHEN** 작업을 실행하면
- **THEN** 작업 유형에 맞는 기본 모델이 사용됩니다 (lint-fix → fast, sentry-triage → powerful)

#### Scenario: 모델 티어 지정
- **GIVEN** 사용자가 모델 티어를 지정했을 때
- **WHEN** `post_task_run({ tasks: ['lint-fix'], model: 'powerful' })`를 실행하면
- **THEN** 지정된 티어의 모델이 사용됩니다 (예: claude-opus)

#### Scenario: CLI와 모델 함께 지정
- **GIVEN** 사용자가 CLI와 모델을 함께 지정했을 때
- **WHEN** `post_task_run({ cli: 'qwen', model: 'fast' })`를 실행하면
- **THEN** qwen CLI의 fast 모델(qwen-turbo)이 사용됩니다

#### Scenario: 지원 CLI 목록
- **GIVEN** 시스템이 초기화될 때
- **WHEN** 지원되는 CLI를 확인하면
- **THEN** claude, gemini, qwen, openai가 지원됩니다
- **AND** 각 CLI별로 fast, balanced, powerful 티어가 정의되어 있습니다

---

### Requirement: Lint Fix Automation

시스템은 ESLint 오류를 자동으로 수정할 수 있어야 합니다(SHALL).

#### Scenario: 자동 수정 가능한 오류
- **GIVEN** ESLint 자동 수정 가능한 오류가 있을 때
- **WHEN** lint-fix 작업을 실행하면
- **THEN** `eslint --fix`로 자동 수정됩니다
- **AND** 수정된 파일 목록이 리포트에 포함됩니다

#### Scenario: 자동 수정 불가능한 오류
- **GIVEN** 자동 수정이 불가능한 ESLint 오류가 있을 때
- **WHEN** lint-fix 작업을 실행하면
- **THEN** AI가 수정안을 제시합니다
- **AND** 사용자 확인 후 적용됩니다

---

### Requirement: Type Check Automation

시스템은 TypeScript 타입 오류를 분석하고 수정할 수 있어야 합니다(SHALL).

#### Scenario: 타입 오류 감지
- **GIVEN** TypeScript 타입 오류가 있을 때
- **WHEN** type-check 작업을 실행하면
- **THEN** `tsc --noEmit` 결과가 분석됩니다
- **AND** 오류별 수정안이 제시됩니다

#### Scenario: 누락된 import 자동 추가
- **GIVEN** import가 누락되어 타입 오류가 발생했을 때
- **WHEN** type-check 작업을 실행하면
- **THEN** 필요한 import가 자동으로 추가됩니다

---

### Requirement: Dead Code Quarantine

시스템은 미사용 코드를 안전하게 격리할 수 있어야 합니다(SHALL).

#### Scenario: 미사용 export 감지
- **GIVEN** 어디서도 import되지 않는 export가 있을 때
- **WHEN** dead-code 작업을 실행하면
- **THEN** ts-prune으로 미사용 export가 감지됩니다
- **AND** 신뢰도가 high인 경우 `.quarantine/`로 이동됩니다

#### Scenario: 미사용 파일 격리
- **GIVEN** 어디서도 참조되지 않는 파일이 있을 때
- **WHEN** dead-code 작업을 실행하면
- **THEN** 해당 파일이 `.quarantine/{date}/` 폴더로 이동됩니다
- **AND** manifest.json에 원본 경로와 격리 사유가 기록됩니다

#### Scenario: 낮은 신뢰도 코드 처리
- **GIVEN** 동적 import 가능성이 있는 미사용 코드가 감지되었을 때
- **WHEN** dead-code 작업을 실행하면
- **THEN** 코드를 이동하지 않고 리포트에만 포함됩니다
- **AND** confidence: 'low'로 표시됩니다

#### Scenario: 격리된 코드 복구
- **GIVEN** `.quarantine/`에 격리된 파일이 있을 때
- **WHEN** `quarantine_restore({ date, itemId })`를 실행하면
- **THEN** 파일이 원본 경로로 복구됩니다
- **AND** manifest.json에 restoredAt이 기록됩니다

#### Scenario: 격리 기간 만료 삭제
- **GIVEN** 30일 이상 격리된 high confidence 파일이 있을 때
- **WHEN** dead-code 작업을 실행하면
- **THEN** 해당 파일의 완전 삭제를 제안합니다
- **AND** 사용자 확인 후 삭제됩니다

---

### Requirement: Test Fix Automation

시스템은 실패한 테스트를 분석하고 수정할 수 있어야 합니다(SHALL).

#### Scenario: 테스트 실패 분석
- **GIVEN** 테스트가 실패했을 때
- **WHEN** test-fix 작업을 실행하면
- **THEN** 실패 원인이 분류됩니다 (assertion, type, mock, environment)
- **AND** 각 실패에 대한 수정안이 제시됩니다

#### Scenario: Assertion 실패 수정
- **GIVEN** assertion 실패로 테스트가 실패했을 때
- **WHEN** test-fix 작업을 실행하면
- **THEN** 기대값과 실제값을 비교 분석합니다
- **AND** 테스트 코드 또는 구현 코드 수정안을 제시합니다

#### Scenario: Mock 문제 수정
- **GIVEN** mock 데이터 불일치로 테스트가 실패했을 때
- **WHEN** test-fix 작업을 실행하면
- **THEN** mock 데이터 업데이트가 제안됩니다

---

### Requirement: Test Generation

시스템은 새 코드에 테스트를 자동 생성할 수 있어야 합니다(SHALL).

#### Scenario: 새 파일 테스트 생성
- **GIVEN** 테스트가 없는 새 파일이 커밋되었을 때
- **WHEN** test-gen 작업을 실행하면
- **THEN** 해당 파일의 테스트 파일이 생성됩니다
- **AND** 함수 시그니처 기반 테스트 케이스가 포함됩니다

#### Scenario: 변경된 파일 테스트 보강
- **GIVEN** 기존 파일에 새 함수가 추가되었을 때
- **WHEN** test-gen 작업을 실행하면
- **THEN** 새 함수에 대한 테스트가 기존 테스트 파일에 추가됩니다

#### Scenario: 테스트 프레임워크 자동 감지
- **GIVEN** 프로젝트에 vitest 또는 jest가 설정되어 있을 때
- **WHEN** test-gen 작업을 실행하면
- **THEN** 해당 프레임워크에 맞는 테스트 코드가 생성됩니다

---

### Requirement: E2E Test Expansion

시스템은 E2E 테스트 커버리지를 확장할 수 있어야 합니다(SHALL).

#### Scenario: 미커버 페이지 감지
- **GIVEN** E2E 테스트가 없는 페이지가 있을 때
- **WHEN** e2e-expand 작업을 실행하면
- **THEN** 커버되지 않은 라우트/페이지 목록이 출력됩니다

#### Scenario: E2E 테스트 생성
- **GIVEN** 커버되지 않은 페이지가 식별되었을 때
- **WHEN** e2e-expand 작업을 실행하면
- **THEN** Playwright 테스트 코드가 생성됩니다
- **AND** 주요 사용자 플로우가 커버됩니다

---

### Requirement: Coverage Fix

시스템은 테스트 커버리지 부족 영역에 테스트를 추가할 수 있어야 합니다(SHALL).

#### Scenario: 커버리지 부족 감지
- **GIVEN** 테스트 커버리지가 임계값 미만일 때
- **WHEN** coverage-fix 작업을 실행하면
- **THEN** 커버리지가 부족한 파일/함수 목록이 출력됩니다

#### Scenario: 타겟 테스트 생성
- **GIVEN** 커버리지 부족 영역이 식별되었을 때
- **WHEN** coverage-fix 작업을 실행하면
- **THEN** 해당 영역을 커버하는 테스트가 생성됩니다

---

### Requirement: Snapshot Update

시스템은 깨진 스냅샷을 분석하고 업데이트할 수 있어야 합니다(SHALL).

#### Scenario: 스냅샷 실패 분석
- **GIVEN** 스냅샷 테스트가 실패했을 때
- **WHEN** snapshot-update 작업을 실행하면
- **THEN** 이전/현재 스냅샷의 차이가 분석됩니다
- **AND** 의도된 변경인지 버그인지 판단됩니다

#### Scenario: 스냅샷 업데이트
- **GIVEN** 의도된 UI 변경으로 스냅샷이 실패했을 때
- **WHEN** snapshot-update 작업을 실행하고 확인하면
- **THEN** 스냅샷이 업데이트됩니다

---

### Requirement: Flaky Test Detection

시스템은 불안정한 테스트를 감지하고 수정할 수 있어야 합니다(SHALL).

#### Scenario: 불안정 테스트 감지
- **GIVEN** 테스트가 간헐적으로 실패할 때
- **WHEN** flaky-detect 작업을 실행하면
- **THEN** 반복 실행으로 불안정 테스트가 식별됩니다
- **AND** 실패 패턴이 분석됩니다 (타이밍, 상태, 비결정성)

#### Scenario: 불안정 테스트 수정
- **GIVEN** 불안정 테스트가 식별되었을 때
- **WHEN** flaky-detect 작업을 실행하면
- **THEN** 수정안이 제시됩니다 (waitFor 추가, mock 격리 등)

---

### Requirement: CI/CD Failure Analysis

시스템은 GitHub Actions 실패를 분석하고 수정안을 제시할 수 있어야 합니다(SHALL).

#### Scenario: 실패 로그 분석
- **GIVEN** GitHub Actions workflow가 실패했을 때
- **WHEN** ci-fix 작업을 실행하면
- **THEN** `gh run view --log-failed`로 실패 로그를 가져옵니다
- **AND** 실패 원인을 분류합니다 (dependency, test, build, environment)

#### Scenario: 테스트 실패 수정
- **GIVEN** CI에서 테스트가 실패했을 때
- **WHEN** ci-fix 작업을 실행하면
- **THEN** 실패한 테스트를 로컬에서 재현합니다
- **AND** 수정안을 제시합니다

#### Scenario: 의존성 문제 해결
- **GIVEN** CI에서 의존성 설치가 실패했을 때
- **WHEN** ci-fix 작업을 실행하면
- **THEN** package-lock.json 동기화를 시도합니다
- **AND** 필요시 의존성 버전을 조정합니다

---

### Requirement: Dependency Audit

시스템은 npm 패키지 보안 취약점을 감지하고 패치할 수 있어야 합니다(SHALL).

#### Scenario: 취약점 감지
- **GIVEN** 프로젝트에 취약한 의존성이 있을 때
- **WHEN** dep-audit 작업을 실행하면
- **THEN** `npm audit`으로 취약점이 감지됩니다
- **AND** 심각도별로 분류됩니다 (critical, high, moderate, low)

#### Scenario: 자동 패치
- **GIVEN** breaking change 없이 패치 가능한 취약점이 있을 때
- **WHEN** dep-audit 작업을 실행하면
- **THEN** `npm audit fix`로 자동 패치됩니다

#### Scenario: 수동 개입 필요
- **GIVEN** major 버전 업그레이드가 필요한 취약점이 있을 때
- **WHEN** dep-audit 작업을 실행하면
- **THEN** 리포트에 업그레이드 가이드가 포함됩니다
- **AND** 자동 수정은 하지 않습니다

---

### Requirement: Sentry Error Triage

시스템은 Sentry 에러를 분석하고 수정안을 제시할 수 있어야 합니다(SHALL).

#### Scenario: 에러 조회
- **GIVEN** Sentry 인증 토큰이 설정되어 있을 때
- **WHEN** sentry-triage 작업을 실행하면
- **THEN** 최근 미해결 이슈 목록을 가져옵니다

#### Scenario: 스택트레이스 분석
- **GIVEN** Sentry 이슈가 있을 때
- **WHEN** sentry-triage 작업을 실행하면
- **THEN** 스택트레이스에서 관련 코드 위치를 찾습니다
- **AND** 수정안을 제시합니다 (자동 수정 안 함)

#### Scenario: 인증 실패
- **GIVEN** Sentry 인증 토큰이 없거나 유효하지 않을 때
- **WHEN** sentry-triage 작업을 실행하면
- **THEN** Integration Hub에서 토큰을 확인하라는 메시지가 표시됩니다

---

### Requirement: Security Log Audit

시스템은 Supabase 보안 로그를 분석할 수 있어야 합니다(SHALL).

#### Scenario: 보안 로그 조회
- **GIVEN** Supabase 프로젝트가 연결되어 있을 때
- **WHEN** security-audit 작업을 실행하면
- **THEN** 인증 실패, 비정상 접근 시도 등의 로그를 분석합니다

#### Scenario: 보안 이슈 감지
- **GIVEN** 의심스러운 패턴이 감지되었을 때
- **WHEN** security-audit 작업을 실행하면
- **THEN** 리포트에 경고가 포함됩니다
- **AND** 권장 조치 사항이 제시됩니다 (자동 수정 안 함)

---

### Requirement: Report Generation

시스템은 실행 결과를 구조화된 리포트로 저장해야 합니다(SHALL).

#### Scenario: 리포트 저장
- **GIVEN** 점검 작업이 완료되었을 때
- **WHEN** 결과를 저장하면
- **THEN** `.zyflow/reports/post-task/{timestamp}_{task}.json`에 저장됩니다
- **AND** 마크다운 버전도 함께 저장됩니다

#### Scenario: 리포트 내용
- **GIVEN** 리포트가 생성되었을 때
- **WHEN** 리포트를 조회하면
- **THEN** 실행 시간, 발견된 문제, 수정된 항목, 미해결 항목이 포함됩니다

---

### Requirement: Post-Task MCP Tools

Claude Code에서 Post-Task Agent를 제어할 수 있는 MCP 도구를 제공해야 합니다(SHALL).

#### Scenario: 통합 실행 도구
- **GIVEN** MCP 서버에 연결되어 있을 때
- **WHEN** `post_task_run` 도구를 호출하면
- **THEN** 지정된 카테고리/작업이 실행됩니다
- **AND** 실행 결과 요약이 반환됩니다

#### Scenario: 격리 관리 도구
- **GIVEN** MCP 서버에 연결되어 있을 때
- **WHEN** `quarantine_list` 도구를 호출하면
- **THEN** 현재 격리된 파일 목록이 반환됩니다

#### Scenario: 격리 복구 도구
- **GIVEN** 격리된 파일이 있을 때
- **WHEN** `quarantine_restore` 도구를 호출하면
- **THEN** 지정된 파일이 원본 위치로 복구됩니다

---

### Requirement: Trigger System

시스템은 다양한 트리거 방식을 지원해야 합니다(SHALL).

#### Scenario: Git Hook 트리거
- **GIVEN** Git hook이 설정되어 있을 때
- **WHEN** pre-commit 훅이 실행되면
- **THEN** 설정된 작업(lint-fix, type-check)이 자동 실행됩니다

#### Scenario: 스케줄 트리거
- **GIVEN** cron 스케줄이 설정되어 있을 때
- **WHEN** 지정된 시간이 되면
- **THEN** 설정된 작업이 자동 실행됩니다

#### Scenario: 이벤트 트리거
- **GIVEN** 이벤트 트리거가 설정되어 있을 때
- **WHEN** CI 실패가 감지되면
- **THEN** ci-fix, test-fix 작업이 자동 실행됩니다

#### Scenario: Polling 기반 감지
- **GIVEN** GitHub CI polling이 활성화되어 있을 때
- **WHEN** 5분마다 상태를 확인하면
- **THEN** 새로운 실패가 감지되면 이벤트가 트리거됩니다

---

### Requirement: Trigger Configuration

시스템은 트리거 설정을 관리할 수 있어야 합니다(SHALL).

#### Scenario: 트리거 설정 파일
- **GIVEN** `.zyflow/triggers.json`이 있을 때
- **WHEN** 시스템이 시작되면
- **THEN** 설정된 트리거가 활성화됩니다

#### Scenario: Hook 설치
- **GIVEN** 트리거 설정에 hooks가 정의되어 있을 때
- **WHEN** `post_task_setup_hooks` 도구를 실행하면
- **THEN** husky 또는 .git/hooks에 스크립트가 설치됩니다

#### Scenario: 스케줄러 시작
- **GIVEN** 트리거 설정에 schedule이 정의되어 있을 때
- **WHEN** `post_task_start_scheduler` 도구를 실행하면
- **THEN** node-cron 기반 스케줄러가 시작됩니다

#### Scenario: 트리거 비활성화
- **GIVEN** 특정 트리거가 활성화되어 있을 때
- **WHEN** 설정에서 enabled: false로 변경하면
- **THEN** 해당 트리거가 비활성화됩니다
