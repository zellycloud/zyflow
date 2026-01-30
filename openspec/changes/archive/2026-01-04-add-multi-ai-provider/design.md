# 멀티 AI Provider 설계 (Option 1: 실행 모드 분리)

## 시스템 아키텍처

### 전체 컴포넌트 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    TaskExecutionDialog                           │    │
│  │  ┌─────────────────────┐    ┌─────────────────────┐             │    │
│  │  │  ⚡ 단일 실행        │    │  🐝 Swarm 실행       │             │    │
│  │  │  (빠르고 저렴)      │    │  (멀티에이전트)      │             │    │
│  │  └──────────┬──────────┘    └──────────┬──────────┘             │    │
│  │             │                          │                        │    │
│  │             ▼                          ▼                        │    │
│  │  Provider/Model 선택         Strategy/MaxAgents 설정            │    │
│  └─────────────┬────────────────────────────┬──────────────────────┘    │
│                │                            │                           │
│                ▼                            ▼                           │
│  ┌──────────────────┐          ┌──────────────────┐                    │
│  │     useAI        │          │    useSwarm      │                    │
│  │   (새 훅)        │          │  (리네임)        │                    │
│  └────────┬─────────┘          └────────┬─────────┘                    │
│           │                             │                              │
│  ┌────────┴─────────┐                   │                              │
│  │   useClaude      │                   │                              │
│  │ (하위 호환 래퍼) │                   │                              │
│  └──────────────────┘                   │                              │
│           │                             │                              │
└───────────┼─────────────────────────────┼──────────────────────────────┘
            │                             │
            │ POST /api/ai/execute        │ POST /api/claude-flow/*
            │                             │
┌───────────┼─────────────────────────────┼──────────────────────────────┐
│           ▼                             ▼            Backend (Express) │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────┐      ┌──────────────────────┐                │
│  │ /api/ai/*            │      │ /api/claude-flow/*   │                │
│  │                      │      │                      │                │
│  │ - execute            │      │ - execute            │                │
│  │ - stop/:runId        │      │ - status/:runId      │                │
│  │ - providers          │      │ - stop/:runId        │                │
│  └──────────┬───────────┘      └──────────┬───────────┘                │
│             │                             │                            │
│             ▼                             ▼                            │
│  ┌──────────────────────┐      ┌──────────────────────┐                │
│  │ CLIProcessManager    │      │ ClaudeFlowExecutor   │                │
│  │ (기존 확장)          │      │ (기존)               │                │
│  └──────────┬───────────┘      └──────────┬───────────┘                │
│             │                             │                            │
│             ▼                             ▼                            │
│  claude | gemini | codex         npx claude-flow@alpha swarm           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 단일 실행 흐름 (useAI)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │ TaskExecution    │     │ useAI Hook       │                  │
│  │ Dialog           │────▶│                  │                  │
│  │                  │     │ - provider       │                  │
│  │ - Provider 선택  │     │ - model          │                  │
│  │ - Model 선택     │     │ - execute()      │                  │
│  │ - 실행 로그      │     │ - stop()         │                  │
│  └──────────────────┘     └────────┬─────────┘                  │
│                                    │                             │
│  ┌──────────────────┐              │ POST /api/ai/execute       │
│  │ useClaude        │◀─ wrapper ───┤                             │
│  │ (하위 호환)      │              │                             │
│  └──────────────────┘              │                             │
│                                    ▼                             │
└────────────────────────────────────┼─────────────────────────────┘
                                     │
┌────────────────────────────────────┼─────────────────────────────┐
│                        Backend (Express)                         │
├────────────────────────────────────┼─────────────────────────────┤
│                                    ▼                             │
│  ┌──────────────────────────────────────────────────┐           │
│  │ /api/ai/execute                                   │           │
│  │                                                   │           │
│  │ 1. provider, model 파라미터 검증                 │           │
│  │ 2. CLIProcessManager.start() 호출               │           │
│  │ 3. SSE 스트리밍 설정                             │           │
│  └─────────────────────┬────────────────────────────┘           │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────┐           │
│  │ CLIProcessManager (기존)                         │           │
│  │                                                   │           │
│  │ - getProfile(provider)                           │           │
│  │ - buildArgs(profile, prompt, model)              │           │
│  │ - spawn(profile.command, args)                   │           │
│  │ - setupProcessHandlers()                         │           │
│  └─────────────────────┬────────────────────────────┘           │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────┐           │
│  │ CLI Profiles (types.ts)                          │           │
│  │                                                   │           │
│  │ claude  → claude -p "prompt" --model opus        │           │
│  │ gemini  → gemini --prompt "prompt"               │           │
│  │ codex   → codex write --task "prompt"            │           │
│  │ qwen    → qwen --prompt "prompt"                 │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Swarm 실행 흐름 (useSwarm)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │ TaskExecution    │     │ useSwarm Hook    │                  │
│  │ Dialog           │────▶│ (리네임)         │                  │
│  │                  │     │                  │                  │
│  │ - Strategy 선택  │     │ - strategy       │                  │
│  │ - MaxAgents 설정 │     │ - maxAgents      │                  │
│  │ - Swarm 로그     │     │ - execute()      │                  │
│  └──────────────────┘     │ - stop()         │                  │
│                           └────────┬─────────┘                  │
│                                    │                             │
│                                    │ POST /api/claude-flow/*    │
│                                    ▼                             │
└────────────────────────────────────┼─────────────────────────────┘
                                     │
┌────────────────────────────────────┼─────────────────────────────┐
│                        Backend (Express)                         │
├────────────────────────────────────┼─────────────────────────────┤
│                                    ▼                             │
│  ┌──────────────────────────────────────────────────┐           │
│  │ /api/claude-flow/execute                          │           │
│  │                                                   │           │
│  │ 1. strategy, maxAgents 파라미터 검증            │           │
│  │ 2. ClaudeFlowExecutor 호출                       │           │
│  │ 3. SSE 스트리밍 설정                             │           │
│  └─────────────────────┬────────────────────────────┘           │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────┐           │
│  │ npx claude-flow@alpha swarm "{prompt}"           │           │
│  │                                                   │           │
│  │ --strategy development                           │           │
│  │ --max-agents 5                                   │           │
│  │ --claude                                         │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 데이터 흐름

### 단일 실행 요청 흐름

```
User clicks "단일 실행"
       │
       ▼
TaskExecutionDialog
       │ { provider: 'gemini', model: 'gemini-2.5-pro', ... }
       ▼
useAI.execute()
       │ POST /api/ai/execute
       ▼
Express Router
       │ req.body 검증
       ▼
CLIProcessManager.start({
  profileId: 'gemini',
  model: 'gemini-2.5-pro',
  initialPrompt: buildPrompt(changeId, taskId)
})
       │
       ▼
spawn('gemini', ['--prompt', prompt])
       │
       ├─▶ stdout ──▶ SSE 'output' ──▶ UI 로그 표시
       │
       ├─▶ stderr ──▶ SSE 'error' ──▶ UI 에러 표시
       │
       └─▶ close ──▶ SSE 'complete' ──▶ UI 완료 상태
```

### Swarm 실행 요청 흐름

```
User clicks "Swarm 실행"
       │
       ▼
TaskExecutionDialog
       │ { strategy: 'development', maxAgents: 5, ... }
       ▼
useSwarm.execute()
       │ POST /api/claude-flow/execute
       ▼
Express Router
       │ req.body 검증
       ▼
ClaudeFlowExecutor.start({
  changeId: 'add-auth',
  mode: 'full',
  strategy: 'development',
  maxAgents: 5
})
       │
       ▼
spawn('npx', ['claude-flow@alpha', 'swarm', prompt, ...args])
       │
       ├─▶ stream-json ──▶ SSE 'progress' ──▶ UI 진행 상황
       │
       ├─▶ agent logs ──▶ SSE 'agent' ──▶ UI 에이전트 로그
       │
       └─▶ close ──▶ SSE 'complete' ──▶ UI 완료 상태
```

### 설정 로드 흐름

```
App 시작
    │
    ▼
loadCLISettings()
    │ 읽기: .zyflow/cli-settings.json
    ▼
병합: DEFAULT_CLI_PROFILES + user settings
    │
    ▼
checkAvailability()
    │ 각 CLI: which claude, which gemini, ...
    ▼
UI에 활성화된 Provider만 표시
```

## 상세 설계

### 1. API 엔드포인트

#### POST /api/ai/execute (단일 실행)

**Request:**
```typescript
interface AIExecuteRequest {
  provider: AIProvider      // 'claude' | 'gemini' | 'codex' | ...
  model?: string            // 'sonnet' | 'gemini-2.5-pro' | ...
  changeId: string
  taskId: string
  taskTitle: string
  context?: string          // 추가 컨텍스트
}
```

**Response:** SSE Stream
```
data: {"type":"start","provider":"gemini","model":"gemini-2.5-pro"}

data: {"type":"output","content":"분석을 시작합니다..."}

data: {"type":"output","content":"파일을 수정합니다..."}

data: {"type":"complete","status":"completed","exitCode":0}
```

#### POST /api/claude-flow/execute (Swarm 실행)

**Request:**
```typescript
interface SwarmExecuteRequest {
  changeId: string
  taskId?: string           // 특정 태스크만 실행
  mode: 'full' | 'single' | 'analysis'
  strategy: 'development' | 'research' | 'testing'
  maxAgents: number         // 1-10
}
```

**Response:** SSE Stream
```
data: {"type":"start","strategy":"development","maxAgents":5}

data: {"type":"agent","name":"researcher","status":"working","message":"문서 분석 중..."}

data: {"type":"progress","phase":"implementation","progress":45}

data: {"type":"complete","status":"completed","summary":"3개 파일 수정됨"}
```

#### GET /api/ai/providers

**Response:**
```typescript
interface ProvidersResponse {
  providers: Array<{
    id: AIProvider
    name: string
    icon: string
    enabled: boolean
    available: boolean      // CLI 설치 여부
    selectedModel: string
    availableModels: string[]
  }>
}
```

### 2. CLI Adapter 확장

#### buildArgs 수정 (process-manager.ts)

```typescript
private buildArgs(
  profile: CLIProfile,
  changeId: string,
  initialPrompt?: string,
  model?: string,          // 추가
  extraArgs?: string[]
): string[] {
  const args = [...profile.args]

  // 모델 지정 (CLI별로 다름)
  if (model) {
    switch (profile.type) {
      case 'claude':
        args.push('--model', model)  // claude --model opus
        break
      case 'gemini':
        args.push('--model', model)  // gemini --model gemini-2.5-pro
        break
      case 'codex':
        args.push('--model', model)  // codex --model gpt-5-codex
        break
    }
  }

  // 프롬프트 전달
  if (initialPrompt) {
    switch (profile.type) {
      case 'claude':
        args.push('-p', initialPrompt)
        break
      case 'gemini':
        args.push('--prompt', initialPrompt)
        break
      case 'codex':
        args.push('write', '--task', initialPrompt)
        break
      case 'qwen':
        args.push('--prompt', initialPrompt)
        break
    }
  }

  return args
}
```

### 3. useAI 훅

```typescript
// src/hooks/useAI.ts

export type AIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode'

export interface AIExecution {
  runId: string | null
  provider: AIProvider | null
  model: string | null
  status: 'idle' | 'running' | 'completed' | 'error'
  messages: AIMessage[]
  error: string | null
}

export interface AIMessage {
  type: 'start' | 'output' | 'error' | 'complete'
  provider?: AIProvider
  model?: string
  content?: string
  status?: 'completed' | 'error'
  exitCode?: number
  timestamp: string
}

export function useAI() {
  const [execution, setExecution] = useState<AIExecution>({
    runId: null,
    provider: null,
    model: null,
    status: 'idle',
    messages: [],
    error: null,
  })

  const execute = useCallback(async (params: {
    provider: AIProvider
    model?: string
    changeId: string
    taskId: string
    taskTitle: string
    context?: string
  }) => {
    // ... SSE 스트리밍 로직
    const response = await fetch('/api/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    // ... 스트림 처리
  }, [])

  const stop = useCallback(async () => {
    // POST /api/ai/stop/{runId}
  }, [execution.runId])

  return { execution, execute, stop, reset }
}
```

### 4. useSwarm 훅

```typescript
// src/hooks/useSwarm.ts (useClaudeFlowExecution 리네임)

export type SwarmStrategy = 'development' | 'research' | 'testing'

export interface SwarmExecution {
  runId: string | null
  strategy: SwarmStrategy | null
  maxAgents: number
  status: 'idle' | 'running' | 'completed' | 'error'
  agents: SwarmAgent[]
  progress: number
  logs: SwarmLog[]
  error: string | null
}

export interface SwarmAgent {
  name: string
  type: 'researcher' | 'coder' | 'tester' | 'reviewer'
  status: 'idle' | 'working' | 'done'
  currentTask?: string
}

export function useSwarm() {
  const [execution, setExecution] = useState<SwarmExecution>({
    runId: null,
    strategy: null,
    maxAgents: 5,
    status: 'idle',
    agents: [],
    progress: 0,
    logs: [],
    error: null,
  })

  const execute = useCallback(async (params: {
    changeId: string
    taskId?: string
    mode: 'full' | 'single' | 'analysis'
    strategy: SwarmStrategy
    maxAgents: number
  }) => {
    // POST /api/claude-flow/execute
    // SSE 스트리밍 처리
  }, [])

  return { execution, execute, stop, reset }
}
```

### 5. useClaude 하위 호환

```typescript
// src/hooks/useClaude.ts (수정)

import { useAI, type AIProvider } from './useAI'

// 기존 타입 유지
export type ClaudeModel = 'haiku' | 'sonnet' | 'opus'

// useAI 래퍼로 변경
export function useClaude() {
  const ai = useAI()

  const execute = useCallback(async (params: {
    changeId: string
    taskId: string
    taskTitle: string
    context?: string
    model?: ClaudeModel
  }) => {
    return ai.execute({
      provider: 'claude',
      model: params.model || 'sonnet',
      ...params,
    })
  }, [ai])

  // 기존 인터페이스 유지
  return {
    execution: {
      ...ai.execution,
      // 하위 호환을 위한 매핑
      runId: ai.execution.runId,
      status: ai.execution.status,
      messages: ai.execution.messages,
      error: ai.execution.error,
    },
    execute,
    stop: ai.stop,
    reset: ai.reset,
  }
}
```

### 6. TaskExecutionDialog 수정

```typescript
// 실행 모드 상태
const [executionMode, setExecutionMode] = useState<'single' | 'swarm'>('single')

// 단일 실행 상태
const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude')
const [selectedModel, setSelectedModel] = useState<string>('sonnet')

// Swarm 실행 상태
const [strategy, setStrategy] = useState<SwarmStrategy>('development')
const [maxAgents, setMaxAgents] = useState<number>(5)

// Provider 옵션 (cli-settings.json 기반)
const [providers, setProviders] = useState<AIProviderConfig[]>([])

// 초기 로드
useEffect(() => {
  fetch('/api/ai/providers')
    .then(res => res.json())
    .then(data => {
      setProviders(data.providers.filter(p => p.enabled && p.available))
    })
}, [])

// 실행 핸들러
const handleExecute = () => {
  if (executionMode === 'single') {
    executeAI({
      provider: selectedProvider,
      model: selectedModel,
      changeId,
      taskId,
      taskTitle,
    })
  } else {
    executeSwarm({
      changeId,
      taskId,
      mode: 'single',
      strategy,
      maxAgents,
    })
  }
}
```

## 파일 구조

```
src/
├── hooks/
│   ├── useAI.ts              # 새로 생성 (핵심 훅)
│   ├── useSwarm.ts           # 새로 생성 (useClaudeFlowExecution 리네임)
│   └── useClaude.ts          # 수정 (useAI 래퍼)
├── types/
│   └── ai.ts                 # 새로 생성 (AI 타입)
├── components/
│   └── flow/
│       └── TaskExecutionDialog.tsx  # 수정 (실행 모드 탭)

server/
├── app.ts                    # 수정 (라우터 등록)
├── ai/                       # 새로 생성
│   ├── index.ts              # API 라우터
│   └── executor.ts           # 실행 로직
└── cli-adapter/
    ├── types.ts              # 수정 (model 파라미터)
    └── process-manager.ts    # 수정 (model 처리)
```

## 설정 파일

### .zyflow/cli-settings.json (기존 형식 유지)

```json
{
  "claude": {
    "enabled": true,
    "selectedModel": "sonnet",
    "order": 0
  },
  "gemini": {
    "enabled": true,
    "selectedModel": "gemini-2.5-pro",
    "order": 1
  },
  "codex": {
    "enabled": true,
    "selectedModel": "gpt-5.1-codex",
    "order": 2
  },
  "qwen": {
    "enabled": false,
    "selectedModel": "qwen-coder-plus",
    "order": 3
  }
}
```

## 테스트 계획

### 단위 테스트
- [ ] useAI 훅 - execute, stop, reset
- [ ] useSwarm 훅 - execute, stop, reset
- [ ] useClaude 하위 호환성
- [ ] buildArgs - Provider별 인자 생성
- [ ] Provider 설정 로드/병합

### 통합 테스트
- [ ] /api/ai/execute - Claude 실행
- [ ] /api/ai/execute - Gemini 실행
- [ ] /api/claude-flow/execute - Swarm 실행
- [ ] /api/ai/providers - 목록 조회
- [ ] SSE 스트리밍 - 실시간 로그

### E2E 테스트
- [ ] UI에서 실행 모드 탭 전환
- [ ] 단일 모드: Provider 선택 → 실행 → 완료
- [ ] Swarm 모드: Strategy 선택 → 실행 → 완료
- [ ] 미설치 CLI 비활성화 표시
