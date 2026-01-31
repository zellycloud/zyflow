/**
 * Unified SPEC API Routes (SPEC-VISIBILITY-001)
 *
 * API endpoints for querying SPEC documents across both MoAI and OpenSpec formats.
 *
 * Endpoints:
 * - GET /api/specs - List all specs with query filters
 * - GET /api/specs/:id - Get single SPEC details
 * - GET /api/specs/migration-status - Get migration progress
 * - GET /api/specs/archived - List archived SPECs (Phase 4)
 * - GET /api/specs/archived/:id - Get archived SPEC details (Phase 4)
 * - POST /api/specs/:id/archive - Archive a SPEC (Phase 4)
 * - POST /api/specs/:id/restore - Restore archived SPEC (Phase 4)
 */
import { Router } from 'express'
import { getActiveProject } from '../config.js'
import {
  scanAllSpecs,
  scanAllSpecsRemote,
  getMigrationStatus,
  clearCache,
} from '../unified-spec-scanner.js'
import {
  archiveSpec,
  restoreSpec,
  listArchivedSpecs,
  getArchiveMetadata,
} from '../archive-manager.js'
import type {
  UnifiedSpec,
  SpecFormat,
  SpecStatus,
  SpecQueryFilter,
  SpecListResponse,
  SpecDetailResponse,
  MigrationStatusResponse,
} from '../types/spec.js'
import type {
  ArchiveRequest,
  ArchiveResponse,
  RestoreResponse,
  ArchivedSpecsListResponse,
  ArchivedSpecDetailResponse,
} from '../types/archive.js'

const router = Router()

// =============================================
// GET /api/specs - List all specs with filters
// =============================================

/**
 * List all SPEC documents with optional filtering
 *
 * Query Parameters:
 * - format: 'moai' | 'openspec' - Filter by source format
 * - status: SpecStatus - Filter by status
 * - domain: string - Filter by domain
 * - search: string - Search in title and spec_id
 * - refresh: 'true' - Force cache refresh
 */
router.get('/', async (req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as SpecListResponse)
    }

    const {
      format,
      status,
      domain,
      search,
      refresh,
    } = req.query as {
      format?: string
      status?: string
      domain?: string
      search?: string
      refresh?: string
    }

    const forceRefresh = refresh === 'true'

    // Use remote scanner for SSH projects
    const result = project.remote
      ? await scanAllSpecsRemote(project.path, project.remote.serverId)
      : await scanAllSpecs(project.path, forceRefresh)

    // Apply filters
    let filteredSpecs = result.specs

    // Filter by format
    if (format && (format === 'moai' || format === 'openspec')) {
      filteredSpecs = filteredSpecs.filter((s) => s.format === format)
    }

    // Filter by status
    if (status) {
      const validStatuses = [
        'planned',
        'active',
        'completed',
        'blocked',
        'archived',
        'draft',
      ]
      if (validStatuses.includes(status)) {
        filteredSpecs = filteredSpecs.filter((s) => s.status === status)
      }
    }

    // Filter by domain
    if (domain) {
      filteredSpecs = filteredSpecs.filter((s) => s.domain === domain)
    }

    // Search in title and spec_id
    if (search) {
      const searchLower = search.toLowerCase()
      filteredSpecs = filteredSpecs.filter(
        (s) =>
          s.title.toLowerCase().includes(searchLower) ||
          s.spec_id.toLowerCase().includes(searchLower)
      )
    }

    // Sort by spec_id for consistent ordering
    filteredSpecs.sort((a, b) => a.spec_id.localeCompare(b.spec_id))

    const filters: SpecQueryFilter = {}
    if (format) filters.format = format as SpecFormat
    if (status) filters.status = status as SpecStatus
    if (domain) filters.domain = domain
    if (search) filters.search = search

    const response: SpecListResponse = {
      success: true,
      data: {
        specs: filteredSpecs,
        total: filteredSpecs.length,
        filters,
      },
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] List error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list specs',
    } as SpecListResponse)
  }
})

// =============================================
// GET /api/specs/migration-status - Migration progress
// =============================================

/**
 * Get migration status showing format distribution
 * This endpoint must be defined BEFORE /:id to avoid route conflict
 */
router.get('/migration-status', async (req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as MigrationStatusResponse)
    }

    const { refresh } = req.query as { refresh?: string }
    const forceRefresh = refresh === 'true'

    const status = await getMigrationStatus(project.path, forceRefresh)

    const response: MigrationStatusResponse = {
      success: true,
      data: status,
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] Migration status error:', error)
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get migration status',
    } as MigrationStatusResponse)
  }
})

// =============================================
// POST /api/specs/cache/clear - Clear cache
// =============================================

/**
 * Clear the spec scanner cache
 */
router.post('/cache/clear', async (_req, res) => {
  try {
    clearCache()
    res.json({
      success: true,
      data: { message: 'Cache cleared' },
    })
  } catch (error) {
    console.error('[Specs] Cache clear error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear cache',
    })
  }
})

// =============================================
// GET /api/specs/archived - List archived SPECs (Phase 4)
// =============================================

/**
 * List all archived SPEC documents
 * Must be defined BEFORE /:id to avoid route conflict
 */
router.get('/archived', async (_req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as ArchivedSpecsListResponse)
    }

    const specs = await listArchivedSpecs(project.path)

    const response: ArchivedSpecsListResponse = {
      success: true,
      data: {
        specs,
        total: specs.length,
      },
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] List archived error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list archived specs',
    } as ArchivedSpecsListResponse)
  }
})

// =============================================
// GET /api/specs/archived/:id - Get archived SPEC details (Phase 4)
// =============================================

/**
 * Get details of a specific archived SPEC
 */
router.get('/archived/:id', async (req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as ArchivedSpecDetailResponse)
    }

    const { id } = req.params
    const metadata = await getArchiveMetadata(id, project.path)

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: `Archived SPEC ${id} not found`,
      } as ArchivedSpecDetailResponse)
    }

    // Get the full archived spec info
    const archivedSpecs = await listArchivedSpecs(project.path)
    const spec = archivedSpecs.find((s) => s.specId === id)

    if (!spec) {
      return res.status(404).json({
        success: false,
        error: `Archived SPEC ${id} not found`,
      } as ArchivedSpecDetailResponse)
    }

    const response: ArchivedSpecDetailResponse = {
      success: true,
      data: {
        ...spec,
        metadata,
      },
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] Get archived spec error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get archived spec',
    } as ArchivedSpecDetailResponse)
  }
})

// =============================================
// POST /api/specs/:id/archive - Archive a SPEC (Phase 4)
// =============================================

/**
 * Archive a SPEC document
 *
 * Request Body:
 * - reason: 'completed' | 'deprecated' | 'superseded' | 'manual' (optional)
 * - notes: string (optional)
 */
router.post('/:id/archive', async (req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as ArchiveResponse)
    }

    const { id } = req.params
    const { reason, notes } = req.body as ArchiveRequest

    const result = await archiveSpec(
      id,
      project.path,
      reason || 'manual',
      'user',
      notes
    )

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      } as ArchiveResponse)
    }

    // Clear cache to reflect changes
    clearCache()

    const response: ArchiveResponse = {
      success: true,
      data: {
        specId: result.specId,
        archivePath: result.archivePath!,
      },
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] Archive error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive spec',
    } as ArchiveResponse)
  }
})

// =============================================
// POST /api/specs/:id/restore - Restore archived SPEC (Phase 4)
// =============================================

/**
 * Restore an archived SPEC document
 */
router.post('/:id/restore', async (req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as RestoreResponse)
    }

    const { id } = req.params
    const result = await restoreSpec(id, project.path)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      } as RestoreResponse)
    }

    // Clear cache to reflect changes
    clearCache()

    const response: RestoreResponse = {
      success: true,
      data: {
        specId: result.specId,
        restoredTo: result.restoredTo!,
      },
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] Restore error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore spec',
    } as RestoreResponse)
  }
})

// =============================================
// GET /api/specs/:id - Get single spec details
// =============================================

/**
 * Get a single SPEC by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({
        success: false,
        error: 'No active project',
      } as SpecDetailResponse)
    }

    const { id } = req.params

    // Use remote scanner for SSH projects
    const result = project.remote
      ? await scanAllSpecsRemote(project.path, project.remote.serverId)
      : await scanAllSpecs(project.path)

    const spec = result.specs.find((s) => s.spec_id === id)

    if (!spec) {
      return res.status(404).json({
        success: false,
        data: null,
        error: `SPEC ${id} not found`,
      } as SpecDetailResponse)
    }

    const response: SpecDetailResponse = {
      success: true,
      data: spec,
    }

    res.json(response)
  } catch (error) {
    console.error('[Specs] Get by ID error:', error)
    res.status(500).json({
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get spec',
    } as SpecDetailResponse)
  }
})

export { router as specsRouter }
