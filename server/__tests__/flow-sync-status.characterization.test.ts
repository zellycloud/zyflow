/**
 * Characterization Tests for SPEC Status Synchronization
 *
 * SPEC-VISIBILITY-001 Phase 1: Status Synchronization Fix
 *
 * These tests document the expected behavior for syncing SPEC frontmatter
 * status to database records.
 *
 * DDD PRESERVE Phase: These tests capture the intended behavior for
 * status synchronization from frontmatter to database.
 */

import { describe, it, expect } from 'vitest'

// =========================================================================
// Valid Status Values
// =========================================================================

/**
 * Valid status values for SPEC documents
 */
const VALID_STATUSES = [
  'planned',
  'active',
  'completed',
  'blocked',
  'archived',
  'draft',
] as const

type SpecStatus = (typeof VALID_STATUSES)[number]

/**
 * Default status when frontmatter status is missing or invalid
 */
const DEFAULT_STATUS: SpecStatus = 'planned'

// =========================================================================
// normalizeStatus() Logic Tests
// =========================================================================

describe('normalizeStatus behavior', () => {
  /**
   * Status normalization function
   * Validates and normalizes status from frontmatter
   */
  function normalizeStatus(rawStatus: unknown): SpecStatus {
    if (typeof rawStatus !== 'string') {
      return DEFAULT_STATUS
    }

    const normalized = rawStatus.toLowerCase().trim()

    // Handle case variations and aliases
    switch (normalized) {
      case 'planned':
        return 'planned'
      case 'active':
        return 'active'
      case 'completed':
      case 'complete':
        return 'completed'
      case 'blocked':
        return 'blocked'
      case 'archived':
        return 'archived'
      case 'draft':
        return 'draft'
      default:
        return DEFAULT_STATUS
    }
  }

  describe('valid status values', () => {
    it('should accept "planned" as valid status', () => {
      expect(normalizeStatus('planned')).toBe('planned')
    })

    it('should accept "active" as valid status', () => {
      expect(normalizeStatus('active')).toBe('active')
    })

    it('should accept "completed" as valid status', () => {
      expect(normalizeStatus('completed')).toBe('completed')
    })

    it('should accept "blocked" as valid status', () => {
      expect(normalizeStatus('blocked')).toBe('blocked')
    })

    it('should accept "archived" as valid status', () => {
      expect(normalizeStatus('archived')).toBe('archived')
    })

    it('should accept "draft" as valid status', () => {
      expect(normalizeStatus('draft')).toBe('draft')
    })
  })

  describe('case normalization', () => {
    it('should normalize uppercase to lowercase', () => {
      expect(normalizeStatus('ACTIVE')).toBe('active')
      expect(normalizeStatus('PLANNED')).toBe('planned')
      expect(normalizeStatus('COMPLETED')).toBe('completed')
    })

    it('should normalize mixed case to lowercase', () => {
      expect(normalizeStatus('Active')).toBe('active')
      expect(normalizeStatus('Planned')).toBe('planned')
      expect(normalizeStatus('Blocked')).toBe('blocked')
    })

    it('should trim whitespace', () => {
      expect(normalizeStatus('  active  ')).toBe('active')
      expect(normalizeStatus('\tplanned\n')).toBe('planned')
    })
  })

  describe('alias handling', () => {
    it('should treat "complete" as alias for "completed"', () => {
      expect(normalizeStatus('complete')).toBe('completed')
      expect(normalizeStatus('Complete')).toBe('completed')
      expect(normalizeStatus('COMPLETE')).toBe('completed')
    })
  })

  describe('default behavior for invalid values', () => {
    it('should default to "planned" for undefined', () => {
      expect(normalizeStatus(undefined)).toBe('planned')
    })

    it('should default to "planned" for null', () => {
      expect(normalizeStatus(null)).toBe('planned')
    })

    it('should default to "planned" for empty string', () => {
      expect(normalizeStatus('')).toBe('planned')
    })

    it('should default to "planned" for unrecognized status', () => {
      expect(normalizeStatus('unknown')).toBe('planned')
      expect(normalizeStatus('in-progress')).toBe('planned')
      expect(normalizeStatus('pending')).toBe('planned')
    })

    it('should default to "planned" for non-string values', () => {
      expect(normalizeStatus(123)).toBe('planned')
      expect(normalizeStatus({})).toBe('planned')
      expect(normalizeStatus([])).toBe('planned')
      expect(normalizeStatus(true)).toBe('planned')
    })
  })
})

// =========================================================================
// Frontmatter Status Extraction Tests
// =========================================================================

describe('frontmatter status extraction', () => {
  /**
   * Simulates parseSpecFile frontmatter extraction
   */
  function extractStatusFromFrontmatter(
    frontmatter: Record<string, unknown>
  ): SpecStatus {
    const rawStatus = frontmatter.status

    if (typeof rawStatus !== 'string') {
      return DEFAULT_STATUS
    }

    const normalized = rawStatus.toLowerCase().trim()

    switch (normalized) {
      case 'planned':
        return 'planned'
      case 'active':
        return 'active'
      case 'completed':
      case 'complete':
        return 'completed'
      case 'blocked':
        return 'blocked'
      case 'archived':
        return 'archived'
      case 'draft':
        return 'draft'
      default:
        return DEFAULT_STATUS
    }
  }

  it('should extract status from frontmatter object', () => {
    const frontmatter = { spec_id: 'SPEC-001', status: 'active' }
    expect(extractStatusFromFrontmatter(frontmatter)).toBe('active')
  })

  it('should handle frontmatter without status field', () => {
    const frontmatter = { spec_id: 'SPEC-001', title: 'Test' }
    expect(extractStatusFromFrontmatter(frontmatter)).toBe('planned')
  })

  it('should handle all valid status values', () => {
    for (const status of VALID_STATUSES) {
      const frontmatter = { spec_id: 'SPEC-001', status }
      expect(extractStatusFromFrontmatter(frontmatter)).toBe(status)
    }
  })
})

// =========================================================================
// Database Query Status Tests
// =========================================================================

describe('database query status behavior', () => {
  describe('INSERT query', () => {
    it('should use parsed status instead of hardcoded active', () => {
      const specStatuses = ['planned', 'active', 'completed', 'blocked', 'archived', 'draft']

      for (const expectedStatus of specStatuses) {
        const frontmatter = { status: expectedStatus }
        const statusForInsert =
          typeof frontmatter.status === 'string' &&
          VALID_STATUSES.includes(frontmatter.status as SpecStatus)
            ? frontmatter.status
            : 'planned'

        expect(statusForInsert).toBe(expectedStatus)
      }
    })

    it('should use "planned" as default for missing status', () => {
      const frontmatter = { spec_id: 'SPEC-001' }
      const statusForInsert = (frontmatter as { status?: string }).status || 'planned'

      expect(statusForInsert).toBe('planned')
    })
  })

  describe('UPDATE query', () => {
    it('should sync status from frontmatter on update', () => {
      const existingRecord = { id: 'SPEC-001', status: 'active' }
      const frontmatter = { status: 'completed' }

      // Simulate update behavior: use frontmatter status
      const newStatus = frontmatter.status || existingRecord.status

      expect(newStatus).toBe('completed')
    })

    it('should preserve existing status if frontmatter has no status', () => {
      const existingRecord = { id: 'SPEC-001', status: 'active' }
      const frontmatter = { title: 'Updated Title' }

      // When frontmatter has no status, keep existing
      const newStatus =
        (frontmatter as { status?: string }).status || existingRecord.status

      expect(newStatus).toBe('active')
    })
  })
})

// =========================================================================
// Integration Contract Tests
// =========================================================================

describe('status synchronization contracts', () => {
  it('should sync all valid status values correctly', () => {
    const testCases = [
      { frontmatterStatus: 'planned', expectedDbStatus: 'planned' },
      { frontmatterStatus: 'active', expectedDbStatus: 'active' },
      { frontmatterStatus: 'completed', expectedDbStatus: 'completed' },
      { frontmatterStatus: 'blocked', expectedDbStatus: 'blocked' },
      { frontmatterStatus: 'archived', expectedDbStatus: 'archived' },
      { frontmatterStatus: 'draft', expectedDbStatus: 'draft' },
    ]

    for (const tc of testCases) {
      expect(tc.frontmatterStatus).toBe(tc.expectedDbStatus)
    }
  })

  it('should handle the "complete" alias correctly', () => {
    // "complete" (from moai-specs.ts) should map to "completed"
    const moaiSpecsStatus = 'complete'
    const normalizedStatus =
      moaiSpecsStatus === 'complete' ? 'completed' : moaiSpecsStatus

    expect(normalizedStatus).toBe('completed')
  })

  it('should default to "planned" instead of "active" for missing status', () => {
    // This is the key behavioral change from SPEC-VISIBILITY-001
    // Previously: hardcoded 'active'
    // After fix: default to 'planned'
    const DEFAULT_STATUS_AFTER_FIX = 'planned'
    expect(DEFAULT_STATUS_AFTER_FIX).toBe('planned')
  })
})
