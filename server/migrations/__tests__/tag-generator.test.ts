/**
 * Tests for TAG Chain Generator (TAG-014)
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { describe, it, expect } from 'vitest'
import { parseOpenSpec } from '../openspec-parser.js'
import { generateEarsSpec } from '../ears-generator.js'
import { generateTagChain, formatTagList } from '../tag-generator.js'

// =============================================
// Test Fixtures
// =============================================

const SPEC_WITH_TASKS = `---
id: feature-spec
title: Feature Implementation
---

# Feature Implementation

## Tasks
- [ ] Design API endpoints
- [ ] Implement database schema
- [x] Create test fixtures
- [ ] Write integration tests

## Acceptance Criteria
- [ ] All endpoints work correctly
`

const SPEC_WITH_PHASES = `---
id: phased-spec
title: Phased Implementation
---

# Phased Implementation

## Phase 1: Setup
### 1.1 Infrastructure
- [ ] Create database
- [ ] Setup CI/CD

### 1.2 Configuration
- [ ] Add environment variables
- [x] Configure logging

## Phase 2: Implementation
- [ ] Build core features
- [ ] Add tests

## Acceptance Criteria
- [ ] All phases complete
`

const SPEC_WITH_NESTED_TASKS = `---
id: nested-spec
title: Nested Tasks
---

# Nested Tasks

## Tasks
- [ ] Parent task 1
  - [ ] Subtask 1.1
  - [x] Subtask 1.2
- [ ] Parent task 2
  - [ ] Subtask 2.1
`

// =============================================
// TAG Generator Tests
// =============================================

describe('TAG Chain Generator', () => {
  describe('generateTagChain', () => {
    it('should generate valid plan.md content', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(100)
    })

    it('should include plan header', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('# Implementation Plan')
      expect(result.content).toContain('**SPEC ID**')
      expect(result.content).toContain('**Status**: planned')
    })

    it('should generate TAG identifiers', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.tags.length).toBeGreaterThan(0)
      expect(result.tags[0].id).toMatch(/TAG-\d{3}/)
    })

    it('should preserve task completion status', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.tags.some(t => t.status === 'completed')).toBe(true)
      expect(result.tags.some(t => t.status === 'pending')).toBe(true)
    })

    it('should include TAG sections in content', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('TAG-001')
      expect(result.content).toContain('**Status**:')
      expect(result.content).toContain('**Acceptance Criteria**:')
    })
  })

  describe('Phase Handling', () => {
    it('should handle specs with phases', () => {
      const parsed = parseOpenSpec(SPEC_WITH_PHASES, 'default')
      const result = generateTagChain(parsed)

      expect(result.tags.length).toBeGreaterThan(0)
    })

    it('should group tasks by phase', () => {
      const parsed = parseOpenSpec(SPEC_WITH_PHASES, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('Implementation Phases')
    })
  })

  describe('Nested Tasks', () => {
    it('should handle nested task structures', () => {
      const parsed = parseOpenSpec(SPEC_WITH_NESTED_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.tags.length).toBeGreaterThan(0)
    })

    it('should track dependencies for nested tasks', () => {
      const parsed = parseOpenSpec(SPEC_WITH_NESTED_TASKS, 'default')
      const result = generateTagChain(parsed)

      // Some tags should have dependencies
      expect(result.tags.some(t => t.dependencies && t.dependencies.length > 0)).toBe(true)
    })
  })

  describe('Content Sections', () => {
    it('should include Technology Stack section', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('## Technology Stack')
    })

    it('should include Risk Analysis section', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('## Risk Analysis')
    })

    it('should include Deployment Strategy section', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('## Deployment Strategy')
    })

    it('should include Success Criteria Summary', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.content).toContain('## Success Criteria Summary')
      expect(result.content).toContain('TAGs Completed')
    })
  })

  describe('Requirements Integration', () => {
    it('should generate TAGs from requirements when no tasks', () => {
      const parsed = parseOpenSpec(`---
id: req-only
---
# Requirements Only

## Requirements
- Do thing A
- Do thing B
`, 'default')

      const spec = generateEarsSpec(parsed)
      const result = generateTagChain(parsed, spec.requirements)

      expect(result.tags.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.includes('requirements'))).toBe(true)
    })
  })

  describe('formatTagList', () => {
    it('should format tags as markdown list', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)
      const formatted = formatTagList(result.tags)

      expect(formatted).toContain('- [ ]')
      expect(formatted).toContain('- [x]')
      expect(formatted).toContain('**TAG-')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty tasks with placeholder', () => {
      const parsed = parseOpenSpec('# Empty\n', 'empty')
      const result = generateTagChain(parsed)

      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true)
      expect(result.tags.length).toBeGreaterThan(0)
    })

    it('should detect file references in tasks', () => {
      const parsed = parseOpenSpec(`---
id: file-ref
---
## Tasks
- [ ] Update \`server/index.ts\`
- [ ] Modify config.json
`, 'default')
      const result = generateTagChain(parsed)

      expect(result.tags.some(t => t.file !== undefined)).toBe(true)
    })

    it('should generate acceptance criteria for tasks', () => {
      const parsed = parseOpenSpec(SPEC_WITH_TASKS, 'default')
      const result = generateTagChain(parsed)

      expect(result.tags.every(t =>
        t.acceptanceCriteria && t.acceptanceCriteria.length > 0
      )).toBe(true)
    })
  })
})
