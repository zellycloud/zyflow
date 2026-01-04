# Tasks: Phase 1 - 미사용 코드 정리

## 1. py-agents 제거

- [ ] py-agents/ 디렉토리 삭제
- [ ] package.json에서 py:server 스크립트 제거
- [ ] package.json에서 py:install 스크립트 제거
- [ ] package.json에서 test:py 스크립트 제거
- [ ] package.json에서 dev:full 스크립트 수정 (py:server 참조 제거)

## 2. claude-flow 코드 정리

- [ ] server/claude-flow/executor.ts 제거
- [ ] server/claude-flow/consensus.ts 제거
- [ ] server/claude-flow/types.ts 간소화 (prompt-builder 의존성만 유지)
- [ ] server/routes/claude-flow.ts 간소화 (executor 호출 제거)
- [ ] server/index.ts에서 claude-flow 라우터 참조 정리

## 3. MCP 설정 정리

- [ ] .mcp.json에서 claude-flow@alpha 제거
- [ ] .mcp.json에서 ruv-swarm 제거
- [ ] .mcp.json에서 flow-nexus 제거

## 4. CLAUDE.md 간소화

- [ ] SPARC Commands 섹션 제거
- [ ] Hooks Integration 섹션 제거
- [ ] Available Agents 54개 목록 제거
- [ ] MCP Tool Categories 제거
- [ ] Agent Coordination Protocol 제거
- [ ] 핵심 정보만 유지하도록 재작성

## 5. .claude/agents 정리

- [ ] consensus/ 디렉토리 제거
- [ ] hive-mind/ 디렉토리 제거
- [ ] neural/ 디렉토리 제거
- [ ] swarm/ 디렉토리 제거
- [ ] flow-nexus/ 디렉토리 제거
- [ ] optimization/ 디렉토리 제거
- [ ] training/ 디렉토리 제거
- [ ] github/ 대부분 제거 (pr-manager만 유지)
- [ ] core/ 핵심 파일만 유지 (coder, reviewer, tester)

## 6. 검증

- [ ] npm run build 성공 확인
- [ ] npm run test 성공 확인
- [ ] npm run dev:all 정상 실행 확인
- [ ] MCP 서버 (zyflow) 정상 동작 확인
