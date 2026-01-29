import { describe, it, expect } from 'vitest'
import { parseFrontmatter, parsePlanFile, parseAcceptanceFile, parseSpecFile } from './moai-parser.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PLAN_CONTENT = `---
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

## TAG Chain

### TAG-001: Characterization Tests for Core Components
- **Scope**: server/parser-utils.ts, server/sync-tasks.ts, server/routes/flow.ts
- **Purpose**: Capture existing behavior before any modifications
- **Dependencies**: None
- **Completion Conditions**:
  - [ ] Characterization tests for parseTasksFile() behavior
  - [ ] Characterization tests for syncChangeTasksFromFile() behavior
  - [ ] Characterization tests for flow route handlers
  - [ ] All existing tests still pass (baseline: 464/498)

### TAG-002: MoAI SPEC Parser Module
- **Scope**: packages/zyflow-parser/src/
- **Purpose**: Add MoAI spec.md/plan.md/acceptance.md parsing alongside existing OpenSpec parsing
- **Dependencies**: TAG-001
- **Completion Conditions**:
  - [x] parsePlanFile() extracts TAG chain with status, scope, dependencies
  - [x] parseAcceptanceFile() extracts Gherkin criteria with verification status
  - [x] parseSpecFile() extracts EARS requirements and metadata (frontmatter)
  - [ ] New parser functions exported alongside existing ones (no breaking changes)
  - [ ] Unit tests for all new parser functions
  - [ ] TypeScript types for MoAI SPEC structures

### TAG-003: Database Schema Dual-Support
- **Scope**: server/tasks/db/schema.ts, server/tasks/db/client.ts
- **Purpose**: Enable DB to store both OpenSpec and MoAI originated tasks
- **Dependencies**: TAG-001
- **Completion Conditions**:
  - [ ] origin enum includes 'moai' value
  - [ ] specPath supports .moai/specs/ paths
`

const ACCEPTANCE_CONTENT = `---
spec_id: SPEC-MIGR-001
phase: acceptance
created: 2026-01-28
format: gherkin
total_criteria: 3
---

# SPEC-MIGR-001: Acceptance Criteria

## AC-1: MoAI SPEC Parser Functionality

**Given** a MoAI SPEC directory at \`.moai/specs/SPEC-XXX/\` containing spec.md, plan.md, and acceptance.md
**When** the parser processes the SPEC directory
**Then** it shall extract:
- EARS requirements from spec.md with frontmatter metadata
- TAG chain items from plan.md with status, scope, and dependencies
- Gherkin criteria from acceptance.md with verification status

### Verification Method
\`\`\`bash
npx vitest run packages/zyflow-parser/src/moai-parser.test.ts
\`\`\`

### Success Metrics
- [ ] parsePlanFile() correctly extracts all TAG items
- [x] parseAcceptanceFile() correctly extracts Gherkin criteria
- [ ] parseSpecFile() correctly extracts EARS requirements
- [ ] Parser handles missing files gracefully (partial SPEC)
- [ ] Parser handles malformed markdown without crashing

---

## AC-2: Database Schema Compatibility

**Given** an existing ZyFlow database with OpenSpec-originated tasks
**When** the schema migration runs
**Then** it shall:
- Add 'moai' to the origin enum
- Preserve all task data without loss

### Success Metrics
- [x] Zero tasks with origin='openspec' after migration
- [x] Task count preserved (before count == after count)

---

## Definition of Done

- [ ] All 3 acceptance criteria verified and passing
- [x] Code reviewed (self-review or pair review)
- [ ] CHANGELOG.md updated with migration entry
`

const SPEC_CONTENT = `---
spec_id: SPEC-MIGR-001
title: OpenSpec to MoAI SPEC System Migration
priority: Critical
status: Draft
created: 2026-01-28
assigned: manager-ddd
dependencies: []
related_specs: [SPEC-TEST-001, SPEC-ARCH-001]
tags: [migration, openspec, moai]
---

# SPEC-MIGR-001: OpenSpec to MoAI SPEC System Migration

## Overview

Migrate ZyFlow from OpenSpec-based spec-driven development to MoAI-ADK SPEC system.

## Functional Requirements

### FR-1: SPEC Parser

**[EARS: Ubiquitous]**
The system shall parse MoAI SPEC documents from .moai/specs/ directories.

**[EARS: Event-Driven]**
When a SPEC document is modified, the system shall synchronize TAG chain items to the tasks database table.

**[EARS: Unwanted]**
If a SPEC document contains invalid YAML frontmatter, then the system shall log a warning and skip the document.

### FR-2: Database Schema Migration

**[EARS: Ubiquitous]**
The system shall store SPEC-originated tasks with origin='moai' in the tasks table.

**[EARS: Event-Driven]**
When the migration runs, the system shall convert existing tasks with origin='openspec' to origin='moai'.

## Non-Functional Requirements

### NFR-1: Build Integrity

**[EARS: Ubiquitous]**
The system shall maintain a passing TypeScript compilation at every migration step.

## Constraints

TypeScript 5.x + React 19 + Express backend.
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MoAI SPEC Parser', () => {
  // =========================================================================
  // Frontmatter
  // =========================================================================
  describe('parseFrontmatter', () => {
    it('parses basic key-value pairs', () => {
      const fm = parseFrontmatter(PLAN_CONTENT)

      expect(fm.spec_id).toBe('SPEC-MIGR-001')
      expect(fm.phase).toBe('plan')
      expect(fm.created).toBe('2026-01-28')
    })

    it('parses numeric values', () => {
      const fm = parseFrontmatter(PLAN_CONTENT)

      expect(fm.estimated_tags).toBe(15)
    })

    it('parses array values in bracket notation', () => {
      const fm = parseFrontmatter(SPEC_CONTENT)

      expect(fm.related_specs).toEqual(['SPEC-TEST-001', 'SPEC-ARCH-001'])
      expect(fm.tags).toEqual(['migration', 'openspec', 'moai'])
    })

    it('parses empty arrays', () => {
      const fm = parseFrontmatter(SPEC_CONTENT)

      expect(fm.dependencies).toEqual([])
    })

    it('returns defaults for content without frontmatter', () => {
      const fm = parseFrontmatter('# Just a title\n\nSome text.')

      expect(fm.spec_id).toBe('')
      expect(fm.phase).toBe('')
      expect(fm.created).toBe('')
    })

    it('returns defaults for empty content', () => {
      const fm = parseFrontmatter('')

      expect(fm.spec_id).toBe('')
    })
  })

  // =========================================================================
  // Plan parser
  // =========================================================================
  describe('parsePlanFile', () => {
    it('extracts spec ID from frontmatter', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      expect(result.specId).toBe('SPEC-MIGR-001')
      expect(result.frontmatter.spec_id).toBe('SPEC-MIGR-001')
      expect(result.frontmatter.phase).toBe('plan')
    })

    it('extracts strategy section text', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      expect(result.strategy).toBeDefined()
      expect(result.strategy).toContain('Vertical-slice DDD migration')
    })

    it('extracts all TAG items', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      expect(result.tags).toHaveLength(3)
      expect(result.tags[0].id).toBe('TAG-001')
      expect(result.tags[1].id).toBe('TAG-002')
      expect(result.tags[2].id).toBe('TAG-003')
    })

    it('extracts TAG titles', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      expect(result.tags[0].title).toBe('Characterization Tests for Core Components')
      expect(result.tags[1].title).toBe('MoAI SPEC Parser Module')
      expect(result.tags[2].title).toBe('Database Schema Dual-Support')
    })

    it('extracts TAG scope', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      expect(result.tags[0].scope).toBe(
        'server/parser-utils.ts, server/sync-tasks.ts, server/routes/flow.ts'
      )
      expect(result.tags[1].scope).toBe('packages/zyflow-parser/src/')
    })

    it('extracts TAG purpose', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      expect(result.tags[0].purpose).toBe(
        'Capture existing behavior before any modifications'
      )
    })

    it('extracts dependencies correctly', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      // TAG-001 has "None"
      expect(result.tags[0].dependencies).toEqual([])
      // TAG-002 depends on TAG-001
      expect(result.tags[1].dependencies).toEqual(['TAG-001'])
      // TAG-003 depends on TAG-001
      expect(result.tags[2].dependencies).toEqual(['TAG-001'])
    })

    it('extracts completion conditions as checkboxes', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      // TAG-001 has 4 unchecked conditions
      expect(result.tags[0].conditions).toHaveLength(4)
      expect(result.tags[0].conditions[0].text).toBe(
        'Characterization tests for parseTasksFile() behavior'
      )
      expect(result.tags[0].conditions[0].checked).toBe(false)
    })

    it('detects checked conditions', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      // TAG-002 has 3 checked and 3 unchecked
      const tag002 = result.tags[1]
      expect(tag002.conditions).toHaveLength(6)
      expect(tag002.conditions[0].checked).toBe(true)
      expect(tag002.conditions[1].checked).toBe(true)
      expect(tag002.conditions[2].checked).toBe(true)
      expect(tag002.conditions[3].checked).toBe(false)
    })

    it('determines TAG completed status', () => {
      const result = parsePlanFile(PLAN_CONTENT)

      // TAG-001: all unchecked -> not completed
      expect(result.tags[0].completed).toBe(false)
      // TAG-002: mixed -> not completed
      expect(result.tags[1].completed).toBe(false)
    })

    it('marks TAG as completed when all conditions checked', () => {
      const content = `---
spec_id: SPEC-TEST
phase: plan
created: 2026-01-01
---

# Test Plan

## TAG Chain

### TAG-001: Done Task
- **Scope**: test/
- **Purpose**: Testing
- **Dependencies**: None
- **Completion Conditions**:
  - [x] First condition done
  - [x] Second condition done
`
      const result = parsePlanFile(content)

      expect(result.tags[0].completed).toBe(true)
    })

    it('handles empty content gracefully', () => {
      const result = parsePlanFile('')

      expect(result.specId).toBe('')
      expect(result.tags).toHaveLength(0)
      expect(result.strategy).toBeUndefined()
    })

    it('handles content without TAG chain section', () => {
      const content = `---
spec_id: SPEC-EMPTY
phase: plan
created: 2026-01-01
---

# Empty Plan

## Strategy

Just a strategy section, no TAGs.
`
      const result = parsePlanFile(content)

      expect(result.specId).toBe('SPEC-EMPTY')
      expect(result.tags).toHaveLength(0)
      expect(result.strategy).toContain('Just a strategy section')
    })

    it('handles multiple dependencies', () => {
      const content = `---
spec_id: SPEC-TEST
phase: plan
created: 2026-01-01
---

# Test Plan

## TAG Chain

### TAG-004: Multi-Dependency
- **Scope**: server/
- **Purpose**: Testing multiple deps
- **Dependencies**: TAG-001, TAG-002, TAG-003
- **Completion Conditions**:
  - [ ] Some condition
`
      const result = parsePlanFile(content)

      expect(result.tags[0].dependencies).toEqual(['TAG-001', 'TAG-002', 'TAG-003'])
    })
  })

  // =========================================================================
  // Acceptance parser
  // =========================================================================
  describe('parseAcceptanceFile', () => {
    it('extracts spec ID from frontmatter', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      expect(result.specId).toBe('SPEC-MIGR-001')
      expect(result.frontmatter.phase).toBe('acceptance')
    })

    it('extracts all acceptance criteria', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      expect(result.criteria).toHaveLength(2)
      expect(result.criteria[0].id).toBe('AC-1')
      expect(result.criteria[1].id).toBe('AC-2')
    })

    it('extracts AC titles', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      expect(result.criteria[0].title).toBe('MoAI SPEC Parser Functionality')
      expect(result.criteria[1].title).toBe('Database Schema Compatibility')
    })

    it('extracts Given clause', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      expect(result.criteria[0].given).toContain(
        'MoAI SPEC directory'
      )
    })

    it('extracts When clause', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      expect(result.criteria[0].when).toContain('parser processes the SPEC directory')
    })

    it('extracts Then clause with continuation lines', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      // Then clause with bullet continuation
      expect(result.criteria[0].then).toContain('it shall extract')
      expect(result.criteria[0].then).toContain('EARS requirements')
    })

    it('extracts success metrics', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      // AC-1 has 5 metrics
      expect(result.criteria[0].successMetrics).toHaveLength(5)
      expect(result.criteria[0].successMetrics[0].text).toBe(
        'parsePlanFile() correctly extracts all TAG items'
      )
      expect(result.criteria[0].successMetrics[0].checked).toBe(false)
      expect(result.criteria[0].successMetrics[1].checked).toBe(true)
    })

    it('determines verified status from success metrics', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      // AC-1: not all checked -> not verified
      expect(result.criteria[0].verified).toBe(false)
      // AC-2: all checked -> verified
      expect(result.criteria[1].verified).toBe(true)
    })

    it('extracts Definition of Done checkboxes', () => {
      const result = parseAcceptanceFile(ACCEPTANCE_CONTENT)

      expect(result.definitionOfDone).toHaveLength(3)
      expect(result.definitionOfDone[0].text).toBe(
        'All 3 acceptance criteria verified and passing'
      )
      expect(result.definitionOfDone[0].checked).toBe(false)
      expect(result.definitionOfDone[1].checked).toBe(true)
      expect(result.definitionOfDone[2].checked).toBe(false)
    })

    it('handles empty content gracefully', () => {
      const result = parseAcceptanceFile('')

      expect(result.specId).toBe('')
      expect(result.criteria).toHaveLength(0)
      expect(result.definitionOfDone).toHaveLength(0)
    })

    it('handles content without AC sections', () => {
      const content = `---
spec_id: SPEC-EMPTY
phase: acceptance
created: 2026-01-01
---

# Empty Acceptance

Just some text, no AC sections.

## Definition of Done

- [x] Single item
`
      const result = parseAcceptanceFile(content)

      expect(result.criteria).toHaveLength(0)
      expect(result.definitionOfDone).toHaveLength(1)
      expect(result.definitionOfDone[0].checked).toBe(true)
    })

    it('handles AC without success metrics', () => {
      const content = `---
spec_id: SPEC-TEST
phase: acceptance
created: 2026-01-01
---

# Test Acceptance

## AC-1: Basic Test

**Given** a test condition
**When** something happens
**Then** it should work
`
      const result = parseAcceptanceFile(content)

      expect(result.criteria).toHaveLength(1)
      expect(result.criteria[0].successMetrics).toHaveLength(0)
      // No metrics means not verified
      expect(result.criteria[0].verified).toBe(false)
    })
  })

  // =========================================================================
  // Spec parser
  // =========================================================================
  describe('parseSpecFile', () => {
    it('extracts spec ID from frontmatter', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      expect(result.specId).toBe('SPEC-MIGR-001')
      expect(result.frontmatter.title).toBe(
        'OpenSpec to MoAI SPEC System Migration'
      )
    })

    it('extracts frontmatter metadata', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      expect(result.frontmatter.priority).toBe('Critical')
      expect(result.frontmatter.status).toBe('Draft')
      expect(result.frontmatter.assigned).toBe('manager-ddd')
    })

    it('extracts all EARS requirements', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      // FR-1 has 3 requirements, FR-2 has 2, NFR-1 has 1 = 6 total
      expect(result.requirements).toHaveLength(6)
    })

    it('extracts requirement IDs with section and counter', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      expect(result.requirements[0].id).toBe('FR-1.1')
      expect(result.requirements[1].id).toBe('FR-1.2')
      expect(result.requirements[2].id).toBe('FR-1.3')
      expect(result.requirements[3].id).toBe('FR-2.1')
      expect(result.requirements[4].id).toBe('FR-2.2')
      expect(result.requirements[5].id).toBe('NFR-1.1')
    })

    it('extracts EARS categories', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      expect(result.requirements[0].earsCategory).toBe('Ubiquitous')
      expect(result.requirements[1].earsCategory).toBe('Event-Driven')
      expect(result.requirements[2].earsCategory).toBe('Unwanted')
    })

    it('detects requirement types from text', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      // All use "shall"
      expect(result.requirements[0].type).toBe('shall')
      expect(result.requirements[1].type).toBe('shall')
    })

    it('extracts requirement text', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      expect(result.requirements[0].text).toContain(
        'parse MoAI SPEC documents'
      )
    })

    it('extracts section titles', () => {
      const result = parseSpecFile(SPEC_CONTENT)

      expect(result.requirements[0].title).toBe('SPEC Parser')
      expect(result.requirements[3].title).toBe('Database Schema Migration')
      expect(result.requirements[5].title).toBe('Build Integrity')
    })

    it('handles empty content gracefully', () => {
      const result = parseSpecFile('')

      expect(result.specId).toBe('')
      expect(result.requirements).toHaveLength(0)
    })

    it('handles content without EARS markers', () => {
      const content = `---
spec_id: SPEC-SIMPLE
phase: spec
created: 2026-01-01
---

# Simple Spec

## Overview

Just a simple spec without EARS markers.
`
      const result = parseSpecFile(content)

      expect(result.specId).toBe('SPEC-SIMPLE')
      expect(result.requirements).toHaveLength(0)
    })

    it('detects should/may/will requirement types', () => {
      const content = `---
spec_id: SPEC-TYPES
phase: spec
created: 2026-01-01
---

# Spec with All Types

## Requirements

### FR-1: Mixed Types

**[EARS: Ubiquitous]**
The system should provide helpful error messages.

**[EARS: Optional]**
The system may support custom themes.

**[EARS: Ubiquitous]**
The migration will complete within 30 minutes.
`
      const result = parseSpecFile(content)

      expect(result.requirements).toHaveLength(3)
      expect(result.requirements[0].type).toBe('should')
      expect(result.requirements[1].type).toBe('may')
      expect(result.requirements[2].type).toBe('will')
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles frontmatter with Windows line endings', () => {
      const content = '---\r\nspec_id: SPEC-WIN\r\nphase: plan\r\ncreated: 2026-01-01\r\n---\r\n\r\n# Windows Plan'
      const fm = parseFrontmatter(content)

      expect(fm.spec_id).toBe('SPEC-WIN')
    })

    it('plan parser handles TAG without conditions section', () => {
      const content = `---
spec_id: SPEC-NOCOND
phase: plan
created: 2026-01-01
---

# Plan

## TAG Chain

### TAG-001: No Conditions
- **Scope**: test/
- **Purpose**: Testing
- **Dependencies**: None
`
      const result = parsePlanFile(content)

      expect(result.tags).toHaveLength(1)
      expect(result.tags[0].conditions).toHaveLength(0)
      // No conditions means not completed (empty check returns false)
      expect(result.tags[0].completed).toBe(false)
    })

    it('acceptance parser handles missing Given/When/Then', () => {
      const content = `---
spec_id: SPEC-PARTIAL
phase: acceptance
created: 2026-01-01
---

# Partial Acceptance

## AC-1: Incomplete Criteria

**Given** some precondition

### Success Metrics
- [ ] Metric one
`
      const result = parseAcceptanceFile(content)

      expect(result.criteria).toHaveLength(1)
      expect(result.criteria[0].given).toContain('some precondition')
      expect(result.criteria[0].when).toBe('')
      expect(result.criteria[0].then).toBe('')
    })

    it('plan parser handles content with only frontmatter', () => {
      const content = `---
spec_id: SPEC-FM-ONLY
phase: plan
created: 2026-01-01
---
`
      const result = parsePlanFile(content)

      expect(result.specId).toBe('SPEC-FM-ONLY')
      expect(result.tags).toHaveLength(0)
    })

    it('spec parser handles multi-line requirement text', () => {
      const content = `---
spec_id: SPEC-MULTI
phase: spec
created: 2026-01-01
---

# Multi-line Spec

## Requirements

### FR-1: Multi-line Requirement

**[EARS: Ubiquitous]**
The system shall parse MoAI SPEC documents
from .moai/specs/ directories and extract
all structured data.
`
      const result = parseSpecFile(content)

      expect(result.requirements).toHaveLength(1)
      expect(result.requirements[0].text).toContain('parse MoAI SPEC documents')
      expect(result.requirements[0].text).toContain('extract')
      expect(result.requirements[0].text).toContain('all structured data')
    })
  })
})
