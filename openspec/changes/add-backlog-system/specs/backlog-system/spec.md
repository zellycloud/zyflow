# Backlog System Specification

## Overview

ZyFlow의 Backlog.md 기반 태스크 관리 시스템 스펙입니다.

## 핵심 원칙

1. **마크다운이 진실의 소스 (SSOT)**: `backlog/*.md` 파일이 원본
2. **DB는 캐시**: SQLite는 빠른 조회를 위한 캐시
3. **단방향 동기화**: 파일 → DB (충돌 방지)
4. **Git 네이티브**: 모든 변경이 Git 히스토리로 보존

## 파일 형식

### 위치

```
project-root/
└── backlog/
    ├── task-001-oauth-implementation.md
    ├── task-002-payment-integration.md
    └── task-003-user-dashboard.md
```

### 파일명 규칙

```
{task-id}-{slugified-title}.md
```

- `task-id`: `task-NNN` 형식 (순차 증가)
- `slugified-title`: 소문자, 특수문자 → 하이픈, 최대 50자

### 파일 구조

```yaml
---
id: task-007
title: OAuth2 인증 구현
status: in-progress
assignees: [@alice, @bob]
labels: [auth, backend, security]
priority: high
blocked_by: [task-003, task-005]
parent: task-001
due_date: 2024-01-15
milestone: Sprint 3
---

## Description
OAuth2 기반 소셜 로그인 구현

## Plan
1. Google OAuth 클라이언트 설정
2. 토큰 관리 로직 구현
3. 세션 연동

## Acceptance Criteria
- [ ] Google 로그인 정상 동작
- [ ] 토큰 갱신 자동화
- [ ] 에러 처리 완료

## Notes
- 2024-01-03: API 키 발급 완료
- 2024-01-04: 토큰 로직 50% 완료
```

## YAML Frontmatter 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | ✅ | 고유 식별자 (task-NNN) |
| `title` | string | ✅ | 태스크 제목 |
| `status` | string | ❌ | 상태 (기본: todo) |
| `assignees` | string[] | ❌ | 담당자 목록 [@user] |
| `labels` | string[] | ❌ | 라벨/태그 |
| `priority` | string | ❌ | 우선순위 (기본: medium) |
| `blocked_by` | string[] | ❌ | 의존성 (차단하는 태스크 ID) |
| `parent` | string | ❌ | 부모 태스크 ID (서브태스크) |
| `due_date` | string | ❌ | 마감일 (ISO 8601) |
| `milestone` | string | ❌ | 마일스톤/스프린트 |

### 상태 값 매핑

| 입력 값 | 정규화 결과 |
|---------|-------------|
| `todo`, `to-do`, `backlog`, `new` | `todo` |
| `in-progress`, `in_progress`, `doing`, `started` | `in-progress` |
| `review`, `reviewing`, `testing` | `review` |
| `done`, `completed`, `finished` | `done` |
| `archived`, `closed` | `archived` |

### 우선순위 값 매핑

| 입력 값 | 정규화 결과 |
|---------|-------------|
| `high`, `critical`, `urgent` | `high` |
| `medium`, `normal`, `default` | `medium` |
| `low`, `minor` | `low` |

## 마크다운 섹션

| 섹션 | 용도 |
|------|------|
| `## Description` | 태스크 상세 설명 |
| `## Plan` | 구현 계획/단계 |
| `## Acceptance Criteria` | 완료 조건 체크리스트 |
| `## Notes` | 진행 메모, 논의 내용 |

## API Endpoints

### Backlog Tasks

```
GET  /api/flow/tasks?origin=backlog&projectId={id}
GET  /api/flow/backlog/tasks/:id
PUT  /api/flow/backlog/tasks/:id
POST /api/flow/backlog/sync
```

### Migration

```
GET  /api/flow/backlog/migration/preview
POST /api/flow/backlog/migration
POST /api/flow/backlog/migration/selected
```

## 동기화 동작

### 트리거

1. **프로젝트 활성화**: 자동 동기화
2. **파일 변경 감지**: chokidar 와처
3. **수동 요청**: sync API 호출

### 동기화 로직

```
파일 발견
    │
    ▼
기존 DB 레코드 존재?
    │
    ├─ Yes → 업데이트 (fileModifiedAt 비교)
    │
    └─ No → 새 레코드 생성
```

### 삭제 처리

- 파일 삭제 시: DB 레코드도 삭제 (또는 archived 처리)

## 마이그레이션

### 대상 조건

```sql
WHERE origin = 'inbox'
  AND changeId IS NULL
  AND status != 'archived'
```

### 변환 과정

1. Inbox 태스크 조회
2. 새 backlogFileId 생성 (task-NNN)
3. 마크다운 파일 생성
4. DB origin='backlog' 업데이트

## React Hooks

```typescript
// 목록 조회
const { data: tasks } = useBacklogTasks(projectId)

// 상세 조회
const { data: task } = useBacklogTaskDetail(taskId)

// 수정
const updateTask = useUpdateBacklogTask()

// 동기화
const syncBacklog = useSyncBacklog()

// 마이그레이션
const { data: preview } = useMigrationPreview()
const migrateAll = useMigrateAllToBacklog()
const migrateSelected = useMigrateSelectedToBacklog()
```

## UI 컴포넌트

### BacklogView

- Kanban 보드 (Todo, In Progress, Review, Done)
- 드래그앤드롭 상태 변경
- 필터링 (status, priority)
- 서브태스크/의존성 배지 표시

### TaskDetailDialog

- YAML 필드 표시
- Plan, Acceptance Criteria, Notes 섹션
- 서브태스크 목록
- Blocked By 의존성 링크

### MigrationDialog

- 미리보기 목록
- 마이그레이션 실행 버튼
- 진행 상황 및 결과

## DB 스키마

```typescript
// tasks 테이블 확장 필드
interface BacklogTaskFields {
  backlogFileId: string | null   // task-007
  parentTaskId: number | null    // 서브태스크 관계
  blockedBy: string | null       // JSON: ["task-003"]
  plan: string | null            // 계획 섹션
  acceptanceCriteria: string | null  // 완료 조건
  notes: string | null           // 메모
  dueDate: Date | null           // 마감일
  milestone: string | null       // 마일스톤
}
```

## 에러 처리

| 에러 상황 | 처리 |
|----------|------|
| YAML 파싱 실패 | 파일 스킵, 로그 경고 |
| 필수 필드 누락 | 파일 스킵, 로그 경고 |
| 파일 읽기 실패 | 파일 스킵, 로그 에러 |
| DB 쓰기 실패 | 롤백, 에러 반환 |
