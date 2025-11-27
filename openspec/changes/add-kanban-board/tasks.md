# Tasks: add-kanban-board

## 1. 프로젝트 초기 설정

- [x] 1.1 Vite + React + TypeScript 프로젝트 생성
- [x] 1.2 TailwindCSS 4 설정
- [x] 1.3 ShadcnUI 초기화 및 기본 컴포넌트 설치
- [x] 1.4 절대 경로 import (`@/`) 설정
- [ ] 1.5 ESLint + Prettier 설정

## 2. 로컬 API 서버

- [x] 2.1 Express 서버 설정 (server/index.ts)
- [x] 2.2 OpenSpec tasks.md 파싱 유틸리티
- [x] 2.3 GET /api/changes - 변경 제안 목록 조회
- [x] 2.4 GET /api/changes/:id/tasks - 특정 변경의 태스크 조회
- [x] 2.5 PATCH /api/tasks/:changeId/:taskId - 체크박스 토글
- [x] 2.6 Vite proxy 설정으로 API 연동

## 3. 타입 정의

- [x] 3.1 Change 인터페이스 (proposal 정보)
- [x] 3.2 Task 인터페이스 (체크리스트 항목)
- [x] 3.3 TaskGroup 인터페이스 (섹션별 그룹)
- [x] 3.4 API 응답 타입 정의

## 4. 대시보드 UI

- [x] 4.1 기본 레이아웃 (헤더, 사이드바, 메인 영역)
- [x] 4.2 ChangeList 컴포넌트 (사이드바 - 변경 제안 목록)
- [x] 4.3 TaskBoard 컴포넌트 (메인 - 선택된 변경의 태스크)
- [x] 4.4 TaskGroup 컴포넌트 (섹션별 그룹)
- [x] 4.5 TaskItem 컴포넌트 (체크박스 + 제목)
- [x] 4.6 ProgressBar 컴포넌트 (완료율 표시)

## 5. 데이터 연동

- [x] 5.1 TanStack Query 설정
- [x] 5.2 useChanges 훅 구현 (변경 목록)
- [x] 5.3 useTasks 훅 구현 (태스크 목록)
- [x] 5.4 useToggleTask 훅 구현 (체크박스 토글)
- [x] 5.5 Optimistic update 구현

## 6. 세부 계획 기능

- [x] 6.1 TaskDetail 패널 (태스크 클릭 시)
- [x] 6.2 세부 계획 파일 조회 (.zyflow/plans/)
- [x] 6.3 "세부 계획 요청" 버튼 (클립보드에 프롬프트 복사)

## 7. 테스트

- [ ] 7.1 Vitest 설정
- [ ] 7.2 tasks.md 파싱 유틸리티 테스트
- [ ] 7.3 API 엔드포인트 테스트

## 8. 문서화

- [ ] 8.1 README.md 작성
- [ ] 8.2 CLAUDE.md에 zyflow 지침 추가
