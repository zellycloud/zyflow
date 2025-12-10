# ZyFlow

OpenSpec 기반 소프트웨어 개발 플로우 관리 도구 - Claude Code MCP 서버

## 주요 기능

### Flow UI (7단계 파이프라인)
- **Spec**: 기능 명세서 관리
- **Changes**: OpenSpec 변경 제안 (proposal.md, design.md)
- **Tasks**: 태스크 목록 관리 (칸반/리스트 뷰)
- **Code**: 코드 구현 추적
- **Test**: 테스트 실행 관리
- **Commit**: Git 커밋/푸시 워크플로우
- **Docs**: 문서화 작업 추적

### 핵심 기능
- **MCP 서버**: Claude Code에서 직접 태스크/변경 관리
- **웹 대시보드**: 프로젝트별 OpenSpec 변경 제안 및 진행률 시각화
- **칸반 보드**: 독립형 태스크 관리 시스템 (SQLite + FTS5 검색)
- **Multi-Project Watcher**: 여러 프로젝트의 tasks.md 파일 실시간 감시 및 동기화
- **Git 워크플로우**: 브랜치 관리, 커밋, 푸시, PR 생성
- **Change Log & Replay**: 이벤트 로깅 및 리플레이 시스템

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

### OpenSpec 도구

| 도구 | 설명 |
|------|------|
| `zyflow_list_changes` | 현재 프로젝트의 OpenSpec 변경 제안 목록 조회 |
| `zyflow_get_tasks` | 특정 변경 제안의 전체 태스크 목록 조회 |
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
| `openspec` | OpenSpec tasks.md에서 동기화된 태스크 |
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
- **OpenSpec 태스크**: `openspec/changes/{change-id}/tasks.md`

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
└── openspec/              # OpenSpec 변경 제안 및 스펙
```

## 기술 스택

- **Frontend**: React 19, Vite, TailwindCSS 4, React Query, dnd-kit
- **Backend**: Express, SQLite (better-sqlite3), Drizzle ORM
- **MCP**: @modelcontextprotocol/sdk
- **Testing**: Vitest, @testing-library/react, Playwright

## 라이선스

Private - Zellycloud
