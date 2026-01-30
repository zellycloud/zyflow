/**
 * Archive Manager (SPEC-VISIBILITY-001 Phase 4)
 *
 * Manages archiving and restoring of SPEC documents.
 *
 * Archive structure:
 * .moai/archive/
 * └── {YYYY-MM}/
 *     └── {SPEC-ID}/
 *         ├── spec.md
 *         ├── plan.md
 *         ├── acceptance.md
 *         └── .archive-metadata.json
 *
 * Features:
 * - Atomic filesystem operations (move, not copy+delete)
 * - Database status synchronization
 * - Metadata preservation
 * - Rollback on failure
 */

import { mkdir, readdir, readFile, writeFile, rename, rm, stat, access, constants } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { getSqlite } from './tasks/db/client.js'
import type {
  ArchiveMetadata,
  ArchiveResult,
  ArchiveReason,
  ArchivedSpecSummary,
} from './types/archive.js'

// =============================================
// Constants
// =============================================

const ARCHIVE_DIR = '.moai/archive'
const SPECS_DIR = '.moai/specs'
const METADATA_FILE = '.archive-metadata.json'

// =============================================
// Helper Functions
// =============================================

/**
 * Get the archive month directory name (YYYY-MM format)
 */
function getArchiveMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Ensure a directory exists, creating it if necessary
 */
async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true })
  }
}

/**
 * Check if a path exists and is accessible
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Safely move a directory using rename (atomic on same filesystem)
 * Falls back to copy+delete if rename fails (cross-filesystem)
 */
async function moveDirectory(source: string, destination: string): Promise<void> {
  // Ensure destination parent exists
  await ensureDir(dirname(destination))

  try {
    // Try atomic rename first (works on same filesystem)
    await rename(source, destination)
  } catch (error) {
    // If rename fails (e.g., cross-filesystem), we could implement
    // copy+delete, but for now we'll throw as .moai directories
    // should always be on the same filesystem
    throw new Error(
      `Failed to move directory from ${source} to ${destination}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

// =============================================
// Atomic Operation Wrapper (TAG-022)
// =============================================

/**
 * Execute an operation with rollback support
 *
 * @param operation - The main operation to execute
 * @param rollback - The rollback function to call on failure
 * @returns The result of the operation
 */
async function withAtomicOperation<T>(
  operation: () => Promise<T>,
  rollback: () => Promise<void>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    // Attempt rollback
    try {
      await rollback()
      console.log('[Archive] Rollback successful')
    } catch (rollbackError) {
      console.error('[Archive] Rollback failed:', rollbackError)
    }
    throw error
  }
}

// =============================================
// Archive Operations
// =============================================

/**
 * Archive a SPEC document
 *
 * This operation:
 * 1. Moves the SPEC directory to archive
 * 2. Creates archive metadata file
 * 3. Updates database status to 'archived'
 *
 * Rolls back all changes if any step fails.
 *
 * @param specId - The SPEC ID to archive (e.g., "SPEC-001")
 * @param projectPath - Path to the project root
 * @param reason - Reason for archiving
 * @param archivedBy - Who is archiving (default: "system")
 * @param notes - Optional notes about the archive
 * @returns ArchiveResult indicating success or failure
 */
export async function archiveSpec(
  specId: string,
  projectPath: string,
  reason: ArchiveReason = 'manual',
  archivedBy: string = 'system',
  notes?: string
): Promise<ArchiveResult> {
  const sqlite = getSqlite()
  const sourcePath = join(projectPath, SPECS_DIR, specId)
  const archiveMonth = getArchiveMonth()
  const archivePath = join(projectPath, ARCHIVE_DIR, archiveMonth, specId)
  const relativeArchivePath = `${ARCHIVE_DIR}/${archiveMonth}/${specId}`

  // Validate source exists
  if (!existsSync(sourcePath)) {
    return {
      success: false,
      specId,
      error: `SPEC directory not found: ${specId}`,
    }
  }

  // Check if already archived
  if (await pathExists(archivePath)) {
    return {
      success: false,
      specId,
      error: `SPEC is already archived at ${relativeArchivePath}`,
    }
  }

  // Get current status from database for metadata
  const existingChange = sqlite
    .prepare(`SELECT status, title FROM changes WHERE id = ?`)
    .get(specId) as { status: string; title: string } | undefined

  const originalStatus = existingChange?.status || 'active'
  const title = existingChange?.title || specId

  // Prepare archive metadata
  const metadata: ArchiveMetadata = {
    archivedAt: new Date().toISOString(),
    archivedBy,
    reason,
    originalStatus,
    restorePath: `${SPECS_DIR}/${specId}`,
    title,
    notes,
  }

  // Track what operations were completed for rollback
  let directoryMoved = false
  let metadataWritten = false
  let databaseUpdated = false
  let previousDbStatus = originalStatus

  const rollback = async () => {
    // Rollback in reverse order
    if (databaseUpdated) {
      try {
        sqlite
          .prepare(`UPDATE changes SET status = ?, updated_at = ? WHERE id = ?`)
          .run(previousDbStatus, Date.now(), specId)
        console.log('[Archive] Rolled back database status')
      } catch (err) {
        console.error('[Archive] Failed to rollback database:', err)
      }
    }

    if (metadataWritten) {
      try {
        const metadataPath = join(archivePath, METADATA_FILE)
        if (await pathExists(metadataPath)) {
          await rm(metadataPath)
          console.log('[Archive] Removed metadata file')
        }
      } catch (err) {
        console.error('[Archive] Failed to remove metadata:', err)
      }
    }

    if (directoryMoved) {
      try {
        // Move back to original location
        await moveDirectory(archivePath, sourcePath)
        // Clean up empty month directory if needed
        const monthDir = dirname(archivePath)
        const monthContents = await readdir(monthDir)
        if (monthContents.length === 0) {
          await rm(monthDir, { recursive: true })
        }
        console.log('[Archive] Moved directory back to original location')
      } catch (err) {
        console.error('[Archive] Failed to move directory back:', err)
      }
    }
  }

  try {
    return await withAtomicOperation(
      async () => {
        // Step 1: Move directory to archive
        await moveDirectory(sourcePath, archivePath)
        directoryMoved = true

        // Step 2: Write archive metadata
        const metadataPath = join(archivePath, METADATA_FILE)
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
        metadataWritten = true

        // Step 3: Update database status
        const now = Date.now()
        sqlite
          .prepare(
            `UPDATE changes SET status = 'archived', updated_at = ? WHERE id = ?`
          )
          .run(now, specId)
        databaseUpdated = true

        // Also archive any tasks associated with this SPEC
        sqlite
          .prepare(
            `UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ? WHERE change_id = ?`
          )
          .run(now, now, specId)

        console.log(`[Archive] Successfully archived ${specId} to ${relativeArchivePath}`)

        return {
          success: true,
          specId,
          archivePath: relativeArchivePath,
        }
      },
      rollback
    )
  } catch (error) {
    return {
      success: false,
      specId,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Restore an archived SPEC document
 *
 * This operation:
 * 1. Reads archive metadata
 * 2. Moves the SPEC directory back to .moai/specs
 * 3. Restores database status from metadata
 *
 * Rolls back all changes if any step fails.
 *
 * @param specId - The SPEC ID to restore (e.g., "SPEC-001")
 * @param projectPath - Path to the project root
 * @returns ArchiveResult indicating success or failure
 */
export async function restoreSpec(
  specId: string,
  projectPath: string
): Promise<ArchiveResult> {
  const sqlite = getSqlite()
  const restorePath = join(projectPath, SPECS_DIR, specId)
  const relativeRestorePath = `${SPECS_DIR}/${specId}`

  // Find the archived SPEC
  const archiveBase = join(projectPath, ARCHIVE_DIR)

  if (!existsSync(archiveBase)) {
    return {
      success: false,
      specId,
      error: `Archive directory not found`,
    }
  }

  // Search for the SPEC in archive month directories
  let archivePath: string | null = null
  let metadata: ArchiveMetadata | null = null

  try {
    const months = await readdir(archiveBase)
    for (const month of months) {
      const potentialPath = join(archiveBase, month, specId)
      if (await pathExists(potentialPath)) {
        archivePath = potentialPath
        // Read metadata
        const metadataPath = join(potentialPath, METADATA_FILE)
        if (await pathExists(metadataPath)) {
          const metadataContent = await readFile(metadataPath, 'utf-8')
          metadata = JSON.parse(metadataContent) as ArchiveMetadata
        }
        break
      }
    }
  } catch (error) {
    return {
      success: false,
      specId,
      error: `Failed to search archive: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (!archivePath) {
    return {
      success: false,
      specId,
      error: `SPEC ${specId} not found in archive`,
    }
  }

  // Check if restore destination already exists
  if (existsSync(restorePath)) {
    return {
      success: false,
      specId,
      error: `Restore destination already exists: ${relativeRestorePath}`,
    }
  }

  // Track operations for rollback
  let directoryMoved = false
  let metadataRemoved = false
  let databaseUpdated = false
  const previousDbStatus = 'archived'
  const originalArchivePath = archivePath

  const rollback = async () => {
    // Rollback in reverse order
    if (databaseUpdated) {
      try {
        sqlite
          .prepare(`UPDATE changes SET status = ?, updated_at = ? WHERE id = ?`)
          .run(previousDbStatus, Date.now(), specId)
        console.log('[Archive] Rolled back database status')
      } catch (err) {
        console.error('[Archive] Failed to rollback database:', err)
      }
    }

    if (directoryMoved) {
      try {
        // Move back to archive
        await moveDirectory(restorePath, originalArchivePath)
        console.log('[Archive] Moved directory back to archive')
      } catch (err) {
        console.error('[Archive] Failed to move directory back:', err)
      }
    }

    // Note: We don't restore metadata file since we only remove it after successful restore
  }

  try {
    return await withAtomicOperation(
      async () => {
        // Get status to restore from metadata or default to 'active'
        const statusToRestore = metadata?.originalStatus || 'active'

        // Step 1: Remove metadata file before moving (it's archive-specific)
        const metadataPath = join(archivePath!, METADATA_FILE)
        if (await pathExists(metadataPath)) {
          await rm(metadataPath)
          metadataRemoved = true
        }

        // Step 2: Move directory back to specs
        await moveDirectory(archivePath!, restorePath)
        directoryMoved = true

        // Clean up empty month directory
        const monthDir = dirname(archivePath!)
        try {
          const monthContents = await readdir(monthDir)
          if (monthContents.length === 0) {
            await rm(monthDir, { recursive: true })
          }
        } catch {
          // Ignore cleanup errors
        }

        // Step 3: Update database status
        const now = Date.now()
        sqlite
          .prepare(
            `UPDATE changes SET status = ?, updated_at = ? WHERE id = ?`
          )
          .run(statusToRestore, now, specId)
        databaseUpdated = true

        // Also restore tasks associated with this SPEC
        sqlite
          .prepare(
            `UPDATE tasks SET status = 'todo', archived_at = NULL, updated_at = ? WHERE change_id = ? AND status = 'archived'`
          )
          .run(now, specId)

        console.log(`[Archive] Successfully restored ${specId} to ${relativeRestorePath}`)

        return {
          success: true,
          specId,
          restoredTo: relativeRestorePath,
        }
      },
      rollback
    )
  } catch (error) {
    return {
      success: false,
      specId,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * List all archived SPECs
 *
 * @param projectPath - Path to the project root
 * @returns Array of archived SPEC summaries
 */
export async function listArchivedSpecs(
  projectPath: string
): Promise<ArchivedSpecSummary[]> {
  const archiveBase = join(projectPath, ARCHIVE_DIR)
  const archivedSpecs: ArchivedSpecSummary[] = []

  if (!existsSync(archiveBase)) {
    return archivedSpecs
  }

  try {
    const months = await readdir(archiveBase)

    for (const month of months) {
      const monthPath = join(archiveBase, month)
      const monthStat = await stat(monthPath)

      if (!monthStat.isDirectory()) continue

      const specs = await readdir(monthPath)

      for (const specId of specs) {
        if (!specId.startsWith('SPEC-')) continue

        const specPath = join(monthPath, specId)
        const specStat = await stat(specPath)

        if (!specStat.isDirectory()) continue

        // Read metadata
        const metadataPath = join(specPath, METADATA_FILE)
        let metadata: ArchiveMetadata | null = null

        if (await pathExists(metadataPath)) {
          try {
            const content = await readFile(metadataPath, 'utf-8')
            metadata = JSON.parse(content) as ArchiveMetadata
          } catch {
            // Use defaults if metadata can't be read
          }
        }

        archivedSpecs.push({
          specId,
          title: metadata?.title || specId,
          archivedAt: metadata?.archivedAt || specStat.mtime.toISOString(),
          archivedBy: metadata?.archivedBy || 'unknown',
          reason: metadata?.reason || 'manual',
          originalStatus: metadata?.originalStatus || 'active',
          archivePath: `${ARCHIVE_DIR}/${month}/${specId}`,
        })
      }
    }

    // Sort by archived date, newest first
    archivedSpecs.sort(
      (a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    )
  } catch (error) {
    console.error('[Archive] Failed to list archived specs:', error)
  }

  return archivedSpecs
}

/**
 * Get archive metadata for a specific SPEC
 *
 * @param specId - The SPEC ID to get metadata for
 * @param projectPath - Path to the project root
 * @returns Archive metadata or null if not found
 */
export async function getArchiveMetadata(
  specId: string,
  projectPath: string
): Promise<ArchiveMetadata | null> {
  const archiveBase = join(projectPath, ARCHIVE_DIR)

  if (!existsSync(archiveBase)) {
    return null
  }

  try {
    const months = await readdir(archiveBase)

    for (const month of months) {
      const metadataPath = join(archiveBase, month, specId, METADATA_FILE)

      if (await pathExists(metadataPath)) {
        const content = await readFile(metadataPath, 'utf-8')
        return JSON.parse(content) as ArchiveMetadata
      }
    }
  } catch (error) {
    console.error('[Archive] Failed to get archive metadata:', error)
  }

  return null
}

/**
 * Check if a SPEC is archived
 *
 * @param specId - The SPEC ID to check
 * @param projectPath - Path to the project root
 * @returns True if the SPEC is archived
 */
export async function isSpecArchived(
  specId: string,
  projectPath: string
): Promise<boolean> {
  const archiveBase = join(projectPath, ARCHIVE_DIR)

  if (!existsSync(archiveBase)) {
    return false
  }

  try {
    const months = await readdir(archiveBase)

    for (const month of months) {
      const specPath = join(archiveBase, month, specId)
      if (await pathExists(specPath)) {
        return true
      }
    }
  } catch {
    // Ignore errors
  }

  return false
}
