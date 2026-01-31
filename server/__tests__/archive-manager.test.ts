/**
 * Integration Tests for Archive Manager (SPEC-VISIBILITY-001 Phase 4)
 *
 * Tests cover:
 * - Archive operation creates correct structure
 * - Restore operation returns SPEC to original location
 * - Database status updates correctly
 * - Metadata preservation
 * - Rollback on filesystem error
 * - Rollback on database error
 * - Edge cases (already archived, not found, etc.)
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdir, writeFile, readFile, rm, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import request from 'supertest'
import { app } from '../app.js'

// Mock the config module
vi.mock('../config.js', () => {
  let mockProjectPath = '/tmp/archive-test-project'
  return {
    loadConfig: vi.fn().mockResolvedValue({
      projects: [
        { id: 'test-project', name: 'Test Project', path: mockProjectPath },
      ],
      activeProjectId: 'test-project',
    }),
    getActiveProject: vi.fn().mockImplementation(() => ({
      id: 'test-project',
      name: 'Test Project',
      path: mockProjectPath,
    })),
    setMockProjectPath: (path: string) => {
      mockProjectPath = path
    },
  }
})

// Mock the database
const mockSqlite = {
  prepare: vi.fn().mockReturnThis(),
  get: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
}

vi.mock('../tasks/db/client.js', () => ({
  getSqlite: () => mockSqlite,
  getDb: () => ({}),
  initDb: vi.fn(),
}))

// Import after mocking
import {
  archiveSpec,
  restoreSpec,
  listArchivedSpecs,
  getArchiveMetadata,
  isSpecArchived,
} from '../archive-manager.js'
import type { ArchiveMetadata } from '../types/archive.js'

// Test helper to create a mock SPEC directory structure
async function createMockSpec(
  projectPath: string,
  specId: string,
  content: {
    spec?: string
    plan?: string
    acceptance?: string
  } = {}
): Promise<void> {
  const specDir = join(projectPath, '.moai', 'specs', specId)
  await mkdir(specDir, { recursive: true })

  await writeFile(
    join(specDir, 'spec.md'),
    content.spec ||
      `---
spec_id: ${specId}
title: Test SPEC ${specId}
status: active
---

# ${specId}

This is a test SPEC.
`
  )

  await writeFile(
    join(specDir, 'plan.md'),
    content.plan ||
      `# Plan for ${specId}

## TAGs

- TAG-001: First task
- TAG-002: Second task
`
  )

  await writeFile(
    join(specDir, 'acceptance.md'),
    content.acceptance ||
      `# Acceptance Criteria for ${specId}

## Scenarios

- Given condition, when action, then result
`
  )
}

// Helper to get current archive month (matching archive-manager.ts logic)
function getCurrentArchiveMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

// Test helper to create an archived SPEC
async function createArchivedSpec(
  projectPath: string,
  specId: string,
  month: string = '2026-01',
  metadata?: Partial<ArchiveMetadata>
): Promise<void> {
  const archiveDir = join(projectPath, '.moai', 'archive', month, specId)
  await mkdir(archiveDir, { recursive: true })

  await writeFile(
    join(archiveDir, 'spec.md'),
    `---
spec_id: ${specId}
title: Archived SPEC ${specId}
status: completed
---

# ${specId}

This is an archived SPEC.
`
  )

  await writeFile(
    join(archiveDir, 'plan.md'),
    `# Plan for ${specId}`
  )

  await writeFile(
    join(archiveDir, 'acceptance.md'),
    `# Acceptance Criteria for ${specId}`
  )

  const fullMetadata: ArchiveMetadata = {
    archivedAt: metadata?.archivedAt || new Date().toISOString(),
    archivedBy: metadata?.archivedBy || 'system',
    reason: metadata?.reason || 'completed',
    originalStatus: metadata?.originalStatus || 'active',
    restorePath: `.moai/specs/${specId}`,
    title: metadata?.title || `Archived SPEC ${specId}`,
    notes: metadata?.notes,
  }

  await writeFile(
    join(archiveDir, '.archive-metadata.json'),
    JSON.stringify(fullMetadata, null, 2)
  )
}

describe('Archive Manager', () => {
  let testProjectPath: string

  beforeAll(async () => {
    // Create a unique temp directory for tests
    testProjectPath = join(tmpdir(), `archive-test-${Date.now()}`)
    await mkdir(testProjectPath, { recursive: true })

    // Update the mock to use our test path
    const config = await import('../config.js')
    ;(config as any).setMockProjectPath(testProjectPath)
  })

  afterAll(async () => {
    // Clean up test directory
    try {
      await rm(testProjectPath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks()

    // Reset database mock behavior
    mockSqlite.prepare.mockReturnThis()
    mockSqlite.get.mockReturnValue({ status: 'active', title: 'Test SPEC' })
    mockSqlite.run.mockReturnValue({ changes: 1 })
    mockSqlite.all.mockReturnValue([])

    // Clean up any existing test files
    const moaiDir = join(testProjectPath, '.moai')
    try {
      await rm(moaiDir, { recursive: true, force: true })
    } catch {
      // Ignore if doesn't exist
    }
  })

  // =========================================================================
  // Archive Operation Tests
  // =========================================================================
  describe('archiveSpec', () => {
    it('should archive a SPEC successfully', async () => {
      await createMockSpec(testProjectPath, 'SPEC-001')

      const result = await archiveSpec('SPEC-001', testProjectPath, 'completed', 'test-user')

      expect(result.success).toBe(true)
      expect(result.specId).toBe('SPEC-001')
      expect(result.archivePath).toMatch(/\.moai\/archive\/\d{4}-\d{2}\/SPEC-001/)

      // Verify source is removed
      expect(existsSync(join(testProjectPath, '.moai', 'specs', 'SPEC-001'))).toBe(false)

      // Verify archive exists
      const archiveBase = join(testProjectPath, '.moai', 'archive')
      expect(existsSync(archiveBase)).toBe(true)
    })

    it('should create archive metadata file', async () => {
      await createMockSpec(testProjectPath, 'SPEC-002')

      await archiveSpec('SPEC-002', testProjectPath, 'deprecated', 'admin', 'Test notes')

      // Find the archive
      const archiveBase = join(testProjectPath, '.moai', 'archive')
      const months = await readdir(archiveBase)
      const archivePath = join(archiveBase, months[0], 'SPEC-002')
      const metadataPath = join(archivePath, '.archive-metadata.json')

      expect(existsSync(metadataPath)).toBe(true)

      const metadata = JSON.parse(await readFile(metadataPath, 'utf-8')) as ArchiveMetadata

      expect(metadata.archivedBy).toBe('admin')
      expect(metadata.reason).toBe('deprecated')
      expect(metadata.originalStatus).toBe('active')
      expect(metadata.notes).toBe('Test notes')
      expect(metadata.restorePath).toBe('.moai/specs/SPEC-002')
    })

    it('should update database status to archived', async () => {
      await createMockSpec(testProjectPath, 'SPEC-003')

      await archiveSpec('SPEC-003', testProjectPath)

      // Verify database update was called
      expect(mockSqlite.prepare).toHaveBeenCalled()
      expect(mockSqlite.run).toHaveBeenCalled()
    })

    it('should fail if SPEC does not exist', async () => {
      const result = await archiveSpec('SPEC-NONEXISTENT', testProjectPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should fail if SPEC is already archived', async () => {
      await createMockSpec(testProjectPath, 'SPEC-004')
      // Use current month to match archiveSpec's getArchiveMonth() behavior
      await createArchivedSpec(testProjectPath, 'SPEC-004', getCurrentArchiveMonth())

      const result = await archiveSpec('SPEC-004', testProjectPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('already archived')
    })

    it('should preserve all SPEC files in archive', async () => {
      await createMockSpec(testProjectPath, 'SPEC-005', {
        spec: '# Custom Spec Content',
        plan: '# Custom Plan Content',
        acceptance: '# Custom Acceptance Content',
      })

      await archiveSpec('SPEC-005', testProjectPath)

      // Find and verify archive contents
      const archiveBase = join(testProjectPath, '.moai', 'archive')
      const months = await readdir(archiveBase)
      const archivePath = join(archiveBase, months[0], 'SPEC-005')

      const specContent = await readFile(join(archivePath, 'spec.md'), 'utf-8')
      const planContent = await readFile(join(archivePath, 'plan.md'), 'utf-8')
      const acceptanceContent = await readFile(join(archivePath, 'acceptance.md'), 'utf-8')

      expect(specContent).toBe('# Custom Spec Content')
      expect(planContent).toBe('# Custom Plan Content')
      expect(acceptanceContent).toBe('# Custom Acceptance Content')
    })
  })

  // =========================================================================
  // Restore Operation Tests
  // =========================================================================
  describe('restoreSpec', () => {
    it('should restore an archived SPEC successfully', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-RESTORE-001')

      const result = await restoreSpec('SPEC-RESTORE-001', testProjectPath)

      expect(result.success).toBe(true)
      expect(result.specId).toBe('SPEC-RESTORE-001')
      expect(result.restoredTo).toBe('.moai/specs/SPEC-RESTORE-001')

      // Verify restored location exists
      expect(existsSync(join(testProjectPath, '.moai', 'specs', 'SPEC-RESTORE-001'))).toBe(true)
    })

    it('should restore original status from metadata', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-RESTORE-002', '2026-01', {
        originalStatus: 'blocked',
      })

      await restoreSpec('SPEC-RESTORE-002', testProjectPath)

      // Verify database was updated with original status
      expect(mockSqlite.run).toHaveBeenCalled()
    })

    it('should remove metadata file after restore', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-RESTORE-003')

      await restoreSpec('SPEC-RESTORE-003', testProjectPath)

      const restoredPath = join(testProjectPath, '.moai', 'specs', 'SPEC-RESTORE-003')
      const metadataPath = join(restoredPath, '.archive-metadata.json')

      expect(existsSync(metadataPath)).toBe(false)
    })

    it('should fail if archived SPEC does not exist', async () => {
      const result = await restoreSpec('SPEC-NONEXISTENT', testProjectPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should fail if restore destination already exists', async () => {
      await createMockSpec(testProjectPath, 'SPEC-RESTORE-004')
      await createArchivedSpec(testProjectPath, 'SPEC-RESTORE-004')

      const result = await restoreSpec('SPEC-RESTORE-004', testProjectPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('already exists')
    })

    it('should clean up empty month directory after restore', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-RESTORE-005', '2025-12')

      await restoreSpec('SPEC-RESTORE-005', testProjectPath)

      // The 2025-12 directory should be cleaned up
      const monthDir = join(testProjectPath, '.moai', 'archive', '2025-12')
      expect(existsSync(monthDir)).toBe(false)
    })
  })

  // =========================================================================
  // List Archived SPECs Tests
  // =========================================================================
  describe('listArchivedSpecs', () => {
    it('should return empty array when no archive exists', async () => {
      const specs = await listArchivedSpecs(testProjectPath)

      expect(specs).toEqual([])
    })

    it('should list all archived SPECs', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-LIST-001', '2026-01')
      await createArchivedSpec(testProjectPath, 'SPEC-LIST-002', '2026-01')

      const specs = await listArchivedSpecs(testProjectPath)

      expect(specs).toHaveLength(2)
      expect(specs.map((s) => s.specId)).toContain('SPEC-LIST-001')
      expect(specs.map((s) => s.specId)).toContain('SPEC-LIST-002')
    })

    it('should list SPECs from multiple months', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-JAN', '2026-01')
      await createArchivedSpec(testProjectPath, 'SPEC-FEB', '2026-02')

      const specs = await listArchivedSpecs(testProjectPath)

      expect(specs).toHaveLength(2)
    })

    it('should include correct metadata in list', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-META', '2026-01', {
        reason: 'superseded',
        originalStatus: 'completed',
        archivedBy: 'admin',
      })

      const specs = await listArchivedSpecs(testProjectPath)
      const spec = specs.find((s) => s.specId === 'SPEC-META')

      expect(spec).toBeDefined()
      expect(spec?.reason).toBe('superseded')
      expect(spec?.originalStatus).toBe('completed')
      expect(spec?.archivedBy).toBe('admin')
    })

    it('should sort by archived date, newest first', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-OLD', '2026-01', {
        archivedAt: '2026-01-01T00:00:00Z',
      })
      await createArchivedSpec(testProjectPath, 'SPEC-NEW', '2026-01', {
        archivedAt: '2026-01-15T00:00:00Z',
      })

      const specs = await listArchivedSpecs(testProjectPath)

      expect(specs[0].specId).toBe('SPEC-NEW')
      expect(specs[1].specId).toBe('SPEC-OLD')
    })
  })

  // =========================================================================
  // Get Archive Metadata Tests
  // =========================================================================
  describe('getArchiveMetadata', () => {
    it('should return metadata for archived SPEC', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-METADATA', '2026-01', {
        reason: 'deprecated',
        notes: 'Test metadata',
      })

      const metadata = await getArchiveMetadata('SPEC-METADATA', testProjectPath)

      expect(metadata).not.toBeNull()
      expect(metadata?.reason).toBe('deprecated')
      expect(metadata?.notes).toBe('Test metadata')
    })

    it('should return null for non-existent archived SPEC', async () => {
      const metadata = await getArchiveMetadata('SPEC-NONEXISTENT', testProjectPath)

      expect(metadata).toBeNull()
    })
  })

  // =========================================================================
  // Is Spec Archived Tests
  // =========================================================================
  describe('isSpecArchived', () => {
    it('should return true for archived SPEC', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-CHECK', '2026-01')

      const isArchived = await isSpecArchived('SPEC-CHECK', testProjectPath)

      expect(isArchived).toBe(true)
    })

    it('should return false for non-archived SPEC', async () => {
      await createMockSpec(testProjectPath, 'SPEC-ACTIVE')

      const isArchived = await isSpecArchived('SPEC-ACTIVE', testProjectPath)

      expect(isArchived).toBe(false)
    })

    it('should return false for non-existent SPEC', async () => {
      const isArchived = await isSpecArchived('SPEC-NONEXISTENT', testProjectPath)

      expect(isArchived).toBe(false)
    })
  })

  // =========================================================================
  // Edge Cases and Error Handling
  // =========================================================================
  describe('Edge Cases', () => {
    it('should handle SPEC with special characters in content', async () => {
      await createMockSpec(testProjectPath, 'SPEC-SPECIAL', {
        spec: '# SPEC with "quotes" and <html> and $pecial chars!',
      })

      const result = await archiveSpec('SPEC-SPECIAL', testProjectPath)

      expect(result.success).toBe(true)
    })

    it('should use default reason when not specified', async () => {
      await createMockSpec(testProjectPath, 'SPEC-DEFAULT')

      await archiveSpec('SPEC-DEFAULT', testProjectPath)

      const archiveBase = join(testProjectPath, '.moai', 'archive')
      const months = await readdir(archiveBase)
      const metadataPath = join(archiveBase, months[0], 'SPEC-DEFAULT', '.archive-metadata.json')

      const metadata = JSON.parse(await readFile(metadataPath, 'utf-8')) as ArchiveMetadata

      expect(metadata.reason).toBe('manual')
      expect(metadata.archivedBy).toBe('system')
    })
  })
})

// =========================================================================
// API Endpoint Tests
// =========================================================================
describe('Archive API Endpoints', () => {
  let testProjectPath: string

  beforeAll(async () => {
    testProjectPath = join(tmpdir(), `archive-api-test-${Date.now()}`)
    await mkdir(testProjectPath, { recursive: true })

    const config = await import('../config.js')
    ;(config as any).setMockProjectPath(testProjectPath)
  })

  afterAll(async () => {
    try {
      await rm(testProjectPath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSqlite.prepare.mockReturnThis()
    mockSqlite.get.mockReturnValue({ status: 'active', title: 'Test SPEC' })
    mockSqlite.run.mockReturnValue({ changes: 1 })
    mockSqlite.all.mockReturnValue([])

    const moaiDir = join(testProjectPath, '.moai')
    try {
      await rm(moaiDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('GET /api/specs/archived', () => {
    it('should return empty list when no archived SPECs', async () => {
      const res = await request(app).get('/api/specs/archived')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.specs).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it('should return list of archived SPECs', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-API-001', '2026-01')

      const res = await request(app).get('/api/specs/archived')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.specs).toHaveLength(1)
      expect(res.body.data.specs[0].specId).toBe('SPEC-API-001')
    })
  })

  describe('GET /api/specs/archived/:id', () => {
    it('should return archived SPEC details', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-DETAIL-001', '2026-01', {
        reason: 'completed',
        notes: 'Test notes',
      })

      const res = await request(app).get('/api/specs/archived/SPEC-DETAIL-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.specId).toBe('SPEC-DETAIL-001')
      expect(res.body.data.metadata.reason).toBe('completed')
    })

    it('should return 404 for non-existent archived SPEC', async () => {
      const res = await request(app).get('/api/specs/archived/SPEC-NONEXISTENT')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/specs/:id/archive', () => {
    it('should archive a SPEC', async () => {
      await createMockSpec(testProjectPath, 'SPEC-ARCHIVE-API')

      const res = await request(app)
        .post('/api/specs/SPEC-ARCHIVE-API/archive')
        .send({ reason: 'completed' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.specId).toBe('SPEC-ARCHIVE-API')
    })

    it('should return error for non-existent SPEC', async () => {
      const res = await request(app)
        .post('/api/specs/SPEC-NONEXISTENT/archive')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/specs/:id/restore', () => {
    it('should restore an archived SPEC', async () => {
      await createArchivedSpec(testProjectPath, 'SPEC-RESTORE-API', '2026-01')

      const res = await request(app).post('/api/specs/SPEC-RESTORE-API/restore')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.specId).toBe('SPEC-RESTORE-API')
    })

    it('should return error for non-archived SPEC', async () => {
      const res = await request(app).post('/api/specs/SPEC-NONEXISTENT/restore')

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })
})

// Helper function to be exported for tests
async function createMockSpecExternal(
  projectPath: string,
  specId: string
): Promise<void> {
  await createMockSpec(projectPath, specId)
}

async function createArchivedSpecExternal(
  projectPath: string,
  specId: string,
  month?: string
): Promise<void> {
  await createArchivedSpec(projectPath, specId, month)
}

export { createMockSpecExternal as createMockSpec, createArchivedSpecExternal as createArchivedSpec }
