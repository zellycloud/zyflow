# Tasks: Flow 중심 UI 아키텍처로 전환

**완료일**: 2025-12-02

## 1. 데이터베이스 스키마

- [x] 1.1 `projects` 테이블 생성 (id, name, path, timestamps) - 기존 config.ts 사용
- [x] 1.2 `changes` 테이블 생성 (id, project_id, title, spec_path, status, current_stage, progress)
- [x] 1.3 `tasks` 테이블 수정 (change_id, stage 필드 추가)
- [x] 1.4 `tasks` 테이블 확장 (group_title, group_order, task_order 필드 추가)
- [x] 1.5 인덱스 및 FTS5 검색 테이블 업데이트
- [x] 1.6 마이그레이션 스크립트 작성

## 2. 백엔드 API

- [x] 2.1 Projects API 구현 (CRUD) - 기존 API 재사용
- [x] 2.2 Changes API 구현 (CRUD + 진행률 계산)
- [x] 2.3 Tasks API 수정 (change_id, stage 필터링 지원)
- [x] 2.4 OpenSpec 동기화 API 구현 (proposal.md, tasks.md 파싱)
- [x] 2.5 Stage별 집계 API 구현
- [x] 2.6 프로젝트별 change counts API (DB 기반 통합)
- [x] 2.7 tasks.md 파서 수정 (group_title, group_order, task_order 추출)

## 3. 타입 정의

- [x] 3.1 Stage, ChangeStatus, TaskStatus 타입 정의
- [x] 3.2 Stage 타입 확장 (7단계: spec, changes, task, code, test, commit, docs)
- [x] 3.3 Project, Change, Task 인터페이스 정의
- [x] 3.4 Task 인터페이스 확장 (groupTitle, groupOrder, taskOrder 필드)
- [x] 3.5 ChangeWithStages 집계 타입 정의
- [x] 3.6 API 요청/응답 타입 정의

## 4. UI 레이아웃

- [x] 4.1 MainLayout 컴포넌트 수정 (사이드바 + 메인 영역)
- [x] 4.2 FlowSidebar 리팩토링 (프로젝트 → Changes 트리 구조)
- [x] 4.3 선택 상태 관리 (project | change | standalone-tasks)
- [x] 4.4 "기타 작업" 항목 추가 (독립 tasks용)

## 5. 프로젝트 대시보드

- [x] 5.1 ProjectDashboard 컴포넌트 구현
- [x] 5.2 Changes 요약 카드 (진행중/완료/전체)
- [x] 5.3 Change별 진행률 목록
- [x] 5.4 최근 활동 표시

## 6. Change 상세 뷰

- [x] 6.1 ChangeDetail 컴포넌트 구현 (기존 ChangeItem 기반)
- [x] 6.2 PipelineBar 7단계로 확장
- [x] 6.3 Changes 탭 구현 (OpenSpec proposal 상세)
- [x] 6.4 각 Stage별 콘텐츠 컴포넌트 수정

## 7. Tasks 탭 (칸반/리스트 뷰)

- [x] 7.1 TasksTab 컴포넌트 구현 (뷰 전환 지원)
- [x] 7.2 KanbanView 컴포넌트 구현 (Todo/Doing/Done)
- [x] 7.3 ListView 컴포넌트 구현 (그룹/번호 구조)
- [x] 7.4 뷰 전환 토글 버튼
- [x] 7.5 드래그앤드롭 지원 (칸반)

## 8. 상태 관리

- [x] 8.1 useProjectsAllData 훅 사용
- [x] 8.2 useFlowChanges 훅 구현
- [x] 8.3 useFlowTasks 훅 구현
- [x] 8.4 useFlowChangeCounts 훅 - DB 기반으로 통합
- [x] 8.5 선택 상태 관리 (selectedItem: {type, id})

## 9. OpenSpec 연동

- [x] 9.1 OpenSpec 파일 스캐너 구현 (changes 디렉토리)
- [x] 9.2 proposal.md 파서 구현
- [x] 9.3 tasks.md 파서 구현 (체크박스 → 상태)
- [x] 9.4 tasks.md 파서 확장 (그룹 제목/순서 추출)
- [x] 9.5 동기화 로직 구현 (OpenSpec → DB)
- [x] 9.6 Spec 내용 조회 API 구현

## 10. 독립 Tasks (기타 작업)

- [x] 10.1 StandaloneTasks 컴포넌트 구현
- [x] 10.2 칸반 뷰 (change_id = null인 tasks)
- [x] 10.3 Task 추가/수정/삭제 기능

## 11. MCP 서버 업데이트

- [x] 11.1 zyflow_list_projects 도구 추가
- [x] 11.2 zyflow_list_changes 도구 수정
- [x] 11.3 zyflow_get_change_detail 도구 추가 (stages 포함)
- [x] 11.4 task 관련 도구 수정 (change_id, stage 지원)

## 12. 테스트

- [x] 12.1 DB 스키마 테스트
- [x] 12.2 API 엔드포인트 테스트
- [x] 12.3 OpenSpec 파서 테스트
- [x] 12.4 UI 컴포넌트 테스트

## 13. 문서화

- [x] 13.1 README.md 업데이트
- [x] 13.2 API 문서 작성
- [x] 13.3 MCP 도구 사용법 업데이트

## 14. 추가 기능 (Git 워크플로우 통합)

- [x] 14.1 Change 브랜치 관리 기능
- [x] 14.2 커밋 워크플로우 구현
- [x] 14.3 푸시 및 PR 생성 기능
- [x] 14.4 충돌 감지 및 해결 기능
- [x] 14.5 원격 상태 동기화

## 15. Change Log & Replay 시스템

- [x] 15.1 이벤트 로깅 시스템 구현
- [x] 15.2 리플레이 엔진 구현
- [x] 15.3 롤백 포인트 관리
- [x] 15.4 이벤트 검색 및 통계
- [x] 15.5 MCP 도구 연동

---

## 진행률 요약

### 전체 진행률: 100% (70/70 항목 완료) ✅

### 카테고리별 진행률:
1. **데이터베이스 스키마**: 100% (6/6) ✅
2. **백엔드 API**: 100% (7/7) ✅
3. **타입 정의**: 100% (6/6) ✅
4. **UI 레이아웃**: 100% (4/4) ✅
5. **프로젝트 대시보드**: 100% (4/4) ✅
6. **Change 상세 뷰**: 100% (4/4) ✅
7. **Tasks 탭**: 100% (5/5) ✅
8. **상태 관리**: 100% (5/5) ✅
9. **OpenSpec 연동**: 100% (6/6) ✅
10. **독립 Tasks**: 100% (3/3) ✅
11. **MCP 서버**: 100% (4/4) ✅
12. **테스트**: 100% (4/4) ✅
13. **문서화**: 100% (3/3) ✅
14. **Git 워크플로우**: 100% (5/5) ✅
15. **Change Log & Replay**: 100% (5/5) ✅

### 완료된 주요 성과:
- Flow 중심 UI 아키텍처로 성공적으로 전환 완료
- 7단계 파이프라인 (spec → changes → task → code → test → commit → docs) 구현
- Git 워크플로우 통합으로 개발 생산성 향상
- Change Log & Replay 시스템으로 운영 안정성 강화
- MCP 서버 확장으로 AI 도구 연동 기능 강화
- UI 컴포넌트 테스트 (stages, PipelineBar, StageContent) 구현
- REST API 문서 작성 (docs/api.md)
- MCP 도구 사용 가이드 작성 (docs/mcp-tools.md)
- README.md 업데이트 (7단계 파이프라인, 프로젝트 구조, 기술 스택)
