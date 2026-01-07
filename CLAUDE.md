# ZyFlow - Claude Code Configuration

## Project Overview

OpenSpec 기반 소프트웨어 개발 플로우 관리 도구. MCP 서버를 통해 태스크 관리 지원.

## Build Commands

```bash
npm run dev          # Vite 개발 서버
npm run build        # 프로덕션 빌드
npm run server       # API 서버 실행
npm run dev:all      # 서버 + 클라이언트 동시 실행
npm run build:mcp    # MCP 서버 빌드
npm run test         # Vitest 테스트 실행
npm run lint         # ESLint 검사
```

## Code Style & Best Practices

- **Modular Design**: 파일당 500줄 이하
- **Environment Safety**: 시크릿 하드코딩 금지
- **Test-First**: 테스트 먼저 작성
- **Clean Architecture**: 관심사 분리

## File Organization

- `/src` - React 프론트엔드
- `/server` - Express API 서버
- `/mcp-server` - MCP 서버 (Claude Code 통합)
- `/openspec` - OpenSpec 변경 제안 및 스펙
- `/tests` - 테스트 파일
- `/docs` - 문서

## MCP 도구 (ZyFlow)

ZyFlow MCP 서버 제공 도구:
- `zyflow_get_tasks` - 태스크 목록 조회
- `zyflow_update_task` - 태스크 상태 업데이트
- `zyflow_get_project` - 프로젝트 정보 조회

## Skills 사용법

4개의 핵심 스킬 제공:

| 스킬 | 경로 | 용도 |
|------|------|------|
| OpenSpec | `.claude/skills/openspec/` | 스펙 주도 개발, proposal 작성 |
| Code Review | `.claude/skills/code-review/` | 코드 품질, 보안 검토 |
| Testing | `.claude/skills/testing/` | 테스트 작성, 커버리지 관리 |
| Git Workflow | `.claude/skills/git-workflow/` | 브랜치 전략, 커밋 규칙 |

**스킬 참조 방법:**
```
# 스킬 파일 읽기
.claude/skills/[skill-name]/SKILL.md
```

## Core Agents

5개의 핵심 에이전트 (`.claude/agents/core/`):
- **coder.md** - 코드 작성 전문
- **reviewer.md** - 코드 리뷰 전문
- **tester.md** - 테스트 작성 전문
- **planner.md** - 계획 수립 전문
- **researcher.md** - 조사/분석 전문

## Important Instructions

- 요청된 것만 수행 (그 이상, 이하 금지)
- 새 파일 생성보다 기존 파일 수정 선호
- 루트 폴더에 작업 파일 저장 금지
