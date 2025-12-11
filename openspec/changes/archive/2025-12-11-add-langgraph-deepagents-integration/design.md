# Design: LangGraph + DeepAgents 통합

## Context

ZyFlow는 현재 TypeScript 기반 MCP 서버로 OpenSpec 변경 관리를 지원합니다.
LangGraph와 DeepAgents는 Python 생태계로, AI 에이전트 오케스트레이션에 특화되어 있습니다.
두 시스템을 통합하여 OpenSpec 태스크를 자동 실행하는 에이전트 워크플로우를 구현합니다.

### Stakeholders
- 개발자: OpenSpec 태스크 자동 실행
- AI 에이전트: 컨텍스트 인식 작업 수행
- ZyFlow 시스템: 상태 동기화 및 모니터링

## Goals / Non-Goals

### Goals
- OpenSpec 문서를 에이전트 컨텍스트로 활용
- LangGraph StateGraph로 태스크 워크플로우 실행
- 로컬 체크포인트로 실행 상태 영구 저장
- ZyFlow UI에서 에이전트 상호작용

### Non-Goals
- LangSmith 클라우드 모니터링 연동
- LangGraph Platform 클라우드 배포
- 실시간 협업 기능 (단일 사용자 우선)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ZyFlow + LangGraph                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [ZyFlow React UI]                                          │
│       │                                                     │
│       ▼                                                     │
│  [Express API Server]                                       │
│       │                                                     │
│       ├──────────────────┬──────────────────┐              │
│       ▼                  ▼                  ▼              │
│  [MCP Server]      [FastAPI Bridge]    [WebSocket]         │
│  (TypeScript)      (Python)            (실시간 업데이트)    │
│       │                  │                                  │
│       │                  ▼                                  │
│       │           ┌─────────────────────────┐              │
│       │           │      LangGraph          │              │
│       │           │  ┌─────────────────┐   │              │
│       │           │  │   StateGraph    │   │              │
│       │           │  │  ┌───┐ ┌───┐   │   │              │
│       │           │  │  │T1 │→│T2 │→...│   │              │
│       │           │  │  └───┘ └───┘   │   │              │
│       │           │  └─────────────────┘   │              │
│       │           │         │              │              │
│       │           │         ▼              │              │
│       │           │  ┌─────────────────┐   │              │
│       │           │  │  DeepAgent      │   │              │
│       │           │  │  - TodoList     │   │              │
│       │           │  │  - Filesystem   │   │              │
│       │           │  │  - SubAgents    │   │              │
│       │           │  │  - OpenSpec MW  │   │              │
│       │           │  └─────────────────┘   │              │
│       │           └─────────────────────────┘              │
│       │                  │                                  │
│       │                  ▼                                  │
│       │           [SqliteSaver]                             │
│       │           (체크포인트)                               │
│       │                  │                                  │
│       ▼                  ▼                                  │
│  [OpenSpec Files]  [Agent State DB]                        │
│  tasks.md 업데이트   상태 영구 저장                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Decisions

### 1. Python 브릿지 방식: FastAPI HTTP 서버

**선택**: FastAPI를 별도 프로세스로 실행, HTTP로 통신

**대안 고려**:
- subprocess 직접 호출: 매 호출마다 Python 시작 오버헤드
- gRPC: 설정 복잡, 이 규모에서 과도함
- 임베디드 Python (PyO3): Rust 필요, 복잡도 증가

**근거**: FastAPI는 가볍고 비동기 지원, 개발 편의성 높음

### 2. 상태 저장: SqliteSaver (LangGraph 내장)

**선택**: LangGraph의 SqliteSaver로 체크포인트 저장

**대안 고려**:
- Redis: 외부 의존성 추가
- PostgreSQL: 과도한 설정
- 메모리만: 재시작 시 손실

**근거**: 이미 ZyFlow가 SQLite 사용 중, 추가 의존성 없음

### 3. OpenSpec 연동: 커스텀 미들웨어

**선택**: DeepAgents의 미들웨어 패턴으로 OpenSpecMiddleware 구현

**구현**:
```python
class OpenSpecMiddleware(Middleware):
    def __init__(self, change_id: str, project_path: str):
        self.change_id = change_id
        self.project_path = project_path

    def get_system_prompt_addition(self) -> str:
        # proposal.md, design.md, spec.md 내용 주입
        pass

    def on_task_complete(self, task_id: str):
        # ZyFlow API 호출하여 tasks.md 업데이트
        pass
```

### 4. UI 통합: 컴포넌트 포팅

**선택**: Deep Agents UI의 React 컴포넌트를 ZyFlow에 직접 포팅

**대안 고려**:
- iframe 임베딩: 스타일 불일치, 통신 복잡
- 별도 앱: 사용자 경험 분리

**근거**: 동일 기술 스택 (React, TypeScript, Tailwind), 일관된 UX

## Directory Structure

```
zyflow/
├── py-agents/                    # Python 에이전트 모듈
│   ├── pyproject.toml
│   ├── src/
│   │   └── zyflow_agents/
│   │       ├── __init__.py
│   │       ├── server.py         # FastAPI 서버
│   │       ├── bridge.py         # MCP ↔ Python 브릿지
│   │       ├── graph.py          # LangGraph StateGraph 빌더
│   │       ├── agent.py          # DeepAgent 팩토리
│   │       └── middleware/
│   │           ├── __init__.py
│   │           └── openspec.py   # OpenSpec 미들웨어
│   └── tests/
│       ├── test_graph.py
│       └── test_middleware.py
├── mcp-server/
│   └── index.ts                  # 새 MCP 도구 추가
├── server/
│   └── agents/                   # FastAPI 프록시 라우트
│       └── routes.ts
└── src/
    └── components/
        └── agent/                # Agent UI 컴포넌트
            ├── AgentChat.tsx
            ├── AgentSidebar.tsx
            ├── FileViewer.tsx
            └── ExecutionLog.tsx
```

## API Design

### FastAPI Endpoints

```
POST /api/agents/execute
  body: { change_id, model?, options? }
  response: { session_id, status }

GET /api/agents/sessions/{session_id}
  response: { status, progress, current_task, logs }

POST /api/agents/sessions/{session_id}/stop
  response: { status }

POST /api/agents/sessions/{session_id}/resume
  response: { status }

GET /api/agents/sessions/{session_id}/stream
  response: SSE stream of execution events
```

### New MCP Tools

```
zyflow_execute_change
  - changeId: string
  - model?: string (default: claude-sonnet-4-20250514)
  - options?: { stopOnError, humanApproval }

zyflow_get_agent_status
  - sessionId: string

zyflow_stop_agent
  - sessionId: string

zyflow_resume_agent
  - sessionId: string
  - fromCheckpoint?: string
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Python/Node 프로세스 관리 복잡 | 중간 | npm 스크립트로 동시 실행 관리 |
| LangGraph API 변경 | 낮음 | 버전 고정, 추상화 레이어 |
| 토큰 비용 증가 | 중간 | Haiku 우선 사용, 캐싱 적용 |
| 디버깅 어려움 (두 언어) | 중간 | 상세 로깅, 에러 전파 체계화 |

## Migration Plan

1. **Phase 1**: Python 환경만 추가, 기존 기능 영향 없음
2. **Phase 2**: 새 MCP 도구 추가, 기존 도구 유지
3. **Phase 3**: UI에 새 탭 추가, 기존 UI 영향 없음
4. **Rollback**: py-agents/ 폴더와 관련 라우트만 제거하면 원복

## Open Questions

1. ~~LangSmith 없이 디버깅 충분한가?~~ → 자체 로깅으로 해결
2. 동시 실행 세션 제한? → MVP는 프로젝트당 1개로 제한
3. 토큰 사용량 추적 방법? → 자체 카운터 구현
