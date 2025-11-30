# Change: Git 워크플로우 통합

## Summary

ZyFlow에 Git 워크플로우를 통합하여 프로젝트 동기화, 브랜치 관리, 커밋/푸시 자동화를 지원합니다. 이를 통해 로컬과 원격 저장소 간의 일관성을 유지하고, Change 기반 개발 워크플로우를 Git과 연계합니다.

## Motivation

### 현재 문제점
1. **수동 동기화 필요**: SSH 서버에서 작업 후 로컬에서 `git pull`을 수동으로 해야 함
2. **상태 불일치**: 원격 저장소와 로컬 파일시스템 간의 불일치로 인한 404 에러 발생
3. **워크플로우 단절**: Change 작업과 Git 작업이 분리되어 있음
4. **협업 어려움**: 여러 환경(로컬, 원격 서버)에서 작업 시 동기화 문제

### 기대 효과
- 프로젝트 전환 시 자동으로 최신 상태 유지
- Change 완료 시 자동 커밋/푸시로 작업 결과 즉시 반영
- Git 상태를 UI에서 실시간 확인
- 충돌 발생 시 사전 알림으로 문제 예방

## Proposed Solution

### Phase 1: 기본 Git 동기화 (MVP)

#### 1.1 프로젝트 활성화 시 자동 Pull
```typescript
// 프로젝트 활성화 API에서 git pull 실행
app.put('/api/projects/:id/activate', async (req, res) => {
  // ... setActiveProject

  // Git pull 실행 (sync 전에)
  try {
    await execAsync('git pull --ff-only', { cwd: project.path })
    console.log(`[Git] Pulled latest changes for "${project.name}"`)
  } catch (error) {
    console.warn(`[Git] Pull failed: ${error.message}`)
    // pull 실패해도 활성화는 진행 (uncommitted changes 등)
  }

  // ... OpenSpec sync
})
```

#### 1.2 Git 상태 API
```typescript
// GET /api/git/status - 현재 프로젝트의 Git 상태
interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
  hasConflicts: boolean
}
```

#### 1.3 수동 Git 명령 API
```typescript
// POST /api/git/pull - 수동 pull
// POST /api/git/push - 수동 push
// POST /api/git/fetch - 원격 상태 확인
```

### Phase 2: Change 연계 Git 워크플로우

#### 2.1 Change별 브랜치 관리
- Change 시작 시 feature 브랜치 자동 생성: `change/{change-id}`
- Change 완료 시 main 브랜치로 머지 옵션 제공
- 브랜치 전환 시 uncommitted changes 경고

#### 2.2 자동 커밋/푸시
- Change의 각 Stage 완료 시 자동 커밋 옵션
- 커밋 메시지 템플릿: `[{change-id}] {stage}: {description}`
- 푸시 타이밍 설정 (즉시, 수동, Stage 완료 시)

#### 2.3 PR 생성 자동화
- Change 완료 시 GitHub/GitLab PR 자동 생성
- Change의 proposal.md 내용을 PR 설명으로 활용

### Phase 3: 협업 및 충돌 관리

#### 3.1 실시간 원격 상태 모니터링
- 주기적으로 `git fetch` 실행 (설정 가능)
- 원격에 새 커밋이 있으면 UI에 알림 표시
- 충돌 가능성 사전 감지

#### 3.2 충돌 해결 지원
- 충돌 발생 시 상세 정보 표시
- 파일별 충돌 해결 UI
- AI 기반 충돌 해결 제안

## Technical Design

### 서버 구조
```
server/
├── git/
│   ├── index.ts        # Git 서비스 메인 모듈
│   ├── commands.ts     # Git 명령 래퍼 함수들
│   ├── status.ts       # 상태 파싱 유틸리티
│   └── hooks.ts        # Git 이벤트 훅 처리
```

### API 엔드포인트
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/git/status | 현재 Git 상태 |
| POST | /api/git/pull | Pull 실행 |
| POST | /api/git/push | Push 실행 |
| POST | /api/git/fetch | Fetch 실행 |
| POST | /api/git/commit | 커밋 생성 |
| GET | /api/git/branches | 브랜치 목록 |
| POST | /api/git/checkout | 브랜치 전환 |
| POST | /api/git/branch | 브랜치 생성 |

### 프론트엔드 컴포넌트
```
src/components/git/
├── GitStatusBadge.tsx     # 상태 뱃지 (헤더/사이드바)
├── GitBranchSelector.tsx  # 브랜치 선택 드롭다운
├── GitSyncButton.tsx      # Pull/Push 버튼
├── GitConflictDialog.tsx  # 충돌 해결 다이얼로그
└── GitCommitDialog.tsx    # 커밋 다이얼로그
```

## Affected Specs

- **NEW**: `git-integration` - Git 통합 기능 스펙
- **MODIFIED**: `project-management` - 프로젝트 활성화에 Git pull 추가
- **MODIFIED**: `change-workflow` - Change 완료 시 Git 커밋 연계

## Implementation Plan

### Phase 1 (1주)
1. Git 서비스 모듈 생성
2. 프로젝트 활성화 시 자동 pull 구현
3. Git 상태 API 구현
4. UI에 Git 상태 뱃지 추가

### Phase 2 (2주)
1. Change별 브랜치 관리 구현
2. 자동 커밋/푸시 로직 구현
3. GitCommitDialog 컴포넌트 개발
4. 설정 UI 추가

### Phase 3 (2주)
1. 원격 상태 모니터링 구현
2. 충돌 감지 및 알림 시스템
3. 충돌 해결 UI 개발
4. PR 생성 자동화 (GitHub API 연동)

## Risks & Mitigations

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| Git 명령 실패 시 에러 처리 | 높음 | 상세 에러 메시지, 복구 가이드 제공 |
| 대용량 저장소 성능 | 중간 | shallow clone, sparse checkout 옵션 |
| 인증 정보 관리 | 높음 | 시스템 credential helper 활용 |
| 충돌 자동 해결 실패 | 중간 | 수동 해결 폴백, 명확한 가이드 |

## Success Metrics

- 프로젝트 전환 시 404 에러 0건
- Git 동기화 소요 시간 < 3초 (일반적인 저장소)
- 사용자 수동 git 명령 실행 횟수 80% 감소
