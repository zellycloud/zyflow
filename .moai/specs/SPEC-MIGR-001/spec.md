---
spec_id: SPEC-MIGR-001
title: OpenSpec to MoAI SPEC System Migration
priority: Critical
status: Draft
created: 2026-01-28
assigned: manager-ddd
dependencies: []
related_specs: [SPEC-TEST-001, SPEC-ARCH-001]
tags: [migration, openspec, moai, spec-system, breaking-change]
---

# SPEC-MIGR-001: OpenSpec to MoAI SPEC System Migration

## Overview

Migrate ZyFlow from OpenSpec-based spec-driven development to MoAI-ADK SPEC system.
The OpenSpec system (CLI binary + tasks.md parser + 7-stage pipeline) will be replaced
by MoAI's native SPEC system (EARS format + TAG chains + 3-phase workflow).

## Problem Statement

### Current State
- ZyFlow uses OpenSpec 1.0 for spec-driven development workflow
- OpenSpec references exist in 51 source files with 406 occurrences
- @zyflow/parser package (1,530 lines) parses OpenSpec tasks.md format
- CLI adapter wraps external `openspec` CLI binary (308 lines)
- 7-stage pipeline (spec/changes/task/code/test/commit/docs) tied to OpenSpec
- MoAI-ADK is already installed and functional with 5 active SPECs

### Target State
- ZyFlow uses MoAI SPEC system exclusively (.moai/specs/SPEC-XXX/)
- @zyflow/parser refactored to parse MoAI plan.md TAG chains and acceptance.md
- CLI adapter removed (MoAI operates as skills/agents, not external CLI)
- Pipeline reflects TAG chain progress within MoAI Run phase
- All OpenSpec remnants removed from codebase

### Decision Rationale
User evaluated MoAI's tracking capabilities and found them superior to OpenSpec.
MoAI provides built-in EARS requirements, TAG chain traceability, Gherkin acceptance
criteria, and TRUST 5 quality gates - features OpenSpec lacks.

## Functional Requirements

### FR-1: SPEC Parser (Replaces @zyflow/parser)

**[EARS: Ubiquitous]**
The system shall parse MoAI SPEC documents (spec.md, plan.md, acceptance.md) from
`.moai/specs/SPEC-{DOMAIN}-{NUM}/` directories.

**[EARS: Event-Driven]**
When a SPEC document is modified, the system shall synchronize TAG chain items to
the tasks database table with accurate status, ordering, and hierarchy.

**[EARS: Event-Driven]**
When a TAG item status changes in plan.md, the system shall update the corresponding
task record in the database and emit a WebSocket event.

### FR-2: Database Schema Migration

**[EARS: Ubiquitous]**
The system shall store SPEC-originated tasks with origin='moai' in the tasks table.

**[EARS: Event-Driven]**
When the migration runs, the system shall convert existing tasks with origin='openspec'
to origin='moai' and update specPath from `openspec/changes/{id}/proposal.md` to
`.moai/specs/SPEC-{id}/spec.md`.

**[EARS: Unwanted]**
If the migration encounters tasks without a valid specPath mapping, then the system
shall preserve them with origin='imported' and log a warning.

### FR-3: Server API Transition

**[EARS: Ubiquitous]**
The system shall serve SPEC data through existing `/api/flow/changes` endpoints,
reading from `.moai/specs/` directory instead of `openspec/changes/`.

**[EARS: Event-Driven]**
When a client requests change details, the system shall return SPEC content
(spec.md, plan.md, acceptance.md) instead of OpenSpec artifacts (proposal.md,
design.md, specs/, tasks.md).

**[EARS: State-Driven]**
While a SPEC is in 'active' status, the system shall track TAG chain progress
and display completion percentages per TAG.

### FR-4: MCP Tool Migration

**[EARS: Ubiquitous]**
The system shall provide MCP tools for listing SPECs, retrieving TAG tasks,
marking tasks complete, and getting SPEC context.

**[EARS: Event-Driven]**
When zyflow_mark_complete is called with a TAG identifier, the system shall
update the task status in both the database and the plan.md file.

**[EARS: Unwanted]**
If an MCP tool references a non-existent SPEC, then the system shall return a
structured error with the SPEC ID and available SPECs list.

### FR-5: Frontend Adaptation

**[EARS: Ubiquitous]**
The system shall display SPEC-based data in the Flow dashboard, including
SPEC list, TAG chain progress, and acceptance criteria status.

**[EARS: Event-Driven]**
When a user clicks a SPEC in the list, the system shall show three tabs:
Spec (spec.md content), Plan (TAG chain with progress), and Acceptance
(Gherkin criteria with verification status).

**[EARS: State-Driven]**
While viewing a SPEC detail, the system shall display TAG completion as a
progress bar replacing the former 7-stage pipeline visualization.

### FR-6: OpenSpec Removal

**[EARS: Event-Driven]**
When migration is complete and verified, the system shall remove all OpenSpec
artifacts: openspec/ directory, .claude/skills/openspec-*/, .claude/commands/opsx/,
server/cli-adapter/openspec.ts, and packages/zyflow-parser/ (if fully replaced).

## Non-Functional Requirements

### NFR-1: Build Integrity
**[EARS: Ubiquitous]**
The system shall maintain a passing TypeScript compilation (0 errors) and
successful Vite build at every migration step.

### NFR-2: Test Non-Regression
**[EARS: Ubiquitous]**
The system shall not increase the number of failing tests beyond the current
baseline (34 failures out of 498 total).

### NFR-3: Data Preservation
**[EARS: Ubiquitous]**
The system shall preserve all existing task data during migration with zero
data loss. Archived changes shall remain accessible.

### NFR-4: DDD Compliance
**[EARS: Ubiquitous]**
The migration shall follow ANALYZE-PRESERVE-IMPROVE methodology, creating
characterization tests before modifying each component.

### NFR-5: Incremental Deployment
**[EARS: Ubiquitous]**
Each migration TAG shall result in a buildable, testable state. No TAG shall
leave the system in a broken intermediate state.

## Constraints

- TypeScript 5.x + React 19 + Express backend
- SQLite database with Drizzle ORM (no migration framework, direct SQL)
- MCP server must remain compatible with Claude Code integration
- Monorepo workspace structure must be maintained
- Git conventional commits required for all changes

## Scope

### In Scope
- @zyflow/parser refactoring to MoAI SPEC format
- Database schema migration (tasks, changes tables)
- Server route updates (flow.ts, sync-tasks.ts, changes.ts, projects.ts)
- MCP tool updates (10 tools in mcp-server/index.ts)
- Frontend component updates (27 files in src/components/flow/)
- OpenSpec skill/command/directory removal
- CLI adapter removal

### Out of Scope
- New feature development
- Performance optimization
- Test coverage improvement (covered by SPEC-COV-001)
- Architecture refactoring (covered by SPEC-ARCH-001)
- Remote plugin migration (deferred)

## Impact Analysis

| Component | Files | References | Risk |
|-----------|-------|------------|------|
| Server core (app.ts) | 1 | 65 | High |
| CLI adapter | 2 | 55 | Medium (removal) |
| Flow routes | 1 | 33 | High |
| Changes routes | 1 | 35 | High |
| Projects routes | 1 | 31 | Medium |
| MCP server | 5 | 42 | High |
| Parser package | 6 | N/A | High (replacement) |
| Frontend | 13 | 16 | Medium |
| Sync tasks | 1 | 12 | High |
| Total | 51 | 406 | - |
