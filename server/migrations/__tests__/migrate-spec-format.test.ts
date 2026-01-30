/**
 * Tests for Migration Orchestrator (TAG-016)
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  migrateOpenSpecToMoai,
  previewMigration,
  formatMigrationResult,
  formatBatchResult,
  getSpecPreview,
  getPlanPreview,
  getAcceptancePreview,
} from '../migrate-spec-format.js'

// =============================================
// Test Fixtures
// =============================================

const SAMPLE_OPENSPEC = `---
id: test-feature
title: Test Feature Implementation
status: active
priority: high
tags: [test, feature]
---

# Change: Test Feature Implementation

## Why
We need this feature for testing the migration tool.

## What Changes
- When user triggers action, process request
- If validation fails, return error
- The system shall log all operations

## Tasks
- [ ] Implement core logic
- [ ] Add validation
- [x] Write tests
- [ ] Update documentation

## Acceptance Criteria
- [ ] Feature works correctly
- [ ] All tests pass
- [ ] Documentation updated

#### Scenario: Success Case
- **WHEN** valid input provided
- **THEN** operation succeeds
`

// =============================================
// Test Setup/Teardown
// =============================================

let testDir: string

beforeEach(async () => {
  // Create temp directory for tests
  testDir = join(tmpdir(), `migration-test-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  // Clean up temp directory
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true, force: true })
  }
})

// =============================================
// Migration Orchestrator Tests
// =============================================

describe('Migration Orchestrator', () => {
  describe('migrateOpenSpecToMoai', () => {
    it('should migrate OpenSpec file successfully', async () => {
      // Setup: Create test OpenSpec file
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const outputDir = join(testDir, '.moai', 'specs')

      // Execute migration
      const result = await migrateOpenSpecToMoai(openspecPath, outputDir)

      // Verify result
      expect(result.success).toBe(true)
      expect(result.specId).toBe('test-feature')
      expect(result.filesCreated).toHaveLength(3)
      expect(result.errors).toHaveLength(0)
    })

    it('should create all three output files', async () => {
      // Setup
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const outputDir = join(testDir, '.moai', 'specs')

      // Execute migration
      const result = await migrateOpenSpecToMoai(openspecPath, outputDir)

      // Verify files created
      expect(result.filesCreated.some(f => f.endsWith('spec.md'))).toBe(true)
      expect(result.filesCreated.some(f => f.endsWith('plan.md'))).toBe(true)
      expect(result.filesCreated.some(f => f.endsWith('acceptance.md'))).toBe(true)

      // Verify files exist
      for (const file of result.filesCreated) {
        expect(existsSync(file)).toBe(true)
      }
    })

    it('should work in dry-run mode without creating files', async () => {
      // Setup
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const outputDir = join(testDir, '.moai', 'specs')

      // Execute dry-run migration
      const result = await migrateOpenSpecToMoai(openspecPath, outputDir, {
        dryRun: true,
      })

      // Verify result
      expect(result.success).toBe(true)
      expect(result.filesCreated).toHaveLength(3)

      // Verify NO files created
      for (const file of result.filesCreated) {
        expect(existsSync(file)).toBe(false)
      }
    })

    it('should return error for missing source file', async () => {
      const result = await migrateOpenSpecToMoai(
        '/non/existent/file.md',
        testDir
      )

      expect(result.success).toBe(false)
      expect(result.errors.some(e => e.includes('not found'))).toBe(true)
    })

    it('should include parsed content in result', async () => {
      // Setup
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await migrateOpenSpecToMoai(openspecPath, testDir, {
        dryRun: true,
      })

      expect(result.parsed).toBeDefined()
      expect(result.parsed?.id).toBe('test-feature')
      expect(result.parsed?.requirements.length).toBeGreaterThan(0)
      expect(result.parsed?.tasks.length).toBeGreaterThan(0)
    })

    it('should include generated content in result', async () => {
      // Setup
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await migrateOpenSpecToMoai(openspecPath, testDir, {
        dryRun: true,
      })

      expect(result.generated).toBeDefined()
      expect(result.generated?.spec.content).toBeDefined()
      expect(result.generated?.plan.content).toBeDefined()
      expect(result.generated?.acceptance.content).toBeDefined()
    })

    it('should collect warnings during migration', async () => {
      // Setup with minimal content that triggers warnings
      const openspecDir = join(testDir, 'openspec', 'changes', 'minimal')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, '# Minimal\n\nJust some text.')

      const result = await migrateOpenSpecToMoai(openspecPath, testDir, {
        dryRun: true,
      })

      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should support verbose logging option', async () => {
      // Setup
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      // Should not throw with verbose option
      const result = await migrateOpenSpecToMoai(openspecPath, testDir, {
        dryRun: true,
        verbose: true,
      })

      expect(result.success).toBe(true)
    })
  })

  describe('previewMigration', () => {
    it('should generate preview without writing files', async () => {
      // Setup
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await previewMigration(openspecPath)

      expect(result.success).toBe(true)
      expect(result.generated).toBeDefined()

      // Verify no files created
      for (const file of result.filesCreated) {
        expect(existsSync(file)).toBe(false)
      }
    })
  })

  describe('formatMigrationResult', () => {
    it('should format successful result', async () => {
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await previewMigration(openspecPath)
      const formatted = formatMigrationResult(result)

      expect(formatted).toContain('Migration Result')
      expect(formatted).toContain('SUCCESS')
      expect(formatted).toContain('test-feature')
    })

    it('should format failed result', () => {
      const result = {
        specId: 'failed-spec',
        success: false,
        filesCreated: [],
        errors: ['File not found'],
        warnings: [],
        sourcePath: '/path/to/file.md',
        outputDir: '/output',
      }

      const formatted = formatMigrationResult(result)

      expect(formatted).toContain('FAILED')
      expect(formatted).toContain('File not found')
    })

    it('should include warnings in formatted output', async () => {
      const openspecDir = join(testDir, 'openspec', 'changes', 'minimal')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, '# Minimal\n')

      const result = await previewMigration(openspecPath)
      const formatted = formatMigrationResult(result)

      expect(formatted).toContain('Warnings')
    })
  })

  describe('formatBatchResult', () => {
    it('should format batch migration result', () => {
      const batchResult = {
        totalProcessed: 5,
        successCount: 4,
        failedCount: 1,
        results: [],
        allWarnings: ['Warning 1', 'Warning 2'],
        allErrors: ['Error 1'],
        timestamp: new Date().toISOString(),
      }

      const formatted = formatBatchResult(batchResult)

      expect(formatted).toContain('Batch Migration Report')
      expect(formatted).toContain('Total Processed: 5')
      expect(formatted).toContain('Successful: 4')
      expect(formatted).toContain('Failed: 1')
      expect(formatted).toContain('80.0%')
    })
  })

  describe('Content Preview Functions', () => {
    it('should get spec preview', async () => {
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await previewMigration(openspecPath)
      const preview = getSpecPreview(result)

      expect(preview).toContain('spec_id')
      expect(preview).toContain('EARS')
    })

    it('should get plan preview', async () => {
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await previewMigration(openspecPath)
      const preview = getPlanPreview(result)

      expect(preview).toContain('Implementation Plan')
      expect(preview).toContain('TAG-')
    })

    it('should get acceptance preview', async () => {
      const openspecDir = join(testDir, 'openspec', 'changes', 'test-feature')
      await mkdir(openspecDir, { recursive: true })
      const openspecPath = join(openspecDir, 'proposal.md')
      await writeFile(openspecPath, SAMPLE_OPENSPEC)

      const result = await previewMigration(openspecPath)
      const preview = getAcceptancePreview(result)

      expect(preview).toContain('Acceptance Criteria')
      expect(preview).toContain('gherkin')
    })

    it('should handle missing generated content', () => {
      const result = {
        specId: 'test',
        success: false,
        filesCreated: [],
        errors: ['Error'],
        warnings: [],
        sourcePath: '/path',
        outputDir: '/output',
      }

      expect(getSpecPreview(result)).toContain('No spec content')
      expect(getPlanPreview(result)).toContain('No plan content')
      expect(getAcceptancePreview(result)).toContain('No acceptance content')
    })
  })
})

describe('Edge Cases', () => {
  it('should handle spec with SPEC- prefix in ID', async () => {
    const openspecDir = join(testDir, 'openspec', 'changes', 'SPEC-TEST-001')
    await mkdir(openspecDir, { recursive: true })
    const openspecPath = join(openspecDir, 'proposal.md')
    await writeFile(openspecPath, `---
id: SPEC-TEST-001
title: Test
---
# Test
`)

    const result = await previewMigration(openspecPath)

    expect(result.specId).toBe('SPEC-TEST-001')
    // Should not double-prefix
    expect(result.generated?.spec.content).not.toContain('SPEC-SPEC-')
  })

  it('should handle empty file gracefully', async () => {
    const openspecDir = join(testDir, 'openspec', 'changes', 'empty')
    await mkdir(openspecDir, { recursive: true })
    const openspecPath = join(openspecDir, 'proposal.md')
    await writeFile(openspecPath, '')

    const result = await previewMigration(openspecPath)

    // Should still succeed with warnings
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('should handle special characters in content', async () => {
    const openspecDir = join(testDir, 'openspec', 'changes', 'special')
    await mkdir(openspecDir, { recursive: true })
    const openspecPath = join(openspecDir, 'proposal.md')
    await writeFile(openspecPath, `---
id: special-chars
title: Test with "quotes" & <brackets>
---
# Test

## Requirements
- Handle "quoted" strings
- Process <HTML> entities
- Support \`code\` blocks
`)

    const result = await previewMigration(openspecPath)

    expect(result.success).toBe(true)
    expect(result.generated?.spec.content).toContain('quotes')
  })
})
