# ZyFlow

OpenSpec 기반 태스크 관리 및 실행 도구

## 기능

- **웹 대시보드**: OpenSpec 변경 제안 및 태스크 진행 상황 시각화
- **칸반 보드**: 독립형 태스크 관리 시스템 (SQLite + FTS5 검색)
- **MCP 서버**: Claude Code에서 직접 태스크 관리 가능
- **CLI**: `zy tasks` 명령어로 태스크 관리

## 설치

```bash
npm install
npm run build:mcp
```

## MCP 서버 사용법

### Claude Code 설정

`~/.claude/settings.json`에 다음 설정 추가:

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

### 사용 가능한 도구

#### OpenSpec 도구

| 도구 | 설명 |
|------|------|
| `zyflow_list_changes` | 현재 프로젝트의 OpenSpec 변경 제안 목록 조회 |
| `zyflow_get_tasks` | 특정 변경 제안의 전체 태스크 목록 조회 |
| `zyflow_get_next_task` | 다음 미완료 태스크와 컨텍스트 조회 |
| `zyflow_get_task_context` | 특정 태스크의 상세 컨텍스트 조회 |
| `zyflow_mark_complete` | 태스크를 완료로 표시 |
| `zyflow_mark_incomplete` | 태스크를 미완료로 되돌리기 |

#### 태스크 관리 도구

| 도구 | 설명 |
|------|------|
| `task_create` | 새 태스크 생성 (순차 번호 ID 자동 생성) |
| `task_list` | 태스크 목록 조회 (kanban: true로 상태별 그룹화) |
| `task_view` | 태스크 상세 조회 |
| `task_update` | 태스크 수정 (상태, 제목, 설명 등) |
| `task_delete` | 태스크 삭제 |
| `task_search` | 태스크 검색 (FTS5 전문 검색) |
| `task_archive` | 완료된 태스크를 아카이브로 이동 |
| `task_unarchive` | 아카이브된 태스크 복원 |

### 예시

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
| `npm run server` | API 서버 실행 |
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
