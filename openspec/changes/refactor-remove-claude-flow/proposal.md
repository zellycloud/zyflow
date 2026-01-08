# Change: claude-flow 외부 의존성 제거

## Why

claude-flow@alpha는 외부 npm 패키지로, Claude Agent SDK 도입 후 더 이상 필요하지 않습니다. 공식 SDK를 사용하면 외부 의존성을 줄이고 유지보수성이 향상됩니다.

## What Changes

- **server/claude-flow/** 디렉토리 제거 (executor, consensus 관련 코드)
- **server/routes/claude-flow.ts** 제거 또는 간소화
- **src/hooks/useClaudeFlowExecution.ts** 제거
- **src/hooks/useSwarm.ts** 제거
- **.claude/settings.json** hooks에서 `claude-flow@alpha` 호출 제거
- **src/config/api.ts**에서 claudeFlow 엔드포인트 제거
- **src/types/index.ts**에서 claude-flow 관련 타입 제거
- **BREAKING**: `/api/claude-flow/*` API 엔드포인트 제거

## Impact

- Affected specs: `claude-flow-execution` (제거 또는 아카이브)
- Affected code:
  - `server/claude-flow/`
  - `server/routes/claude-flow.ts`
  - `src/hooks/useClaudeFlowExecution.ts`
  - `src/hooks/useSwarm.ts`
  - `src/config/api.ts`
  - `src/types/index.ts`
  - `.claude/settings.json`
  
## Migration

1. claude-flow 기반 Swarm 기능 → Claude Agent SDK 기반으로 마이그레이션 (필요시)
2. 기존 hooks → 단순 스크립트 또는 제거
3. prompt-builder.ts는 자체 구현이므로 유지 가능
