/**
 * Characterization tests for moai-spec-tools
 * Tests that MoAI SPEC functions work correctly and maintain behavior
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rmdir } from 'fs/promises'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import {
  scanMoaiSpecs,
  getMoaiSpecContext,
  getNextMoaiTag,
  getMoaiTag,
  updateMoaiTagStatus,
  isMoaiSpec,
  isMoaiTag,
  type MoaiSpecSummary,
} from './moai-spec-tools'

let tempDir: string

beforeAll(async () => {
  // Create temporary directory for test SPECs
  tempDir = await mkdtemp('/tmp/zyflow-test-')
})

afterAll(async () => {
  // Clean up test directory
  try {
    await rmdir(tempDir, { recursive: true })
  } catch {
    // Ignore cleanup errors
  }
})

/**
 * Create a test MoAI SPEC directory with sample files
 */
async function createTestSpec(specId: string, projectPath: string) {
  const specsDir = join(projectPath, '.moai', 'specs', specId)
  const specDir = join(specsDir)

  // Create plan.md
  const planContent = `---
spec_id: ${specId}
phase: plan
created: 2026-01-29
---

# Test Plan

## Strategy

Test-driven SPEC implementation using MoAI system.

## TAG Chain

### TAG-001: First Task
- **Scope**: scope-001
- **Purpose**: Test parsing
- **Dependencies**: None
- **Completion Conditions**:
  - [x] Condition 1
  - [x] Condition 2

### TAG-002: Second Task
- **Scope**: scope-002
- **Purpose**: Test dependencies
- **Dependencies**: TAG-001
- **Completion Conditions**:
  - [ ] Condition 1
  - [ ] Condition 2

### TAG-003: Third Task
- **Scope**: scope-003
- **Purpose**: Test completion
- **Dependencies**: TAG-002
- **Completion Conditions**:
  - [ ] Condition 1
`

  // Create spec.md
  const specContent = `---
spec_id: ${specId}
title: Test SPEC Title
priority: Critical
status: active
created: 2026-01-29
---

# Test SPEC

## Overview

This is a test SPEC for unit testing.

## Functional Requirements

### FR-1: Test Requirement
**[EARS: Ubiquitous]**
The system shall perform test operations.
`

  // Create acceptance.md
  const acceptanceContent = `---
spec_id: ${specId}
phase: acceptance
format: gherkin
---

# Test Acceptance Criteria

## AC-1: Test Scenario

**Given** a test SPEC directory
**When** the parser processes the directory
**Then** it shall extract all SPEC content

### Success Metrics
- [x] Parser works
- [ ] Complete
`

  // Create directories and files
  const fs = await import('fs/promises')
  await fs.mkdir(specsDir, { recursive: true })
  await writeFile(join(specsDir, 'plan.md'), planContent)
  await writeFile(join(specsDir, 'spec.md'), specContent)
  await writeFile(join(specsDir, 'acceptance.md'), acceptanceContent)
}

describe('moai-spec-tools', () => {
  describe('isMoaiSpec', () => {
    it('should recognize valid MoAI SPEC IDs', () => {
      expect(isMoaiSpec('SPEC-MIGR-001')).toBe(true)
      expect(isMoaiSpec('SPEC-TEST-001')).toBe(true)
      expect(isMoaiSpec('SPEC-ARCH-002')).toBe(true)
    })

    it('should reject invalid SPEC IDs', () => {
      expect(isMoaiSpec('add-payment-method')).toBe(false)
      expect(isMoaiSpec('spec-migr-001')).toBe(false) // lowercase
      expect(isMoaiSpec('SPEC-001')).toBe(false) // missing domain
      expect(isMoaiSpec('TAG-001')).toBe(false)
    })
  })

  describe('isMoaiTag', () => {
    it('should recognize valid MoAI TAG IDs', () => {
      expect(isMoaiTag('TAG-001')).toBe(true)
      expect(isMoaiTag('TAG-100')).toBe(true)
      expect(isMoaiTag('TAG-999')).toBe(true)
    })

    it('should reject invalid TAG IDs', () => {
      expect(isMoaiTag('tag-001')).toBe(false) // lowercase
      expect(isMoaiTag('TAG-A01')).toBe(false) // non-numeric
      expect(isMoaiTag('SPEC-001')).toBe(false)
      expect(isMoaiTag('task-1-1')).toBe(false)
    })
  })

  describe('scanMoaiSpecs', () => {
    it('should return empty list when no specs exist', async () => {
      const specs = await scanMoaiSpecs(tempDir)
      expect(specs).toEqual([])
    })

    it('should find MoAI SPECs in .moai/specs directory', async () => {
      await createTestSpec('SPEC-TEST-001', tempDir)

      const specs = await scanMoaiSpecs(tempDir)

      expect(specs).toHaveLength(1)
      expect(specs[0]?.id).toBe('SPEC-TEST-001')
      expect(specs[0]?.title).toBe('Test SPEC Title')
    })

    it('should calculate progress from TAG completion', async () => {
      const specs = await scanMoaiSpecs(tempDir)

      // TAG-001 is completed (2/2 conditions), TAG-002 and TAG-003 are not
      // So overall progress should be 1/3 = 33%
      expect(specs[0]?.progress).toBe(33)
      expect(specs[0]?.totalTags).toBe(3)
      expect(specs[0]?.completedTags).toBe(1)
    })
  })

  describe('getMoaiSpecContext', () => {
    it('should load all SPEC files (plan, spec, acceptance)', async () => {
      const context = await getMoaiSpecContext('SPEC-TEST-001', tempDir)

      expect(context.plan).toBeDefined()
      expect(context.spec).toBeDefined()
      expect(context.acceptance).toBeDefined()
    })

    it('should parse plan.md correctly', async () => {
      const context = await getMoaiSpecContext('SPEC-TEST-001', tempDir)

      expect(context.plan.tags).toHaveLength(3)
      expect(context.plan.tags[0]?.id).toBe('TAG-001')
      expect(context.plan.tags[0]?.completed).toBe(true)
      expect(context.plan.tags[1]?.dependencies).toContain('TAG-001')
    })

    it('should parse spec.md correctly', async () => {
      const context = await getMoaiSpecContext('SPEC-TEST-001', tempDir)

      expect(context.spec.frontmatter.title).toBe('Test SPEC Title')
      expect(context.spec.frontmatter.status).toBe('active')
    })

    it('should parse acceptance.md correctly', async () => {
      const context = await getMoaiSpecContext('SPEC-TEST-001', tempDir)

      expect(context.acceptance.criteria).toBeDefined()
      expect(context.acceptance.criteria.length).toBeGreaterThan(0)
    })
  })

  describe('getMoaiTag', () => {
    it('should retrieve a specific TAG from plan', async () => {
      const tag = await getMoaiTag('SPEC-TEST-001', 'TAG-001', tempDir)

      expect(tag.id).toBe('TAG-001')
      expect(tag.title).toBe('First Task')
      expect(tag.completed).toBe(true)
    })

    it('should throw error for non-existent TAG', async () => {
      await expect(getMoaiTag('SPEC-TEST-001', 'TAG-999', tempDir))
        .rejects
        .toThrow('TAG TAG-999 not found')
    })
  })

  describe('getNextMoaiTag', () => {
    it('should return next incomplete TAG without dependencies', async () => {
      const nextTag = await getNextMoaiTag('SPEC-TEST-001', tempDir)

      expect(nextTag).toBeDefined()
      expect(nextTag?.id).toBe('TAG-002')
      expect(nextTag?.dependencies).toContain('TAG-001')
    })

    it('should respect TAG dependencies', async () => {
      // TAG-002 depends on TAG-001 (completed)
      // TAG-003 depends on TAG-002 (not completed)
      // So next should be TAG-002

      const nextTag = await getNextMoaiTag('SPEC-TEST-001', tempDir)

      expect(nextTag?.id).toBe('TAG-002')
      expect(nextTag?.dependencies[0]).toBe('TAG-001')
    })
  })

  describe('updateMoaiTagStatus', () => {
    it('should update TAG status in plan.md', async () => {
      await updateMoaiTagStatus('SPEC-TEST-001', 'TAG-002', true, tempDir)

      const tag = await getMoaiTag('SPEC-TEST-001', 'TAG-002', tempDir)
      expect(tag.completed).toBe(true)
    })

    it('should revert TAG status when marked incomplete', async () => {
      await updateMoaiTagStatus('SPEC-TEST-001', 'TAG-002', false, tempDir)

      const tag = await getMoaiTag('SPEC-TEST-001', 'TAG-002', tempDir)
      expect(tag.completed).toBe(false)
    })
  })

  describe('Backward compatibility', () => {
    it('should not affect existing OpenSpec operations', () => {
      // Verify that MoAI functions don't interfere with OpenSpec
      // (This is verified by isMoaiSpec returning false for OpenSpec IDs)
      expect(isMoaiSpec('add-payment')).toBe(false)
      expect(isMoaiTag('task-1-1')).toBe(false)
    })
  })
})
