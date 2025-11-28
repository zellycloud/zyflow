# Tasks: 독립형 태스크 관리 시스템

## 1. 패키지 설정
- [x] 1.1 `server/tasks` 디렉토리 생성 (모노레포 대신 단일 패키지 구조 사용)
- [x] 1.2 package.json에 의존성 추가 (better-sqlite3, drizzle-orm, nanoid)
- [x] 1.3 tsconfig.mcp.json에 tasks 포함
- [x] 1.4 빌드 확인

## 2. DB 스키마 및 클라이언트
- [x] 2.1 Drizzle 스키마 정의 (`server/tasks/db/schema.ts`)
- [x] 2.2 DB 클라이언트 생성 (`server/tasks/db/client.ts`)
- [x] 2.3 FTS5 가상 테이블 및 트리거 생성
- [x] 2.4 DB 초기화 함수 (`initDb`)

## 3. Core 로직
- [x] 3.1 Task CRUD 함수 (`server/tasks/core/task.ts`)
  - [x] createTask
  - [x] getTask
  - [x] listTasks (필터링, 정렬)
  - [x] updateTask
  - [x] deleteTask
  - [x] moveTask (상태 + 순서 변경)
  - [x] getTasksByStatus (칸반용)
- [x] 3.2 검색 함수 (`server/tasks/core/search.ts`)
  - [x] searchTasks (FTS5 쿼리)
  - [x] FTS 인덱스 동기화 트리거

## 4. CLI 명령어
- [x] 4.1 `zy tasks list` 명령어 (--kanban 옵션 포함)
- [x] 4.2 `zy tasks add` 명령어
- [x] 4.3 `zy tasks view` 명령어
- [x] 4.4 `zy tasks edit` 명령어
- [x] 4.5 `zy tasks move` 명령어
- [x] 4.6 `zy tasks search` 명령어
- [x] 4.7 `zy tasks delete` 명령어
- [x] 4.8 `zy tasks help` 명령어

## 5. MCP 도구
- [x] 5.1 `task_list` 도구
- [x] 5.2 `task_create` 도구
- [x] 5.3 `task_update` 도구
- [x] 5.4 `task_search` 도구
- [x] 5.5 `task_delete` 도구
- [x] 5.6 `task_view` 도구
- [x] 5.7 MCP 서버에 도구 등록

## 6. REST API
- [x] 6.1 GET /api/tasks - 태스크 목록 조회
- [x] 6.2 POST /api/tasks - 태스크 생성
- [x] 6.3 GET /api/tasks/:id - 태스크 조회
- [x] 6.4 PATCH /api/tasks/:id - 태스크 수정
- [x] 6.5 DELETE /api/tasks/:id - 태스크 삭제
- [x] 6.6 GET /api/tasks/search - 태스크 검색

## 7. 칸반 UI
- [x] 7.1 타입 정의 (`src/components/tasks/types.ts`)
- [x] 7.2 TaskCard 컴포넌트 (드래그 가능)
- [x] 7.3 TaskColumn 컴포넌트 (드롭 가능)
- [x] 7.4 TaskDialog 컴포넌트 (생성/수정)
- [x] 7.5 KanbanBoard 컴포넌트 (dnd-kit 통합)
- [x] 7.6 useKanbanTasks hook
- [x] 7.7 TasksPage 컴포넌트
- [x] 7.8 사이드바에 Tasks 메뉴 추가
- [x] 7.9 App.tsx 라우팅 추가

## 8. 정리
- [x] 8.1 Backlog MCP 서버 설정 제거 (선택적) - 사용자가 선택적으로 제거 가능
- [x] 8.2 관련 문서 정리 (CLAUDE.md에 태스크 관리 섹션 추가됨)
- [x] 8.3 README 업데이트 (칸반 보드, CLI, MCP 태스크 도구 문서화)
