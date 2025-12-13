<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# ZyFlow 프로젝트 지침

## 프로젝트 구조

```
zyflow/
├── src/           # React 프론트엔드 (Vite + React 19 + TailwindCSS 4)
├── server/        # Express API 서버
├── mcp-server/    # MCP 서버 (Claude Code 통합)
├── openspec/      # OpenSpec 변경 제안 및 스펙
```

## 개발 서버

```bash
# 프론트엔드 + API 서버 동시 실행
npm run dev:all

# 개별 실행
npm run dev      # Vite (localhost:5173)
npm run server   # Express API (localhost:3001)
```

## 코드 품질

- ESLint + Prettier 사용
- 코드 변경 후 `npm run lint` 실행
- 테스트: `npm run test`

## MCP 서버 빌드

```bash
npm run build:mcp
```

`dist/mcp-server/index.js`가 생성되며, Claude Code에서 사용 가능

## Task 관리 (칸반 보드)

작업 내용을 칸반 보드에 등록하여 진행 상황을 추적합니다.

### MCP 도구 사용 (권장)

```
task_create    - 새 태스크 생성 (ID: TASK-1, TASK-2, ... 순차 번호)
task_list      - 태스크 목록 조회 (kanban: true로 상태별 그룹화)
task_update    - 태스크 수정 (상태 변경 포함)
task_search    - 태스크 검색 (includeArchived: true로 아카이브 포함)
task_delete    - 태스크 삭제
task_view      - 태스크 상세 조회
task_archive   - 완료된 태스크를 아카이브로 이동
task_unarchive - 아카이브된 태스크 복원 (done으로)
```

### 태스크 상태

- `todo`: 대기 중
- `in-progress`: 진행 중
- `review`: 검토 중
- `done`: 완료
- `archived`: 아카이브됨 (칸반에서 숨김, 검색 시 includeArchived로 조회)

### 우선순위

- `high`: 긴급
- `medium`: 보통 (기본값)
- `low`: 낮음

### 사용 예시

```
# 버그 수정 태스크 생성 (순차 번호 ID 자동 생성)
task_create(title: "API 응답 시간 개선", priority: "high", tags: ["performance"])
# → TASK-1 생성됨

# 작업 시작 시 상태 변경
task_update(id: "TASK-1", status: "in-progress")

# 작업 완료 시
task_update(id: "TASK-1", status: "done")

# 완료된 작업 정리 (아카이브)
task_archive(id: "TASK-1")

# 아카이브된 작업 포함 검색
task_search(query: "API", includeArchived: true)
```

### CLI 명령어 (대안)

```bash
zy tasks add "태스크 제목" --priority high --tags bug,urgent
zy tasks list --kanban
zy tasks move TASK-ABC123 in-progress
zy tasks search "검색어"
```

### 태스크 등록 가이드라인

- **작은 단위**: OpenSpec이 필요 없는 작은 버그 수정, 리팩토링, 단순 작업에 사용
- **명확한 제목**: 무엇을 해야 하는지 명확하게 작성
- **적절한 태그**: `bug`, `refactor`, `feature`, `docs`, `test` 등 사용
- **우선순위 설정**: 긴급한 버그는 `high`, 일반 작업은 `medium`

## AI Agent 실행 (OpenSpec 자동화)

ZyFlow는 LangGraph 기반 AI Agent를 통해 OpenSpec 변경 제안을 자동으로 실행할 수 있습니다.

### Agent MCP 도구

```
zyflow_execute_change  - OpenSpec Change 실행 시작
zyflow_get_agent_status - Agent 세션 상태 조회
zyflow_stop_agent      - 실행 중인 Agent 중단
zyflow_resume_agent    - 체크포인트에서 Agent 재개
```

### 사용 예시

```
# Change 실행 시작
zyflow_execute_change(changeId: "add-feature-x", projectPath: "/path/to/project")
# → session_id 반환

# 상태 확인
zyflow_get_agent_status(sessionId: "session-123")

# 중단
zyflow_stop_agent(sessionId: "session-123")

# 재개
zyflow_resume_agent(sessionId: "session-123")
```

### Python Agent 서버

AI Agent는 별도의 Python FastAPI 서버에서 실행됩니다:

```bash
# Python Agent 서버 포함 전체 실행
npm run dev:full

# 개별 실행
npm run py:server  # Python Agent 서버 (localhost:3002)
```

### 지원 CLI

Agent UI에서 다양한 AI CLI를 선택하여 사용할 수 있습니다:
- Claude Code (기본)
- Gemini CLI
- Qwen Code CLI
- Kilo Code CLI

각 CLI는 ZyFlow MCP 서버와 연동되어 OpenSpec 태스크를 실행합니다.

## Post-Task Agent (자동 코드 품질 관리)

Post-Task Agent는 작업 완료 후 자동으로 코드 품질 검사, 테스트, CI/CD 분석, 프로덕션 모니터링을 수행합니다.

### MCP 도구

```
post_task_run          - Post-Task 작업 실행
quarantine_list        - 격리된 파일 목록 조회
quarantine_restore     - 격리된 파일 복구
quarantine_delete      - 격리된 파일 삭제
quarantine_stats       - 격리 시스템 통계
post_task_setup_hooks  - Git hooks 설치/제거
post_task_start_scheduler - 스케줄러 시작/중지
post_task_event_listener  - 이벤트 리스너 시작/중지
post_task_trigger_status  - 트리거 시스템 상태
post_task_reports      - 실행 리포트 목록
post_task_report_view  - 특정 리포트 조회
```

### 작업 카테고리

| 카테고리 | 작업 | 설명 |
|----------|------|------|
| **code-quality** | lint-fix | ESLint 오류 수정 |
| | type-check | TypeScript 타입 검사 |
| | dead-code | 미사용 코드 감지 |
| | todo-cleanup | TODO/FIXME 정리 |
| | refactor-suggest | 리팩토링 제안 |
| **testing** | test-fix | 실패 테스트 수정 |
| | test-gen | 테스트 자동 생성 |
| | e2e-expand | E2E 테스트 확장 |
| | coverage-fix | 커버리지 개선 |
| | snapshot-update | 스냅샷 업데이트 |
| | flaky-detect | 불안정 테스트 감지 |
| **ci-cd** | ci-fix | CI 실패 분석 |
| | dep-audit | 의존성 보안 검사 |
| | bundle-check | 번들 크기 분석 |
| **production** | sentry-triage | Sentry 이슈 분석 |
| | security-audit | 보안 로그 분석 |
| | api-validate | API 스키마 검증 |

### 사용 예시

```
# 전체 카테고리 실행
post_task_run(category: "all")

# 특정 카테고리 실행
post_task_run(category: "code-quality")

# 개별 작업 실행
post_task_run(tasks: ["lint-fix", "type-check"])

# CLI 및 모델 지정
post_task_run(category: "testing", cli: "gemini", model: "balanced")

# 드라이런 (실제 변경 없이 분석만)
post_task_run(category: "code-quality", dryRun: true)
```

### Quarantine 시스템 (Dead Code 격리)

미사용 코드는 즉시 삭제하지 않고 `.quarantine/` 폴더로 이동됩니다:

- **0-14일**: 격리됨 (quarantined) - 쉽게 복구 가능
- **14-30일**: 삭제 대기 (pending) - 경고 표시
- **30일+**: 만료 (expired) - 삭제 권장

```
# 격리 파일 조회
quarantine_list(status: "quarantined")

# 파일 복구
quarantine_restore(itemId: "abc123")

# 파일 삭제
quarantine_delete(itemId: "abc123")
```

### 트리거 설정

`.zyflow/triggers.json`에서 자동 실행을 설정할 수 있습니다:

```json
{
  "hooks": {
    "pre-commit": ["lint-fix", "type-check"],
    "pre-push": ["test-fix"],
    "post-merge": ["dep-audit", "dead-code"]
  },
  "schedule": [
    { "cron": "0 9 * * *", "tasks": ["sentry-triage"] },
    { "cron": "0 9 * * 1", "tasks": ["dead-code", "e2e-expand"] }
  ],
  "events": {
    "ci-failure": ["ci-fix", "test-fix"],
    "pr-created": ["lint-fix", "type-check", "test-gen"]
  }
}
```

```
# Git hooks 설치
post_task_setup_hooks(action: "install")

# 스케줄러 시작
post_task_start_scheduler(action: "start")

# 이벤트 리스너 시작
post_task_event_listener(action: "start")

# 전체 트리거 상태 확인
post_task_trigger_status()
```

### 리포트 조회

실행 결과는 `.zyflow/reports/post-task/`에 저장됩니다:

```
# 최근 리포트 목록
post_task_reports(limit: 10)

# 특정 작업 리포트
post_task_reports(taskType: "lint-fix")

# 리포트 상세 조회
post_task_report_view(reportId: "2024-12-13T10-30-00_lint-fix")
```
