# Tasks: Phase 4 - Claude SDK 정렬

## 1. .claude/agents 정리

### 1.1 디렉토리 제거
- [x] .claude/agents/consensus/ 제거 (이미 없음)
- [x] .claude/agents/hive-mind/ 제거 (이미 없음)
- [x] .claude/agents/neural/ 제거 (이미 없음)
- [x] .claude/agents/swarm/ 제거 (이미 없음)
- [x] .claude/agents/flow-nexus/ 제거 (이미 없음)
- [x] .claude/agents/optimization/ 제거 (이미 없음)
- [x] .claude/agents/training/ 제거 (이미 없음)

### 1.2 핵심 agents 유지
- [x] .claude/agents/core/coder.md 유지
- [x] .claude/agents/core/reviewer.md 유지
- [x] .claude/agents/core/tester.md 유지
- [x] .claude/agents/core/planner.md 유지
- [x] .claude/agents/core/researcher.md 유지

## 2. Skills 생성

### 2.1 OpenSpec Skill
- [x] .claude/skills/openspec/SKILL.md 작성
- [x] proposal 작성 지침 포함
- [x] tasks.md 관리 지침 포함
- [x] 7단계 파이프라인 워크플로우 포함

### 2.2 Code Review Skill
- [x] .claude/skills/code-review/SKILL.md 작성
- [x] 코드 품질 체크리스트 포함
- [x] 보안 검토 항목 포함

### 2.3 Testing Skill
- [x] .claude/skills/testing/SKILL.md 작성
- [x] 테스트 작성 가이드라인 포함
- [x] 커버리지 기준 포함

### 2.4 Git Workflow Skill
- [x] .claude/skills/git-workflow/SKILL.md 작성
- [x] 브랜치 전략 포함
- [x] 커밋 메시지 규칙 포함

## 3. SDK Hooks 설정

- [x] .claude/settings.json에 hooks 설정 추가 (이미 구성됨)
- [x] PreToolUse hook 구현 (이미 구성됨)
- [x] PostToolUse hook 구현 (이미 구성됨)
- [x] SessionStart hook 구현 (Stop hook으로 대체)

## 4. MCP 설정 정리

- [ ] .mcp.json 최종 정리
- [ ] zyflow MCP 서버만 유지
- [ ] 불필요한 설정 제거

## 5. CLAUDE.md 최종 정리

- [x] Project Overview 간소화
- [x] Build Commands 유지
- [x] Code Style & Best Practices 유지
- [x] MCP 도구 목록 (zyflow만)
- [x] Skills 사용법 추가
- [x] 불필요한 섹션 모두 제거

## 6. 문서화

- [x] Skills 사용 가이드 작성 (docs/claude-sdk-guide.md)
- [x] Hooks 설정 가이드 작성 (docs/claude-sdk-guide.md)
- [ ] 마이그레이션 완료 문서 작성

## 7. 검증

- [ ] Claude Code에서 Skills 인식 확인
- [ ] /skill 명령어로 Skills 호출 확인
- [ ] MCP 도구 정상 동작 확인
- [ ] 전체 워크플로우 테스트
