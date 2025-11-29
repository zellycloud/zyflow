# Tasks: Flow 중심 UI 아키텍처로 전환

## 1. 데이터베이스 스키마

- [x] 1.1 `projects` 테이블 생성 (id, name, path, timestamps) - 기존 config.ts 사용
- [x] 1.2 `changes` 테이블 생성 (id, project_id, title, spec_path, status, current_stage, progress)
- [x] 1.3 `tasks` 테이블 수정 (change_id, stage 필드 추가)
- [ ] 1.4 `tasks` 테이블 확장 (group_title, group_order, task_order 필드 추가)
- [ ] 1.5 인덱스 및 FTS5 검색 테이블 업데이트
- [x] 1.6 마이그레이션 스크립트 작성

## 2. 백엔드 API

- [x] 2.1 Projects API 구현 (CRUD) - 기존 API 재사용
- [x] 2.2 Changes API 구현 (CRUD + 진행률 계산)
- [x] 2.3 Tasks API 수정 (change_id, stage 필터링 지원)
- [x] 2.4 OpenSpec 동기화 API 구현 (proposal.md, tasks.md 파싱)
- [x] 2.5 Stage별 집계 API 구현
- [ ] 2.6 프로젝트별 change counts API (DB 기반 통합)
- [ ] 2.7 tasks.md 파서 수정 (group_title, group_order, task_order 추출)

## 3. 타입 정의

- [x] 3.1 Stage, ChangeStatus, TaskStatus 타입 정의
- [ ] 3.2 Stage 타입 확장 (7단계: spec, changes, task, code, test, commit, docs)
- [x] 3.3 Project, Change, Task 인터페이스 정의
- [ ] 3.4 Task 인터페이스 확장 (groupTitle, groupOrder, taskOrder 필드)
- [x] 3.5 ChangeWithStages 집계 타입 정의
- [x] 3.6 API 요청/응답 타입 정의

## 4. UI 레이아웃

- [x] 4.1 MainLayout 컴포넌트 수정 (사이드바 + 메인 영역)
- [ ] 4.2 FlowSidebar 리팩토링 (프로젝트 → Changes 트리 구조)
- [ ] 4.3 선택 상태 관리 (project | change | standalone-tasks)
- [ ] 4.4 "기타 작업" 항목 추가 (독립 tasks용)

## 5. 프로젝트 대시보드

- [ ] 5.1 ProjectDashboard 컴포넌트 구현
- [ ] 5.2 Changes 요약 카드 (진행중/완료/전체)
- [ ] 5.3 Change별 진행률 목록
- [ ] 5.4 최근 활동 표시

## 6. Change 상세 뷰

- [x] 6.1 ChangeDetail 컴포넌트 구현 (기존 ChangeItem 기반)
- [ ] 6.2 PipelineBar 7단계로 확장
- [ ] 6.3 Changes 탭 구현 (OpenSpec proposal 상세)
- [ ] 6.4 각 Stage별 콘텐츠 컴포넌트 수정

## 7. Tasks 탭 (칸반/리스트 뷰)

- [ ] 7.1 TasksTab 컴포넌트 구현 (뷰 전환 지원)
- [ ] 7.2 KanbanView 컴포넌트 구현 (Todo/Doing/Done)
- [ ] 7.3 ListView 컴포넌트 구현 (그룹/번호 구조)
- [ ] 7.4 뷰 전환 토글 버튼
- [ ] 7.5 드래그앤드롭 지원 (칸반)

## 8. 상태 관리

- [x] 8.1 useProjectsAllData 훅 사용
- [x] 8.2 useFlowChanges 훅 구현
- [x] 8.3 useFlowTasks 훅 구현
- [ ] 8.4 useFlowChangeCounts 훅 - DB 기반으로 통합
- [ ] 8.5 선택 상태 관리 (selectedItem: {type, id})

## 9. OpenSpec 연동

- [x] 9.1 OpenSpec 파일 스캐너 구현 (changes 디렉토리)
- [x] 9.2 proposal.md 파서 구현
- [x] 9.3 tasks.md 파서 구현 (체크박스 → 상태)
- [ ] 9.4 tasks.md 파서 확장 (그룹 제목/순서 추출)
- [x] 9.5 동기화 로직 구현 (OpenSpec → DB)
- [x] 9.6 Spec 내용 조회 API 구현

## 10. 독립 Tasks (기타 작업)

- [ ] 10.1 StandaloneTasks 컴포넌트 구현
- [ ] 10.2 칸반 뷰 (change_id = null인 tasks)
- [ ] 10.3 Task 추가/수정/삭제 기능

## 11. MCP 서버 업데이트

- [ ] 11.1 zyflow_list_projects 도구 추가
- [ ] 11.2 zyflow_list_changes 도구 수정
- [ ] 11.3 zyflow_get_change_detail 도구 추가 (stages 포함)
- [ ] 11.4 task 관련 도구 수정 (change_id, stage 지원)

## 12. 테스트

- [ ] 12.1 DB 스키마 테스트
- [ ] 12.2 API 엔드포인트 테스트
- [ ] 12.3 OpenSpec 파서 테스트
- [ ] 12.4 UI 컴포넌트 테스트

## 13. 문서화

- [ ] 13.1 README.md 업데이트
- [ ] 13.2 API 문서 작성
- [ ] 13.3 MCP 도구 사용법 업데이트
