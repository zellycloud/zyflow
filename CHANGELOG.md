# Changelog

All notable changes to ZyFlow will be documented in this file.

## [0.1.0] - 2024-11-30

### Added

#### 태스크 Origin 구분 시스템
- `origin` 필드 추가로 태스크 출처 구분 (openspec/inbox/imported)
- 기존 데이터 자동 마이그레이션 (change_id 유무로 판단)
- MCP 및 CLI에서 origin 지원

#### Multi-Project Watcher
- 여러 프로젝트의 tasks.md 파일 동시 감시
- 실시간 동기화로 DB와 tasks.md 일관성 유지
- 프로젝트별 독립 DB 관리 (`.zyflow/tasks.db`)

#### 웹 대시보드 개선
- StandaloneTasks 태스크 상세 보기 다이얼로그
- 4컬럼 칸반 보드 (To Do, In Progress, Review, Done)
- 3단계 계층 구조 표시 (Major > Sub > Task)

#### Git 워크플로우 통합
- Change별 Git 브랜치 관리
- 충돌 해결 다이얼로그 UI
- Git API 엔드포인트

### Changed

- MCP 서버 전역 설정 지원 (`~/.claude.json`)
- `ZYFLOW_PROJECT` 환경변수 없이도 현재 디렉토리 자동 사용
- Parser 개선: 다양한 tasks.md 형식 지원

### Fixed

- React Hooks 순서 오류 수정
- Plain subsection 빈 그룹 생성 문제 해결
- 404 에러 처리 개선

---

## [0.0.1] - 2024-11-27

### Added

#### 초기 릴리스
- OpenSpec 기반 태스크 관리 시스템
- MCP 서버 (Claude Code 연동)
- 웹 대시보드 (React + Vite)
- SQLite 기반 태스크 저장소 (FTS5 전문 검색)
- CLI 도구 (`zy tasks`)

#### MCP 도구
- `zyflow_list_changes`: 변경 제안 목록 조회
- `zyflow_get_tasks`: 태스크 목록 조회
- `zyflow_get_next_task`: 다음 태스크 및 컨텍스트 조회
- `zyflow_mark_complete`: 태스크 완료 표시
- `task_create`, `task_list`, `task_update`, `task_delete`: CRUD

#### UI 컴포넌트
- 7단계 파이프라인 UI (Proposal → Archive)
- Flow Changes/Tasks API
- 프로젝트 중심 사이드바
