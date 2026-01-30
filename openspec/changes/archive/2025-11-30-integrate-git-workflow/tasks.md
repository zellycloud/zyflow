# Tasks: Git 워크플로우 통합

## 1. Phase 1: 기본 Git 동기화 (MVP)

- [x] 1.1 Git 서비스 모듈 생성 (server/git/)
- [x] 1.2 Git 명령 래퍼 함수 구현 (commands.ts)
- [x] 1.3 Git 상태 파싱 유틸리티 구현 (status.ts)
- [x] 1.4 프로젝트 활성화 시 자동 pull 구현
- [x] 1.5 Git 상태 API 구현 (/api/git/status)
- [x] 1.6 Git 명령 API 구현 (pull, push, fetch, commit)
- [x] 1.7 Git 브랜치 API 구현 (branches, checkout, branch)
- [x] 1.8 프론트엔드 useGit 훅 생성
- [x] 1.9 GitStatusBadge 컴포넌트 구현
- [x] 1.10 GitSyncButton 컴포넌트 구현
- [x] 1.11 GitBranchSelector 컴포넌트 구현
- [x] 1.12 GitCommitDialog 컴포넌트 구현
- [x] 1.13 File Watcher 구현 (tasks.md 변경 시 자동 DB 동기화)

## 2. Phase 2: Change 연계 Git 워크플로우

- [x] 2.1 Change별 브랜치 자동 생성 기능
- [x] 2.2 Change 시작 시 feature 브랜치 생성 (change/{change-id})
- [x] 2.3 브랜치 전환 시 uncommitted changes 경고
- [x] 2.4 자동 커밋 옵션 구현
- [x] 2.5 커밋 메시지 템플릿 적용 ([{change-id}] {stage}: {description})
- [x] 2.6 푸시 타이밍 설정 UI 추가

## 3. Phase 3: 협업 및 충돌 관리

- [x] 3.1 실시간 원격 상태 모니터링 구현
- [x] 3.2 주기적 git fetch 실행 (설정 가능)
- [x] 3.3 원격 새 커밋 알림 UI 구현
- [x] 3.4 충돌 가능성 사전 감지
- [x] 3.5 충돌 해결 다이얼로그 UI 개발
- [x] 3.6 PR 생성 자동화 (GitHub API 연동)


