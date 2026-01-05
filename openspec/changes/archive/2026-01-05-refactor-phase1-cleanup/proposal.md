# Change: Phase 1 - 미사용 코드 정리

## Summary

ZyFlow v0.5.0의 코드베이스에서 실제로 사용되지 않는 코드와 의존성을 제거합니다.
claude-flow MCP는 설정만 되어 있고 실제 호출이 0건임이 확인되었습니다.

## Motivation

- py-agents (88MB): TypeScript 코드베이스와 별도 운영, 실제 통합 코드 미발견
- claude-flow: MCP 도구 호출 0건, CLI 직접 spawning만 사용
- .claude/agents (90+ 파일): 대부분 미사용, Claude Code 공식 방식과 충돌

## Scope

### 제거 대상

1. **py-agents/** (88MB)
   - 전체 디렉토리 삭제
   - package.json 스크립트 정리

2. **server/claude-flow/** (2,081 LOC)
   - executor.ts (787 LOC) - 제거
   - consensus.ts (568 LOC) - 제거
   - types.ts (322 LOC) - 간소화
   - prompt-builder.ts (404 LOC) - 유지

3. **.mcp.json**
   - claude-flow@alpha 제거
   - ruv-swarm 제거
   - flow-nexus 제거
   - zyflow만 유지

4. **CLAUDE.md** (~100줄 제거)
   - 미구현 hooks/SPARC/swarm 문서 제거

5. **.claude/agents/** (90+ → 15 파일)
   - 핵심 agents만 유지

## Expected Impact

- 88MB 용량 절감
- ~2,400 LOC 제거
- 75+ 파일 정리
- 빌드/시작 시간 단축
