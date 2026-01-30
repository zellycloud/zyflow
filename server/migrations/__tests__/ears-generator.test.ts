/**
 * Tests for EARS Generator (TAG-013)
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { describe, it, expect } from 'vitest'
import { parseOpenSpec } from '../openspec-parser.js'
import { generateEarsSpec } from '../ears-generator.js'

// =============================================
// Test Fixtures
// =============================================

const SAMPLE_OPENSPEC = `---
id: auth-feature
title: Authentication Feature
created: 2024-01-15
tags: [auth, security]
---

# Change: Add Authentication

## Why
Users need to authenticate.

## What Changes
- When user logs in, create session
- If credentials invalid, show error
- The system must validate inputs

## Tasks
- [ ] Implement login
- [ ] Add validation

## Acceptance Criteria
- [ ] Users can log in
- [ ] Errors handled gracefully
`

const SPEC_WITH_MANY_REQUIREMENTS = `---
id: complex-spec
title: Complex Specification
---

# Complex Feature

## Requirements
- When API request received, validate parameters
- If user not authenticated, return 401
- While processing request, show loading state
- The system shall log all operations
- The system must handle errors gracefully
- Upon completion, send notification
- After timeout, retry automatically
`

// =============================================
// EARS Generator Tests
// =============================================

describe('EARS Generator', () => {
  describe('generateEarsSpec', () => {
    it('should generate valid spec.md content', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(100)
    })

    it('should include YAML frontmatter', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('---')
      expect(result.content).toContain('spec_id:')
      expect(result.content).toContain('status: planned')
    })

    it('should generate EARS requirements', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.requirements.length).toBeGreaterThan(0)
      expect(result.requirements.some(r => r.pattern === 'when')).toBe(true)
    })

    it('should format WHEN patterns correctly', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      const whenReq = result.requirements.find(r => r.pattern === 'when')
      expect(whenReq?.text).toContain('WHEN')
      expect(whenReq?.text).toContain('SHALL')
    })

    it('should format IF patterns correctly', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      const ifReq = result.requirements.find(r => r.pattern === 'if')
      expect(ifReq?.text).toContain('IF')
      expect(ifReq?.text).toContain('THEN')
    })

    it('should include EARS labels in content', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('[EARS:')
      expect(result.content).toMatch(/Event-Driven|State-Driven|Ubiquitous/)
    })

    it('should include Functional Requirements section', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('## Functional Requirements')
    })

    it('should include FR-XXX requirement IDs', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toMatch(/FR-\d{3}/)
    })

    it('should track auto-converted requirements', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.requirements.some(r => r.autoConverted)).toBe(true)
    })

    it('should include original text as comment for auto-converted', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('<!-- Original:')
    })
  })

  describe('Pattern Detection', () => {
    it('should detect all EARS patterns', () => {
      const parsed = parseOpenSpec(SPEC_WITH_MANY_REQUIREMENTS, 'default')
      const result = generateEarsSpec(parsed)

      const patterns = new Set(result.requirements.map(r => r.pattern))

      expect(patterns.has('when')).toBe(true)
      expect(patterns.has('if')).toBe(true)
      expect(patterns.has('shall')).toBe(true)
    })

    it('should detect WHILE patterns', () => {
      const parsed = parseOpenSpec(SPEC_WITH_MANY_REQUIREMENTS, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.requirements.some(r => r.pattern === 'while')).toBe(true)
    })
  })

  describe('Content Structure', () => {
    it('should include all required sections', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('## Overview')
      expect(result.content).toContain('## Functional Requirements')
      expect(result.content).toContain('## Constraints')
      expect(result.content).toContain('## Scope')
      expect(result.content).toContain('## Success Criteria')
    })

    it('should include HISTORY table', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('## HISTORY')
      expect(result.content).toContain('| Version | Date')
    })

    it('should include References section with migration note', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('## References')
      expect(result.content).toContain('Migrated from OpenSpec')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty requirements', () => {
      const parsed = parseOpenSpec('# Empty\n', 'empty')
      const result = generateEarsSpec(parsed)

      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true)
      expect(result.content).toContain('FR-001')
    })

    it('should preserve tags from metadata', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toContain('tags:')
    })

    it('should generate valid SPEC ID format', () => {
      const parsed = parseOpenSpec(SAMPLE_OPENSPEC, 'default')
      const result = generateEarsSpec(parsed)

      expect(result.content).toMatch(/spec_id: SPEC-[A-Z0-9-]+/)
    })
  })
})
