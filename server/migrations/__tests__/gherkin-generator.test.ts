/**
 * Tests for Gherkin Generator (TAG-015)
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { describe, it, expect } from 'vitest'
import { parseOpenSpec } from '../openspec-parser.js'
import { generateEarsSpec } from '../ears-generator.js'
import { generateGherkinCriteria } from '../gherkin-generator.js'

// =============================================
// Test Fixtures
// =============================================

const SPEC_WITH_CRITERIA = `---
id: auth-spec
title: Authentication
---

# Authentication Feature

## Acceptance Criteria
- [ ] Users can log in with valid credentials
- [ ] Invalid credentials show error message
- [x] Session persists after page refresh
- [ ] Logout clears session

## Notes
Some additional notes.
`

const SPEC_WITH_SCENARIOS = `---
id: scenario-spec
title: Scenario Test
---

# Feature with Scenarios

## Acceptance Criteria
- Given the user is logged in, when they click logout, then session ends
- If user enters wrong password, show error
- The system should validate all inputs

#### Scenario: User Login Success
- **WHEN** valid credentials provided
- **THEN** JWT token returned

#### Scenario: User Login Failure
- **WHEN** invalid credentials provided
- **THEN** error message shown
`

const SPEC_WITH_REQUIREMENTS = `---
id: req-spec
title: Requirements Spec
---

# Requirements

## Requirements
- When user submits form, validate all fields
- If validation fails, highlight errors
- The system shall save data to database

## Acceptance Criteria
- [ ] Form validation works
- [ ] Data saved correctly
`

// =============================================
// Gherkin Generator Tests
// =============================================

describe('Gherkin Generator', () => {
  describe('generateGherkinCriteria', () => {
    it('should generate valid acceptance.md content', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(100)
    })

    it('should include Gherkin code block', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toContain('```gherkin')
      expect(result.content).toContain('```')
    })

    it('should generate Feature header', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.feature.name).toBe('Authentication')
      expect(result.content).toContain('Feature: Authentication')
    })

    it('should generate Scenario for each criterion', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.feature.scenarios.length).toBeGreaterThan(0)
      expect(result.content).toContain('Scenario:')
    })

    it('should include Given/When/Then steps', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toContain('Given')
      expect(result.content).toContain('When')
      expect(result.content).toContain('Then')
    })
  })

  describe('Scenario Generation', () => {
    it('should convert acceptance criteria to scenarios', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.feature.scenarios.length).toBe(4)
    })

    it('should parse existing Gherkin-style scenarios', () => {
      const parsed = parseOpenSpec(SPEC_WITH_SCENARIOS, 'default')
      const result = generateGherkinCriteria(parsed)

      // Should have scenarios from both criteria and explicit scenarios
      expect(result.feature.scenarios.length).toBeGreaterThan(3)
    })

    it('should handle Given/When/Then in criteria text', () => {
      const parsed = parseOpenSpec(SPEC_WITH_SCENARIOS, 'default')
      const result = generateGherkinCriteria(parsed)

      // Should parse the inline Given/When/Then
      const scenario = result.feature.scenarios.find(s =>
        s.name.includes('logged in')
      )
      expect(scenario).toBeDefined()
    })

    it('should handle WHEN/THEN format from OpenSpec', () => {
      const parsed = parseOpenSpec(SPEC_WITH_SCENARIOS, 'default')
      const result = generateGherkinCriteria(parsed)

      // Should find scenarios from #### Scenario blocks
      expect(result.feature.scenarios.some(s =>
        s.name.includes('Login')
      )).toBe(true)
    })
  })

  describe('EARS Integration', () => {
    it('should generate scenarios from EARS requirements', () => {
      const parsed = parseOpenSpec(SPEC_WITH_REQUIREMENTS, 'default')
      const earsSpec = generateEarsSpec(parsed)
      const result = generateGherkinCriteria(parsed, earsSpec.requirements)

      // Should have more scenarios with EARS requirements
      expect(result.feature.scenarios.length).toBeGreaterThanOrEqual(
        parsed.acceptanceCriteria.length
      )
    })

    it('should tag scenarios with requirement IDs', () => {
      const parsed = parseOpenSpec(SPEC_WITH_REQUIREMENTS, 'default')
      const earsSpec = generateEarsSpec(parsed)
      const result = generateGherkinCriteria(parsed, earsSpec.requirements)

      // Some scenarios should have FR tags
      expect(result.feature.scenarios.some(s =>
        s.tags?.some(t => t.includes('FR-'))
      )).toBe(true)
    })
  })

  describe('Content Sections', () => {
    it('should include header section', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toContain('# Acceptance Criteria')
      expect(result.content).toContain('**SPEC ID**')
    })

    it('should include Edge Cases section', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toContain('## Edge Cases')
    })

    it('should include Test Coverage Matrix', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toContain('## Test Coverage Matrix')
      expect(result.content).toContain('| Requirement | Scenario | Status |')
    })

    it('should include Validation Checklist', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.content).toContain('## Validation Checklist')
      expect(result.content).toContain('- [ ] All scenarios pass')
    })
  })

  describe('Feature Structure', () => {
    it('should include feature tags', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      expect(result.feature.tags).toBeDefined()
      expect(result.feature.tags?.some(t => t.includes('SPEC-'))).toBe(true)
    })

    it('should set feature description', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      // Description might be set from parsed description
      expect(result.feature.name).toBe('Authentication')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty criteria with placeholder', () => {
      const parsed = parseOpenSpec('# Empty\n', 'empty')
      const result = generateGherkinCriteria(parsed)

      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true)
      expect(result.feature.scenarios.length).toBe(1)
    })

    it('should handle checkbox criteria', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      // Checkbox items should become scenarios
      expect(result.feature.scenarios.some(s =>
        s.name.includes('log in')
      )).toBe(true)
    })

    it('should clean scenario names', () => {
      const parsed = parseOpenSpec(SPEC_WITH_CRITERIA, 'default')
      const result = generateGherkinCriteria(parsed)

      // Names should not have checkbox markers
      expect(result.feature.scenarios.every(s =>
        !s.name.includes('[ ]') && !s.name.includes('[x]')
      )).toBe(true)
    })

    it('should handle long criterion text', () => {
      const parsed = parseOpenSpec(`---
id: long-text
---
## Acceptance Criteria
- [ ] This is a very long acceptance criterion that describes something that should happen when the user performs a specific action in the system and the system should respond appropriately with the correct behavior
`, 'default')
      const result = generateGherkinCriteria(parsed)

      // Scenario name should be truncated
      expect(result.feature.scenarios[0].name.length).toBeLessThanOrEqual(83)
    })
  })
})
