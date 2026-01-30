/**
 * Archive Types (SPEC-VISIBILITY-001 Phase 4)
 *
 * TypeScript interfaces for SPEC archive management.
 */

// =============================================
// Archive Metadata Types
// =============================================

/**
 * Reason for archiving a SPEC
 */
export type ArchiveReason = 'completed' | 'deprecated' | 'superseded' | 'manual'

/**
 * Archive metadata stored in .archive-metadata.json
 */
export interface ArchiveMetadata {
  /** ISO timestamp when archived */
  archivedAt: string
  /** Who archived the SPEC (user or system) */
  archivedBy: string
  /** Reason for archiving */
  reason: ArchiveReason
  /** Original status before archiving */
  originalStatus: string
  /** Path where the SPEC can be restored to */
  restorePath: string
  /** Spec title for display purposes */
  title?: string
  /** Optional notes about the archive */
  notes?: string
}

// =============================================
// Archive Operation Result Types
// =============================================

/**
 * Result of an archive or restore operation
 */
export interface ArchiveResult {
  /** Whether the operation succeeded */
  success: boolean
  /** SPEC ID that was processed */
  specId: string
  /** Path to the archive (for archive operation) */
  archivePath?: string
  /** Path where restored (for restore operation) */
  restoredTo?: string
  /** Error message if operation failed */
  error?: string
}

/**
 * Archived SPEC summary for listing
 */
export interface ArchivedSpecSummary {
  /** SPEC ID */
  specId: string
  /** SPEC title */
  title: string
  /** When it was archived */
  archivedAt: string
  /** Who archived it */
  archivedBy: string
  /** Why it was archived */
  reason: ArchiveReason
  /** Original status before archiving */
  originalStatus: string
  /** Archive path (relative) */
  archivePath: string
}

// =============================================
// API Request/Response Types
// =============================================

/**
 * Request body for archive operation
 */
export interface ArchiveRequest {
  /** Reason for archiving (optional, defaults to 'manual') */
  reason?: ArchiveReason
  /** Optional notes */
  notes?: string
}

/**
 * Response for archive operation
 */
export interface ArchiveResponse {
  success: boolean
  data?: {
    specId: string
    archivePath: string
  }
  error?: string
}

/**
 * Response for restore operation
 */
export interface RestoreResponse {
  success: boolean
  data?: {
    specId: string
    restoredTo: string
  }
  error?: string
}

/**
 * Response for listing archived SPECs
 */
export interface ArchivedSpecsListResponse {
  success: boolean
  data?: {
    specs: ArchivedSpecSummary[]
    total: number
  }
  error?: string
}

/**
 * Response for getting archived SPEC details
 */
export interface ArchivedSpecDetailResponse {
  success: boolean
  data?: ArchivedSpecSummary & {
    /** Full archive metadata */
    metadata: ArchiveMetadata
  }
  error?: string
}
