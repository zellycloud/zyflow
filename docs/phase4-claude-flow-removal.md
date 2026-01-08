# claude-flow 외부 의존성 제거 완료

## 변경 요약

**작업일**: 2026-01-08  
**목적**: 외부 `claude-flow@alpha` 패키지 의존성을 제거하고, 내부 구현으로 전환

## 제거된 항목

### 1. 서버 코드
- ✅ `server/claude-flow/executor.ts` - 이전에 제거됨
- ✅ `server/claude-flow/consensus.ts` - 이전에 제거됨
- ✅ 라우트 `server/routes/claude-flow.ts` - 이전에 제거됨
- ✅ `server/claude-flow/types.ts` - prompt-builder 의존성만 유지

### 2. 프론트엔드 코드
- ✅ `src/hooks/useClaudeFlowExecution.ts` - **제거됨**
  - `useSwarm.ts`의 하위 호환 래퍼로 대체
- ✅ `src/config/api.ts` - `claudeFlow` 엔드포인트 제거됨
- ✅ `src/components/claude-flow/ExecutionPanel.tsx` - import 경로 수정됨

### 3. Claude SDK 설정
- ✅ `.claude/settings.json` - claude-flow@alpha 관련 항목 제거됨
  - `env.CLAUDE_FLOW_*` 환경변수 제거
  - `permissions.allow` 에서 `npx claude-flow:*` 제거
  - `hooks.PreToolUse` - claude-flow@alpha hooks 제거
  - `hooks.PostToolUse` - claude-flow@alpha hooks 제거
  - `hooks.Stop` - claude-flow@alpha session-end 제거
  - `enabledMcpjsonServers` - claude-flow 제거

### 4. 스펙 정리
- ✅ `openspec/specs/claude-flow-execution/` → `openspec/archive/claude-flow-execution/` 로 이동

## 유지된 항목

### 내부 구현 (prompt-builder)
`server/claude-flow/prompt-builder.ts`는 유지됩니다:
- OpenSpec 문서를 AI 프롬프트로 변환하는 핵심 기능
- `server/ai/index.ts`에서 사용 중
- 외부 의존성 없이 독립적으로 동작

### 타입 정의
`src/types/index.ts`의 claude-flow 관련 타입들:
- `ClaudeFlowExecutionMode`, `ClaudeFlowStrategy` 등
- UI 컴포넌트와 API 호환성을 위해 유지
- 추후 리네이밍 가능 (예: `ExecutionMode`, `Strategy`)

### 프론트엔드 컴포넌트
`src/components/claude-flow/` 디렉토리:
- `ExecutionPanel.tsx` - 실행 패널 UI
- `LogViewer.tsx` - 로그 뷰어
- `ProgressIndicator.tsx` - 진행 상태 표시

## 테스트 결과

- ✅ `npm run lint` - 통과 (기존 경고만 존재)
- ✅ `npm run build` - 성공

## 다음 단계 (선택사항)

1. **타입 리네이밍**: `ClaudeFlow*` 타입들을 `AI*` 또는 `Execution*`으로 변경
2. **컴포넌트 디렉토리 이동**: `src/components/claude-flow/` → `src/components/ai-execution/`
3. **내부 모듈 리팩토링**: `server/claude-flow/` → `server/prompt-builder/`

---

작성자: AI Assistant  
Phase 4 SDK 리팩토링 작업의 일부로 진행됨
