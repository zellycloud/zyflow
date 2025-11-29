# Design: Flow 중심 UI 아키텍처

## Context

ZyFlow는 OpenSpec 기반 태스크 관리 도구로, "Flow"라는 이름처럼 개발 파이프라인 전체를 관리하는 것이 목표. 현재는 OpenSpec과 Kanban이 분리되어 있어 흐름 시각화가 부족함.

**Stakeholders**: 개발자 (1인 또는 소규모 팀)
**Constraints**: 기존 칸반 데이터 마이그레이션 필요, OpenSpec 파일 구조 호환성 유지

## Goals / Non-Goals

### Goals
- 6단계 파이프라인(Spec → Task → Code → Test → Commit → Docs) 시각화
- Change 단위로 전체 흐름 추적
- OpenSpec과 DB 간 양방향 동기화
- 3단계 정보 계층으로 인지 부하 최소화

### Non-Goals
- 다중 사용자/팀 협업 기능 (향후 고려)
- 실시간 동기화 (수동 새로고침으로 충분)
- Git 커밋 자동 추적 (수동 기록으로 시작)

## Decisions

### 1. 데이터 모델: Change 중심 구조

**결정**: `changes` 테이블을 최상위 단위로 하고, `tasks`가 change_id로 연결

**이유**:
- Flow의 핵심 단위가 "Change" (하나의 기능/수정 단위)
- OpenSpec의 changes 디렉토리 구조와 1:1 매핑
- 독립 태스크(change_id=null)도 기존 칸반처럼 관리 가능

**대안 검토**:
- A) OpenSpec 파일만 사용 (DB 없음) → 검색/필터링 어려움
- B) Task만 사용하고 태그로 그룹화 → 파이프라인 단계 추적 복잡

### 2. UI 패턴: 아코디언 + 탭 하이브리드

**결정**: 아코디언으로 Change 목록, 펼치면 파이프라인 탭으로 상세 보기

**이유**:
- 아코디언: 여러 Change를 컴팩트하게 표시, 관심있는 것만 펼침
- 탭: 모달 없이 인라인으로 각 단계 전환, 컨텍스트 유지
- 3단계 계층으로 점진적 정보 공개

**대안 검토**:
- A) 중첩 아코디언 (깊이 4단계) → 너무 복잡, 인지 부하 높음
- B) 모달 방식 → 컨텍스트 전환 빈번, 열고 닫기 번거로움
- C) 스윔레인 칸반 → 넓은 화면 필요, 모바일 불친절

### 3. OpenSpec 연동: 읽기 우선, 선택적 쓰기

**결정**:
- OpenSpec → DB: 동기화 버튼으로 가져오기
- DB → OpenSpec: tasks.md 체크박스만 업데이트 (선택적)

**이유**:
- OpenSpec 파일은 버전 관리되는 문서로서 가치 유지
- 복잡한 양방향 동기화 대신 단순한 단방향 우선
- 충돌 최소화

### 4. Stage 정의: 6단계 고정

**결정**: `spec`, `task`, `code`, `test`, `commit`, `docs` 고정

**이유**:
- 일반적인 개발 워크플로우 커버
- UI/DB 구조 단순화
- 커스텀 단계는 향후 확장 가능

### 5. 진행률 계산

**결정**: 각 단계별 완료 비율 평균으로 전체 진행률 계산

```
progress = (spec_done + task_done + code_done + test_done + commit_done + docs_done) / 6 * 100
```

**이유**:
- 단순하고 직관적
- 단계별 가중치는 복잡성 대비 이점 적음

## Database Schema

```sql
-- 프로젝트 (저장소)
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  path          TEXT NOT NULL UNIQUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Change (Flow 최상위 단위)
CREATE TABLE changes (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  spec_path     TEXT,
  status        TEXT DEFAULT 'active',      -- active, completed, archived
  current_stage TEXT DEFAULT 'spec',        -- spec, task, code, test, commit, docs
  progress      INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Tasks (기존 테이블 수정)
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  change_id     TEXT,                       -- nullable for standalone tasks
  project_id    TEXT NOT NULL,
  stage         TEXT NOT NULL,              -- spec, task, code, test, commit, docs
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT DEFAULT 'todo',
  priority      TEXT DEFAULT 'medium',
  order_index   INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME,
  FOREIGN KEY (change_id) REFERENCES changes(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

## UI Component Hierarchy

```
MainLayout
├── Sidebar
│   ├── ProjectList
│   │   └── ProjectItem (선택 가능)
│   ├── ProjectAddButton
│   └── SettingsButton
│
└── MainContent
    └── FlowPage
        └── ChangeList
            └── ChangeItem (아코디언)
                ├── ChangeItemCollapsed (Level 1)
                │   ├── ChevronIcon
                │   ├── Title
                │   ├── CurrentStageBadge
                │   └── ProgressBar
                │
                └── ChangeItemExpanded (Level 2)
                    ├── Header (클릭시 접힘)
                    ├── PipelineBar (탭 역할)
                    │   └── StageBox × 6 (클릭 가능)
                    └── StageContent (탭 내용)
                        └── TaskList
                            └── TaskItem
                                └── [상세보기] → TaskDetail (Level 3)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 추가 |
| GET | `/api/projects/:id/changes` | Change 목록 (stages 집계 포함) |
| POST | `/api/projects/:id/changes` | Change 생성 |
| PATCH | `/api/projects/:id/changes/:cid` | Change 수정 |
| POST | `/api/projects/:id/changes/sync` | OpenSpec에서 동기화 |
| GET | `/api/projects/:id/tasks` | 태스크 목록 (필터: change_id, stage, status) |
| POST | `/api/projects/:id/tasks` | 태스크 생성 |
| PATCH | `/api/projects/:id/tasks/:tid` | 태스크 수정 |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 기존 칸반 데이터 손실 | 마이그레이션 스크립트로 change_id=null, stage='task'로 변환 |
| OpenSpec 동기화 충돌 | 단방향(OpenSpec→DB) 우선, 충돌 시 사용자에게 선택 요청 |
| 복잡한 UI로 사용성 저하 | 3단계 계층으로 점진적 공개, 스마트 기본값(진행중 자동 펼침) |

## Migration Plan

1. **Phase 1**: 스키마 추가 (기존 데이터 유지)
   - projects, changes 테이블 생성
   - tasks에 change_id, stage 컬럼 추가 (nullable)

2. **Phase 2**: 데이터 마이그레이션
   - 기존 tasks에 stage='task' 설정
   - 독립 태스크로 유지 (change_id=null)

3. **Phase 3**: UI 전환
   - 새 Flow UI 구현
   - 기존 OpenSpec/Kanban 탭 UI 코멘트 처리 (코드 보존, 향후 재사용 가능)
   - 독립 태스크는 별도 섹션 또는 필터로 접근

4. **Rollback**:
   - change_id, stage 컬럼만 제거하면 기존 상태 복원 가능

## Open Questions

- [ ] 독립 태스크(Change에 속하지 않는 태스크)를 어디에 표시할까?
  - 옵션 A: 별도 "Standalone Tasks" 섹션
  - 옵션 B: 특수 "Misc" Change로 그룹화
  - 옵션 C: 상단 필터로 "Change 없는 태스크만" 보기
