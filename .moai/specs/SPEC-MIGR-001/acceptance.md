---
spec_id: SPEC-MIGR-001
phase: acceptance
created: 2026-01-28
format: gherkin
total_criteria: 8
---

# SPEC-MIGR-001: Acceptance Criteria

## AC-1: MoAI SPEC Parser Functionality (✓ VERIFIED - TAG-002)

**Given** a MoAI SPEC directory at `.moai/specs/SPEC-XXX/` containing spec.md, plan.md, and acceptance.md
**When** the parser processes the SPEC directory
**Then** it shall extract:
- EARS requirements from spec.md with frontmatter metadata
- TAG chain items from plan.md with status, scope, and dependencies
- Gherkin criteria from acceptance.md with verification status

### Verification Method
```bash
npx vitest run packages/zyflow-parser/src/moai-parser.test.ts
```

### Success Metrics
- [x] parsePlanFile() correctly extracts all TAG items
- [x] parseAcceptanceFile() correctly extracts Gherkin criteria
- [x] parseSpecFile() correctly extracts EARS requirements
- [x] Parser handles missing files gracefully (partial SPEC)
- [x] Parser handles malformed markdown without crashing

---

## AC-2: Database Schema Compatibility (✓ VERIFIED - TAG-003)

**Given** an existing ZyFlow database with OpenSpec-originated tasks
**When** the schema migration runs
**Then** it shall:
- Add 'moai' to the origin enum
- Convert existing 'openspec' origin tasks to 'moai'
- Update specPath from openspec/ paths to .moai/specs/ paths
- Preserve all task data without loss

### Verification Method
```bash
# Verify migration SQL
sqlite3 data/zyflow.db "SELECT COUNT(*) FROM tasks WHERE origin='openspec'"
# Should return 0 after migration

sqlite3 data/zyflow.db "SELECT COUNT(*) FROM tasks WHERE origin='moai'"
# Should return the count of previously openspec-origin tasks
```

### Success Metrics
- [x] Zero tasks with origin='openspec' after migration
- [x] Task count preserved (before count == after count)
- [x] All specPath values point to valid .moai/specs/ directories
- [x] No NULL specPath for previously mapped tasks

---

## AC-3: SPEC Sync to Database (✓ VERIFIED - TAG-004)

**Given** a MoAI SPEC with TAG chain items in plan.md
**When** the sync module processes the SPEC
**Then** it shall create corresponding task records in the database with:
- Correct tag_id matching the TAG identifier
- Correct status reflecting the plan.md checkbox state
- Proper ordering matching the TAG chain dependency order

### Verification Method
```bash
npx vitest run server/sync-tasks.test.ts
```

### Success Metrics
- [x] TAG items appear as tasks in DB
- [x] TAG status (checked/unchecked) maps to task status (complete/pending)
- [x] TAG dependencies preserved in task records
- [x] Re-sync does not create duplicate tasks (idempotent)

---

## AC-4: API Endpoint Compatibility (✓ VERIFIED - TAG-005)

**Given** an API client calling `/api/flow/changes`
**When** MoAI SPECs exist in `.moai/specs/`
**Then** the API shall return SPEC data in a compatible format including:
- SPEC ID, title, status, created date
- TAG chain progress (completed/total)
- Content from spec.md, plan.md, acceptance.md

### Verification Method
```bash
# Start dev server
npm run dev &
sleep 3

# Test changes list endpoint
curl -s http://localhost:5173/api/flow/changes | jq '.length'

# Test SPEC detail endpoint
curl -s http://localhost:5173/api/flow/changes/SPEC-MIGR-001 | jq '.title'

kill %1
```

### Success Metrics
- [x] Changes list includes MoAI SPECs
- [x] SPEC detail returns complete content
- [x] Response format compatible with existing frontend
- [x] No 500 errors on any endpoint

---

## AC-5: MCP Tool Functionality (✓ VERIFIED - TAG-007)

**Given** Claude Code connected to ZyFlow MCP server
**When** MCP tools are invoked for MoAI SPECs
**Then** the tools shall:
- List SPECs from .moai/specs/ directory
- Return TAG chain tasks for a given SPEC
- Mark TAG items as complete (update plan.md and DB)
- Provide full SPEC context for Claude Code agents

### Verification Method
```bash
# Test via MCP inspector or direct invocation
npx vitest run mcp-server/index.test.ts
```

### Success Metrics
- [x] zyflow_list_changes returns MoAI SPECs
- [x] zyflow_get_tasks returns TAG items for SPEC IDs
- [x] zyflow_mark_complete updates both file and DB
- [x] zyflow_get_task_context returns complete SPEC context
- [x] No regression in existing MCP tool functionality

---

## AC-6: Frontend Display (✓ VERIFIED - TAG-009)

**Given** a user viewing the Flow dashboard in the browser
**When** MoAI SPECs are present
**Then** the UI shall:
- Show SPECs in the change list with SPEC- prefix
- Display 3 tabs (Spec/Plan/Acceptance) for SPEC details
- Show TAG progress bar instead of 7-stage pipeline
- Allow TAG checkbox toggling

### Verification Method
```bash
# Run component tests
npx vitest run src/components/flow/

# Visual verification (manual)
# Open http://localhost:5173/flow and verify SPEC display
```

### Success Metrics
- [x] SPEC list renders without errors
- [x] SPEC detail shows 3 tabs correctly
- [x] TAG progress bar displays accurate percentages
- [x] Checkbox toggling updates both UI and backend

---

## AC-7: OpenSpec Complete Removal (✓ VERIFIED - TAG-014)

**Given** the migration is complete (TAGs 012-014 done)
**When** searching the codebase for OpenSpec references
**Then** the codebase shall:
- Contain zero source files with "openspec" string literals
- Have no openspec/ top-level directory
- Have no .claude/skills/openspec-* skill files
- Have no .claude/commands/opsx/ command files
- Have no server/cli-adapter/openspec.ts file

### Verification Method
```bash
# Search for remaining OpenSpec references
grep -r "openspec" --include="*.ts" --include="*.tsx" --include="*.js" -l .
# Should return empty

# Verify directories removed
ls -la openspec/ 2>&1 | grep "No such file"
ls -la .claude/skills/openspec-* 2>&1 | grep "No such file"
ls -la .claude/commands/opsx/ 2>&1 | grep "No such file"
```

### Success Metrics
- [x] Zero "openspec" references in source code
- [x] openspec/ directory does not exist
- [x] OpenSpec skills removed
- [x] OpenSpec commands removed
- [x] CLI adapter file removed

---

## AC-8: Build and Test Integrity (✓ VERIFIED - TAGs 001-014)

**Given** the complete migration (all TAGs done)
**When** running the full build and test suite
**Then** the system shall:
- Pass TypeScript compilation with 0 errors
- Pass Vite build successfully
- Pass ESLint with 0 errors
- Maintain or improve test pass rate (baseline: 93.2%, 464/498)

### Verification Method
```bash
# TypeScript check
npx tsc --noEmit

# Build
npm run build

# ESLint
npx eslint . --max-warnings 200

# Tests
npx vitest run
```

### Success Metrics
- [x] `tsc --noEmit` exits with code 0
- [x] `npm run build` succeeds
- [x] ESLint reports 0 errors
- [x] Test pass rate >= 95.9% (810/845 tests passing - improved from 93.2% baseline)
- [x] No new test failures introduced by migration

---

## Definition of Done

- [x] All 8 acceptance criteria verified and passing
- [x] All 15 TAGs completed
- [x] Code reviewed (manager-docs agent review completed)
- [x] CHANGELOG.md updated with migration entry
- [x] .moai/project/product.md and structure.md created
- [x] Git history clean with conventional commits per TAG

## Anti-Patterns to Avoid

1. **Big Bang Migration**: Do not replace everything at once. Follow TAG dependency order.
2. **Deleting Before Replacing**: Do not remove OpenSpec code before MoAI equivalents are working.
3. **Skipping Characterization Tests**: Do not modify components without capturing existing behavior first.
4. **Breaking the Build**: Each TAG commit must leave the build passing.
5. **Ignoring Edge Cases**: Parser must handle malformed/partial SPEC documents.

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | - | - | Pending |
| Code Review | - | - | Pending |
| QA Verification | - | - | Pending |
