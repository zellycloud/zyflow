# 멀티 AI Provider 지원

## Summary

zyflow의 태스크 실행 시스템을 확장하여 Claude 외에 Gemini, Codex, Qwen 등 다중 AI Provider를 지원합니다. 기존 CLI Adapter 구조를 활용하여 충돌 없이 통합합니다.

## Motivation

### 현재 상황
- zyflow는 Claude Code CLI만 지원 (`/api/claude/execute`)
- `server/cli-adapter/`에 이미 6개 AI CLI 프로필 정의됨 (미사용)
- `.zyflow/cli-settings.json`에 Provider 설정 존재 (미연결)
- 모든 태스크가 Claude로만 실행되어 비용/성능 최적화 불가

### 목표
- 태스크 실행 시 AI Provider 선택 가능
- CLI Adapter의 기존 구조 활용 (충돌 방지)
- 태스크 유형별 자동 라우팅 (선택적)
- Provider별 모델 선택 지원

### 기대 효과
- **비용 절감**: 단순 태스크는 저렴한 모델 사용 (Gemini Flash, Haiku)
- **성능 최적화**: 대용량 컨텍스트는 Gemini Pro 활용 (100만 토큰)
- **유연성**: 태스크 특성에 맞는 AI 선택
- **확장성**: 새 AI CLI 추가 용이

## Scope

### In Scope
- TaskExecutionDialog에 Provider 선택 UI 추가
- useClaude 훅을 useAI 훅으로 확장 (하위 호환)
- 서버 API에 provider 파라미터 추가
- CLI Adapter와 useClaude 연결
- Provider별 모델 옵션 동적 로드
- cli-settings.json 기반 활성화/비활성화

### Out of Scope
- MCP Server 기반 통합 (문서 방식)
- 태스크 유형별 자동 라우팅 (v2)
- Consensus 패턴 - 다중 AI 합의 (v2)
- 커스텀 CLI 추가 UI

## Approach

### 아키텍처

#### 현재 구조 (Claude 전용)
```
TaskExecutionDialog → useClaude → /api/claude/execute → node-pty → claude -p
```

#### 목표 구조 (Multi-Provider)
```
TaskExecutionDialog
    │ provider + model 선택
    ▼
useAI (확장된 훅)
    │ POST /api/ai/execute
    │ { provider, model, changeId, taskId, ... }
    ▼
zyflow Server
    │ CLI Adapter 활용
    ▼
CLIProcessManager.start({
  profileId: 'gemini' | 'claude' | 'codex',
  model: 'gemini-2.5-pro' | 'sonnet' | 'gpt-5-codex'
})
    ▼
spawn(profile.command, args)
    │ claude -p | gemini --prompt | codex write
    ▼
SSE 스트리밍 → 클라이언트
```

### 구현 단계

#### Phase 1: API 확장 (서버)
1. `/api/ai/execute` 엔드포인트 생성 (또는 기존 확장)
2. CLI Adapter의 `CLIProcessManager` 활용
3. Provider별 프롬프트 형식 처리
4. SSE 스트리밍 통합

#### Phase 2: 훅 확장 (클라이언트)
1. `useAI` 훅 생성 (useClaude 확장)
2. Provider + Model 상태 관리
3. `/api/ai/execute` 호출

#### Phase 3: UI 수정
1. TaskExecutionDialog에 Provider 선택 추가
2. Provider별 모델 옵션 동적 표시
3. cli-settings.json 기반 활성/비활성 표시

### Provider별 CLI 명령어

| Provider | 명령어 | 프롬프트 전달 | 비고 |
|----------|--------|--------------|------|
| Claude | `claude` | `-p "prompt"` | 이미 구현됨 |
| Gemini | `gemini` | `--prompt "prompt"` | 100만 토큰 컨텍스트 |
| Codex | `codex` | `write --task "prompt"` | 코드 특화 |
| Qwen | `qwen` | stdin 또는 `--prompt` | 중국어 지원 |

### UI 디자인

```
┌─────────────────────────────────────────────┐
│ 태스크 실행                                  │
├─────────────────────────────────────────────┤
│                                             │
│  AI Provider 선택                           │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 🤖 Claude                     [✓]   │   │
│  │    Sonnet (권장)                    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 💎 Gemini                     [ ]   │   │
│  │    2.5 Pro (대용량 컨텍스트)        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 🧠 Codex                      [ ]   │   │
│  │    GPT-5.1 (코드 특화)             │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ── 모델 선택 (Claude) ──                   │
│                                             │
│  ○ Haiku   - 빠르고 저렴                   │
│  ● Sonnet  - 균형 잡힌 성능 (권장)         │
│  ○ Opus    - 최고 품질                     │
│                                             │
│           [ 실행 시작 ]                     │
│                                             │
└─────────────────────────────────────────────┘
```

### 타입 정의

```typescript
// src/types/ai.ts
export type AIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode'

export interface AIProviderConfig {
  id: AIProvider
  name: string
  icon: string
  enabled: boolean
  selectedModel: string
  availableModels: string[]
  order: number
}

export interface AIExecuteParams {
  provider: AIProvider
  model: string
  changeId: string
  taskId: string
  taskTitle: string
  context?: string
}
```

## Risks & Mitigations

| 리스크 | 완화 방안 |
|--------|----------|
| CLI 미설치 시 오류 | 실행 전 `which` 체크, 비활성 표시 |
| Provider별 출력 형식 차이 | 공통 파서 인터페이스 정의 |
| API 키 누락 | 환경변수 체크, 설정 안내 표시 |
| 기존 useClaude 호환성 | useClaude는 useAI wrapper로 유지 |
| node-pty vs spawn 혼용 | CLI Adapter의 spawn 방식으로 통일 |

## Dependencies

### 기존 코드 활용
- `server/cli-adapter/types.ts` - CLIProfile, CLIType 정의
- `server/cli-adapter/process-manager.ts` - CLIProcessManager
- `.zyflow/cli-settings.json` - Provider 설정
- `src/hooks/useClaude.ts` - 기존 실행 로직 참고

### 새로 필요한 것
- Provider별 CLI 설치 (선택적)
  - `npm install -g @anthropic/claude-code`
  - `npm install -g @google/gemini-cli`
  - `npm install -g @openai/codex`

## Success Criteria

- [ ] Claude 외 최소 1개 Provider (Gemini) 동작 확인
- [ ] TaskExecutionDialog에서 Provider 선택 가능
- [ ] Provider별 모델 선택 가능
- [ ] cli-settings.json 기반 활성/비활성 표시
- [ ] 기존 useClaude 코드 하위 호환
- [ ] 실행 로그에 Provider/Model 정보 표시
