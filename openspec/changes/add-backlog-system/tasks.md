# Backlog System 구현 작업

## Phase 1: Foundation ✅ COMPLETED

### Database & Schema
- [x] tasks 테이블에 Backlog 관련 컬럼 추가 (backlogFileId, parentTaskId, blockedBy, plan, acceptanceCriteria, notes, dueDate, milestone)
- [x] Backlog 컬럼 인덱스 생성 (idx_tasks_backlog_file_id, idx_tasks_parent_task_id, idx_tasks_milestone)

### Backlog Parser
- [x] YAML frontmatter 파싱 (id, title, status, priority, assignees, labels, blocked_by, parent, due_date, milestone)
- [x] 마크다운 섹션 파싱 (Description, Plan, Acceptance Criteria, Notes)
- [x] 상태/우선순위 정규화 함수 (normalizeStatus, normalizePriority)

### Sync Module
- [x] scanBacklogDirectory() - backlog/*.md 파일 검색
- [x] syncBacklogToDb() - 전체 동기화
- [x] syncBacklogTaskToDb() - 개별 태스크 동기화

### API Endpoints
- [x] GET /api/flow/tasks?origin=backlog - Backlog 태스크 목록
- [x] GET /api/flow/backlog/tasks/:id - 상세 조회
- [x] PUT /api/flow/backlog/tasks/:id - 태스크 수정
- [x] POST /api/flow/backlog/sync - 수동 동기화
- [x] GET /api/flow/backlog/stats - 통계 조회

---

## Phase 2: UI Implementation ✅ COMPLETED

### Components
- [x] BacklogView.tsx - Kanban 보드 메인 컴포넌트
- [x] TaskDetailDialog - 상세 보기 다이얼로그 (Plan, AC, Notes, Dependencies)
- [x] 서브태스크/의존성 배지 표시

### Navigation
- [x] MenuBar.tsx에 Backlog 버튼 추가
- [x] FlowContent.tsx 라우팅 연결
- [x] App.tsx SelectedItem 타입 확장

### React Hooks
- [x] useBacklogTasks() - 목록 조회
- [x] useBacklogTaskDetail() - 상세 조회
- [x] useUpdateBacklogTask() - 수정
- [x] useSyncBacklog() - 동기화

---

## Phase 3: Migration Tool ✅ COMPLETED

### Migration API
- [x] GET /api/flow/backlog/migration/preview - 마이그레이션 미리보기
- [x] POST /api/flow/backlog/migration - 전체 마이그레이션
- [x] POST /api/flow/backlog/migration/selected - 선택 마이그레이션

### Migration Logic
- [x] getInboxTasksForMigration() - 대상 태스크 조회
- [x] generateNewBacklogTaskId() - 새 ID 생성 (task-NNN)
- [x] convertToBacklogTask() - Inbox → Backlog 변환
- [x] saveTaskToBacklogFile() - 마크다운 파일 저장

### UI
- [x] MigrationDialog - 미리보기 및 실행 UI
- [x] StandaloneTasks에 "Migrate to Backlog" 버튼 추가
- [x] useMigrationPreview(), useMigrateAllToBacklog(), useMigrateSelectedToBacklog() 훅

---

## Phase 4: Cleanup 🔲 PENDING

### Legacy Code
- [ ] Inbox 전용 코드 정리 (Backlog와 통합)
- [ ] 중복 컴포넌트 정리

---

## Files Created/Modified

### Created (Phase 1)
- server/backlog/parser.ts
- server/backlog/sync.ts
- server/backlog/index.ts

### Created (Phase 2)
- src/components/flow/BacklogView.tsx

### Created (Phase 3)
- server/backlog/migration.ts

### Modified
- server/tasks/db/client.ts - Backlog 컬럼 마이그레이션
- server/routes/flow.ts - Backlog API 엔드포인트
- src/hooks/useFlowChanges.ts - Backlog 훅
- src/components/layout/MenuBar.tsx - Backlog 버튼
- src/components/flow/FlowContent.tsx - 라우팅
- src/components/flow/StandaloneTasks.tsx - Migration 버튼

---

## Test Checklist

### Build & Type Check
- [x] TypeScript 컴파일 성공
- [x] Vite 빌드 성공

### API Tests
- [x] Backlog stats API 동작 확인
- [x] Tasks API origin=backlog 필터 동작

### UI Tests
- [x] BacklogView Kanban 렌더링
- [x] TaskDetailDialog 상세 정보 표시
- [x] Migration 버튼 및 다이얼로그
