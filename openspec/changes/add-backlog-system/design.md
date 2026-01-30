# Backlog System 설계 문서

## 개요

Backlog.md 패턴을 ZyFlow에 통합하여 Git-native 태스크 관리를 구현합니다.

## 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          backlog/*.md (소스)                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ ---                                                              │    │
│  │ id: task-007                                                     │    │
│  │ title: OAuth2 인증 구현                                          │    │
│  │ status: in-progress                                              │    │
│  │ priority: high                                                   │    │
│  │ blocked_by: [task-003]                                           │    │
│  │ parent: task-001                                                 │    │
│  │ ---                                                              │    │
│  │ ## Description                                                   │    │
│  │ ## Plan                                                          │    │
│  │ ## Acceptance Criteria                                           │    │
│  │ ## Notes                                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Backlog Parser                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ parseYamlFront  │→ │ parseMarkdown   │→ │ normalizeStatus/        │  │
│  │ matter()        │  │ Sections()      │  │ Priority()              │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Sync Module                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ scanBacklog     │→ │ syncBacklog     │→ │ syncBacklogTask         │  │
│  │ Directory()     │  │ ToDb()          │  │ ToDb()                  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     SQLite DB (캐시)                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ tasks 테이블                                                     │    │
│  │  - origin = 'backlog'                                            │    │
│  │  - backlogFileId = 'task-007'                                    │    │
│  │  - parentTaskId, blockedBy (확장 필드)                           │    │
│  │  - plan, acceptanceCriteria, notes                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        REST API                                          │
│  GET /api/flow/tasks?origin=backlog                                      │
│  GET /api/flow/backlog/tasks/:id                                         │
│  PUT /api/flow/backlog/tasks/:id                                         │
│  POST /api/flow/backlog/sync                                             │
│  GET /api/flow/backlog/migration/preview                                 │
│  POST /api/flow/backlog/migration                                        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ZyFlow UI                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │ BacklogView│  │ KanbanBoard│  │ TaskDetail │  │ MigrationDialog    │ │
│  │            │  │ (재사용)   │  │ Dialog     │  │                    │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## DB 스키마 확장

```sql
-- tasks 테이블 확장 필드
ALTER TABLE tasks ADD COLUMN backlogFileId TEXT;       -- task-007
ALTER TABLE tasks ADD COLUMN parentTaskId INTEGER;     -- 서브태스크 관계
ALTER TABLE tasks ADD COLUMN blockedBy TEXT;           -- JSON: ["task-003"]
ALTER TABLE tasks ADD COLUMN plan TEXT;                -- 계획 섹션
ALTER TABLE tasks ADD COLUMN acceptanceCriteria TEXT;  -- 완료 조건
ALTER TABLE tasks ADD COLUMN notes TEXT;               -- 메모/노트
ALTER TABLE tasks ADD COLUMN dueDate INTEGER;          -- 마감일 (timestamp)
ALTER TABLE tasks ADD COLUMN milestone TEXT;           -- 마일스톤

-- 인덱스
CREATE INDEX idx_tasks_backlog_file_id ON tasks(backlogFileId);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parentTaskId);
CREATE INDEX idx_tasks_origin ON tasks(origin);
```

## 파서 구현

### BacklogTask 인터페이스

```typescript
interface BacklogTask {
  // YAML frontmatter 필드
  backlogFileId: string      // task-007
  title: string
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'archived'
  assignees?: string[]       // [@alice, @bob]
  labels?: string[]          // [auth, backend]
  priority: 'low' | 'medium' | 'high'
  blockedBy?: string[]       // [task-003]
  parent?: string            // task-001
  dueDate?: string           // ISO 8601
  milestone?: string         // Sprint 3

  // 마크다운 섹션
  description?: string
  plan?: string
  acceptanceCriteria?: string
  notes?: string

  // 파일 메타데이터
  filePath: string
  fileModifiedAt?: string
}
```

### 상태 정규화

```typescript
function normalizeStatus(status: string): TaskStatus {
  const normalized = status.toLowerCase().replace(/\s+/g, '-')
  switch (normalized) {
    case 'to-do':
    case 'todo':
    case 'backlog':
    case 'new':
      return 'todo'
    case 'in-progress':
    case 'in_progress':
    case 'doing':
      return 'in-progress'
    case 'review':
    case 'reviewing':
    case 'testing':
      return 'review'
    case 'done':
    case 'completed':
      return 'done'
    case 'archived':
    case 'closed':
      return 'archived'
    default:
      return 'todo'
  }
}
```

## 동기화 전략

### 단방향 동기화 (파일 → DB)

1. **프로젝트 활성화 시**: `syncBacklogToDb()` 호출
2. **파일 변경 감지 시**: `chokidar` 와처가 변경된 파일 동기화
3. **수동 동기화**: `POST /api/flow/backlog/sync` API

### 충돌 방지

- **마크다운이 항상 우선**: DB는 캐시일 뿐
- **UI 수정 시**: 마크다운 파일 업데이트 → DB 자동 동기화
- **파일 삭제 시**: DB 레코드도 삭제

## 마이그레이션 도구

### Inbox → Backlog 변환

```typescript
async function migrateInboxToBacklog(
  projectId: string,
  projectPath: string
): Promise<MigrationResult> {
  // 1. origin='inbox', changeId=null인 태스크 조회
  const inboxTasks = getInboxTasksForMigration(projectId)

  // 2. 각 태스크를 backlog/*.md 파일로 생성
  for (const task of inboxTasks) {
    const backlogFileId = await generateNewBacklogTaskId(projectPath)
    const backlogTask = convertToBacklogTask(task, backlogFileId)
    await saveTaskToBacklogFile(projectPath, backlogTask)

    // 3. DB 업데이트: origin='backlog', backlogFileId 설정
    updateTaskOrigin(task.id, 'backlog', backlogFileId)
  }

  return { migratedCount, errors }
}
```

## UI 컴포넌트

### BacklogView

- 기존 `StandaloneTasks` Kanban 컴포넌트 재사용
- `origin='backlog'` 필터로 데이터 조회
- 서브태스크/의존성 배지 표시

### TaskDetailDialog

- Plan, Acceptance Criteria, Notes 섹션 표시
- 서브태스크 목록 표시
- Blocked By 의존성 표시

### MigrationDialog

- 마이그레이션 미리보기 (대상 태스크 목록)
- 일괄/선택 마이그레이션 옵션
- 진행 상황 및 결과 표시
