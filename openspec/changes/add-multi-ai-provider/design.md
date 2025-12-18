# 멀티 AI Provider 설계

## 시스템 아키텍처

### 컴포넌트 다이어그램

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

## 데이터 흐름

### 실행 요청 흐름

```
User clicks "실행"
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

#### POST /api/ai/execute

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

### 4. useClaude 하위 호환

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

### 5. TaskExecutionDialog 수정

```typescript
// Provider 옵션 (cli-settings.json 기반)
const [providers, setProviders] = useState<AIProviderConfig[]>([])
const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude')
const [selectedModel, setSelectedModel] = useState<string>('sonnet')

// 초기 로드
useEffect(() => {
  fetch('/api/ai/providers')
    .then(res => res.json())
    .then(data => {
      setProviders(data.providers.filter(p => p.enabled && p.available))
    })
}, [])

// Provider 변경 시 기본 모델 설정
useEffect(() => {
  const provider = providers.find(p => p.id === selectedProvider)
  if (provider) {
    setSelectedModel(provider.selectedModel || provider.availableModels[0])
  }
}, [selectedProvider, providers])
```

## 파일 구조

```
src/
├── hooks/
│   ├── useAI.ts              # 새로 생성 (핵심 훅)
│   └── useClaude.ts          # 수정 (useAI 래퍼)
├── types/
│   └── ai.ts                 # 새로 생성 (AI 타입)
├── components/
│   └── flow/
│       └── TaskExecutionDialog.tsx  # 수정 (Provider 선택 UI)

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
- [ ] useClaude 하위 호환성
- [ ] buildArgs - Provider별 인자 생성
- [ ] Provider 설정 로드/병합

### 통합 테스트
- [ ] /api/ai/execute - Claude 실행
- [ ] /api/ai/execute - Gemini 실행
- [ ] /api/ai/providers - 목록 조회
- [ ] SSE 스트리밍 - 실시간 로그

### E2E 테스트
- [ ] UI에서 Provider 선택 → 실행 → 완료
- [ ] 미설치 CLI 비활성화 표시
