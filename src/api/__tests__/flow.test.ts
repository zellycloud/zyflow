/**
 * Flow API Tests
 *
 * Tests for discriminated union handling and type-safe API client
 */

import { describe, it, expect } from 'vitest'
import { parseFlowItem, parseFlowItems, assertOpenSpecChange, assertMoaiSpec } from '../flow'
import type { OpenSpecChangeWithType, MoaiSpecWithType, FlowItem } from '@/types'
import { isOpenSpecChange, isMoaiSpec } from '@/types'

describe('Flow API - Discriminated Union Handling', () => {
  describe('parseFlowItem', () => {
    it('should parse OpenSpec change correctly', () => {
      const data = {
        type: 'openspec',
        id: 'change-001',
        title: 'Test Change',
        progress: 50,
        totalTasks: 10,
        completedTasks: 5,
      }

      const result = parseFlowItem(data)

      expect(result).toEqual(data)
      expect(result?.type).toBe('openspec')
    })

    it('should parse MoAI SPEC correctly', () => {
      const data: MoaiSpecWithType = {
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

      const result = parseFlowItem(data)

      expect(result).toEqual(data)
      expect(result?.type).toBe('spec')
      if (result?.type === 'spec') {
        expect(result.spec.requirements).toHaveLength(1)
        expect(result.acceptance.criteria).toHaveLength(1)
      }
    })

    it('should default to openspec for unknown type', () => {
      const data = {
        id: 'unknown-001',
        title: 'Unknown Item',
      }

      const result = parseFlowItem(data)

      expect(result?.type).toBe('openspec')
    })

    it('should return null for invalid data', () => {
      expect(parseFlowItem(null)).toBeNull()
      expect(parseFlowItem(undefined)).toBeNull()
      expect(parseFlowItem('string')).toBeNull()
      expect(parseFlowItem(123)).toBeNull()
    })
  })

  describe('parseFlowItems', () => {
    it('should parse array of mixed items', () => {
      const items = [
        {
          type: 'openspec',
          id: 'change-001',
          title: 'Change 1',
          progress: 50,
          totalTasks: 10,
          completedTasks: 5,
        },
        {
          type: 'spec',
          id: 'spec-001',
          specId: 'SPEC-001',
          title: 'Spec 1',
          status: 'active',
          progress: { completed: 3, total: 5, percentage: 60 },
          spec: { content: '', requirements: [] },
          plan: { content: '', tags: [], progress: { completed: 0, total: 0, percentage: 0 } },
          acceptance: { content: '', criteria: [] },
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ]

      const result = parseFlowItems(items)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('openspec')
      expect(result[1].type).toBe('spec')
    })

    it('should filter out invalid items', () => {
      const items = [
        {
          type: 'openspec',
          id: 'change-001',
          title: 'Change 1',
        },
        null,
        {
          type: 'spec',
          id: 'spec-001',
          title: 'Spec 1',
        },
        undefined,
      ]

      const result = parseFlowItems(items as unknown[])

      expect(result.length).toBeGreaterThan(0)
      expect(result.every((item) => item !== null && item !== undefined)).toBe(true)
    })

    it('should handle empty array', () => {
      const result = parseFlowItems([])
      expect(result).toEqual([])
    })

    it('should return empty array for non-array input', () => {
      expect(parseFlowItems(null as unknown)).toEqual([])
      expect(parseFlowItems('string' as unknown)).toEqual([])
      expect(parseFlowItems(123 as unknown)).toEqual([])
    })
  })

  describe('Type Assertions', () => {
    const openspecItem: OpenSpecChangeWithType = {
      type: 'openspec',
      id: 'change-001',
      title: 'Test Change',
      progress: 50,
      totalTasks: 10,
      completedTasks: 5,
    }

    const moaiItem: MoaiSpecWithType = {
      type: 'spec',
      id: 'spec-001',
      title: 'Test Spec',
      status: 'active',
      progress: { completed: 0, total: 0, percentage: 0 },
      spec: { content: '', requirements: [] },
      plan: { content: '', tags: [], progress: { completed: 0, total: 0, percentage: 0 } },
      acceptance: { content: '', criteria: [] },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }

    it('should assert OpenSpec change correctly', () => {
      const result = assertOpenSpecChange(openspecItem)
      expect(result.type).toBe('openspec')
    })

    it('should throw for non-OpenSpec item', () => {
      expect(() => assertOpenSpecChange(moaiItem)).toThrow(/Expected OpenSpec change/)
    })

    it('should assert MoAI SPEC correctly', () => {
      const result = assertMoaiSpec(moaiItem)
      expect(result.type).toBe('spec')
    })

    it('should throw for non-MoAI item', () => {
      expect(() => assertMoaiSpec(openspecItem)).toThrow(/Expected MoAI SPEC/)
    })
  })

  describe('Type Guards (from types)', () => {
    // Using imported type guards from @/types module at top of file

    const openspecItem: FlowItem = {
      type: 'openspec',
      id: 'change-001',
      title: 'Test Change',
      progress: 50,
      totalTasks: 10,
      completedTasks: 5,
    }

    const moaiItem: FlowItem = {
      type: 'spec',
      id: 'spec-001',
      title: 'Test Spec',
      status: 'active',
      progress: { completed: 0, total: 0, percentage: 0 },
      spec: { content: '', requirements: [] },
      plan: { content: '', tags: [], progress: { completed: 0, total: 0, percentage: 0 } },
      acceptance: { content: '', criteria: [] },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }

    it('should correctly identify OpenSpec changes', () => {
      expect(isOpenSpecChange(openspecItem)).toBe(true)
      expect(isOpenSpecChange(moaiItem)).toBe(false)
    })

    it('should correctly identify MoAI SPECs', () => {
      expect(isMoaiSpec(moaiItem)).toBe(true)
      expect(isMoaiSpec(openspecItem)).toBe(false)
    })
  })
})
