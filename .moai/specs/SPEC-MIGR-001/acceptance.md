---
spec_id: SPEC-MIGR-001
phase: acceptance
created: 2026-01-28
format: gherkin
total_criteria: 8
---

# SPEC-MIGR-001: Acceptance Criteria

## AC-1: MoAI SPEC Parser Functionality

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
- [ ] parsePlanFile() correctly extracts all TAG items
- [ ] parseAcceptanceFile() correctly extracts Gherkin criteria
- [ ] parseSpecFile() correctly extracts EARS requirements
- [ ] Parser handles missing files gracefully (partial SPEC)
- [ ] Parser handles malformed markdown without crashing

---

## AC-2: Database Schema Compatibility

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
- [ ] Zero tasks with origin='openspec' after migration
- [ ] Task count preserved (before count == after count)
- [ ] All specPath values point to valid .moai/specs/ directories
- [ ] No NULL specPath for previously mapped tasks

---

## AC-3: SPEC Sync to Database

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
- [ ] TAG items appear as tasks in DB
- [ ] TAG status (checked/unchecked) maps to task status (complete/pending)
- [ ] TAG dependencies preserved in task records
- [ ] Re-sync does not create duplicate tasks (idempotent)

---

## AC-4: API Endpoint Compatibility

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
- [ ] Changes list includes MoAI SPECs
- [ ] SPEC detail returns complete content
- [ ] Response format compatible with existing frontend
- [ ] No 500 errors on any endpoint

---

## AC-5: MCP Tool Functionality

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
- [ ] zyflow_list_changes returns MoAI SPECs
- [ ] zyflow_get_tasks returns TAG items for SPEC IDs
- [ ] zyflow_mark_complete updates both file and DB
- [ ] zyflow_get_task_context returns complete SPEC context
- [ ] No regression in existing MCP tool functionality

---

## AC-6: Frontend Display

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
- [ ] SPEC list renders without errors
- [ ] SPEC detail shows 3 tabs correctly
- [ ] TAG progress bar displays accurate percentages
- [ ] Checkbox toggling updates both UI and backend

---

## AC-7: OpenSpec Complete Removal

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
- [ ] Zero "openspec" references in source code
- [ ] openspec/ directory does not exist
- [ ] OpenSpec skills removed
- [ ] OpenSpec commands removed
- [ ] CLI adapter file removed

---

## AC-8: Build and Test Integrity

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
- [ ] `tsc --noEmit` exits with code 0
- [ ] `npm run build` succeeds
- [ ] ESLint reports 0 errors
- [ ] Test pass rate >= 93.2% (464 or more tests passing)
- [ ] No new test failures introduced by migration

---

## Definition of Done

- [ ] All 8 acceptance criteria verified and passing
- [ ] All 15 TAGs completed
- [ ] Code reviewed (self-review or pair review)
- [ ] CHANGELOG.md updated with migration entry
- [ ] INDEX.md updated with SPEC-MIGR-001 completion
- [ ] Git history clean with conventional commits per TAG

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
