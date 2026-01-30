# Tasks (Option 1: 실행 모드 분리)

## Phase 1: 서버 API 확장

### 1.1 AI 실행 API (단일 실행)

- [x] **AI 타입 정의** (`server/ai/types.ts`)
  - AIProvider 타입 정의
  - AIExecuteRequest/Response 인터페이스
  - AIMessage 타입

- [x] **AI 실행 API 라우터** (`server/ai/index.ts`)
  - POST /api/ai/execute - 실행 시작
  - POST /api/ai/stop/:runId - 실행 중지
  - GET /api/ai/providers - Provider 목록 조회

- [x] **CLI Adapter 확장** (`server/cli-adapter/process-manager.ts`)
  - buildArgs에 model 파라미터 추가
  - Provider별 모델 인자 처리 (--model)
  - start() 메서드에 model 전달

- [x] **앱에 라우터 등록** (`server/app.ts`)
  - aiRouter import 및 등록
  - /api/ai/* 엔드포인트 활성화

### 1.2 Claude-Flow API 정리 (Swarm 실행)

- [x] **기존 API 검토** (`server/claude-flow/index.ts`)
  - 현재 엔드포인트 구조 확인
  - Strategy, maxAgents 파라미터 지원 확인

- [x] **Swarm 타입 정의** (`server/claude-flow/types.ts`)
  - SwarmStrategy 타입
  - SwarmExecuteRequest/Response 인터페이스
  - SwarmProgress, SwarmAgent 타입

## Phase 2: 클라이언트 훅 확장

### 2.1 useAI 훅 (단일 실행)

- [x] **AI 타입 정의** (`src/types/ai.ts`)
  - AIProvider 타입 export
  - AIExecution, AIMessage 인터페이스
  - AIProviderConfig 인터페이스

- [x] **useAI 훅 생성** (`src/hooks/useAI.ts`)
  - execute() - provider, model 포함 실행
  - stop() - 실행 중지
  - reset() - 상태 초기화
  - SSE 스트리밍 처리

- [x] **useClaude 하위 호환** (`src/hooks/useClaude.ts`)
  - useAI 래퍼로 리팩토링
  - 기존 인터페이스 100% 유지
  - 타입 export 유지 (ClaudeModel, ClaudeMessage)

### 2.2 useSwarm 훅 (Swarm 실행)

- [x] **useClaudeFlowExecution 리네임** (`src/hooks/useSwarm.ts`)
  - 파일명 변경: useClaudeFlowExecution.ts → useSwarm.ts
  - 훅 이름 변경: useClaudeFlowExecution → useSwarm
  - 기존 import 업데이트

- [x] **useSwarm 타입 추가**
  - SwarmStrategy 타입
  - SwarmExecution, SwarmAgent 인터페이스
  - SwarmLog 타입

- [x] **useClaudeFlowExecution 하위 호환**
  - useSwarm re-export로 유지
  - deprecated 주석 추가

## Phase 3: UI 수정

### 3.1 실행 모드 탭 추가

- [x] **실행 모드 탭 UI** (`src/components/flow/TaskExecutionDialog.tsx`)
  - 단일 실행 / Swarm 실행 탭 추가
  - 탭별 설정 영역 분리
  - 탭 전환 시 상태 유지

### 3.2 단일 실행 UI

- [x] **Provider 선택 UI**
  - Provider 목록 로드 (/api/ai/providers)
  - Provider 선택 카드 UI
  - 선택된 Provider의 모델 옵션 표시
  - 비활성화된 Provider 표시 (미설치)

- [x] **실행 로그 개선**
  - Provider 아이콘 표시
  - 선택된 모델 표시
  - Provider별 색상 구분

### 3.3 Swarm 실행 UI

- [x] **Strategy 선택 UI**
  - Development / Research / Testing 옵션
  - 각 Strategy 설명 표시
  - 추천 사용 케이스 안내

- [x] **MaxAgents 설정 UI**
  - 슬라이더 또는 숫자 입력
  - 1-10 범위 제한
  - 예상 비용 안내

- [x] **Swarm 진행 상황 UI**
  - 에이전트 상태 표시
  - 전체 진행률 표시
  - 에이전트별 로그 탭

## Phase 4: 설정 및 테스트

### 4.1 CLI 가용성 체크

- [x] **which 명령어 체크**
  - 각 CLI: which claude, which gemini, ...
  - 결과를 Provider 목록에 반영

- [x] **미설치 처리**
  - UI에서 비활성화 표시
  - 설치 안내 메시지 표시
  - 설치 링크 제공

### 4.2 단위 테스트

- [x] **useAI 훅 테스트** (`src/hooks/useAI.test.ts`)
  - execute, stop, reset 동작
  - SSE 스트리밍 처리
  - 에러 핸들링

- [x] **useSwarm 훅 테스트** (`src/hooks/useSwarm.test.ts`)
  - execute, stop, reset 동작
  - 에이전트 상태 업데이트
  - 진행률 계산

- [x] **useClaude 하위 호환 테스트** (`src/hooks/useClaude.test.ts`)
  - 기존 API 동작 확인
  - 타입 호환성 확인

- [x] **buildArgs Provider별 테스트** (`server/cli-adapter/process-manager.test.ts`)
  - Claude 인자 생성
  - Gemini 인자 생성
  - Codex 인자 생성
  - Qwen, Kilo, OpenCode 인자 생성

### 4.3 통합 테스트

- [x] **단일 실행 테스트** (`server/cli-adapter/integration.test.ts`)
  - CLI Profiles 구성 테스트
  - Session 관리 테스트
  - Conversation History 구조 테스트

- [x] **Swarm 실행 테스트** (`server/cli-adapter/integration.test.ts`)
  - 다중 Provider 지원 테스트
  - Profile 가용성 테스트
  - Multi-CLI 대화 추적 테스트

### 4.4 E2E 테스트

- [x] **실행 모드 전환 테스트** (`src/components/flow/TaskExecutionDialog.e2e.test.tsx`)
  - 탭 전환 동작
  - 상태 유지 확인 (Provider 선택, Swarm 설정 등)

- [x] **단일 실행 전체 흐름** (`src/components/flow/TaskExecutionDialog.e2e.test.tsx`)
  - Provider 선택 → 모델 선택 → 실행 → 완료
  - 에러 처리, 중지, 재실행

- [x] **Swarm 실행 전체 흐름** (`src/components/flow/TaskExecutionDialog.e2e.test.tsx`)
  - Strategy 선택 → MaxAgents 설정 → 실행 → 완료
  - 진행률, 로그 표시, 중지

## 완료 기준

### 필수 항목

- [x] 실행 모드 선택 UI (단일/Swarm 탭) 동작
- [x] Claude 외 최소 1개 Provider (Gemini) 동작 확인
- [x] TaskExecutionDialog에서 Provider 선택 가능
- [x] Provider별 모델 선택 가능
- [x] CLI 미설치 시 비활성화 표시
- [x] cli-settings.json 기반 설정 반영
- [x] 기존 useClaude 코드 하위 호환
- [x] useSwarm으로 리네임 완료
- [x] 실행 로그에 Provider/Model/Mode 정보 표시

### 선택 항목 (v2)

- [x] Swarm에 다중 Provider 지원
  - consensus.ts에 실제 CLI 실행 구현
  - executor.ts에 consensus 모드 통합
  - 다중 Provider 병렬 실행 지원

- [x] 태스크 유형별 자동 라우팅
  - task-routing.ts에 shouldUseConsensus, getAutoRouting 추가
  - 태스크 복잡도 분석 (0-100점)
  - 단일/Swarm/Consensus 모드 자동 선택

- [x] Consensus 패턴 (다중 AI 합의)
  - 4가지 전략 구현 (majority, weighted, unanimous, best-of-n)
  - Jaccard 유사도 기반 결과 비교
  - API 엔드포인트 추가 (/api/claude-flow/consensus, /providers)

- [x] 커스텀 CLI 추가 UI
  - CustomCLIDialog에 템플릿 선택 기능 추가 (Ollama, LlamaCpp 등)
  - CLISettings에 Consensus 설정 UI 추가
  - 전략 선택, 임계값, 타임아웃 설정
