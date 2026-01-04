# Tasks

## 1. Backend 기반 구축

### 1.1 타입 정의
- [x] ExecutionRequest, ExecutionStatus 타입 정의
- [x] LogEntry, ExecutionResult 타입 정의
- [x] API 응답 타입 정의

### 1.2 프롬프트 빌더
- [x] OpenSpecPromptBuilder 클래스 구현
- [x] CLAUDE.md 로드 및 요약 기능
- [x] proposal.md, design.md 로드
- [x] tasks.md 파싱 및 미완료 태스크 추출
- [x] 관련 specs 파일 목록 생성
- [x] 최종 프롬프트 조합 함수

### 1.3 실행 관리자
- [x] ClaudeFlowExecutor 클래스 구현
- [x] child_process.spawn으로 claude-flow 실행
- [x] stream-json 출력 파싱
- [x] 실행 상태 관리 (Map 기반)
- [x] 타임아웃 처리 (기본 30분)
- [x] 프로세스 강제 종료 기능

### 1.4 API 엔드포인트
- [x] POST /api/claude-flow/execute - 실행 시작
- [x] GET /api/claude-flow/status/:id - 상태 조회
- [x] GET /api/claude-flow/stream/:id - SSE 스트림
- [x] POST /api/claude-flow/stop/:id - 실행 중지
- [x] GET /api/claude-flow/history - 히스토리 조회

## 2. Frontend 구현

### 2.1 훅 및 상태 관리
- [x] useClaudeFlowExecution 훅 구현
- [x] SSE 연결 관리 로직
- [x] React Query 캐시 무효화 연동

### 2.2 UI 컴포넌트
- [x] ExecutionPanel 메인 컴포넌트
- [x] 실행 모드 선택 UI (full/single/analysis)
- [x] LogViewer 컴포넌트 (스크롤, 필터링)
- [x] ProgressIndicator 컴포넌트
- [x] 실행/중지 버튼

### 2.3 ChangeDetail 통합
- [x] ChangeDetail에 ExecutionPanel 추가
- [x] 실행 상태에 따른 UI 변경
- [x] 태스크 완료 시 자동 새로고침

## 3. 테스트 및 문서화

### 3.1 테스트
- [x] 프롬프트 빌더 단위 테스트
- [x] API 엔드포인트 통합 테스트
- [x] E2E 테스트 (실행 → 완료 흐름)

### 3.2 문서화
- [x] README에 claude-flow 통합 섹션 추가
- [x] API 문서 업데이트
