# Tasks: LangGraph + DeepAgents 통합

## Phase 1: Python 환경 구축

### 1.1 프로젝트 구조 설정
- [x] py-agents/ 디렉토리 생성
- [x] pyproject.toml 작성 (dependencies: langgraph, deepagents, fastapi, uvicorn, langchain-anthropic)
- [x] src/zyflow_agents/ 패키지 구조 생성
- [x] .gitignore에 Python 관련 항목 추가 (__pycache__, .venv, etc.)

### 1.2 FastAPI 브릿지 서버
- [x] server.py 기본 구조 작성 (FastAPI app, CORS 설정)
- [x] /health 엔드포인트 구현
- [x] /api/agents/execute 엔드포인트 스텁 작성
- [x] /api/agents/sessions/{id} 엔드포인트 스텁 작성
- [x] /api/agents/sessions/{id}/stream SSE 엔드포인트 스텁 작성

### 1.3 개발 환경 통합
- [x] package.json에 py:server 스크립트 추가 (uvicorn 실행)
- [x] package.json에 dev:full 스크립트 추가 (Node + Python 동시 실행)
- [x] Express 서버에 /api/agents 프록시 라우트 추가
- [x] Python 서버 연결 상태 확인 API 추가

### 1.4 테스트 환경
- [x] pytest 설정 (pyproject.toml)
- [x] 기본 테스트 파일 생성 (test_server.py)
- [x] CI에 Python 테스트 추가 (선택)

## Phase 2: LangGraph 기본 통합

### 2.1 OpenSpec 파서
- [x] openspec_parser.py 작성 - tasks.md 파싱
- [x] proposal.md, design.md, spec.md 읽기 함수
- [x] 태스크 구조체 정의 (TaskGroup, Task)
- [x] 파서 단위 테스트

### 2.2 LangGraph StateGraph 빌더
- [x] graph.py 작성 - OpenSpecState TypedDict 정의
- [x] create_openspec_graph() 함수 구현
- [x] 태스크별 노드 동적 생성
- [x] 순차 실행 엣지 연결
- [x] 그래프 컴파일 및 체크포인터 연결

### 2.3 체크포인트 시스템
- [x] SqliteSaver 설정 (zyflow-agents.db)
- [x] 세션 ID 생성 및 관리
- [x] 체크포인트 저장/로드 테스트
- [x] 중단 지점에서 재개 기능

### 2.4 ZyFlow 동기화
- [x] 태스크 완료 시 ZyFlow API 호출 로직
- [x] tasks.md 파일 직접 수정 (mark_complete 호출 또는 파일 수정)
- [x] 진행률 업데이트 WebSocket 이벤트 발행
- [x] 동기화 실패 시 재시도 로직

### 2.5 기본 실행 테스트
- [x] 샘플 OpenSpec change로 그래프 실행 테스트
- [x] 모든 태스크 순차 실행 확인
- [x] 체크포인트 저장/복원 확인
- [x] ZyFlow 태스크 상태 동기화 확인

## Phase 3: DeepAgents 통합

### 3.1 OpenSpec 미들웨어
- [x] middleware/openspec.py 작성
- [x] get_system_prompt_addition() - proposal, design, spec 내용 주입
- [x] get_initial_todos() - tasks.md에서 초기 Todo 목록 생성
- [x] on_task_complete() - ZyFlow 동기화 콜백
- [x] 미들웨어 단위 테스트

### 3.2 DeepAgent 팩토리
- [x] agent.py 작성 - create_zyflow_agent() 함수
- [x] 모델 선택 로직 (기본: Claude Sonnet, 옵션: Haiku, GPT 등)
- [x] 미들웨어 스택 구성 (OpenSpec + 기본 미들웨어)
- [x] 도구 연결 (ZyFlow MCP 도구들)

### 3.3 실행 엔진
- [x] /api/agents/execute 완전 구현
- [x] 비동기 실행 (백그라운드 태스크)
- [x] 실행 상태 추적 (pending, running, completed, failed, stopped)
- [x] 에러 핸들링 및 로깅

### 3.4 제어 API
- [x] /api/agents/sessions/{id}/stop 구현 (그래프 인터럽트)
- [x] /api/agents/sessions/{id}/resume 구현 (체크포인트에서 재개)
- [x] 세션 목록 조회 API
- [x] 세션 삭제 API

### 3.5 스트리밍 출력
- [x] SSE 스트림 구현 (/api/agents/sessions/{id}/stream)
- [x] 실행 로그 이벤트 (task_start, task_complete, error, etc.)
- [x] LLM 응답 스트리밍
- [x] 연결 끊김 처리

## Phase 4: MCP 도구 확장

### 4.1 새 MCP 도구 정의
- [x] zyflow_execute_change 도구 스키마 정의
- [x] zyflow_get_agent_status 도구 스키마 정의
- [x] zyflow_stop_agent 도구 스키마 정의
- [x] zyflow_resume_agent 도구 스키마 정의

### 4.2 MCP 핸들러 구현
- [x] Python FastAPI 호출 브릿지 (fetch 또는 axios)
- [x] execute_change 핸들러 - 세션 생성 및 실행 시작
- [x] get_agent_status 핸들러 - 상태 조회
- [x] stop_agent 핸들러 - 실행 중단
- [x] resume_agent 핸들러 - 체크포인트에서 재개

### 4.3 도구 테스트
- [x] Claude Code에서 새 MCP 도구 테스트
- [x] 에러 케이스 처리 확인
- [x] 타임아웃 처리

## Phase 5: Multi-CLI 지원

### 5.1 CLI 어댑터 아키텍처
- [x] CLI 설정 스키마 정의 (name, command, args, mcp_flag)
- [x] CLIAdapter 인터페이스 설계
- [x] 기본 CLI 프로필 추가 (claude, gemini, qwen, kilo, opencode)
- [x] CLI 프로필 저장/로드 로직

### 5.2 CLI 프로세스 관리
- [x] CLI 프로세스 스폰 (child_process)
- [x] stdin/stdout/stderr 스트리밍
- [x] MCP 서버 연결 전달 (--mcp-config 또는 환경변수)
- [x] 프로세스 종료 및 정리

### 5.3 CLI 선택 UI
- [x] CLI 선택 드롭다운 컴포넌트
- [x] 커스텀 CLI 등록 다이얼로그
- [x] CLI별 설정 (모델 선택, 추가 옵션)
- [x] 기본 CLI 설정 저장 (localStorage)

### 5.4 CLI별 통합 테스트
- [x] Claude Code 통합 테스트
- [x] Gemini CLI 통합 테스트 (설치된 경우)
- [x] Qwen Code CLI 통합 테스트 (설치된 경우)
- [x] Kilo Code CLI 통합 테스트 (설치된 경우)

## Phase 6: UI 통합

### 6.1 Agent 페이지 라우팅
- [x] /agent 라우트 추가 (App.tsx)
- [x] FlowSidebar에 Agent 메뉴 추가
- [x] 네비게이션 상태 관리

### 6.2 Agent 채팅 컴포넌트
- [x] AgentChat.tsx 작성 - 메시지 입력/표시
- [x] useAgentChat 훅 - SSE 스트림 연결
- [x] 메시지 타입별 렌더링 (user, agent, system, error)
- [x] 마크다운 렌더링 지원

### 6.3 Agent 사이드바
- [x] AgentSidebar.tsx 작성
- [x] Todo 리스트 뷰 (상태별 그룹화)
- [x] 파일 리스트 뷰 (에이전트가 생성/수정한 파일)
- [x] OpenSpec 컨텍스트 요약 표시

### 6.4 파일 뷰어
- [x] FileViewer.tsx 작성 (또는 기존 SpecContent 확장)
- [x] 구문 강조 (react-syntax-highlighter 또는 기존 라이브러리)
- [x] 파일 복사/다운로드 기능
- [x] 마크다운 파일 렌더링

### 6.5 실행 제어 UI
- [x] 실행 시작 버튼 (변경 선택 후)
- [x] 중단/재개 버튼
- [x] 진행률 표시 (PipelineBar 연동 또는 별도)
- [x] 실행 로그 뷰어

### 6.6 상태 연동
- [x] useAgentSession 훅 - 세션 상태 관리
- [x] WebSocket 실시간 업데이트 연동
- [x] 에러 상태 토스트 알림
- [x] 완료 상태 알림

## Phase 7: 통합 테스트 및 문서화

### 7.1 E2E 테스트
- [x] AgentPage.test.tsx - UI 컴포넌트 테스트 (7개)
- [x] useAgentSession.test.ts - 훅 테스트 (9개)
- [x] scrollIntoView mock 추가로 테스트 오류 수정
- [x] 전체 워크플로우 E2E 테스트 (선택 - Playwright)
- [x] 동시 세션 제한 테스트 (선택)

### 7.2 문서화
- [x] README 업데이트 - 새 기능 설명
- [x] CLAUDE.md 업데이트 - 새 MCP 도구 설명
- [x] py-agents/README.md 작성 - Python 모듈 사용법
- [x] 아키텍처 다이어그램 추가
- [x] CLI 설정 가이드 작성

### 7.3 정리
- [x] 불필요한 코드 정리 (Agent 관련 lint 오류 수정)
- [x] 로깅 레벨 조정
- [x] 성능 프로파일링 (선택)
- [x] 토큰 사용량 추적 구현 (선택)
