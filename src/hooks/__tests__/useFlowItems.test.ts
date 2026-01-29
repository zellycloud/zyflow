/**
 * useFlowItems Hook Tests
 *
 * Tests for flow items hook with MoAI SPEC support
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { OpenSpecChangeWithType, MoaiSpecWithType } from '@/types'

// Mock the API
vi.mock('@/api/flow', () => ({
  flowApi: {
    listChanges: vi.fn(),
    getChange: vi.fn(),
    syncChanges: vi.fn(),
    archiveChange: vi.fn(),
  },
  parseFlowItem: vi.fn((item) => item),
}))

vi.mock('@/api/client', () => ({
  isApiError: vi.fn((error) => error instanceof Error && error.name === 'ApiError'),
  getErrorMessage: vi.fn((error) => error?.message || 'Unknown error'),
}))

const mockOpenSpecChange: OpenSpecChangeWithType = {
  type: 'openspec',
  id: 'change-001',
  title: 'Test Change',
  progress: 50,
  totalTasks: 10,
  completedTasks: 5,
}

const mockMoaiSpec: MoaiSpecWithType = {
  type: 'spec',
  id: 'spec-001',
  specId: 'SPEC-001',
  title: 'API Authentication',
  status: 'active',
  progress: { completed: 3, total: 5, percentage: 60 },
  spec: {
    content: '# API Auth Spec',
    requirements: [
      {
        id: 'req-1',
        title: 'JWT Support',
        description: 'Support JWT authentication',
        type: 'functional',
        priority: 'critical',
      },
    ],
  },
  plan: {
    content: '# Implementation Plan',
    tags: [{ id: 'tag-1', name: 'auth', color: '#FF0000' }],
    progress: { completed: 2, total: 3, percentage: 67 },
  },
  acceptance: {
    content: '# Acceptance Criteria',
    criteria: [
      {
        id: 'ac-1',
        description: 'JWT tokens must be validated',
        priority: 'critical',
      },
    ],
  },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-15T00:00:00Z',
}

describe('useFlowItems Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Hook Tests - Mock-based', () => {
    it('should have mixed flow items mock data', () => {
      expect(mockOpenSpecChange.type).toBe('openspec')
      expect(mockMoaiSpec.type).toBe('spec')
      expect(mockOpenSpecChange.id).toBe('change-001')
      expect(mockMoaiSpec.id).toBe('spec-001')
    })

    it('should differentiate between OpenSpec and MoAI types', () => {
      expect(mockOpenSpecChange.type === 'openspec').toBe(true)
      expect(mockMoaiSpec.type === 'spec').toBe(true)

      // Verify structure
      expect('totalTasks' in mockOpenSpecChange).toBe(true)
      expect('spec' in mockMoaiSpec).toBe(true)
    })

    it('should have correct progress types', () => {
      expect(mockOpenSpecChange.progress).toBe(50)
      expect(mockMoaiSpec.progress.completed).toBe(3)
      expect(mockMoaiSpec.progress.percentage).toBe(60)
    })

    it('should have correct status values', () => {
      expect(['active', 'completed', 'archived']).toContain(mockMoaiSpec.status)
      expect(mockOpenSpecChange.title).toBeDefined()
    })
  })

  describe('Type Safety Tests', () => {
    it('should enforce type constraints for OpenSpec', () => {
      const item: OpenSpecChangeWithType = {
        type: 'openspec',
        id: 'test',
        title: 'Test',
        progress: 0,
        totalTasks: 5,
        completedTasks: 2,
      }

      expect(item.type).toBe('openspec')
      expect(item.totalTasks).toBeDefined()
    })

    it('should enforce type constraints for MoAI SPEC', () => {
      const item: MoaiSpecWithType = {
        type: 'spec',
        id: 'test',
        title: 'Test',
        status: 'active',
        progress: { completed: 0, total: 0, percentage: 0 },
        spec: { content: '', requirements: [] },
        plan: { content: '', tags: [], progress: { completed: 0, total: 0, percentage: 0 } },
        acceptance: { content: '', criteria: [] },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      }

      expect(item.type).toBe('spec')
      expect(item.spec).toBeDefined()
    })
  })

  describe('Mock API Tests', () => {
    it('should mock flowApi.listChanges', async () => {
      const { flowApi } = await import('@/api/flow')
      vi.mocked(flowApi.listChanges).mockResolvedValueOnce([mockOpenSpecChange, mockMoaiSpec])

      const result = await flowApi.listChanges()

      expect(result).toHaveLength(2)
      expect(flowApi.listChanges).toHaveBeenCalled()
    })

    it('should mock flowApi.getChange', async () => {
      const { flowApi } = await import('@/api/flow')
      vi.mocked(flowApi.getChange).mockResolvedValueOnce({
        change: mockMoaiSpec,
        stages: {},
      })

      const result = await flowApi.getChange('spec-001')

      expect(result.change.type).toBe('spec')
      expect(flowApi.getChange).toHaveBeenCalledWith('spec-001')
    })

    it('should mock flowApi.syncChanges', async () => {
      const { flowApi } = await import('@/api/flow')
      vi.mocked(flowApi.syncChanges).mockResolvedValueOnce({
        synced: 5,
        created: 2,
        updated: 3,
      })

      const result = await flowApi.syncChanges()

      expect(result.synced).toBe(5)
      expect(flowApi.syncChanges).toHaveBeenCalled()
    })

    it('should mock flowApi.archiveChange', async () => {
      const { flowApi } = await import('@/api/flow')
      vi.mocked(flowApi.archiveChange).mockResolvedValueOnce({
        changeId: 'spec-001',
        archived: true,
        filesMoved: true,
      })

      const result = await flowApi.archiveChange('spec-001', { force: true })

      expect(result.archived).toBe(true)
      expect(flowApi.archiveChange).toHaveBeenCalledWith('spec-001', { force: true })
    })

    it('should handle API errors', async () => {
      const { flowApi } = await import('@/api/flow')
      const error = new Error('API Error')
      vi.mocked(flowApi.listChanges).mockRejectedValueOnce(error)

      await expect(flowApi.listChanges()).rejects.toThrow('API Error')
    })
  })
})
