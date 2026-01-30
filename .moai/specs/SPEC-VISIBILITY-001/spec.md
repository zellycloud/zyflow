---
spec_id: SPEC-VISIBILITY-001
title: SPEC Visibility & Unified Management System
version: 1.0.0
status: completed
created: 2026-01-30
updated: 2026-01-30
completed: 2026-01-30
author: manager-spec
priority: high
dependencies: []
related_specs: [SPEC-MIGR-001]
tags: [visibility, migration, openspec, unification, tooling]
lifecycle: spec-anchored
implementation_metrics:
  phases_completed: 4
  total_tags: 23
  new_files: 25
  new_tests: 175
  total_tests_passing: 997
  commits: 5
  lines_added: 11581
---

# SPEC-VISIBILITY-001: SPEC Visibility & Unified Management System

## HISTORY

| Version | Date       | Author        | Changes                           |
|---------|------------|---------------|-----------------------------------|
| 1.0.0   | 2026-01-30 | manager-spec  | Initial SPEC creation             |

---

## Overview

This SPEC defines a comprehensive SPEC visibility and unified management system that addresses status synchronization gaps, provides unified visibility across MoAI and OpenSpec formats, enables migration from OpenSpec to MoAI, and implements archive management capabilities.

**Context:**
- **zyflow project**: Only 1 SPEC visible (SPEC-MIGR-001) despite 5 legacy SPECs archived in backups
- **zellyy-money project**: Two coexisting spec systems with visibility gaps:
  - MoAI SPEC: 3 SPECs in `.moai/specs/` (visible)
  - OpenSpec: 19+ specs in `openspec/specs/` (invisible to tools)

**Root Causes:**
1. **Status Sync Gap**: `scanMoaiSpecs` in `server/flow-sync.ts` hardcodes status to 'active' instead of reading from frontmatter
2. **Format Fragmentation**: Two separate spec systems (MoAI vs OpenSpec) operate independently without unified view
3. **No Migration Path**: No tooling exists to convert OpenSpec to MoAI 3-file format
4. **Archive Invisibility**: Archived SPECs are inaccessible without manual filesystem exploration

---

## Problem Statement

### Current State

**Status Synchronization Issue:**
- File: `server/flow-sync.ts` (lines 308-339)
- Problem: `scanMoaiSpecs` function hardcodes `status: 'active'` in INSERT/UPDATE queries
- Impact: SPEC frontmatter status values ('planned', 'completed', 'blocked') are ignored
- Consequence: All SPECs appear as 'active' in UI regardless of actual status

**Format Fragmentation:**
- MoAI SPECs: 3-file structure (spec.md, plan.md, acceptance.md) in `.moai/specs/`
- OpenSpec specs: Single-file structure in `openspec/specs/`
- Gap: Unified scanner does not exist; tools only recognize MoAI format
- Impact: 19+ OpenSpec specs in zellyy-money are invisible to Flow dashboard

**Missing Migration Tooling:**
- Current: Manual conversion from OpenSpec to MoAI format
- Problem: No automated parser for OpenSpec markdown structure
- Impact: 19+ specs in zellyy-money remain unconverted
- Risk: Duplicate effort and inconsistent migration quality

**Archive Management Gap:**
- Current: Manual filesystem operations to archive/restore SPECs
- Problem: No programmatic API for archive workflows
- Impact: 5 archived SPECs in zyflow backups are inaccessible to tools
- Consequence: Loss of historical SPEC data visibility

### Target State

**Status Synchronization:**
- `scanMoaiSpecs` reads status from YAML frontmatter using gray-matter parser
- Database accurately reflects frontmatter status values
- Status changes in frontmatter propagate to database within 5 seconds
- Invalid/missing status defaults to 'planned' with warning log

**Unified SPEC Visibility:**
- Single scanner endpoint returns both MoAI and OpenSpec specs
- Each spec includes `format: 'moai' | 'openspec'` discriminator field
- API supports filtering by format, status, domain
- Duplicate SPEC IDs (same ID in both formats) prioritize MoAI with migration flag

**Automated Migration:**
- OpenSpec parser extracts requirements, tasks, and acceptance criteria
- EARS generator converts requirements to EARS format patterns
- TAG chain generator creates plan.md with hierarchical task structure
- Gherkin generator produces acceptance.md with Given/When/Then scenarios
- Dry-run mode previews migration without filesystem writes
- Batch migration handles 19+ specs with progress tracking

**Archive Management:**
- RESTful API for archive/restore operations
- Archive structure: `.moai/archive/{YYYY-MM}/{SPEC-ID}/`
- Archive metadata preserves original status for restoration
- Atomic operations: filesystem + database stay synchronized
- Rollback capability on errors

---

## Functional Requirements

### FR-001: Status Synchronization Fix

**[EARS: Ubiquitous]**
The system SHALL parse SPEC frontmatter status field from spec.md and synchronize the value to the database tasks table.

**[EARS: Event-Driven]**
WHEN `scanMoaiSpecs` function is executed, THEN the system SHALL read status from YAML frontmatter using gray-matter parser instead of hardcoding 'active'.

**[EARS: Event-Driven]**
WHEN a SPEC status changes in frontmatter, THEN the database record SHALL update to reflect the new status within 5 seconds of file modification detection.

**[EARS: State-Driven]**
IF frontmatter status is missing or contains invalid value, THEN the system SHALL default to 'planned' status and log a warning with SPEC ID and missing field information.

**[EARS: Unwanted]**
The system SHALL NOT hardcode status values in database INSERT or UPDATE queries. All status values SHALL originate from frontmatter parsing.

**Success Criteria:**
- All SPECs with frontmatter `status: completed` display as completed in database and UI
- SPECs with missing status default to 'planned' with warning log entry
- Status normalization handles case variations (e.g., "In Progress" → 'in_progress')
- Zero instances of hardcoded status='active' in codebase

---

### FR-002: Unified SPEC Scanner

**[EARS: Ubiquitous]**
The system SHALL scan both `.moai/specs/SPEC-*/` directories and `openspec/specs/` directories in a single unified operation.

**[EARS: Event-Driven]**
WHEN the unified scanner executes, THEN the system SHALL return a combined list containing both MoAI and OpenSpec specs with `format: 'moai' | 'openspec'` discriminator field.

**[EARS: State-Driven]**
IF a SPEC exists in both formats with the same ID, THEN the system SHALL prioritize the MoAI format and flag the OpenSpec version as `migrationCandidate: true`.

**[EARS: Event-Driven]**
WHEN API endpoint `GET /api/specs` is called, THEN the system SHALL return unified spec list with support for query parameters: `?format=moai`, `?status=active`, `?domain=AUTH`.

**[EARS: Event-Driven]**
WHEN API endpoint `GET /api/specs/migration-status` is called, THEN the system SHALL return migration progress tracking with counts of MoAI specs, OpenSpec specs, and migration candidates.

**Success Criteria:**
- Unified scanner returns 22+ total specs in zellyy-money project (3 MoAI + 19 OpenSpec)
- Each spec includes format field and source path
- Filtering by `?format=openspec` returns only OpenSpec specs
- Duplicate SPEC IDs correctly prioritize MoAI format

---

### FR-003: OpenSpec → MoAI Migration Tool

**[EARS: Ubiquitous]**
The system SHALL provide a migration tool that converts OpenSpec markdown to MoAI 3-file structure (spec.md, plan.md, acceptance.md).

**[EARS: Event-Driven]**
WHEN migration is initiated for an OpenSpec file, THEN the system SHALL:
- Parse OpenSpec markdown structure to extract sections
- Generate EARS-formatted requirements in spec.md following WHEN/IF/WHILE patterns
- Extract task lists and generate TAG chains for plan.md with TAG-001 format
- Convert test scenarios to Gherkin format (Given/When/Then) in acceptance.md

**[EARS: State-Driven]**
IF OpenSpec content lacks required sections (requirements, tasks, or acceptance), THEN the system SHALL generate placeholder content with `<!-- TODO: Manual review required -->` markers and log missing sections for manual review.

**[EARS: Event-Driven]**
WHEN dry-run mode is enabled via `--dry-run` flag, THEN the system SHALL output migration preview to console without writing files to filesystem.

**[EARS: Unwanted]**
The system SHALL NOT delete original OpenSpec files during migration unless explicitly confirmed by user via `--delete-original` flag.

**[EARS: Event-Driven]**
WHEN batch migration script executes, THEN the system SHALL process all OpenSpec files, generate migration report with warnings, and track progress with completion percentage.

**Success Criteria:**
- Migration tool successfully converts all 19 OpenSpec specs in zellyy-money
- Generated spec.md contains valid EARS requirements (WHEN/IF/WHILE patterns)
- Generated plan.md contains properly formatted TAG chains (TAG-001, TAG-002, etc.)
- Generated acceptance.md contains valid Gherkin scenarios
- Dry-run mode produces accurate preview without filesystem changes
- Original OpenSpec files preserved unless user confirms deletion

---

### FR-004: Archive Management

**[EARS: Ubiquitous]**
The system SHALL provide archive and restore workflows for SPEC documents via RESTful API.

**[EARS: Event-Driven]**
WHEN `POST /api/specs/:id/archive` is called, THEN the system SHALL:
- Move SPEC directory from `.moai/specs/{SPEC-ID}/` to `.moai/archive/{YYYY-MM}/{SPEC-ID}/`
- Update database status to 'archived'
- Create archive metadata file preserving original status for future restoration
- Preserve all file metadata and timestamps

**[EARS: Event-Driven]**
WHEN `POST /api/specs/:id/restore` is called, THEN the system SHALL:
- Move SPEC directory from archive back to `.moai/specs/`
- Read archive metadata and restore original status to database
- Validate restored SPEC structure integrity (all 3 files present)
- Return validation report with file checksums

**[EARS: State-Driven]**
IF archive operation fails due to filesystem errors (permissions, disk full), THEN the system SHALL rollback database status change and return detailed error message with recovery instructions.

**[EARS: Event-Driven]**
WHEN `GET /api/specs/archived` is called, THEN the system SHALL return list of archived SPECs with archive date, original status, and restoration eligibility.

**Success Criteria:**
- Archive operation moves SPEC to `.moai/archive/2026-01/SPEC-XXX/`
- Database status updates to 'archived' atomically with filesystem move
- Restore operation returns SPEC to original location with preserved status
- Failed operations rollback completely with no partial state changes
- Archived SPECs visible in UI with restore capability

---

### FR-005: Quality & Performance (Non-Functional Requirements)

**[EARS: Ubiquitous]**
All database queries SHALL complete within 100ms for projects with up to 100 SPECs.

**[EARS: Ubiquitous]**
The migration tool SHALL preserve 100% of original SPEC data with zero data loss during conversion.

**[EARS: Event-Driven]**
WHEN unified scanner executes, THEN the system SHALL cache results for 60 seconds to improve performance and reduce filesystem I/O.

**[EARS: Ubiquitous]**
All SPEC operations SHALL maintain TypeScript type safety with 0 type errors as verified by `tsc --noEmit`.

**[EARS: Event-Driven]**
WHEN cache invalidation occurs (SPEC file modified), THEN the system SHALL clear relevant cache entries within 1 second of file change detection.

**[EARS: Ubiquitous]**
The system SHALL log all SPEC operations (scan, migrate, archive, restore) with structured logging including timestamp, operation type, SPEC ID, and result status.

**Success Criteria:**
- Unified scanner completes in <100ms for 100 SPECs
- Migration preserves all frontmatter fields and content
- Cache hit rate exceeds 80% after initial scan
- TypeScript compilation produces 0 errors
- All operations logged with complete audit trail

---

## Constraints

### Technical Constraints

- **TypeScript 5.9.3**: Strict mode enabled, all code fully typed
- **React 19.2.0**: Server Components for UI rendering
- **Express 4.21.1**: RESTful API server framework
- **SQLite + Drizzle ORM**: Database with direct SQL queries (no migration framework)
- **gray-matter ^4.0.3**: YAML frontmatter parser (already installed)
- **zod ^3.24.2**: Schema validation (to be installed)

### Architectural Constraints

- **Monorepo Structure**: Must maintain existing workspace organization
- **MCP Server Compatibility**: Archive/restore must work with Claude Code MCP integration
- **Backward Compatibility**: Existing MoAI SPECs must continue to work without modification

### Operational Constraints

- **Zero Data Loss**: Migration and archive operations must preserve 100% of data
- **Atomic Operations**: Filesystem + database changes must stay synchronized
- **Incremental Deployment**: Each phase must result in buildable, testable state
- **Git Conventional Commits**: All changes require conventional commit format

---

## Scope

### In Scope

**Phase 1: Status Synchronization Fix**
- Modify `server/flow-sync.ts` (lines 308-339)
- Implement frontmatter parsing with gray-matter
- Update INSERT/UPDATE queries to use parsed status
- Create status normalization script

**Phase 2: Unified SPEC Scanner**
- Create `server/unified-spec-scanner.ts` module
- Create `server/routes/specs.ts` API routes
- Implement caching layer for performance
- Add filtering and pagination support

**Phase 3: OpenSpec → MoAI Migration Tool**
- Create `server/migrations/migrate-spec-format.ts`
- Implement OpenSpec parser for markdown structure
- Implement EARS generator for requirements
- Implement TAG chain generator for plan.md
- Implement Gherkin generator for acceptance.md
- Create batch migration script

**Phase 4: Archive Management**
- Create `server/archive-manager.ts` module
- Implement archive/restore API endpoints
- Add archive metadata management
- Implement rollback on errors

### Out of Scope

- **UI Development**: No new UI components (uses existing Flow dashboard)
- **Performance Optimization**: Beyond 100ms query target
- **Test Coverage Improvement**: Covered by separate SPEC
- **OpenSpec Format Extensions**: Only converts existing format
- **Multi-Project Management**: Single project scope only

---

## Impact Analysis

| Component               | Files Modified | Risk Level | Mitigation Strategy                    |
|-------------------------|----------------|------------|----------------------------------------|
| server/flow-sync.ts     | 1              | High       | Characterization tests before change   |
| server/unified-scanner  | New            | Low        | Isolated module, comprehensive tests   |
| server/routes/specs.ts  | New            | Medium     | API versioning, backward compatibility |
| server/migrations/      | New            | Medium     | Dry-run mode, validation checks        |
| server/archive-manager  | New            | High       | Atomic operations, rollback capability |
| Database schema         | 0              | Low        | No schema changes required             |
| Frontend components     | 0              | None       | Reuses existing Flow dashboard         |

---

## Dependencies

### Internal Dependencies

- **SPEC-MIGR-001**: Completed migration provides MoAI-compatible codebase foundation
- **Existing Flow Dashboard**: UI reuses existing SPEC display components

### External Dependencies

- **gray-matter ^4.0.3**: Already installed, production-ready
- **zod ^3.24.2**: Requires installation for schema validation

### Dependency Installation

```bash
npm install zod@^3.24.2
```

**Rationale for Zod:**
- TypeScript-first schema validation (aligns with existing TypeScript 5.9.3)
- Production-stable version (verified via Context7 MCP)
- Required for validating SPEC structure, frontmatter schemas, and API request/response validation
- High source reputation and extensive documentation

---

## Success Metrics

### Functional Metrics

- **Status Accuracy**: 100% of SPECs display correct status from frontmatter
- **Unified Visibility**: 22+ specs visible in zellyy-money (3 MoAI + 19 OpenSpec)
- **Migration Success**: 19 OpenSpec specs successfully converted to MoAI format
- **Archive Operations**: 100% success rate for archive/restore with 0 data loss

### Performance Metrics

- **Query Performance**: <100ms for unified scan of 100 SPECs
- **Cache Hit Rate**: >80% after initial scan
- **Migration Speed**: 19 specs converted in <60 seconds

### Quality Metrics

- **Type Safety**: 0 TypeScript errors (`tsc --noEmit`)
- **Test Coverage**: >85% for new modules (TRUST 5 compliance)
- **Data Integrity**: 100% data preservation during migration and archive

---

## References

### Related SPECs

- **SPEC-MIGR-001**: OpenSpec to MoAI SPEC System Migration (Completed)
  - Provides foundational MoAI integration
  - Establishes SPEC-driven development workflow

### External Standards

- **EARS Specification**: Easy Approach to Requirements Syntax (Mavin et al., 2009)
- **Gherkin Specification**: Given/When/Then behavior-driven development format
- **OpenSpec Format**: Legacy specification format used in zellyy-money

### Technical Documentation

- **gray-matter**: https://github.com/jonschlinkert/gray-matter
- **zod**: https://zod.dev (v3.24.2 documentation)
- **MoAI-ADK SPEC-First DDD**: .claude/skills/moai-foundation-core

---

**End of SPEC-VISIBILITY-001**
