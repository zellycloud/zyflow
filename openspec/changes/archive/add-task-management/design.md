# Design: 독립형 태스크 관리 시스템

## Context

zyflow는 OpenSpec 워크플로우 대시보드로, 큰 변경 제안을 관리함. 하지만 **작은 단순 작업**을 추적할 시스템이 없음.

**요구사항**:
- 독립형 (Supabase 등 외부 DB 의존 없음)
- AI(Claude)가 CLI/MCP로 직접 제어 가능
- 빠른 검색/필터링
- 칸반 보드 UI

## Goals / Non-Goals

### Goals
- SQLite 기반 로컬 태스크 DB
- 프로젝트별 `.zyflow/tasks.db` 파일
- CLI로 CRUD + 검색
- MCP 도구로 Claude 연동
- shadcn 칸반 보드 UI

### Non-Goals
- 클라우드 동기화
- 멀티유저/협업 기능
- 복잡한 프로젝트 관리 (간트 차트 등)
- GitHub Issues 동기화 (v1에서는)

## Decisions

### 1. SQLite + Drizzle ORM

**선택**: better-sqlite3 + Drizzle

**이유**:
- 동기식 API로 CLI에서 간단
- Drizzle은 타입 안전하고 가벼움
- FTS5로 풀텍스트 검색 가능

**대안 고려**:
- sql.js: 브라우저에서도 동작하지만 성능 열세
- Prisma: 무거움, SQLite 지원 제한적

### 2. 패키지 구조

```
packages/tasks/
├── src/
│   ├── db/
│   │   ├── schema.ts       # Drizzle 스키마
│   │   ├── client.ts       # DB 연결
│   │   └── migrations/     # 마이그레이션
│   ├── core/
│   │   ├── task.ts         # Task CRUD
│   │   └── search.ts       # FTS5 검색
│   ├── ui/                 # React 컴포넌트 (칸반)
│   │   ├── kanban-board.tsx
│   │   ├── task-card.tsx
│   │   └── task-dialog.tsx
│   └── index.ts            # Public API
├── package.json
└── tsconfig.json
```

### 3. DB 스키마

```typescript
// packages/tasks/src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),           // nanoid
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('todo'),
    // 'todo' | 'in-progress' | 'review' | 'done'
  priority: text('priority').notNull().default('medium'),
    // 'low' | 'medium' | 'high'
  tags: text('tags'),                      // JSON array: ["bug", "refactor"]
  assignee: text('assignee'),
  order: integer('order').notNull().default(0),  // 칸반 정렬용
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// FTS5 가상 테이블 (검색용)
// CREATE VIRTUAL TABLE tasks_fts USING fts5(title, description, content=tasks);
```

### 4. DB 파일 위치

```
<project-root>/
├── .zyflow/
│   ├── tasks.db          # SQLite 파일
│   └── config.json       # 설정 (선택)
├── src/
└── ...
```

- 프로젝트별로 독립적인 태스크 DB
- `.gitignore`에 추가하거나, 팀 공유 시 포함

### 5. CLI 명령어

```bash
# 기존 zy CLI에 통합
zy tasks list                           # 모든 태스크 (테이블)
zy tasks list --status todo             # 필터링
zy tasks list --kanban                  # 칸반 형태 출력

zy tasks add "버그: 모달 닫힘 이슈"      # 생성
zy tasks add "리팩토링" -p high -t refactor

zy tasks view TASK-001                  # 상세 보기
zy tasks edit TASK-001 --status in-progress
zy tasks move TASK-001 done             # 상태 변경 단축

zy tasks search "모달"                  # FTS5 검색
zy tasks delete TASK-001                # 삭제
```

### 6. MCP 도구

```typescript
// packages/mcp/src/tools/tasks.ts
export const taskTools = {
  'task-list': {
    description: 'List tasks with optional filtering',
    parameters: { status, priority, tags, limit },
  },
  'task-create': {
    description: 'Create a new task',
    parameters: { title, description, priority, tags },
  },
  'task-update': {
    description: 'Update task fields',
    parameters: { id, status, priority, title, description },
  },
  'task-search': {
    description: 'Full-text search tasks',
    parameters: { query, limit },
  },
  'task-delete': {
    description: 'Delete a task',
    parameters: { id },
  },
};
```

### 7. 칸반 UI

shadcn CRUD Kanban Board 참고 (https://www.shadcn.io/blocks/crud-kanban-board-01):

**컬럼 구성**:
- To Do (todo)
- In Progress (in-progress)
- Review (review)
- Done (done)

**기능**:
- 드래그 앤 드롭 (dnd-kit)
- 인라인 생성/수정
- 우선순위 표시 (색상 badge)
- 태그 표시
- 검색 + 필터 toolbar

## Risks / Trade-offs

| 리스크 | 완화 방안 |
|--------|----------|
| SQLite 바이너리 Git diff 불가 | `.gitignore` 또는 JSON export 명령 제공 |
| better-sqlite3 네이티브 빌드 | prebuild 바이너리 사용, CI 캐싱 |
| FTS5 한글 토크나이징 | unicode61 토크나이저 사용 |

## Migration Plan

1. **Phase 1**: `packages/tasks` 생성, DB 스키마, core 로직
2. **Phase 2**: CLI 명령어 (`zy tasks`)
3. **Phase 3**: MCP 도구 추가
4. **Phase 4**: 칸반 UI (zyflow 대시보드에 통합)
5. **Phase 5**: Backlog MCP 제거

## Open Questions

- [x] 태그는 별도 테이블 vs JSON 컬럼? → **JSON 컬럼** (단순함 우선)
- [ ] 태스크 ID 형식: nanoid vs TASK-001 형태?
- [ ] 칸반 컬럼 커스터마이징 허용?
