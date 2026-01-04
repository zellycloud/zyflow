# Change: Phase 4 - Claude SDK 정렬

## Summary

ZyFlow의 커스텀 구현을 Claude Code 공식 기능(Skills, Hooks, Sessions)으로 전환합니다.

## Motivation

### 현재 문제
1. **.claude/agents/** 90+ 파일이 Claude Code 공식 방식과 충돌
2. 커스텀 hooks/sessions는 Claude Code 업데이트 시 호환성 문제 가능
3. 문서화되지 않은 커스텀 구현은 유지보수 어려움

### Claude Code 공식 기능
- **Skills (SKILL.md)**: 재사용 가능한 기능 확장
- **Hooks**: PreToolUse, PostToolUse, Stop, SessionStart
- **Sessions**: resume, fork 지원
- **MCP Servers**: 외부 도구 연동

## Scope

### 4.1 .claude/ 디렉토리 정리

**현재 (90+ 파일):**
```
.claude/
├── agents/           # 90+ 파일
│   ├── consensus/
│   ├── core/
│   ├── flow-nexus/
│   ├── hive-mind/
│   └── ...
├── commands/
├── plans/
└── skills/
```

**변경 후 (15-20 파일):**
```
.claude/
├── skills/           # 10-15 Skills
│   ├── openspec/SKILL.md
│   ├── code-review/SKILL.md
│   └── git-workflow/SKILL.md
├── agents/           # 핵심 5개만
├── commands/         # 유지
└── plans/            # 유지
```

### 4.2 Skills 생성
- openspec: OpenSpec 워크플로우
- code-review: 코드 리뷰
- testing: 테스트 작성
- git-workflow: Git 브랜치 관리

### 4.3 SDK Hooks 활용
- PreToolUse: 파일 편집 전 검증
- PostToolUse: 편집 후 자동 포맷팅
- SessionStart: 프로젝트 컨텍스트 로딩

### 4.4 문서 정리
- CLAUDE.md 간소화
- 핵심 정보만 유지

## Expected Impact

- 90+ 파일 → 15-20 파일
- Claude Code 공식 기능 활용
- 업데이트 호환성 보장
- 문서화된 표준 방식 사용
