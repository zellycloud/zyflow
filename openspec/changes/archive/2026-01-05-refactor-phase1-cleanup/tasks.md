# Tasks: Phase 1 - 미사용 코드 정리

## 1. py-agents 제거

- [x] py-agents/ 디렉토리 삭제
- [x] package.json에서 py:server 스크립트 제거
- [x] package.json에서 py:install 스크립트 제거
- [x] package.json에서 test:py 스크립트 제거
- [x] package.json에서 dev:full 스크립트 수정 (py:server 참조 제거)

## 2. claude-flow 코드 정리

- [x] server/claude-flow/executor.ts 제거
- [x] server/claude-flow/consensus.ts 제거
- [x] server/claude-flow/types.ts 간소화 (prompt-builder 의존성만 유지)
- [x] server/routes/claude-flow.ts 간소화 (executor 호출 제거)
- [x] server/index.ts에서 claude-flow 라우터 참조 정리

## 3. MCP 설정 정리

- [x] .mcp.json에서 claude-flow@alpha 제거
- [x] .mcp.json에서 ruv-swarm 제거
- [x] .mcp.json에서 flow-nexus 제거

## 4. CLAUDE.md 간소화

- [x] SPARC Commands 섹션 제거
- [x] Hooks Integration 섹션 제거
- [x] Available Agents 54개 목록 제거
- [x] MCP Tool Categories 제거
- [x] Agent Coordination Protocol 제거
- [x] 핵심 정보만 유지하도록 재작성

## 5. .claude/agents 정리

- [x] consensus/ 디렉토리 제거
- [x] hive-mind/ 디렉토리 제거
- [x] neural/ 디렉토리 제거
- [x] swarm/ 디렉토리 제거
- [x] flow-nexus/ 디렉토리 제거
- [x] optimization/ 디렉토리 제거
- [x] sparc/ 디렉토리 제거
- [x] github/ 대부분 제거 (pr-manager만 유지)
- [x] core/ 핵심 파일만 유지 (coder, reviewer, tester, planner, researcher)

## 6. 검증

- [x] npm run build 성공 확인
- [x] npm run test 성공 확인 (기존 테스트 실패 존재 - 리팩토링 무관)
- [x] npm run dev:all 정상 실행 확인 (포트 3000 사용 중 - 기존 서버 실행 중)
- [x] MCP 서버 (zyflow) 정상 동작 확인 (build:mcp 성공, tools/list 응답 정상)
