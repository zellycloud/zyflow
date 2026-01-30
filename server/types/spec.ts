/**
 * Unified SPEC Types (SPEC-VISIBILITY-001)
 *
 * TypeScript interfaces and zod schemas for unified SPEC data model
 * supporting both MoAI (.moai/specs/) and OpenSpec (openspec/specs/) formats.
 */
import { z } from 'zod'

// =============================================
// Zod Schemas for Validation
// =============================================

/**
 * SPEC format discriminator
 */
export const SpecFormatSchema = z.enum(['moai', 'openspec'])
export type SpecFormat = z.infer<typeof SpecFormatSchema>

/**
 * Valid status values for SPEC documents
 * Matches the normalizeStatus function in flow-sync.ts
 */
export const SpecStatusSchema = z.enum([
  'planned',
  'active',
  'completed',
  'blocked',
  'archived',
  'draft',
])
export type SpecStatus = z.infer<typeof SpecStatusSchema>

/**
 * Priority levels for SPEC documents
 */
export const SpecPrioritySchema = z.enum(['high', 'medium', 'low'])
export type SpecPriority = z.infer<typeof SpecPrioritySchema>

/**
 * Unified SPEC schema combining both MoAI and OpenSpec formats
 */
export const UnifiedSpecSchema = z.object({
  /** SPEC identifier, e.g. "SPEC-001" or "change-001" */
  spec_id: z.string(),

  /** Human-readable title */
  title: z.string(),

  /** Current status */
  status: SpecStatusSchema,

  /** Priority level */
  priority: SpecPrioritySchema.default('medium'),

  /** Source format (moai or openspec) */
  format: SpecFormatSchema,

  /** Relative path to the spec file from project root */
  sourcePath: z.string(),

  /** Creation date in ISO format */
  created: z.string().optional(),

  /** Last updated date in ISO format */
  updated: z.string().optional(),

  /** Flag indicating this SPEC exists in both formats (migration candidate) */
  migrationCandidate: z.boolean().optional(),

  /** Optional tags for categorization */
  tags: z.array(z.string()).optional(),

  /** Optional domain for filtering */
  domain: z.string().optional(),
})

export type UnifiedSpec = z.infer<typeof UnifiedSpecSchema>

// =============================================
// Migration Status Types
// =============================================

/**
 * Migration progress statistics
 */
export interface MigrationStatus {
  /** Number of MoAI format specs */
  moaiCount: number
  /** Number of OpenSpec format specs */
  openspecCount: number
  /** Number of specs that exist in both formats */
  migrationCandidates: number
  /** Total unique specs across all formats */
  totalSpecs: number
}

// =============================================
// API Response Types
// =============================================

/**
 * Query filter options for listing specs
 */
export interface SpecQueryFilter {
  format?: SpecFormat
  status?: SpecStatus
  domain?: string
  tags?: string[]
  search?: string
}

/**
 * Response format for GET /api/specs
 */
export interface SpecListResponse {
  success: boolean
  data: {
    specs: UnifiedSpec[]
    total: number
    filters: SpecQueryFilter
  }
  error?: string
}

/**
 * Response format for GET /api/specs/:id
 */
export interface SpecDetailResponse {
  success: boolean
  data: UnifiedSpec | null
  error?: string
}

/**
 * Response format for GET /api/specs/migration-status
 */
export interface MigrationStatusResponse {
  success: boolean
  data: MigrationStatus
  error?: string
}

// =============================================
// Scanner Types
// =============================================

/**
 * Result of scanning a directory for SPEC files
 */
export interface ScanResult {
  specs: UnifiedSpec[]
  errors: string[]
  scannedAt: number
}

/**
 * Cache entry for scan results
 */
export interface CacheEntry {
  result: ScanResult
  expiresAt: number
}

// =============================================
// Validation Helpers
// =============================================

/**
 * Validate and parse a UnifiedSpec object
 * @param data - Raw data to validate
 * @returns Validated UnifiedSpec or null if invalid
 */
export function validateSpec(data: unknown): UnifiedSpec | null {
  const result = UnifiedSpecSchema.safeParse(data)
  return result.success ? result.data : null
}

/**
 * Validate partial spec data (for updates)
 * @param data - Partial data to validate
 * @returns Validated partial spec or null if invalid
 */
export function validatePartialSpec(
  data: unknown
): Partial<UnifiedSpec> | null {
  const result = UnifiedSpecSchema.partial().safeParse(data)
  return result.success ? result.data : null
}
