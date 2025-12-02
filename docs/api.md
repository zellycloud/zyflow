# ZyFlow REST API Documentation

Base URL: `http://localhost:3001/api`

## Projects API

### GET /projects
프로젝트 목록 조회

**Response:**
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "project-id",
        "name": "project-name",
        "path": "/path/to/project",
        "addedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "activeProjectId": "project-id"
  }
}
```

### POST /projects
새 프로젝트 추가

**Request Body:**
```json
{
  "path": "/path/to/project"
}
```

### DELETE /projects/:id
프로젝트 제거

### PUT /projects/:id/activate
프로젝트 활성화

### GET /projects/all-data
모든 프로젝트와 해당 changes/specs 데이터 조회

---

## Flow Changes API

### GET /flow/changes
활성 프로젝트의 Flow Changes 목록 조회

**Response:**
```json
{
  "success": true,
  "data": {
    "changes": [
      {
        "id": "change-id",
        "projectId": "project-id",
        "title": "Change Title",
        "specPath": "openspec/changes/change-id/proposal.md",
        "status": "active",
        "currentStage": "task",
        "progress": 75,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "stages": {
          "spec": { "total": 0, "completed": 0, "tasks": [] },
          "changes": { "total": 0, "completed": 0, "tasks": [] },
          "task": { "total": 4, "completed": 3, "tasks": [...] },
          "code": { "total": 0, "completed": 0, "tasks": [] },
          "test": { "total": 0, "completed": 0, "tasks": [] },
          "commit": { "total": 0, "completed": 0, "tasks": [] },
          "docs": { "total": 0, "completed": 0, "tasks": [] }
        }
      }
    ]
  }
}
```

### GET /flow/changes/:id
특정 Change 상세 조회 (stages 포함)

### GET /flow/changes/counts
프로젝트별 Change 수 조회

**Query Parameters:**
- `status`: `active` | `completed` | `all` (기본값: `active`)

**Response:**
```json
{
  "success": true,
  "data": {
    "counts": { "project-id": 5 },
    "detailed": {
      "project-id": { "active": 3, "completed": 2, "total": 5 }
    }
  }
}
```

### POST /flow/sync
OpenSpec 파일에서 Changes 동기화

### GET /flow/changes/:id/proposal
Change의 proposal.md 내용 조회

### GET /flow/changes/:id/design
Change의 design.md 내용 조회

### GET /flow/changes/:id/spec
Change의 첫 번째 spec.md 내용 조회

### GET /flow/changes/:changeId/specs/:specId
특정 spec.md 내용 조회

---

## Flow Tasks API

### GET /flow/tasks
Flow Tasks 목록 조회

**Query Parameters:**
- `changeId`: Change ID로 필터링
- `stage`: Stage로 필터링 (`spec`, `changes`, `task`, `code`, `test`, `commit`, `docs`)
- `status`: 상태로 필터링 (`todo`, `in-progress`, `review`, `done`)
- `standalone`: `true`면 독립 태스크만 조회 (change_id = null)
- `includeArchived`: `true`면 아카이브된 태스크 포함

**Response:**
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": 1,
        "changeId": "change-id",
        "stage": "task",
        "title": "Task Title",
        "description": "Task Description",
        "status": "todo",
        "priority": "medium",
        "tags": ["tag1", "tag2"],
        "assignee": null,
        "order": 1,
        "groupTitle": "Group Title",
        "groupOrder": 1,
        "taskOrder": 1,
        "majorTitle": "Major Section Title",
        "subOrder": 1,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "archivedAt": null
      }
    ]
  }
}
```

### POST /flow/tasks
새 Flow Task 생성

**Request Body:**
```json
{
  "changeId": "change-id",
  "stage": "task",
  "title": "Task Title",
  "description": "Task Description",
  "priority": "medium"
}
```

### PATCH /flow/tasks/:id
Flow Task 수정

**Request Body:**
```json
{
  "title": "Updated Title",
  "status": "done",
  "priority": "high"
}
```

---

## Independent Tasks API

### GET /tasks
태스크 목록 조회

**Query Parameters:**
- `status`: 상태로 필터링 (`todo`, `in-progress`, `review`, `done`, `archived`)
- `priority`: 우선순위로 필터링 (`low`, `medium`, `high`)
- `tags`: 태그로 필터링 (쉼표 구분)
- `kanban`: `true`면 상태별 그룹화된 형식으로 반환

### POST /tasks
새 태스크 생성

**Request Body:**
```json
{
  "title": "Task Title",
  "description": "Task Description",
  "status": "todo",
  "priority": "medium",
  "tags": ["tag1", "tag2"],
  "assignee": "user@example.com"
}
```

### GET /tasks/:id
태스크 상세 조회

### PATCH /tasks/:id
태스크 수정

### DELETE /tasks/:id
태스크 삭제

### GET /tasks/search
태스크 검색 (FTS5 전문 검색)

**Query Parameters:**
- `q`: 검색 쿼리 (필수)
- `status`: 상태로 필터링
- `priority`: 우선순위로 필터링
- `limit`: 최대 결과 수

### POST /tasks/:id/archive
태스크 아카이브

### POST /tasks/:id/unarchive
아카이브된 태스크 복원

### GET /tasks/archived
아카이브된 태스크 목록 (페이지네이션)

**Query Parameters:**
- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 20)
- `search`: 검색 쿼리

---

## Git API

### GET /git/status
현재 Git 상태 조회

### GET /git/branch
현재 브랜치 정보 조회

### POST /git/checkout
브랜치 체크아웃

**Request Body:**
```json
{
  "branch": "branch-name",
  "create": true
}
```

### POST /git/commit
커밋 생성

**Request Body:**
```json
{
  "message": "Commit message",
  "files": ["file1.ts", "file2.ts"]
}
```

### POST /git/push
원격 저장소에 푸시

### POST /git/pull
원격 저장소에서 풀

---

## OpenSpec Changes API (Legacy)

### GET /changes
Changes 목록 조회 (파일 기반)

### GET /changes/:id/tasks
Change의 tasks.md 파일 파싱 결과 조회

### PATCH /tasks/:changeId/:taskId
tasks.md 파일에서 태스크 체크박스 토글

### PATCH /tasks/reorder
tasks.md 파일에서 태스크 순서 재정렬

---

## Specs API

### GET /specs
Specs 목록 조회

### GET /specs/:id
Spec 내용 조회

---

## Claude Code Execution API

### POST /claude/execute
Claude Code로 태스크 실행 (SSE 스트리밍)

**Request Body:**
```json
{
  "changeId": "change-id",
  "taskId": "task-id",
  "taskTitle": "Task Title",
  "context": "Additional context"
}
```

### GET /claude/status/:runId
실행 상태 조회

### POST /claude/stop/:runId
실행 중지

### GET /claude/logs/:changeId
실행 로그 조회

---

## Health Check

### GET /health
서버 상태 확인

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 3600
  }
}
```

---

## Error Response

모든 에러 응답은 다음 형식을 따릅니다:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Types

### Stage
```typescript
type Stage = 'spec' | 'changes' | 'task' | 'code' | 'test' | 'commit' | 'docs'
```

### ChangeStatus
```typescript
type ChangeStatus = 'active' | 'completed' | 'archived'
```

### TaskStatus
```typescript
type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'archived'
```

### TaskPriority
```typescript
type TaskPriority = 'low' | 'medium' | 'high'
```
