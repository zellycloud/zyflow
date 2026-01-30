#!/usr/bin/env tsx
/**
 * SPEC Status Migration Script
 * SPEC-VISIBILITY-001 Phase 1: Status Synchronization Fix
 *
 * This script scans all SPEC frontmatter files and updates database records
 * with the correct status values from frontmatter.
 *
 * Usage:
 *   npx tsx server/scripts/migrate-spec-status.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be changed without making actual updates
 */

import { readdir, readFile, access } from 'fs/promises'
import { join } from 'path'
import { loadConfig } from '../config.js'
import { initDb } from '../tasks/index.js'
import { getSqlite } from '../tasks/db/client.js'
import { normalizeStatus } from '../flow-sync.js'
import { parseSpecFile } from '@zyflow/parser'

interface MigrationResult {
  projectId: string
  specId: string
  previousStatus: string
  newStatus: string
  updated: boolean
  error?: string
}

interface MigrationReport {
  totalSpecs: number
  updated: number
  skipped: number
  errors: number
  results: MigrationResult[]
}

/**
 * Parse frontmatter from spec.md content
 */
async function getSpecStatus(specPath: string): Promise<string | null> {
  try {
    const content = await readFile(specPath, 'utf-8')
    const parsed = parseSpecFile(content)
    return normalizeStatus(parsed.frontmatter.status)
  } catch {
    return null
  }
}

/**
 * Migrate SPEC statuses for a single project
 */
async function migrateProjectSpecs(
  projectPath: string,
  projectId: string,
  dryRun: boolean
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []
  const specsDir = join(projectPath, '.moai', 'specs')

  try {
    await access(specsDir)
  } catch {
    // No .moai/specs directory, skip this project
    return results
  }

  const entries = await readdir(specsDir, { withFileTypes: true })
  const specDirs = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith('SPEC-')
  )

  const sqlite = getSqlite()

  for (const dir of specDirs) {
    const specId = dir.name
    const specPath = join(specsDir, specId, 'spec.md')

    try {
      // Get current status from frontmatter
      const frontmatterStatus = await getSpecStatus(specPath)

      if (!frontmatterStatus) {
        results.push({
          projectId,
          specId,
          previousStatus: 'unknown',
          newStatus: 'planned',
          updated: false,
          error: 'Could not read spec.md frontmatter',
        })
        continue
      }

      // Get current status from database
      const dbRecord = sqlite
        .prepare(`SELECT status FROM changes WHERE id = ? AND project_id = ?`)
        .get(specId, projectId) as { status: string } | undefined

      if (!dbRecord) {
        results.push({
          projectId,
          specId,
          previousStatus: 'not_in_db',
          newStatus: frontmatterStatus,
          updated: false,
          error: 'SPEC not found in database - will be created on next sync',
        })
        continue
      }

      const previousStatus = dbRecord.status
      const newStatus = frontmatterStatus

      // Check if update is needed
      if (previousStatus === newStatus) {
        results.push({
          projectId,
          specId,
          previousStatus,
          newStatus,
          updated: false,
        })
        continue
      }

      // Perform update (unless dry run)
      if (!dryRun) {
        sqlite
          .prepare(
            `UPDATE changes SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?`
          )
          .run(newStatus, Date.now(), specId, projectId)
      }

      results.push({
        projectId,
        specId,
        previousStatus,
        newStatus,
        updated: !dryRun,
      })
    } catch (err) {
      results.push({
        projectId,
        specId,
        previousStatus: 'unknown',
        newStatus: 'unknown',
        updated: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

/**
 * Run the migration across all configured projects
 */
async function runMigration(dryRun: boolean): Promise<MigrationReport> {
  const report: MigrationReport = {
    totalSpecs: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    results: [],
  }

  // Initialize database
  initDb()

  const config = await loadConfig()

  if (!config.projects.length) {
    console.log('No projects configured.')
    return report
  }

  for (const project of config.projects) {
    console.log(`\nProcessing project: ${project.id} (${project.path})`)
    const results = await migrateProjectSpecs(project.path, project.id, dryRun)
    report.results.push(...results)
  }

  // Calculate summary
  for (const result of report.results) {
    report.totalSpecs++
    if (result.error) {
      report.errors++
    } else if (result.updated) {
      report.updated++
    } else if (result.previousStatus === result.newStatus) {
      report.skipped++
    }
  }

  return report
}

/**
 * Print migration report
 */
function printReport(report: MigrationReport, dryRun: boolean): void {
  console.log('\n' + '='.repeat(60))
  console.log(dryRun ? 'MIGRATION REPORT (DRY RUN)' : 'MIGRATION REPORT')
  console.log('='.repeat(60))

  console.log(`\nSummary:`)
  console.log(`  Total SPECs scanned: ${report.totalSpecs}`)
  console.log(`  Updated: ${report.updated}`)
  console.log(`  Skipped (already correct): ${report.skipped}`)
  console.log(`  Errors: ${report.errors}`)

  // Show changes
  const changes = report.results.filter(
    (r) => r.previousStatus !== r.newStatus && !r.error
  )
  if (changes.length > 0) {
    console.log(`\nChanges${dryRun ? ' (would be applied)' : ' applied'}:`)
    for (const change of changes) {
      console.log(
        `  [${change.projectId}] ${change.specId}: ${change.previousStatus} -> ${change.newStatus}`
      )
    }
  }

  // Show errors
  const errors = report.results.filter((r) => r.error)
  if (errors.length > 0) {
    console.log(`\nErrors:`)
    for (const error of errors) {
      console.log(`  [${error.projectId}] ${error.specId}: ${error.error}`)
    }
  }

  console.log('\n' + '='.repeat(60))
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('SPEC Status Migration Script')
  console.log('SPEC-VISIBILITY-001 Phase 1')
  console.log('')

  if (dryRun) {
    console.log('Running in DRY RUN mode - no changes will be made.')
  }

  try {
    const report = await runMigration(dryRun)
    printReport(report, dryRun)

    if (!dryRun && report.updated > 0) {
      console.log(
        `\nMigration complete. ${report.updated} SPEC(s) updated successfully.`
      )
    }
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

main()
