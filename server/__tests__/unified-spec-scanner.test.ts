/**
 * Integration Tests for Unified SPEC Scanner (SPEC-VISIBILITY-001)
 *
 * Tests cover:
 * - Status normalization
 * - Spec merging and deduplication logic
 * - API endpoint behavior
 * - Caching behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'

// Mock the config module
vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    projects: [
      { id: 'test-project', name: 'Test Project', path: '/tmp/test-project' },
    ],
    activeProjectId: 'test-project',
  }),
  getActiveProject: vi.fn().mockResolvedValue({
    id: 'test-project',
    name: 'Test Project',
    path: '/tmp/test-project',
  }),
}))

// Import after mocking
import {
  normalizeStatus,
  mergeSpecLists,
  clearCache,
} from '../unified-spec-scanner.js'
import type { UnifiedSpec } from '../types/spec.js'
import { validateSpec, validatePartialSpec } from '../types/spec.js'

describe('Unified SPEC Scanner', () => {
  beforeEach(() => {
    clearCache()
  })

  afterEach(() => {
    clearCache()
  })

  // =========================================================================
  // Status Normalization Tests
  // =========================================================================
  describe('normalizeStatus', () => {
    it('should normalize valid status values', () => {
      expect(normalizeStatus('planned')).toBe('planned')
      expect(normalizeStatus('active')).toBe('active')
      expect(normalizeStatus('completed')).toBe('completed')
      expect(normalizeStatus('blocked')).toBe('blocked')
      expect(normalizeStatus('archived')).toBe('archived')
      expect(normalizeStatus('draft')).toBe('draft')
    })

    it('should handle case variations', () => {
      expect(normalizeStatus('PLANNED')).toBe('planned')
      expect(normalizeStatus('Active')).toBe('active')
      expect(normalizeStatus('COMPLETED')).toBe('completed')
    })

    it('should normalize "complete" alias to "completed"', () => {
      expect(normalizeStatus('complete')).toBe('completed')
      expect(normalizeStatus('COMPLETE')).toBe('completed')
    })

    it('should default to "planned" for invalid values', () => {
      expect(normalizeStatus('invalid')).toBe('planned')
      expect(normalizeStatus('')).toBe('planned')
      expect(normalizeStatus(123)).toBe('planned')
      expect(normalizeStatus(null)).toBe('planned')
      expect(normalizeStatus(undefined)).toBe('planned')
    })

    it('should handle whitespace', () => {
      expect(normalizeStatus('  active  ')).toBe('active')
      expect(normalizeStatus('\tblocked\n')).toBe('blocked')
    })
  })

  // =========================================================================
  // Zod Schema Validation Tests
  // =========================================================================
  describe('UnifiedSpec validation', () => {
    it('should validate a complete UnifiedSpec object', () => {
      const validSpec = {
        spec_id: 'SPEC-001',
        title: 'Test Spec',
        status: 'active',
        priority: 'high',
        format: 'moai',
        sourcePath: '.moai/specs/SPEC-001/spec.md',
        created: '2024-01-01',
        updated: '2024-01-15',
        tags: ['auth', 'security'],
        domain: 'backend',
      }

      const result = validateSpec(validSpec)
      expect(result).not.toBeNull()
      expect(result?.spec_id).toBe('SPEC-001')
    })

    it('should validate a minimal UnifiedSpec object', () => {
      const minimalSpec = {
        spec_id: 'SPEC-001',
        title: 'Test',
        status: 'planned',
        format: 'moai',
        sourcePath: '.moai/specs/SPEC-001/spec.md',
      }

      const result = validateSpec(minimalSpec)
      expect(result).not.toBeNull()
      expect(result?.priority).toBe('medium') // default value
    })

    it('should reject invalid status', () => {
      const invalidSpec = {
        spec_id: 'SPEC-001',
        title: 'Test',
        status: 'invalid-status',
        format: 'moai',
        sourcePath: '.moai/specs/SPEC-001/spec.md',
      }

      const result = validateSpec(invalidSpec)
      expect(result).toBeNull()
    })

    it('should reject invalid format', () => {
      const invalidSpec = {
        spec_id: 'SPEC-001',
        title: 'Test',
        status: 'active',
        format: 'invalid-format',
        sourcePath: '.moai/specs/SPEC-001/spec.md',
      }

      const result = validateSpec(invalidSpec)
      expect(result).toBeNull()
    })

    it('should validate partial spec for updates', () => {
      const partialSpec = {
        status: 'completed',
        priority: 'low',
      }

      const result = validatePartialSpec(partialSpec)
      expect(result).not.toBeNull()
      expect(result?.status).toBe('completed')
    })
  })

  // =========================================================================
  // Deduplication Logic
  // =========================================================================
  describe('mergeSpecLists', () => {
    it('should prioritize MoAI specs over OpenSpec when IDs match', () => {
      const moaiSpecs: UnifiedSpec[] = [
        {
          spec_id: 'SPEC-001',
          title: 'MoAI Version',
          status: 'active',
          priority: 'high',
          format: 'moai',
          sourcePath: '.moai/specs/SPEC-001/spec.md',
        },
      ]

      const openSpecs: UnifiedSpec[] = [
        {
          spec_id: 'SPEC-001',
          title: 'OpenSpec Version',
          status: 'planned',
          priority: 'medium',
          format: 'openspec',
          sourcePath: 'openspec/specs/SPEC-001/spec.md',
        },
      ]

      const merged = mergeSpecLists(moaiSpecs, openSpecs)

      expect(merged).toHaveLength(1)
      expect(merged[0].title).toBe('MoAI Version')
      expect(merged[0].format).toBe('moai')
      expect(merged[0].migrationCandidate).toBe(true)
    })

    it('should merge unique specs from both sources', () => {
      const moaiSpecs: UnifiedSpec[] = [
        {
          spec_id: 'SPEC-001',
          title: 'MoAI Spec',
          status: 'active',
          priority: 'medium',
          format: 'moai',
          sourcePath: '.moai/specs/SPEC-001/spec.md',
        },
      ]

      const openSpecs: UnifiedSpec[] = [
        {
          spec_id: 'change-001',
          title: 'OpenSpec Change',
          status: 'planned',
          priority: 'medium',
          format: 'openspec',
          sourcePath: 'openspec/changes/change-001/proposal.md',
        },
      ]

      const merged = mergeSpecLists(moaiSpecs, openSpecs)

      expect(merged).toHaveLength(2)
      expect(merged.find((s) => s.spec_id === 'SPEC-001')).toBeDefined()
      expect(merged.find((s) => s.spec_id === 'change-001')).toBeDefined()
    })

    it('should mark duplicates as migration candidates', () => {
      const moaiSpecs: UnifiedSpec[] = [
        {
          spec_id: 'SPEC-001',
          title: 'MoAI Spec',
          status: 'active',
          priority: 'medium',
          format: 'moai',
          sourcePath: '.moai/specs/SPEC-001/spec.md',
        },
        {
          spec_id: 'SPEC-002',
          title: 'Unique MoAI',
          status: 'active',
          priority: 'medium',
          format: 'moai',
          sourcePath: '.moai/specs/SPEC-002/spec.md',
        },
      ]

      const openSpecs: UnifiedSpec[] = [
        {
          spec_id: 'SPEC-001',
          title: 'Duplicate OpenSpec',
          status: 'planned',
          priority: 'medium',
          format: 'openspec',
          sourcePath: 'openspec/specs/SPEC-001/spec.md',
        },
        {
          spec_id: 'change-001',
          title: 'Unique OpenSpec',
          status: 'planned',
          priority: 'medium',
          format: 'openspec',
          sourcePath: 'openspec/changes/change-001/proposal.md',
        },
      ]

      const merged = mergeSpecLists(moaiSpecs, openSpecs)

      expect(merged).toHaveLength(3)

      const duplicate = merged.find((s) => s.spec_id === 'SPEC-001')
      expect(duplicate?.migrationCandidate).toBe(true)

      const uniqueMoai = merged.find((s) => s.spec_id === 'SPEC-002')
      expect(uniqueMoai?.migrationCandidate).toBeUndefined()

      const uniqueOpen = merged.find((s) => s.spec_id === 'change-001')
      expect(uniqueOpen?.migrationCandidate).toBeUndefined()
    })

    it('should handle empty arrays', () => {
      expect(mergeSpecLists([], [])).toEqual([])
      expect(
        mergeSpecLists(
          [
            {
              spec_id: 'SPEC-001',
              title: 'Only',
              status: 'active',
              priority: 'medium',
              format: 'moai',
              sourcePath: '.moai/specs/SPEC-001/spec.md',
            },
          ],
          []
        )
      ).toHaveLength(1)
    })
  })

  // =========================================================================
  // API Endpoint Tests
  // =========================================================================
  describe('API Endpoints', () => {
    describe('GET /api/specs', () => {
      it('should return empty specs when directories do not exist', async () => {
        const res = await request(app).get('/api/specs')

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.specs).toEqual([])
      })

      it('should return specs list with total count', async () => {
        const res = await request(app).get('/api/specs')

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data).toHaveProperty('specs')
        expect(res.body.data).toHaveProperty('total')
        expect(res.body.data).toHaveProperty('filters')
      })

      it('should accept filter query parameters', async () => {
        const res = await request(app).get(
          '/api/specs?format=moai&status=active'
        )

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.filters).toEqual({
          format: 'moai',
          status: 'active',
        })
      })

      it('should accept refresh query parameter', async () => {
        const res = await request(app).get('/api/specs?refresh=true')

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
      })
    })

    describe('GET /api/specs/migration-status', () => {
      it('should return migration status', async () => {
        const res = await request(app).get('/api/specs/migration-status')

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data).toHaveProperty('moaiCount')
        expect(res.body.data).toHaveProperty('openspecCount')
        expect(res.body.data).toHaveProperty('migrationCandidates')
        expect(res.body.data).toHaveProperty('totalSpecs')
      })
    })

    describe('GET /api/specs/:id', () => {
      it('should return 404 for non-existent spec', async () => {
        const res = await request(app).get('/api/specs/SPEC-999')

        expect(res.status).toBe(404)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toContain('not found')
      })
    })

    describe('POST /api/specs/cache/clear', () => {
      it('should clear cache successfully', async () => {
        const res = await request(app).post('/api/specs/cache/clear')

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
      })
    })
  })

  // =========================================================================
  // Cache Behavior Tests
  // =========================================================================
  describe('cache behavior', () => {
    it('clearCache should not throw', () => {
      expect(() => clearCache()).not.toThrow()
      expect(() => clearCache('/some/path')).not.toThrow()
    })
  })
})
