<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# ZyFlow 프로젝트 지침

## 프로젝트 구조

```
zyflow/
├── src/           # React 프론트엔드 (Vite + React 19 + TailwindCSS 4)
├── server/        # Express API 서버
├── mcp-server/    # MCP 서버 (Claude Code 통합)
├── openspec/      # OpenSpec 변경 제안 및 스펙
```

## 개발 서버

```bash
# 프론트엔드 + API 서버 동시 실행
npm run dev:all

# 개별 실행
npm run dev      # Vite (localhost:5173)
npm run server   # Express API (localhost:3001)
```

## 코드 품질

- ESLint + Prettier 사용
- 코드 변경 후 `npm run lint` 실행
- 테스트: `npm run test`

## MCP 서버 빌드

```bash
npm run build:mcp
```

`dist/mcp-server/index.js`가 생성되며, Claude Code에서 사용 가능

## Task 관리 (칸반 보드)

작업 내용을 칸반 보드에 등록하여 진행 상황을 추적합니다.

### MCP 도구 사용 (권장)

```
task_create    - 새 태스크 생성 (ID: TASK-1, TASK-2, ... 순차 번호)
task_list      - 태스크 목록 조회 (kanban: true로 상태별 그룹화)
task_update    - 태스크 수정 (상태 변경 포함)
task_search    - 태스크 검색 (includeArchived: true로 아카이브 포함)
task_delete    - 태스크 삭제
task_view      - 태스크 상세 조회
task_archive   - 완료된 태스크를 아카이브로 이동
task_unarchive - 아카이브된 태스크 복원 (done으로)
```

### 태스크 상태

- `todo`: 대기 중
- `in-progress`: 진행 중
- `review`: 검토 중
- `done`: 완료
- `archived`: 아카이브됨 (칸반에서 숨김, 검색 시 includeArchived로 조회)

### 우선순위

- `high`: 긴급
- `medium`: 보통 (기본값)
- `low`: 낮음

### 사용 예시

```
# 버그 수정 태스크 생성 (순차 번호 ID 자동 생성)
task_create(title: "API 응답 시간 개선", priority: "high", tags: ["performance"])
# → TASK-1 생성됨

# 작업 시작 시 상태 변경
task_update(id: "TASK-1", status: "in-progress")

# 작업 완료 시
task_update(id: "TASK-1", status: "done")

# 완료된 작업 정리 (아카이브)
task_archive(id: "TASK-1")

# 아카이브된 작업 포함 검색
task_search(query: "API", includeArchived: true)
```

### CLI 명령어 (대안)

```bash
zy tasks add "태스크 제목" --priority high --tags bug,urgent
zy tasks list --kanban
zy tasks move TASK-ABC123 in-progress
zy tasks search "검색어"
```

### 태스크 등록 가이드라인

- **작은 단위**: OpenSpec이 필요 없는 작은 버그 수정, 리팩토링, 단순 작업에 사용
- **명확한 제목**: 무엇을 해야 하는지 명확하게 작성
- **적절한 태그**: `bug`, `refactor`, `feature`, `docs`, `test` 등 사용
- **우선순위 설정**: 긴급한 버그는 `high`, 일반 작업은 `medium`

<!-- ZYWIKI:START -->
# zywiki - AI Code Wiki Integration

## For AI Assistants: How to Use This Wiki

### Reading Documentation
When you need to understand code in this project:
1. **First check** `zywiki/overview.md` for project structure and tech stack
2. **Search by category**: `zywiki/features/`, `zywiki/api/`, `zywiki/database/`, etc.
3. **Use file references**: Each doc has `<cite>file/path:line</cite>` pointing to source code

### When User Asks About Code
1. Read the relevant `zywiki/*.md` documentation first
2. Then read the actual source code if needed for details
3. Documentation provides context, architecture decisions, and usage patterns

### Updating Documentation After Code Changes
When you modify code files:
1. Check if there's a corresponding doc in `zywiki/` folder
2. Update the doc to reflect your changes
3. Keep `<cite>` references accurate with correct line numbers

## Auto Documentation Sync

**At session start**, check for pending documentation updates:

```bash
cat .zywiki/pending.json 2>/dev/null
```

**If pending updates exist:**
1. Read each changed file listed in `changedFiles`
2. Read each affected document listed in `affectedDocs`
3. Update the documents to reflect code changes
4. Ensure `<cite>` blocks have correct file references and line numbers

## Commands Reference

| Command | Description |
|---------|-------------|
| `zywiki status` | Show tracking status and pending updates |
| `zywiki build` | Generate documentation for tracked files |
| `zywiki build --filter <keyword>` | Generate docs for specific groups |
| `zywiki build --force` | Regenerate existing docs |
| `zywiki add <path> -r` | Add files for tracking |
| `zywiki detect` | Detect changed files |
| `zywiki stack` | Show project tech stack |

## Wiki Structure

```
zywiki/
├── overview.md          # Project overview & tech stack
├── architecture/        # Core architecture & design patterns
├── features/            # Feature implementations
├── api/                 # API endpoints & edge functions
├── database/            # Database schema & migrations
├── security/            # Auth & security patterns
├── testing/             # Test strategies
└── guides/              # Scripts & utilities
```

## Document Format

Each document includes:
- **Source reference**: `<cite>file/path:line</cite>`
- **Overview**: 2-3 sentence summary
- **Mermaid diagrams**: Architecture, data flow, dependencies
- **Key components**: Functions, classes, exports
- **Usage examples**: Code snippets
- **Related docs**: Links to related documentation
<!-- ZYWIKI:END -->
