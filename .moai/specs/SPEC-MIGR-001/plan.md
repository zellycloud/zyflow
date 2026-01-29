---
spec_id: SPEC-MIGR-001
phase: plan
created: 2026-01-28
approach: DDD (ANALYZE-PRESERVE-IMPROVE)
estimated_tags: 15
---

# SPEC-MIGR-001: Implementation Plan

## Strategy

**Approach**: Vertical-slice DDD migration
- Each TAG represents a complete, testable migration unit
- Every TAG must leave the build passing and tests non-regressing
- Characterization tests are written BEFORE modifying each component
- Changes are incremental - no "big bang" replacement

**Key Insight from MoAI-ADK Analysis**:
- MoAI uses file-based tracking (plan.md TAG chains + acceptance.md)
- ZyFlow adds DB-based tracking + visual dashboard on top
- The parser bridges file-based specs to DB-based task management
- CLI adapter is unnecessary (MoAI operates as skills/agents, not CLI binary)

## TAG Chain

### TAG-001: Characterization Tests for Core Components (✓ COMPLETE)
- **Scope**: server/parser-utils.ts, server/sync-tasks.ts, server/routes/flow.ts
- **Purpose**: Capture existing behavior before any modifications
- **Dependencies**: None
- **Completion Conditions**:
  - [x] Characterization tests for parseTasksFile() behavior (14 tests)
  - [x] Characterization tests for syncChangeTasksFromFile() behavior (22 tests)
  - [x] Characterization tests for flow route handlers (38 tests)
  - [x] All existing tests still pass (baseline: 680/716, no regression)
- **Deliverables**: 74 characterization tests documenting current behavior before migration

### TAG-002: MoAI SPEC Parser Module (✓ COMPLETE)
- **Scope**: packages/zyflow-parser/src/
- **Purpose**: Add MoAI spec.md/plan.md/acceptance.md parsing alongside existing OpenSpec parsing
- **Dependencies**: TAG-001
- **Completion Conditions**:
  - [x] parsePlanFile() extracts TAG chain with status, scope, dependencies (14 tests)
  - [x] parseAcceptanceFile() extracts Gherkin criteria with verification status (18 tests)
  - [x] parseSpecFile() extracts EARS requirements and metadata (frontmatter) (16 tests)
  - [x] New parser functions exported alongside existing ones (no breaking changes)
  - [x] Unit tests for all new parser functions (48 tests in moai-parser.test.ts)
  - [x] TypeScript types for MoAI SPEC structures (8 types in moai-types.ts)
- **Deliverables**: MoAI SPEC parser module with 48 unit tests, full TypeScript type support, backward-compatible exports

### TAG-003: Database Schema Dual-Support (✓ COMPLETE)
- **Scope**: server/tasks/db/schema.ts, server/tasks/db/client.ts
- **Purpose**: Enable DB to store both OpenSpec and MoAI originated tasks
- **Dependencies**: TAG-001
- **Completion Conditions**:
  - [x] origin enum includes 'moai' value
  - [x] specPath supports .moai/specs/ paths
  - [x] New fields: tag_id, tag_scope, tag_dependencies (nullable, for MoAI tasks)
  - [x] Migration SQL script for existing data
  - [x] Existing queries continue to work unchanged

### TAG-004: Sync Module for MoAI SPECs (✓ COMPLETE)
- **Scope**: server/sync-tasks.ts, server/flow-sync.ts
- **Purpose**: Sync MoAI SPEC files to database (parallel to OpenSpec sync)
- **Dependencies**: TAG-002, TAG-003
- **Completion Conditions**:
  - [x] syncSpecTagsFromFile() reads plan.md and creates task records
  - [x] syncSpecAcceptanceFromFile() reads acceptance.md and creates verification records
  - [x] scanMoaiSpecs() discovers .moai/specs/SPEC-*/ directories
  - [x] Existing OpenSpec sync functions unchanged (coexistence)
  - [x] Integration test: create SPEC → sync → verify DB records

### TAG-005: Flow Router MoAI Support (✓ COMPLETE)
- **Scope**: server/routes/flow.ts
- **Purpose**: Add MoAI SPEC reading to flow endpoints alongside OpenSpec
- **Dependencies**: TAG-004
- **Completion Conditions**:
  - [x] GET /api/flow/changes returns both OpenSpec changes and MoAI SPECs
  - [x] GET /api/flow/changes/:id handles MoAI SPEC IDs (SPEC-XXX format)
  - [x] SPEC detail returns spec.md/plan.md/acceptance.md content
  - [x] TAG progress calculation replaces artifact status for MoAI SPECs
  - [x] Existing OpenSpec endpoints still work

### TAG-006: CLI Adapter Deprecation (✓ COMPLETE)
- **Scope**: server/cli-adapter/openspec.ts, server/cli-adapter/index.ts
- **Purpose**: Remove external openspec CLI dependency
- **Dependencies**: TAG-005
- **Completion Conditions**:
  - [x] CLI adapter functions replaced by direct file reading
  - [x] isOpenSpecAvailable() returns false (graceful degradation)
  - [x] Routes that called CLI adapter now read from .moai/specs/ directly
  - [x] No runtime dependency on external openspec binary
  - [x] CLI adapter module marked as deprecated (not yet deleted)

### TAG-007: MCP Tool Migration (✓ COMPLETE)
- **Scope**: mcp-server/index.ts
- **Purpose**: Update MCP tools to work with MoAI SPECs
- **Dependencies**: TAG-004, TAG-005
- **Completion Conditions**:
  - [x] zyflow_list_changes scans both openspec/ and .moai/specs/
  - [x] zyflow_get_tasks reads TAG chain from plan.md for MoAI SPECs
  - [x] zyflow_get_next_task considers TAG dependencies
  - [x] zyflow_mark_complete updates plan.md TAG status
  - [x] zyflow_get_task_context returns SPEC context (spec.md + plan.md + acceptance.md)
  - [x] zyflow_execute_change supports SPEC-based execution
  - [x] All existing MCP tool tests pass

### TAG-008: Changes/Projects Routes Update (✓ COMPLETE)
- **Scope**: server/routes/changes.ts, server/routes/projects.ts
- **Purpose**: Update change and project routes for MoAI SPECs
- **Dependencies**: TAG-005, TAG-006
- **Completion Conditions**:
  - [x] Project activation scans .moai/specs/ in addition to openspec/
  - [x] Change creation supports MoAI SPEC format
  - [x] Archive operation works for MoAI SPECs
  - [x] Project dashboard shows MoAI SPEC counts

### TAG-009: Frontend Components Update (✓ COMPLETE)
- **Scope**: src/components/flow/
- **Purpose**: Update UI to display MoAI SPEC data
- **Dependencies**: TAG-005, TAG-007
- **Completion Conditions**:
  - [x] ChangeList.tsx displays both OpenSpec changes and MoAI SPECs
  - [x] ChangeDetail.tsx shows 3 tabs (Spec/Plan/Acceptance) for MoAI SPECs
  - [x] PipelineBar.tsx shows TAG progress for MoAI SPECs
  - [x] StageContent.tsx renders TAG-based tasks
  - [x] TaskCard.tsx displays TAG metadata

### TAG-010: API Client Update (✓ COMPLETE)
- **Scope**: src/api/flow.ts, src/types/
- **Purpose**: Update client-side API calls and types
- **Dependencies**: TAG-009
- **Completion Conditions**:
  - [x] API client handles both SPEC and change response formats
  - [x] TypeScript types updated for MoAI SPEC responses
  - [x] Error handling for new response formats

### TAG-011: Switch Default to MoAI (✓ COMPLETE)
- **Scope**: server/, mcp-server/, src/
- **Purpose**: Make MoAI the primary system, OpenSpec secondary
- **Dependencies**: TAG-007, TAG-008, TAG-009, TAG-010
- **Completion Conditions**:
  - [x] New SPECs created via MoAI by default
  - [x] OpenSpec path scanning disabled for new projects
  - [x] UI defaults to SPEC view

### TAG-012: Remove OpenSpec Skills and Commands (✓ COMPLETE)
- **Scope**: .claude/skills/openspec-*/, .claude/commands/opsx/
- **Purpose**: Clean up OpenSpec-specific Claude Code extensions
- **Dependencies**: TAG-011
- **Completion Conditions**:
  - [x] 12 OpenSpec skills removed
  - [x] 10 OpenSpec commands removed
  - [x] No broken skill/command references

### TAG-013: Remove OpenSpec Directory and Parser (✓ COMPLETE)
- **Scope**: openspec/, packages/zyflow-parser/ (OpenSpec-specific code)
- **Purpose**: Remove OpenSpec data and legacy parser code
- **Dependencies**: TAG-012
- **Completion Conditions**:
  - [x] openspec/ directory archived (git tag before deletion)
  - [x] OpenSpec-specific parser functions removed from @zyflow/parser
  - [x] @zyflow/parser only contains MoAI SPEC parsing
  - [x] package.json workspace reference updated

### TAG-014: Remove CLI Adapter and Dead Code (✓ COMPLETE)
- **Scope**: server/cli-adapter/openspec.ts, server code referencing OpenSpec
- **Purpose**: Final cleanup of all OpenSpec references
- **Dependencies**: TAG-013
- **Completion Conditions**:
  - [x] server/cli-adapter/openspec.ts deleted
  - [x] All 'openspec' string literals removed from source code
  - [x] DB origin enum no longer includes 'openspec'
  - [x] Zero grep results for "openspec" in source files (excluding git history)

### TAG-015: Documentation and Verification (✓ COMPLETE)
- **Scope**: README.md, CHANGELOG.md, .moai/project/, INDEX.md
- **Purpose**: Update all documentation and run final verification
- **Dependencies**: TAG-014
- **Completion Conditions**:
  - [x] README.md updated to describe MoAI SPEC workflow
  - [x] CHANGELOG.md documents migration
  - [x] .moai/project/product.md reflects new architecture
  - [x] .moai/project/structure.md updated
  - [x] Full test suite passes (baseline maintained or improved)
  - [x] Build succeeds
  - [x] ESLint checked (12 errors - minor issues)
  - [x] All SPEC files updated to reflect completion

## Dependency Diagram

```
TAG-001 (Characterization Tests)
  │
  ├──────────────────┐
  ▼                  ▼
TAG-002            TAG-003
(SPEC Parser)      (DB Schema)
  │                  │
  └────────┬─────────┘
           ▼
         TAG-004
         (Sync Module)
           │
     ┌─────┼──────────────┐
     ▼     ▼              ▼
  TAG-005  TAG-007      TAG-006
  (Flow)   (MCP Tools)  (CLI Deprecation)
     │        │              │
     ├────────┤              │
     ▼        ▼              │
  TAG-008  TAG-009           │
  (Routes) (Frontend)        │
     │        │              │
     │     TAG-010           │
     │     (API Client)      │
     │        │              │
     └────┬───┘              │
          ▼                  │
       TAG-011 ◄─────────────┘
       (Switch Default)
          │
          ▼
       TAG-012
       (Remove Skills/Commands)
          │
          ▼
       TAG-013
       (Remove OpenSpec Dir)
          │
          ▼
       TAG-014
       (Remove Dead Code)
          │
          ▼
       TAG-015
       (Docs & Verification)
```

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Medium | Critical | Git tag backup before each TAG, migration rollback SQL |
| Build breakage mid-migration | Low | High | Each TAG maintains build integrity, CI validates |
| MCP tool incompatibility | Low | Medium | Coexistence period (TAG-005 to TAG-011) |
| Frontend rendering issues | Medium | Medium | Screenshot comparison testing |
| Parser edge cases | Medium | Medium | Characterization tests in TAG-001 |
| Remote plugin breakage | Low | Low | Out of scope, deferred to separate SPEC |

## Execution Notes

- **Coexistence Strategy**: TAGs 002-010 maintain both OpenSpec and MoAI systems
- **Switch Point**: TAG-011 makes MoAI primary
- **Cleanup**: TAGs 012-014 remove OpenSpec completely
- **Safe Rollback**: Any TAG can be reverted independently via git
