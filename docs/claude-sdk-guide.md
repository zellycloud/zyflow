# Claude SDK Skills & Hooks 가이드

## Skills 사용 가이드

### 개요

ZyFlow 프로젝트는 4개의 핵심 스킬을 제공하여 일관된 개발 워크플로우를 지원합니다.

### 사용 가능한 Skills

| 스킬 | 위치 | 목적 |
|------|------|------|
| OpenSpec | `.claude/skills/openspec/SKILL.md` | 스펙 주도 개발 |
| Code Review | `.claude/skills/code-review/SKILL.md` | 코드 품질 보증 |
| Testing | `.claude/skills/testing/SKILL.md` | 테스트 작성 |
| Git Workflow | `.claude/skills/git-workflow/SKILL.md` | Git 협업 |

### 스킬 참조 방법

스킬은 필요 시 직접 파일을 참조하여 사용합니다:

```
# OpenSpec 워크플로우 참조
.claude/skills/openspec/SKILL.md

# 코드 리뷰 체크리스트 참조
.claude/skills/code-review/SKILL.md
```

### 스킬별 주요 용도

#### OpenSpec Skill
- 변경 제안서(proposal) 작성
- tasks.md 관리 및 진행 추적
- 7단계 파이프라인 워크플로우 적용
- Spec delta 작성 규칙

#### Code Review Skill
- 코드 품질 체크리스트 적용
- 보안 검토 항목 확인
- 리뷰 피드백 템플릿 사용
- 우선순위별 이슈 분류

#### Testing Skill
- AAA 패턴 테스트 작성
- 커버리지 기준 확인
- 모킹 전략 적용
- 테스트 안티패턴 회피

#### Git Workflow Skill
- 브랜치 명명 규칙 준수
- 한국어 커밋 메시지 작성
- PR 템플릿 활용
- 릴리스 프로세스 진행

---

## Hooks 설정 가이드

### 개요

ZyFlow는 Claude Code SDK hooks를 활용하여 도구 사용 전후에 자동화된 작업을 수행합니다.

### 설정 파일

Hooks는 `.claude/settings.json`에 정의되어 있습니다.

### 구성된 Hooks

#### 1. PreToolUse Hooks

**Bash 명령어 실행 전:**
```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "command": "npx claude-flow@alpha hooks pre-command --validate-safety true --prepare-resources true"
  }]
}
```
- 명령어 안전성 검증
- 필요한 리소스 준비

**파일 편집 전:**
```json
{
  "matcher": "Write|Edit|MultiEdit",
  "hooks": [{
    "type": "command",
    "command": "npx claude-flow@alpha hooks pre-edit --auto-assign-agents true --load-context true"
  }]
}
```
- 에이전트 자동 할당
- 컨텍스트 로드

#### 2. PostToolUse Hooks

**Bash 명령어 실행 후:**
```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "command": "npx claude-flow@alpha hooks post-command --track-metrics true --store-results true"
  }]
}
```
- 메트릭 추적
- 결과 저장

**파일 편집 후:**
```json
{
  "matcher": "Write|Edit|MultiEdit",
  "hooks": [{
    "type": "command",
    "command": "npx claude-flow@alpha hooks post-edit --format true --update-memory true"
  }]
}
```
- 코드 포맷팅
- 메모리 업데이트

#### 3. PreCompact Hooks

컨텍스트 압축 전 가이드 제공:
- 사용 가능한 에이전트 알림
- 동시 실행 패턴 안내
- SPARC 방법론 참조

#### 4. Stop Hooks

세션 종료 시:
```json
{
  "hooks": [{
    "type": "command",
    "command": "npx claude-flow@alpha hooks session-end --generate-summary true --persist-state true --export-metrics true"
  }]
}
```
- 세션 요약 생성
- 상태 영속화
- 메트릭 내보내기

### Hook 비활성화

특정 hook을 비활성화하려면 환경 변수를 설정합니다:

```json
{
  "env": {
    "CLAUDE_FLOW_HOOKS_ENABLED": "false"
  }
}
```

### 커스텀 Hook 추가

새 hook을 추가하려면 `.claude/settings.json`의 해당 섹션에 추가:

```json
{
  "matcher": "YourMatcher",
  "hooks": [{
    "type": "command",
    "command": "your-custom-command"
  }]
}
```

---

## Core Agents

### 개요

5개의 핵심 에이전트가 `.claude/agents/core/`에 정의되어 있습니다.

| 에이전트 | 파일 | 역할 |
|----------|------|------|
| Coder | `coder.md` | 코드 작성 전문 |
| Reviewer | `reviewer.md` | 코드 리뷰 전문 |
| Tester | `tester.md` | 테스트 작성 전문 |
| Planner | `planner.md` | 계획 수립 전문 |
| Researcher | `researcher.md` | 조사/분석 전문 |

---

## 환경 변수

`.claude/settings.json`에 정의된 환경 변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CLAUDE_FLOW_AUTO_COMMIT` | false | 자동 커밋 |
| `CLAUDE_FLOW_AUTO_PUSH` | false | 자동 푸시 |
| `CLAUDE_FLOW_HOOKS_ENABLED` | true | hooks 활성화 |
| `CLAUDE_FLOW_TELEMETRY_ENABLED` | true | 텔레메트리 |
| `CLAUDE_FLOW_CHECKPOINTS_ENABLED` | true | 체크포인트 |
