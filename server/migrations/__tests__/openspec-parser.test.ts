/**
 * Tests for OpenSpec Parser (TAG-012)
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { describe, it, expect } from 'vitest'
import { parseOpenSpec, validateParsedOpenSpec } from '../openspec-parser.js'

// =============================================
// Test Fixtures
// =============================================

const SAMPLE_PROPOSAL = `---
id: add-auth-feature
title: Add Authentication Feature
status: active
priority: high
tags: [auth, security]
---

# Change: Add Two-Factor Authentication

## Why
Users need additional security for their accounts.

## What Changes
- Add TOTP-based 2FA
- Update login flow
- **BREAKING** Change session management

## Impact
- Affected specs: auth, session
- Affected code: src/auth/, src/session/

## Tasks
- [ ] Design 2FA flow
- [ ] Implement TOTP generation
- [x] Update database schema

## Acceptance Criteria
- [ ] Users can enable 2FA
- [ ] TOTP codes work correctly
- [ ] Backup codes available
`

const SAMPLE_SPEC_WITH_PHASES = `---
id: SPEC-TEST-001
title: Test Specification
---

# Test Specification

## Description
This is a test specification for the parser.

## Requirements
- When user logs in, show dashboard
- If session expires, redirect to login
- The system shall validate all inputs

## Phase 1: Setup
### 1.1 Database
- [ ] Create tables
- [ ] Add migrations

### 1.2 API
- [ ] Create endpoints
- [x] Add validation

## Phase 2: Implementation
- [ ] Build UI
- [ ] Connect frontend

## Acceptance Criteria
- [ ] All tests pass
- [x] Code coverage above 85%

#### Scenario: User Login Success
- **WHEN** valid credentials provided
- **THEN** JWT token returned
`

const MINIMAL_SPEC = `# Simple Feature

Just a simple description.

- Do something
- Do another thing
`

// =============================================
// Parser Tests
// =============================================

describe('OpenSpec Parser', () => {
  describe('parseOpenSpec', () => {
    it('should parse a full proposal.md file', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.id).toBe('add-auth-feature')
      // Title comes from frontmatter, which takes precedence over heading
      expect(result.title).toBe('Add Authentication Feature')
      expect(result.description).toContain('additional security')
    })

    it('should extract requirements from What Changes section', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.requirements.length).toBeGreaterThan(0)
      expect(result.requirements.some(r => r.text.includes('TOTP'))).toBe(true)
    })

    it('should extract tasks with correct status', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.tasks.length).toBeGreaterThan(0)
      expect(result.tasks.some(t => t.status === 'completed')).toBe(true)
      expect(result.tasks.some(t => t.status === 'pending')).toBe(true)
    })

    it('should extract acceptance criteria', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.acceptanceCriteria.length).toBe(3)
      expect(result.acceptanceCriteria[0].isCheckbox).toBe(true)
    })

    it('should handle specs with Phase sections', () => {
      const result = parseOpenSpec(SAMPLE_SPEC_WITH_PHASES, 'default-id')

      expect(result.id).toBe('SPEC-TEST-001')
      expect(result.tasks.length).toBeGreaterThan(0)
    })

    it('should parse Gherkin-style scenarios', () => {
      const result = parseOpenSpec(SAMPLE_SPEC_WITH_PHASES, 'default-id')

      expect(result.acceptanceCriteria.some(c =>
        c.text.includes('WHEN') && c.text.includes('THEN')
      )).toBe(true)
    })

    it('should detect requirement types', () => {
      const result = parseOpenSpec(SAMPLE_SPEC_WITH_PHASES, 'default-id')

      expect(result.requirements.some(r => r.typeHint === 'when')).toBe(true)
      expect(result.requirements.some(r => r.typeHint === 'if')).toBe(true)
      expect(result.requirements.some(r => r.typeHint === 'shall')).toBe(true)
    })

    it('should handle minimal content gracefully', () => {
      const result = parseOpenSpec(MINIMAL_SPEC, 'minimal-spec')

      // ID is extracted from title heading when no frontmatter ID exists
      expect(result.id).toBe('simple-feature')
      expect(result.title).toBe('Simple Feature')
    })

    it('should use default ID when no heading or frontmatter', () => {
      // Content with no heading and no frontmatter
      const result = parseOpenSpec('Just some plain text.', 'fallback-id')

      expect(result.id).toBe('fallback-id')
    })

    it('should preserve metadata from frontmatter', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.metadata.priority).toBe('high')
      expect(result.metadata.tags).toContain('auth')
    })

    it('should track found and missing sections', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.foundSections.length).toBeGreaterThan(0)
      expect(Array.isArray(result.missingSections)).toBe(true)
    })

    it('should preserve raw content', () => {
      const result = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')

      expect(result.rawContent).toBe(SAMPLE_PROPOSAL)
    })
  })

  describe('validateParsedOpenSpec', () => {
    it('should validate a complete spec as valid', () => {
      const parsed = parseOpenSpec(SAMPLE_PROPOSAL, 'default-id')
      const validation = validateParsedOpenSpec(parsed)

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should report warnings for missing sections', () => {
      const parsed = parseOpenSpec(MINIMAL_SPEC, 'minimal')
      const validation = validateParsedOpenSpec(parsed)

      expect(validation.warnings.length).toBeGreaterThan(0)
    })

    it('should report error for missing ID', () => {
      const parsed = parseOpenSpec('# No frontmatter', 'unknown')
      // Force unknown ID
      parsed.id = 'unknown'

      const validation = validateParsedOpenSpec(parsed)

      expect(validation.errors.some(e => e.includes('ID'))).toBe(true)
    })
  })
})

describe('Edge Cases', () => {
  it('should handle empty content', () => {
    const result = parseOpenSpec('', 'empty')

    expect(result.id).toBe('empty')
    expect(result.requirements).toHaveLength(0)
    expect(result.tasks).toHaveLength(0)
  })

  it('should handle frontmatter-only content', () => {
    const content = `---
id: frontmatter-only
title: Only Frontmatter
---
`
    const result = parseOpenSpec(content, 'default')

    expect(result.id).toBe('frontmatter-only')
    expect(result.title).toBe('Only Frontmatter')
  })

  it('should handle Korean content', () => {
    const content = `---
id: korean-spec
title: 한글 스펙
---

# 한글 스펙

## 요구 사항
- 사용자 인증 구현
- 데이터베이스 연동

## 인수 조건
- [ ] 모든 테스트 통과
`
    const result = parseOpenSpec(content, 'default')

    expect(result.id).toBe('korean-spec')
    expect(result.title).toBe('한글 스펙')
    // Should find requirements from Korean section headers
  })

  it('should handle nested checkbox items', () => {
    const content = `---
id: nested-tasks
---

## Tasks
- [ ] Parent task
  - [ ] Child task 1
  - [x] Child task 2
- [ ] Another parent
`
    const result = parseOpenSpec(content, 'default')

    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.tasks.some(t => t.subtasks && t.subtasks.length > 0)).toBe(true)
  })
})
