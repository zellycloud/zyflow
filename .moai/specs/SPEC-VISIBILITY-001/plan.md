# Implementation Plan: SPEC-VISIBILITY-001

**SPEC ID**: SPEC-VISIBILITY-001
**Title**: SPEC Visibility & Unified Management System
**Version**: 1.0.0
**Status**: planned

---

## Technology Stack

### Core Dependencies (Already Installed)

| Library        | Version  | Purpose                          | Status      |
|----------------|----------|----------------------------------|-------------|
| TypeScript     | ~5.9.3   | Type-safe language               | ✅ Installed |
| Express        | ^4.21.1  | API server framework             | ✅ Installed |
| React          | ^19.2.0  | UI rendering                     | ✅ Installed |
| better-sqlite3 | ^12.4.6  | SQLite database driver           | ✅ Installed |
| drizzle-orm    | ^0.44.7  | TypeScript ORM                   | ✅ Installed |
| gray-matter    | ^4.0.3   | YAML frontmatter parser          | ✅ Installed |
| Vitest         | ^4.0.14  | Testing framework                | ✅ Installed |

### New Dependencies (To Install)

| Library | Version  | Purpose                     | Installation Command       |
|---------|----------|-----------------------------|----------------------------|
| zod     | ^3.24.2  | Schema validation           | `npm install zod@^3.24.2`  |

**Installation Steps:**

```bash
# Install new dependencies
npm install zod@^3.24.2

# Verify installation
npm list zod
```

---

## Implementation Phases

### **Phase 1: Status Synchronization Fix** (Priority: Critical)

**Objective**: Fix hardcoded status in `scanMoaiSpecs` to read from frontmatter

**Dependencies**: None (standalone fix)

**Estimated Effort**: 6 TAGs, ~4-6 hours

#### TAG-001: Analyze Current Implementation
**Status**: pending
**File**: `server/flow-sync.ts` (lines 308-339)

**Tasks**:
- Read `scanMoaiSpecs` function implementation
- Identify all occurrences of hardcoded `status: 'active'`
- Document expected vs actual behavior
- Create characterization test capturing current behavior

**Acceptance Criteria**:
- Current implementation documented with code snippets
- Characterization test passes with hardcoded behavior
- All status assignment locations identified

---

#### TAG-002: Reference Correct Implementation Pattern
**Status**: pending
**File**: `server/moai-specs.ts` (lines 68-72)
**Dependencies**: TAG-001

**Tasks**:
- Read `server/moai-specs.ts` implementation
- Extract frontmatter parsing pattern using gray-matter
- Document status normalization logic
- Compare with `flow-sync.ts` implementation

**Acceptance Criteria**:
- Correct pattern documented
- Status normalization rules identified
- Comparison report created

---

#### TAG-003: Implement Frontmatter Status Parsing
**Status**: pending
**File**: `server/flow-sync.ts`
**Dependencies**: TAG-002

**Tasks**:
- Import gray-matter library at top of file
- Add `parseFrontmatter(content: string)` helper function
- Extract status field from frontmatter
- Apply normalization (lowercase, trim, validate)
- Handle missing/invalid status with 'planned' default

**Implementation**:

```typescript
import matter from 'gray-matter';

interface SpecFrontmatter {
  spec_id: string;
  title: string;
  status?: string;
  priority?: string;
  created?: string;
  updated?: string;
}

function parseSpecFrontmatter(fileContent: string): SpecFrontmatter {
  const { data } = matter(fileContent);
  return {
    spec_id: data.spec_id || '',
    title: data.title || '',
    status: normalizeStatus(data.status),
    priority: data.priority || 'medium',
    created: data.created,
    updated: data.updated,
  };
}

function normalizeStatus(status: string | undefined): string {
  if (!status) {
    console.warn('Missing status field, defaulting to planned');
    return 'planned';
  }

  const normalized = status.toLowerCase().trim().replace(/\s+/g, '_');
  const validStatuses = ['planned', 'active', 'completed', 'blocked', 'archived'];

  if (!validStatuses.includes(normalized)) {
    console.warn(`Invalid status "${status}", defaulting to planned`);
    return 'planned';
  }

  return normalized;
}
```

**Acceptance Criteria**:
- gray-matter successfully parses YAML frontmatter
- Status field extracted correctly
- Normalization handles edge cases (missing, invalid, case variations)
- Warning logged for missing/invalid status

---

#### TAG-004: Update Database Queries
**Status**: pending
**File**: `server/flow-sync.ts`
**Dependencies**: TAG-003

**Tasks**:
- Locate INSERT query for new SPECs
- Locate UPDATE query for existing SPECs
- Replace hardcoded `status: 'active'` with parsed status
- Add status validation before database write
- Update TypeScript types to reflect status field

**Implementation**:

```typescript
// Before: Hardcoded status
db.run(`
  INSERT INTO tasks (spec_id, title, status, priority)
  VALUES (?, ?, 'active', ?)
`, [specId, title, priority]);

// After: Parsed status
const frontmatter = parseSpecFrontmatter(fileContent);
db.run(`
  INSERT INTO tasks (spec_id, title, status, priority)
  VALUES (?, ?, ?, ?)
`, [
  frontmatter.spec_id,
  frontmatter.title,
  frontmatter.status, // Now from frontmatter
  frontmatter.priority
]);
```

**Acceptance Criteria**:
- All INSERT queries use parsed status
- All UPDATE queries use parsed status
- TypeScript types updated for status field
- No hardcoded 'active' status remains

---

#### TAG-005: Create Status Migration Script
**Status**: pending
**File**: `server/scripts/migrate-spec-status.ts` (new)
**Dependencies**: TAG-004

**Tasks**:
- Create migration script to update existing database records
- Scan all SPEC frontmatter files
- Read status from each frontmatter
- Update corresponding database record
- Generate migration report with before/after status counts

**Implementation**:

```typescript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { db } from '../db';

async function migrateSpecStatus() {
  const specsDir = '.moai/specs';
  const specDirs = await fs.readdir(specsDir);

  const report = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    changes: [] as Array<{ specId: string; oldStatus: string; newStatus: string }>
  };

  for (const specDir of specDirs) {
    if (!specDir.startsWith('SPEC-')) continue;

    report.total++;

    try {
      const specPath = path.join(specsDir, specDir, 'spec.md');
      const content = await fs.readFile(specPath, 'utf-8');
      const { data } = matter(content);

      const newStatus = normalizeStatus(data.status);

      // Get current status from database
      const current = db.get('SELECT status FROM tasks WHERE spec_id = ?', [data.spec_id]);

      if (current && current.status !== newStatus) {
        db.run('UPDATE tasks SET status = ? WHERE spec_id = ?', [newStatus, data.spec_id]);
        report.updated++;
        report.changes.push({
          specId: data.spec_id,
          oldStatus: current.status,
          newStatus
        });
      } else {
        report.skipped++;
      }
    } catch (error) {
      console.error(`Error processing ${specDir}:`, error);
      report.errors++;
    }
  }

  console.log('Migration Report:', JSON.stringify(report, null, 2));
  return report;
}

migrateSpecStatus().catch(console.error);
```

**Acceptance Criteria**:
- Migration script successfully scans all SPECs
- Database records updated with frontmatter status
- Migration report generated with change details
- Script can be run multiple times safely (idempotent)

---

#### TAG-006: Integration Testing
**Status**: pending
**File**: `server/__tests__/flow-sync.test.ts`
**Dependencies**: TAG-005

**Tasks**:
- Create test SPECs with different status values
- Test status sync for 'planned', 'active', 'completed', 'blocked'
- Test default behavior with missing frontmatter
- Test normalization with case variations
- Test concurrent status updates
- Verify database reflects frontmatter accurately

**Test Cases**:

```typescript
describe('SPEC Status Synchronization', () => {
  test('reads status from frontmatter for planned SPEC', async () => {
    const specContent = `---
spec_id: SPEC-TEST-001
title: Test SPEC
status: planned
---`;

    await scanMoaiSpecs();
    const dbRecord = db.get('SELECT status FROM tasks WHERE spec_id = ?', ['SPEC-TEST-001']);
    expect(dbRecord.status).toBe('planned');
  });

  test('defaults to planned for missing status', async () => {
    const specContent = `---
spec_id: SPEC-TEST-002
title: Test SPEC
---`;

    await scanMoaiSpecs();
    const dbRecord = db.get('SELECT status FROM tasks WHERE spec_id = ?', ['SPEC-TEST-002']);
    expect(dbRecord.status).toBe('planned');
  });

  test('normalizes status case variations', async () => {
    const specContent = `---
spec_id: SPEC-TEST-003
title: Test SPEC
status: In Progress
---`;

    await scanMoaiSpecs();
    const dbRecord = db.get('SELECT status FROM tasks WHERE spec_id = ?', ['SPEC-TEST-003']);
    expect(dbRecord.status).toBe('in_progress');
  });
});
```

**Acceptance Criteria**:
- All test cases pass
- Edge cases covered (missing, invalid, case variations)
- Integration with database verified
- No regression in existing functionality

---

### **Phase 2: Unified SPEC Scanner** (Priority: High)

**Objective**: Create unified scanner for both MoAI and OpenSpec formats

**Dependencies**: Phase 1 complete (status sync needed for unified view)

**Estimated Effort**: 5 TAGs, ~6-8 hours

#### TAG-007: Design Unified SPEC Data Model
**Status**: pending
**File**: `server/types/spec.ts` (new)

**Tasks**:
- Define TypeScript interface for unified SPEC representation
- Add `format: 'moai' | 'openspec'` discriminator field
- Include source path and migration status fields
- Create zod schema for validation

**Implementation**:

```typescript
import { z } from 'zod';

export const SpecFormatSchema = z.enum(['moai', 'openspec']);
export type SpecFormat = z.infer<typeof SpecFormatSchema>;

export const UnifiedSpecSchema = z.object({
  spec_id: z.string(),
  title: z.string(),
  status: z.enum(['planned', 'active', 'completed', 'blocked', 'archived']),
  priority: z.enum(['high', 'medium', 'low']),
  format: SpecFormatSchema,
  sourcePath: z.string(),
  created: z.string().optional(),
  updated: z.string().optional(),
  migrationCandidate: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export type UnifiedSpec = z.infer<typeof UnifiedSpecSchema>;

export interface MigrationStatus {
  moaiCount: number;
  openspecCount: number;
  migrationCandidates: number;
  totalSpecs: number;
}
```

**Acceptance Criteria**:
- TypeScript interfaces defined
- Zod schemas created for validation
- Format discriminator included
- Migration candidate flag supported

---

#### TAG-008: Create Unified Scanner Module
**Status**: pending
**File**: `server/unified-spec-scanner.ts` (new)
**Dependencies**: TAG-007

**Tasks**:
- Implement `scanMoaiSpecs()` function (refactor existing)
- Implement `scanOpenSpecs()` function for OpenSpec format
- Implement `mergeSpecLists()` for unified view with deduplication
- Add duplicate detection and MoAI prioritization

**Implementation**:

```typescript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { UnifiedSpec, SpecFormat } from './types/spec';

export async function scanMoaiSpecs(): Promise<UnifiedSpec[]> {
  const specsDir = '.moai/specs';
  const specs: UnifiedSpec[] = [];

  const specDirs = await fs.readdir(specsDir);

  for (const specDir of specDirs) {
    if (!specDir.startsWith('SPEC-')) continue;

    try {
      const specPath = path.join(specsDir, specDir, 'spec.md');
      const content = await fs.readFile(specPath, 'utf-8');
      const { data } = matter(content);

      specs.push({
        spec_id: data.spec_id,
        title: data.title,
        status: normalizeStatus(data.status),
        priority: data.priority || 'medium',
        format: 'moai',
        sourcePath: specPath,
        created: data.created,
        updated: data.updated,
        tags: data.tags || [],
      });
    } catch (error) {
      console.error(`Error scanning ${specDir}:`, error);
    }
  }

  return specs;
}

export async function scanOpenSpecs(): Promise<UnifiedSpec[]> {
  const openspecDir = 'openspec/specs';

  // Check if openspec directory exists
  try {
    await fs.access(openspecDir);
  } catch {
    return []; // OpenSpec directory doesn't exist
  }

  const specs: UnifiedSpec[] = [];
  const specFiles = await fs.readdir(openspecDir);

  for (const specFile of specFiles) {
    if (!specFile.endsWith('.md')) continue;

    try {
      const specPath = path.join(openspecDir, specFile);
      const content = await fs.readFile(specPath, 'utf-8');
      const { data } = matter(content);

      specs.push({
        spec_id: data.id || specFile.replace('.md', ''),
        title: data.title || specFile,
        status: 'active', // OpenSpec doesn't have status field
        priority: 'medium',
        format: 'openspec',
        sourcePath: specPath,
        created: data.created,
        updated: data.updated,
      });
    } catch (error) {
      console.error(`Error scanning ${specFile}:`, error);
    }
  }

  return specs;
}

export function mergeSpecLists(moaiSpecs: UnifiedSpec[], openspecs: UnifiedSpec[]): UnifiedSpec[] {
  const specMap = new Map<string, UnifiedSpec>();

  // Add MoAI specs first (higher priority)
  for (const spec of moaiSpecs) {
    specMap.set(spec.spec_id, spec);
  }

  // Add OpenSpec specs, marking duplicates
  for (const spec of openspecs) {
    if (specMap.has(spec.spec_id)) {
      // Duplicate detected - mark OpenSpec as migration candidate
      spec.migrationCandidate = true;
      specMap.set(`${spec.spec_id}-openspec`, spec);
    } else {
      specMap.set(spec.spec_id, spec);
    }
  }

  return Array.from(specMap.values());
}

export async function scanAllSpecs(): Promise<UnifiedSpec[]> {
  const [moaiSpecs, openspecs] = await Promise.all([
    scanMoaiSpecs(),
    scanOpenSpecs(),
  ]);

  return mergeSpecLists(moaiSpecs, openspecs);
}
```

**Acceptance Criteria**:
- MoAI specs scanned from `.moai/specs/`
- OpenSpec specs scanned from `openspec/specs/`
- Unified list merges both formats
- Duplicates detected and MoAI prioritized
- Migration candidate flag set correctly

---

#### TAG-009: Create API Routes
**Status**: pending
**File**: `server/routes/specs.ts` (new)
**Dependencies**: TAG-008

**Tasks**:
- Create `GET /api/specs` endpoint with filtering
- Create `GET /api/specs/:id` endpoint for single SPEC
- Create `GET /api/specs/migration-status` endpoint
- Add query parameter support (format, status, domain)
- Implement pagination

**Implementation**:

```typescript
import express from 'express';
import { scanAllSpecs } from '../unified-spec-scanner';
import { UnifiedSpec, MigrationStatus } from '../types/spec';

const router = express.Router();

// Cache for scan results
let cachedSpecs: UnifiedSpec[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 60 seconds

async function getSpecs(forceRefresh = false): Promise<UnifiedSpec[]> {
  const now = Date.now();

  if (!forceRefresh && cachedSpecs && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedSpecs;
  }

  cachedSpecs = await scanAllSpecs();
  cacheTimestamp = now;
  return cachedSpecs;
}

// GET /api/specs - List all specs with filtering
router.get('/', async (req, res) => {
  try {
    const specs = await getSpecs();

    // Apply filters
    let filtered = specs;

    if (req.query.format) {
      filtered = filtered.filter(s => s.format === req.query.format);
    }

    if (req.query.status) {
      filtered = filtered.filter(s => s.status === req.query.status);
    }

    if (req.query.domain) {
      filtered = filtered.filter(s => s.spec_id.includes(req.query.domain as string));
    }

    res.json({
      specs: filtered,
      total: filtered.length,
      filters: {
        format: req.query.format,
        status: req.query.status,
        domain: req.query.domain,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan specs' });
  }
});

// GET /api/specs/:id - Get single SPEC details
router.get('/:id', async (req, res) => {
  try {
    const specs = await getSpecs();
    const spec = specs.find(s => s.spec_id === req.params.id);

    if (!spec) {
      return res.status(404).json({ error: 'SPEC not found' });
    }

    res.json(spec);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve SPEC' });
  }
});

// GET /api/specs/migration-status - Migration progress tracking
router.get('/migration-status', async (req, res) => {
  try {
    const specs = await getSpecs();

    const status: MigrationStatus = {
      moaiCount: specs.filter(s => s.format === 'moai').length,
      openspecCount: specs.filter(s => s.format === 'openspec').length,
      migrationCandidates: specs.filter(s => s.migrationCandidate).length,
      totalSpecs: specs.length,
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get migration status' });
  }
});

export default router;
```

**Acceptance Criteria**:
- `GET /api/specs` returns all specs with filters
- `GET /api/specs/:id` returns single SPEC
- `GET /api/specs/migration-status` returns counts
- Query parameters work correctly
- Cache improves performance

---

#### TAG-010: Implement Caching Layer
**Status**: pending
**File**: `server/cache-manager.ts` (new)
**Dependencies**: TAG-009

**Tasks**:
- Create cache manager module
- Implement 60-second TTL for scan results
- Add cache invalidation on file changes
- Add cache hit/miss metrics logging

**Implementation** (included in TAG-009 above)

**Acceptance Criteria**:
- Cache TTL set to 60 seconds
- Cache invalidates on SPEC file changes
- Cache hit rate logged for monitoring
- Performance improves after initial scan

---

#### TAG-011: Integration Testing
**Status**: pending
**File**: `server/__tests__/unified-spec-scanner.test.ts`
**Dependencies**: TAG-010

**Tasks**:
- Test with MoAI-only project
- Test with OpenSpec-only project
- Test with mixed MoAI + OpenSpec project
- Test deduplication logic
- Test API endpoints with filters

**Acceptance Criteria**:
- All test cases pass
- Edge cases covered
- API endpoints validated
- Performance within 100ms target

---

### **Phase 3: OpenSpec → MoAI Migration Tool** (Priority: High)

**Objective**: Automated migration from OpenSpec to MoAI 3-file format

**Dependencies**: Phase 2 complete (scanner identifies migration candidates)

**Estimated Effort**: 7 TAGs, ~10-12 hours

#### TAG-012: Design OpenSpec Parser
**Status**: pending
**File**: `server/migrations/openspec-parser.ts` (new)

**Tasks**:
- Analyze OpenSpec markdown structure
- Identify extractable sections (## Requirements, ## Tasks, ## Acceptance)
- Create TypeScript AST representation for parsed structure

**Acceptance Criteria**:
- Parser handles variable OpenSpec structures
- Sections extracted correctly
- Missing sections detected and logged

---

#### TAG-013: Implement EARS Generator
**Status**: pending
**File**: `server/migrations/ears-generator.ts` (new)
**Dependencies**: TAG-012

**Tasks**:
- Convert OpenSpec requirements to EARS patterns
- Detect requirement types (WHEN, IF, WHILE)
- Generate proper EARS syntax

**Acceptance Criteria**:
- Requirements converted to valid EARS format
- Traceability tags added
- Generated spec.md validates

---

#### TAG-014: Implement TAG Chain Generator
**Status**: pending
**File**: `server/migrations/tag-generator.ts` (new)
**Dependencies**: TAG-013

**Tasks**:
- Extract task lists from OpenSpec
- Generate TAG-{NUM} identifiers
- Create hierarchical task structure for plan.md

**Acceptance Criteria**:
- TAG chains properly formatted
- Hierarchy preserved
- Generated plan.md validates

---

#### TAG-015: Implement Gherkin Generator
**Status**: pending
**File**: `server/migrations/gherkin-generator.ts` (new)
**Dependencies**: TAG-014

**Tasks**:
- Convert test scenarios to Given/When/Then format
- Extract acceptance criteria from OpenSpec
- Generate scenario outlines for data-driven tests

**Acceptance Criteria**:
- Scenarios in valid Gherkin format
- Edge cases included
- Generated acceptance.md validates

---

#### TAG-016: Create Migration Orchestrator
**Status**: pending
**File**: `server/migrations/migrate-spec-format.ts` (new)
**Dependencies**: TAG-015

**Tasks**:
- Implement main migration orchestrator
- Add dry-run mode for preview
- Add validation for generated content
- Create migration report

**Acceptance Criteria**:
- Dry-run produces accurate preview
- Validation catches errors
- Migration report comprehensive

---

#### TAG-017: Create Batch Migration Script
**Status**: pending
**File**: `server/scripts/migrate-all-openspecs.ts` (new)
**Dependencies**: TAG-016

**Tasks**:
- Scan all OpenSpec specs in project
- Generate migration report with warnings
- Execute batch migration with user confirmation

**Acceptance Criteria**:
- All OpenSpec files processed
- Progress tracking implemented
- User confirmation required before write

---

#### TAG-018: Test with zellyy-money OpenSpec
**Status**: pending
**Dependencies**: TAG-017

**Tasks**:
- Dry-run all 19 OpenSpec specs in zellyy-money
- Review generated MoAI format for accuracy
- Execute actual migration and verify results

**Acceptance Criteria**:
- 19 specs successfully converted
- Generated files validate
- Original files preserved

---

### **Phase 4: Archive Management** (Priority: Medium)

**Objective**: Implement archive and restore workflows

**Dependencies**: Phase 2 complete (unified scanner provides archive visibility)

**Estimated Effort**: 5 TAGs, ~6-8 hours

#### TAG-019: Design Archive Structure
**Status**: pending
**File**: `docs/archive-design.md` (new)

**Tasks**:
- Create `.moai/archive/{YYYY-MM}/` structure
- Define archive metadata format
- Plan restore workflow

**Acceptance Criteria**:
- Archive structure documented
- Metadata format defined
- Restore workflow planned

---

#### TAG-020: Create Archive Manager Module
**Status**: pending
**File**: `server/archive-manager.ts` (new)
**Dependencies**: TAG-019

**Tasks**:
- Implement `archiveSpec(specId)` function
- Implement `restoreSpec(specId)` function
- Implement `listArchivedSpecs()` function
- Add atomic filesystem + database operations

**Acceptance Criteria**:
- Archive operations work correctly
- Restore operations work correctly
- Atomic operations guaranteed

---

#### TAG-021: Create Archive API Endpoints
**Status**: pending
**File**: `server/routes/specs.ts` (modify)
**Dependencies**: TAG-020

**Tasks**:
- Add `POST /api/specs/:id/archive` endpoint
- Add `POST /api/specs/:id/restore` endpoint
- Add `GET /api/specs/archived` endpoint

**Acceptance Criteria**:
- All endpoints functional
- Error handling comprehensive
- API documentation updated

---

#### TAG-022: Implement Rollback on Errors
**Status**: pending
**File**: `server/archive-manager.ts` (modify)
**Dependencies**: TAG-021

**Tasks**:
- Add transaction-like behavior
- Rollback database changes on filesystem errors
- Add comprehensive error logging

**Acceptance Criteria**:
- Rollback works correctly
- No partial state changes
- Errors logged with context

---

#### TAG-023: Integration Testing
**Status**: pending
**File**: `server/__tests__/archive-manager.test.ts`
**Dependencies**: TAG-022

**Tasks**:
- Test archive operation
- Test restore operation
- Test error scenarios
- Test rollback

**Acceptance Criteria**:
- All tests pass
- Edge cases covered
- Error scenarios validated

---

## Risk Analysis

### High-Risk Areas

**Risk 1: Data Loss During Migration**
- **Impact**: High - Loss of SPEC content
- **Probability**: Medium
- **Mitigation**:
  - Implement dry-run mode
  - Preserve original files by default
  - Add comprehensive validation
  - Create backups before migration

**Risk 2: Database-Filesystem Desynchronization**
- **Impact**: High - Inconsistent system state
- **Probability**: Medium
- **Mitigation**:
  - Implement atomic operations
  - Add rollback capability
  - Log all operations for audit trail
  - Add synchronization verification

**Risk 3: Performance Degradation**
- **Impact**: Medium - Slow UI response
- **Probability**: Low
- **Mitigation**:
  - Implement 60-second caching
  - Optimize database queries
  - Add pagination for large datasets
  - Monitor performance metrics

### Medium-Risk Areas

**Risk 4: OpenSpec Parser Failures**
- **Impact**: Medium - Migration incomplete
- **Probability**: Medium
- **Mitigation**:
  - Handle variable OpenSpec structures gracefully
  - Generate placeholder content for missing sections
  - Log warnings for manual review
  - Provide detailed error messages

**Risk 5: Breaking Existing Functionality**
- **Impact**: High - Regression in working features
- **Probability**: Low
- **Mitigation**:
  - Create characterization tests before changes
  - Maintain backward compatibility
  - Incremental deployment with validation
  - Comprehensive integration testing

---

## Dependencies Between Phases

```
Phase 1 (Status Fix)
    ↓
Phase 2 (Unified Scanner) ← depends on Phase 1 for accurate status
    ↓
Phase 3 (Migration Tool) ← depends on Phase 2 for identifying candidates
    ↓
Phase 4 (Archive) ← depends on Phase 2 for unified visibility
```

**Sequential Dependencies**:
- Phase 2 requires Phase 1 completion (status sync needed for unified view)
- Phase 3 requires Phase 2 completion (scanner identifies migration candidates)
- Phase 4 requires Phase 2 completion (unified scanner provides archive visibility)

**Parallel Opportunities**:
- Phase 3 and Phase 4 can be developed in parallel after Phase 2 completes
- Testing can occur in parallel with development of next phase

---

## Deployment Strategy

### Incremental Deployment

**Step 1: Deploy Phase 1 (Status Fix)**
- Deploy to production after TAG-006 complete
- Monitor status sync accuracy
- Verify no regressions

**Step 2: Deploy Phase 2 (Unified Scanner)**
- Deploy after all integration tests pass
- Enable caching gradually
- Monitor performance metrics

**Step 3: Deploy Phase 3 (Migration Tool)**
- Deploy dry-run mode first
- Validate with test migrations
- Enable batch migration after validation

**Step 4: Deploy Phase 4 (Archive)**
- Deploy archive operations
- Test with non-critical SPECs
- Enable for all SPECs after validation

---

## Success Criteria Summary

| Phase | Success Metric                                  | Target        |
|-------|-------------------------------------------------|---------------|
| 1     | Status accuracy from frontmatter                | 100%          |
| 2     | Unified visibility (zellyy-money)               | 22+ specs     |
| 2     | Query performance                               | <100ms        |
| 3     | Migration success rate                          | 19/19 specs   |
| 3     | Data preservation                               | 100%          |
| 4     | Archive/restore success rate                    | 100%          |
| 4     | Zero data loss                                  | 0 errors      |
| All   | TypeScript type safety                          | 0 errors      |
| All   | Test coverage                                   | >85%          |

---

**End of Implementation Plan**
