# Tasks: claude-flow 외부 의존성 제거

## 1. 서버 코드 정리

### 1.1 server/claude-flow 디렉토리
- [x] executor.ts 제거 (이미 제거된 경우 확인)
- [x] consensus.ts 제거 (이미 제거된 경우 확인)
- [x] types.ts 정리 (prompt-builder 의존성만 유지)
- [x] 불필요한 파일 제거

### 1.2 라우트 정리
- [x] server/routes/claude-flow.ts 제거 또는 간소화
- [x] server/app.ts에서 claude-flow 라우터 참조 제거

## 2. 프론트엔드 코드 정리

### 2.1 Hooks 제거
- [x] src/hooks/useClaudeFlowExecution.ts 제거
- [x] src/hooks/useSwarm.ts 정리 (하위 호환 래퍼 유지)
- [x] 관련 import 정리

### 2.2 설정 및 타입 정리
- [x] src/config/api.ts에서 claudeFlow 엔드포인트 제거
- [x] src/types/index.ts에서 claude-flow 관련 타입 유지 (UI 호환성)

## 3. Claude SDK 설정 정리

### 3.1 settings.json 수정
- [x] .claude/settings.json에서 claude-flow@alpha 호출 제거
- [x] hooks 단순화 또는 제거
- [x] 필요한 hooks만 유지

## 4. 스펙 정리

- [x] openspec/specs/claude-flow-execution/ 아카이브 또는 제거
- [x] 관련 스펙 문서 정리

## 5. 테스트 및 검증

- [x] prompt-builder.test.ts 수정 (필요시)
- [x] npm run lint 통과 확인
- [x] npm run test 통과 확인
- [x] npm run build 성공 확인

## 6. 문서화

- [x] CLAUDE.md 업데이트 (claude-flow 참조 제거) - 이미 없음
- [x] 마이그레이션 완료 문서 작성
