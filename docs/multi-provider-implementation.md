# Multi-Provider Support Implementation

## 개요
Swarm 실행 시 다중 AI Provider를 지원하도록 확장 완료

## 수정된 파일
- `/Users/hansoo./ZELLYY/zyflow/server/claude-flow/executor.ts`

## 구현된 기능

### 1. Provider별 CLI 명령어 생성 (`buildProviderCommand`)
```typescript
private buildProviderCommand(provider: string, model?: string): { command: string; args: string[] }
```

**지원 Provider:**
- `claude`: Claude Code CLI (stream-json 형식)
- `gemini`: Gemini CLI
- `qwen`: Qwen Code CLI
- `kilo`: Kilo Code CLI
- `opencode`: OpenCode CLI
- `codex`: Codex CLI

**특징:**
- Provider별 CLI 명령어 자동 매핑
- 모델 파라미터 동적 처리
- Claude의 경우 모델명 자동 변환 (opus → claude-opus-4-5-20251101)

### 2. Provider별 출력 파싱 (`parseOutput`, `parseClaudeOutput`, `parseTextOutput`)

**출력 파싱 전략:**
- **Claude**: JSON (stream-json 형식) 파싱 우선
- **기타 Provider**: 텍스트 파싱 (JSON 시도 후 fallback)

**구현된 메서드:**
1. `parseOutput()`: Provider 감지 및 적절한 파서 호출
2. `parseClaudeOutput()`: Claude JSON 형식 파싱
3. `parseTextOutput()`: 일반 텍스트 파싱 (다른 Provider용)

### 3. 실행 로그 개선
Provider 정보가 포함된 상세 로그:
```
GEMINI 실행 중... (Swarm 모드) - 모델: gemini-2.5-pro
```

Swarm 지시사항에도 Provider 정보 포함:
```
## Swarm 실행 모드
- Provider: gemini
- 전략: development
- 최대 에이전트: 5
```

## 사용 예시

### useSwarm 훅에서 사용
```typescript
const { execute } = useSwarm()

await execute({
  projectPath: '/path/to/project',
  changeId: 'add-feature',
  strategy: 'development',
  maxAgents: 5,
  provider: 'gemini',  // 새로 추가된 파라미터
  model: 'gemini-2.5-pro'  // 새로 추가된 파라미터
})
```

### API 요청
```typescript
POST /api/claude-flow/execute
{
  "projectPath": "/path/to/project",
  "changeId": "add-feature",
  "mode": "full",
  "strategy": "development",
  "maxAgents": 5,
  "provider": "qwen",
  "model": "qwen-coder-plus"
}
```

## 기술적 세부사항

### 1. Provider 감지 및 기본값
```typescript
const provider = instance.status.request.provider || 'claude'
```
- Provider 미지정 시 'claude' 기본값 사용

### 2. CLI 명령어 생성 프로세스
1. `buildProviderCommand()`에서 Provider별 command + args 생성
2. Bash 스크립트로 래핑하여 stdin 리다이렉션 처리
3. 임시 파일에 프롬프트 저장 (쉘 이스케이프 방지)

### 3. 출력 파싱 확장성
- Provider별 커스텀 파싱 로직 추가 가능
- JSON 및 텍스트 모두 지원
- 기존 Claude JSON 형식과 완벽 호환

## 향후 확장 가능성

### 1. Provider별 출력 형식 처리
각 Provider의 고유한 출력 형식에 맞춘 파서 추가:
```typescript
case 'gemini':
  return this.parseGeminiOutput(executionId, line)
case 'qwen':
  return this.parseQwenOutput(executionId, line)
```

### 2. Provider별 기능 지원
- Stream 모드 지원 여부
- Tool calling 방식 차이 처리
- 비용 추적 형식 통일

### 3. 동적 Provider 추가
CLI Adapter의 `DEFAULT_CLI_PROFILES`를 활용한 동적 프로필 지원

## 타입 정의

### ExecutionRequest (types.ts)
```typescript
export interface ExecutionRequest {
  projectPath: string
  changeId: string
  taskId?: string
  mode: ExecutionMode
  strategy?: SwarmStrategy
  maxAgents?: number
  timeout?: number
  provider?: AIProvider  // 추가됨
  model?: string  // 추가됨
}
```

### AIProvider (types.ts)
```typescript
export type AIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode' | 'custom'
```

## 테스트 시나리오

### 1. Claude Provider (기본)
- 모델: opus, sonnet, haiku
- 출력: stream-json
- 검증: 기존 기능 정상 작동 확인

### 2. Gemini Provider
- 모델: gemini-2.5-flash, gemini-2.5-pro
- 출력: 텍스트 (JSON fallback)
- 검증: CLI 정상 호출, 로그 출력 확인

### 3. 기타 Provider (qwen, kilo, opencode, codex)
- 모델: Provider별 기본값
- 출력: 텍스트
- 검증: 명령어 생성 및 실행 확인

## 호환성
- 기존 코드와 100% 하위 호환
- Provider 미지정 시 Claude 기본 동작
- useSwarm 훅 인터페이스 확장 (기존 파라미터 유지)

## 마이그레이션 가이드
기존 코드 수정 불필요. 필요시 provider/model 파라미터만 추가:

```diff
await execute({
  projectPath: '/path',
  changeId: 'id',
+ provider: 'gemini',
+ model: 'gemini-2.5-pro'
})
```
