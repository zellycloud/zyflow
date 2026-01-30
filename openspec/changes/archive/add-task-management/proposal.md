# Change: 독립형 태스크 관리 시스템 추가

## Why

현재 Backlog MCP가 있지만 실제로 활용되지 않고 있음:
- OpenSpec `tasks.md`와 역할 중복
- 진입점(워크플로우)이 불명확
- 파일 기반이라 검색/필터링이 불편

OpenSpec은 **설계가 필요한 큰 변경**용이고, **작은 단순 작업**(버그 수정, 리팩토링, 소소한 개선)을 관리할 도구가 없음.

## What Changes

- **SQLite 기반 태스크 DB**: 검색(FTS5), 필터링, 정렬 지원
- **칸반 보드 UI**: shadcn CRUD Kanban Board 기반
- **CLI**: `zy tasks add/list/move/search` 명령어
- **MCP 통합**: 기존 zyflow MCP 서버에 태스크 도구 추가
- **Backlog MCP 제거**: 역할 중복 해소

## Impact

- Affected specs: (신규) `task-management`
- Affected code:
  - `packages/tasks/` (신규 패키지)
  - `packages/cli/` (태스크 명령어 추가)
  - `packages/mcp/` (태스크 도구 추가)
- **BREAKING**: Backlog MCP 서버 제거

## 역할 분담

| 작업 유형 | 도구 |
|----------|------|
| 설계 필요한 큰 변경 | OpenSpec |
| 단순 작업 (버그, 리팩토링) | zy-tasks |
| 세션 내 임시 TODO | Claude TodoWrite |
