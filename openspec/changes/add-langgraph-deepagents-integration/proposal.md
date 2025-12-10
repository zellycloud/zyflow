# Change: LangGraph + DeepAgents 통합

## Why

ZyFlow의 OpenSpec 기반 변경 관리에 AI 에이전트 오케스트레이션 기능을 추가하여:
- OpenSpec 태스크를 자동으로 실행하는 에이전트 워크플로우 구현
- 상태 관리, 체크포인트, 서브에이전트 위임 등 고급 에이전트 패턴 활용
- LLM Agnostic 아키텍처로 Claude, GPT, Gemini 등 다양한 모델 지원

## What Changes

### Phase 1: Python 환경 구축
- Python 프로젝트 구조 추가 (`py-agents/`)
- FastAPI 브릿지 서버 구현
- ZyFlow MCP 서버와 Python 간 통신 레이어

### Phase 2: LangGraph 기본 통합
- OpenSpec tasks.md → LangGraph StateGraph 변환
- SqliteSaver 기반 로컬 체크포인트
- 태스크 완료 시 ZyFlow 동기화

### Phase 3: DeepAgents 통합
- OpenSpec 문서를 DeepAgents 컨텍스트로 주입
- 커스텀 OpenSpecMiddleware 구현
- 서브에이전트를 통한 태스크 분할 실행

### Phase 4: MCP 도구 확장
- 에이전트 제어용 MCP 도구 (execute, status, stop, resume)
- Python FastAPI 호출 브릿지

### Phase 5: Multi-CLI 지원
- 다양한 CLI 에이전트 지원 (Claude Code, Gemini CLI, Qwen CLI, Kilo Code, OpenCode)
- CLI 어댑터 아키텍처 및 프로세스 관리
- CLI 선택 UI 및 커스텀 CLI 등록

### Phase 6: UI 통합
- Deep Agents UI 컴포넌트를 ZyFlow에 포팅
- 채팅 인터페이스, 파일 뷰어, Todo 뷰 통합
- 실행 로그 및 상태 시각화

## Impact

- Affected specs: 신규 `agent-orchestration` capability 추가
- Affected code:
  - `py-agents/` (신규 Python 모듈)
  - `mcp-server/index.ts` (새 MCP 도구 추가)
  - `server/` (FastAPI 프록시 엔드포인트)
  - `src/components/` (Agent UI 컴포넌트)
- Dependencies: `langgraph`, `deepagents`, `fastapi`, `langchain-anthropic`

## Constraints

- **유료 서비스 회피**: LangSmith, LangGraph Platform 사용 금지
- **로컬 실행 전용**: 모든 에이전트 실행은 로컬에서 수행
- **MIT 라이선스 준수**: 오픈소스 컴포넌트만 사용

## Success Criteria

1. OpenSpec change를 선택하면 LangGraph 에이전트가 자동 실행
2. 각 태스크 완료 시 tasks.md가 자동 업데이트
3. 에이전트 실행 중 중단/재개 가능 (체크포인트)
4. UI에서 실시간 진행 상황 모니터링 가능
5. Claude Code, Gemini CLI, Qwen CLI 등 다양한 CLI 에이전트 선택 가능
