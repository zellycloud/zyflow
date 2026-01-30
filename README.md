# ZyFlow - MoAI SPEC 기반 개발 플로우 관리 도구

MoAI-ADK SPEC 시스템을 기본 워크플로우로 사용하는 소프트웨어 개발 플로우 관리 도구 - Claude Code MCP 서버

이전에 OpenSpec을 사용했던 프로젝트는 완전히 MoAI SPEC으로 마이그레이션되었습니다.

## 새로운 MoAI SPEC 워크플로우

ZyFlow는 MoAI-ADK의 3단계 SPEC 워크플로우를 지원합니다:

### 1. SPEC 계획 (Plan Phase)
```bash
/moai plan "새로운 기능 또는 리팩토링 설명"
```
EARS 형식 요구사항 명시, 수용 기준 정의, 기술 접근 방식 계획

### 2. SPEC 구현 (Run Phase)
```bash
/moai run SPEC-MIGR-001
```
DDD 사이클 (ANALYZE-PRESERVE-IMPROVE)을 통한 구현
- 기존 코드 분석 및 도메인 경계 식별
- 특성화 테스트 생성으로 현재 동작 보존
- 구조적 개선사항 점진적 적용

### 3. 문서 동기화 (Sync Phase)
```bash
/moai sync SPEC-MIGR-001
```
API 문서, README 업데이트, CHANGELOG 항목 추가, PR 생성

## 주요 기능

### Flow UI (7단계 파이프라인)
- **Spec**: MoAI SPEC 및 기능 명세서 관리
- **Changes**: SPEC 변경사항 및 진행 상황 추적
- **Tasks**: 태스크 목록 관리 (칸반/리스트 뷰)
- **Code**: 코드 구현 추적
- **Test**: 테스트 실행 관리
- **Commit**: Git 커밋/푸시 워크플로우
- **Docs**: 문서화 작업 추적

### 핵심 기능
- **MCP 서버**: Claude Code에서 직접 SPEC 및 태스크 관리
- **웹 대시보드**: SPEC별 진행률 시각화 및 태스크 추적
- **칸반 보드**: 독립형 태스크 관리 시스템 (SQLite + FTS5 검색)
- **Multi-Project Watcher**: 여러 프로젝트의 SPEC 파일 실시간 감시 및 동기화
- **Git 워크플로우**: 브랜치 관리, 커밋, 푸시, PR 생성
- **Change Log & Replay**: 이벤트 로깅 및 리플레이 시스템
- **MoAI SPEC 파서**: EARS 형식 SPEC 파싱 및 검증

## 설치

```bash
npm install
npm run build:mcp
```

## MCP 서버 설정

### 전역 설정 (모든 프로젝트에서 사용)

`~/.claude.json`에 다음 설정 추가:

```json
{
  "mcpServers": {
    "zyflow": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/zyflow/dist/mcp-server/index.js"],
      "env": {}
    }
  }
}
```

> **Note**: `ZYFLOW_PROJECT` 환경변수가 없으면 현재 작업 디렉토리(`process.cwd()`)를 프로젝트 경로로 사용합니다.

### 프로젝트별 설정 (특정 프로젝트 전용)

프로젝트의 `.mcp.json`에 다음 설정 추가:

```json
{
  "mcpServers": {
    "zyflow": {
      "command": "node",
      "args": ["/path/to/zyflow/dist/mcp-server/index.js"],
      "env": {
        "ZYFLOW_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

## 사용 가능한 MCP 도구

### SPEC 및 변경사항 도구

| 도구 | 설명 |
|------|------|
| `zyflow_list_changes` | 현재 프로젝트의 MoAI SPEC 변경사항 목록 조회 |
| `zyflow_get_tasks` | 특정 SPEC의 전체 태스크 목록 조회 |
| `zyflow_get_next_task` | 다음 미완료 태스크와 컨텍스트 조회 |
| `zyflow_get_task_context` | 특정 태스크의 상세 컨텍스트 조회 |
| `zyflow_mark_complete` | 태스크를 완료로 표시 |
| `zyflow_mark_incomplete` | 태스크를 미완료로 되돌리기 |

### 태스크 관리 도구

| 도구 | 설명 |
|------|------|
| `task_create` | 새 태스크 생성 (순차 번호 ID 자동 생성, origin='inbox') |
| `task_list` | 태스크 목록 조회 (kanban: true로 상태별 그룹화) |
| `task_view` | 태스크 상세 조회 |
| `task_update` | 태스크 수정 (상태, 제목, 설명 등) |
| `task_delete` | 태스크 삭제 |
| `task_search` | 태스크 검색 (FTS5 전문 검색) |
| `task_archive` | 완료된 태스크를 아카이브로 이동 |
| `task_unarchive` | 아카이브된 태스크 복원 |

### SPEC 관리 API

통합 SPEC 스캐너와 아카이브 관리를 위한 REST API 엔드포인트:

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/specs` | 통합 SPEC 목록 조회 (MoAI + OpenSpec 형식 지원) |
| `GET /api/specs/:id` | 특정 SPEC 상세 조회 |
| `GET /api/specs/migration-status` | 마이그레이션 상태 조회 (MoAI/OpenSpec 개수) |
| `POST /api/specs/:id/archive` | SPEC 아카이브 (월별 디렉토리로 이동) |
| `POST /api/specs/:id/restore` | 아카이브된 SPEC 복원 |
| `GET /api/specs/archived` | 아카이브된 SPEC 목록 조회 |

**필터링 옵션** (`GET /api/specs`):
- `?format=moai` - MoAI 형식만 조회
- `?format=openspec` - OpenSpec 형식만 조회
- `?status=active` - 특정 상태만 조회
- `?domain=AUTH` - 특정 도메인만 조회

### Change Log & Replay 도구

| 도구 | 설명 |
|------|------|
| `get_events` | 변경 이벤트 조회 (필터링 지원) |
| `get_event_statistics` | 이벤트 통계 조회 |
| `search_events` | 텍스트로 이벤트 검색 |
| `export_events` | 이벤트 내보내기 (JSON/CSV/SQL) |
| `create_replay_session` | 리플레이 세션 생성 |
| `start_replay` | 리플레이 세션 시작 |
| `get_replay_progress` | 리플레이 진행 상황 조회 |

## 태스크 출처 구분 (Origin)

태스크는 `origin` 필드로 출처를 구분합니다:

| Origin | 설명 |
|--------|------|
| `spec` | MoAI SPEC 또는 tasks.md에서 동기화된 태스크 |
| `inbox` | MCP/CLI를 통해 수동으로 생성된 태스크 |
| `imported` | 외부 시스템에서 가져온 태스크 (향후 지원) |

## 사용 예시

```
사용자: "zyflow-mcp-server의 다음 태스크 해줘"

Claude: [zyflow_get_next_task 호출]
        다음 태스크: README.md에 MCP 서버 사용법 추가

        [작업 수행...]

        완료했습니다. 태스크를 완료로 표시할까요?

사용자: "응"

Claude: [zyflow_mark_complete 호출]
        태스크가 완료되었습니다. (35/37 완료)
```

## 웹 대시보드

```bash
# 서버 + 클라이언트 동시 실행
npm run dev:all

# 또는 개별 실행
npm run server  # API 서버 (포트 3001)
npm run dev     # Vite 개발 서버
```

## CLI 사용법

```bash
# 태스크 목록 (칸반 형식)
zy tasks list --kanban

# 태스크 생성
zy tasks add "버그 수정: 로그인 오류" --priority high --tags bug,urgent

# 태스크 상태 변경
zy tasks move TASK-1 in-progress

# 태스크 검색
zy tasks search "로그인"

# 태스크 삭제
zy tasks delete TASK-1
```

## 스크립트

| 스크립트 | 설명 |
|---------|------|
| `npm run dev` | Vite 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run server` | API 서버 실행 (Multi-Project Watcher 포함) |
| `npm run dev:all` | 서버 + 클라이언트 동시 실행 |
| `npm run build:mcp` | MCP 서버 빌드 |
| `npm run mcp` | MCP 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run lint:fix` | ESLint 자동 수정 |
| `npm run format` | Prettier 포맷팅 |
| `npm run test` | Vitest 테스트 실행 |
| `npm run test:watch` | Vitest 감시 모드 |

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ZYFLOW_PROJECT` | 대상 프로젝트 경로 | 현재 디렉토리 |

## 데이터 저장소

- **태스크 DB**: 각 프로젝트의 `.zyflow/tasks.db` (SQLite)
- **SPEC 파일**: `.moai/specs/{SPEC-ID}/spec.md` (MoAI SPEC 문서)
- **SPEC 태스크**: `tasks.md` 또는 SPEC 문서 내 태스크 정의

## 프로젝트 구조

```
zyflow/
├── src/                    # React 프론트엔드
│   ├── components/
│   │   ├── flow/          # Flow UI 컴포넌트 (PipelineBar, StageContent 등)
│   │   ├── git/           # Git 워크플로우 컴포넌트
│   │   └── ui/            # 공통 UI 컴포넌트
│   ├── hooks/             # React Query 훅
│   ├── constants/         # 상수 정의 (STAGES, STAGE_CONFIG)
│   └── types/             # TypeScript 타입 정의
├── server/                 # Express API 서버
│   ├── tasks/             # 태스크 관리 모듈 (SQLite)
│   ├── git/               # Git 워크플로우 API
│   └── watcher.ts         # Multi-Project Watcher
├── mcp-server/            # MCP 서버 (Claude Code 통합)
├── packages/              # 공개 npm 패키지
│   ├── zyflow-parser      # MoAI SPEC 파서 (@zyflow/parser)
│   └── zyflow-remote-plugin  # 원격 플러그인
└── .moai/                  # MoAI SPEC 설정
    └── specs/             # 프로젝트 SPEC 문서
```

## 기술 스택

- **Frontend**: React 19, Vite, TailwindCSS 4, React Query, dnd-kit
- **Backend**: Express, SQLite (better-sqlite3), Drizzle ORM
- **MCP**: @modelcontextprotocol/sdk
- **Testing**: Vitest, @testing-library/react, Playwright

## Claude Code 통합 (Claude-Flow)

ZyFlow는 Claude Code CLI와 통합되어 MoAI SPEC 기반 태스크를 자동으로 실행할 수 있습니다.

### 주요 기능

- **MoAI SPEC 기반 프롬프트 생성**: SPEC 문서를 자동으로 분석하여 컨텍스트 생성
- **DDD 사이클 자동화**: ANALYZE-PRESERVE-IMPROVE 단계 자동 실행
- **실시간 스트리밍**: SSE를 통해 Claude Code 실행 결과를 실시간으로 확인
- **태스크 단위 실행**: 개별 SPEC 태스크 선택하여 실행 가능
- **실행 제어**: 실행 중 중지 및 재시작 지원

### 사용 방법

1. **웹 대시보드에서**:
   - Changes 목록에서 특정 SPEC 선택
   - Tasks 탭에서 실행할 태스크의 "실행" 버튼 클릭
   - 실행 모달에서 진행 상황 실시간 확인

2. **Claude Code CLI에서**:
   ```bash
   /moai plan "새로운 기능"        # SPEC 작성
   /moai run SPEC-MIGR-001        # 구현 (DDD 사이클)
   /moai sync SPEC-MIGR-001       # 문서화
   ```

3. **실행 모드**:
   - `single`: 선택한 단일 태스크만 실행
   - `full`: 미완료 태스크 전체 실행
   - `analysis`: 코드 변경 없이 분석만 수행

### 기술 스택

- **Backend**: node-pty (TTY 에뮬레이션), stream-json 출력 파싱
- **Frontend**: SSE (Server-Sent Events), React Query 연동
- **프로세스 관리**: PM2
- **SPEC 파싱**: @zyflow/parser (MoAI SPEC 형식)

### API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/claude/execute` | 태스크 실행 시작 (SSE 스트리밍) |
| `GET /api/claude/status/:runId` | 실행 상태 조회 |
| `POST /api/claude/stop/:runId` | 실행 중지 |
| `GET /api/claude/logs/:specId` | 실행 로그 조회 |

### 프롬프트 빌더

MoaiSpecPromptBuilder가 다음 문서를 자동으로 로드합니다:

- `CLAUDE.md`: 프로젝트 맥락 (요약 버전)
- `.moai/specs/{SPEC-ID}/spec.md`: MoAI SPEC 문서
- `tasks.md`: 프로젝트 태스크 목록 (미완료 항목 추출)
- `.moai/config/`: MoAI 설정 파일

---

## 라이선스

Private - Zellycloud
