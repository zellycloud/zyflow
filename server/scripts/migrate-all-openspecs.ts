#!/usr/bin/env npx tsx
/**
 * Batch Migration Script (TAG-017)
 *
 * Scans all OpenSpec files in a project and migrates them to MoAI format.
 * Supports dry-run mode, progress tracking, and user confirmation.
 *
 * Usage:
 *   npx tsx server/scripts/migrate-all-openspecs.ts [options]
 *
 * Options:
 *   --dry-run       Preview migration without writing files
 *   --project-path  Path to project root (default: current directory)
 *   --output-dir    Output directory for migrated specs (default: .moai/specs)
 *   --verbose       Enable verbose logging
 *   --yes           Skip confirmation prompt
 *   --help          Show help
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import * as readline from 'readline'

import {
  migrateOpenSpecToMoai,
  formatMigrationResult,
  formatBatchResult,
  type MigrationResult,
  type BatchMigrationResult,
  type MigrationOptions,
} from '../migrations/migrate-spec-format.js'

// =============================================
// CLI Argument Parsing
// =============================================

interface CliArgs {
  dryRun: boolean
  projectPath: string
  outputDir: string
  verbose: boolean
  skipConfirmation: boolean
  showHelp: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)

  const cliArgs: CliArgs = {
    dryRun: false,
    projectPath: process.cwd(),
    outputDir: '.moai/specs',
    verbose: false,
    skipConfirmation: false,
    showHelp: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '--dry-run':
      case '-n':
        cliArgs.dryRun = true
        break

      case '--project-path':
      case '-p':
        if (args[i + 1]) {
          cliArgs.projectPath = resolve(args[++i])
        }
        break

      case '--output-dir':
      case '-o':
        if (args[i + 1]) {
          cliArgs.outputDir = args[++i]
        }
        break

      case '--verbose':
      case '-v':
        cliArgs.verbose = true
        break

      case '--yes':
      case '-y':
        cliArgs.skipConfirmation = true
        break

      case '--help':
      case '-h':
        cliArgs.showHelp = true
        break
    }
  }

  return cliArgs
}

function showHelp(): void {
  console.log(`
OpenSpec to MoAI Migration Tool (SPEC-VISIBILITY-001)

Usage:
  npx tsx server/scripts/migrate-all-openspecs.ts [options]

Options:
  --dry-run, -n       Preview migration without writing files
  --project-path, -p  Path to project root (default: current directory)
  --output-dir, -o    Output directory for migrated specs (default: .moai/specs)
  --verbose, -v       Enable verbose logging
  --yes, -y           Skip confirmation prompt
  --help, -h          Show this help message

Examples:
  # Dry-run to preview migration
  npx tsx server/scripts/migrate-all-openspecs.ts --dry-run

  # Migrate all OpenSpecs in a specific project
  npx tsx server/scripts/migrate-all-openspecs.ts -p /path/to/project

  # Migrate with verbose output
  npx tsx server/scripts/migrate-all-openspecs.ts --verbose --yes

Output:
  Creates MoAI 3-file structure for each OpenSpec:
  - .moai/specs/SPEC-{ID}/spec.md       (EARS requirements)
  - .moai/specs/SPEC-{ID}/plan.md       (TAG chain)
  - .moai/specs/SPEC-{ID}/acceptance.md (Gherkin scenarios)
`)
}

// =============================================
// OpenSpec Discovery
// =============================================

interface DiscoveredOpenSpec {
  id: string
  path: string
  type: 'proposal' | 'spec'
  directory: string
}

/**
 * Scan project for OpenSpec files
 */
async function discoverOpenSpecs(projectPath: string): Promise<DiscoveredOpenSpec[]> {
  const discovered: DiscoveredOpenSpec[] = []

  // Scan openspec/specs directory
  const specsDir = join(projectPath, 'openspec', 'specs')
  if (existsSync(specsDir)) {
    const specs = await scanOpenSpecDirectory(specsDir, 'specs')
    discovered.push(...specs)
  }

  // Scan openspec/changes directory
  const changesDir = join(projectPath, 'openspec', 'changes')
  if (existsSync(changesDir)) {
    const changes = await scanOpenSpecDirectory(changesDir, 'changes')
    discovered.push(...changes)
  }

  return discovered
}

/**
 * Scan a specific OpenSpec directory
 */
async function scanOpenSpecDirectory(
  directory: string,
  _dirType: 'specs' | 'changes'
): Promise<DiscoveredOpenSpec[]> {
  const discovered: DiscoveredOpenSpec[] = []

  try {
    const entries = await readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue

      const changeDir = join(directory, entry.name)
      const proposalPath = join(changeDir, 'proposal.md')
      const specPath = join(changeDir, 'spec.md')

      if (existsSync(proposalPath)) {
        discovered.push({
          id: entry.name,
          path: proposalPath,
          type: 'proposal',
          directory: changeDir,
        })
      } else if (existsSync(specPath)) {
        discovered.push({
          id: entry.name,
          path: specPath,
          type: 'spec',
          directory: changeDir,
        })
      }
    }
  } catch (error) {
    console.error(`Error scanning ${directory}:`, error)
  }

  return discovered
}

// =============================================
// User Confirmation
// =============================================

async function confirmMigration(
  discovered: DiscoveredOpenSpec[],
  dryRun: boolean
): Promise<boolean> {
  console.log('\n' + '='.repeat(60))
  console.log('OpenSpec Discovery Report')
  console.log('='.repeat(60))
  console.log(`\nFound ${discovered.length} OpenSpec file(s) to migrate:\n`)

  for (const spec of discovered) {
    console.log(`  - ${spec.id} (${spec.type})`)
    console.log(`    Path: ${spec.path}`)
  }

  if (dryRun) {
    console.log('\n[DRY-RUN MODE] No files will be written.\n')
    return true
  }

  console.log('\n' + '-'.repeat(60))
  console.log('This will create MoAI 3-file structure for each OpenSpec.')
  console.log('Original files will be preserved.')
  console.log('-'.repeat(60))

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question('\nProceed with migration? (y/N): ', (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

// =============================================
// Progress Tracking
// =============================================

function showProgress(current: number, total: number, specId: string): void {
  const percent = Math.round((current / total) * 100)
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5))
  process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total}) - ${specId}`)
}

function clearProgress(): void {
  process.stdout.write('\r' + ' '.repeat(80) + '\r')
}

// =============================================
// Main Migration Logic
// =============================================

async function runBatchMigration(
  discovered: DiscoveredOpenSpec[],
  outputDir: string,
  options: MigrationOptions
): Promise<BatchMigrationResult> {
  const results: MigrationResult[] = []
  const allWarnings: string[] = []
  const allErrors: string[] = []

  let successCount = 0
  let failedCount = 0

  console.log('\nStarting migration...\n')

  for (let i = 0; i < discovered.length; i++) {
    const spec = discovered[i]

    if (!options.verbose) {
      showProgress(i + 1, discovered.length, spec.id)
    }

    try {
      const result = await migrateOpenSpecToMoai(
        spec.path,
        outputDir,
        {
          ...options,
          outputDir: undefined, // Let orchestrator determine output path
        }
      )

      results.push(result)

      if (result.success) {
        successCount++
      } else {
        failedCount++
        allErrors.push(`${spec.id}: ${result.errors.join(', ')}`)
      }

      allWarnings.push(...result.warnings.map(w => `${spec.id}: ${w}`))

      if (options.verbose) {
        console.log(formatMigrationResult(result))
      }
    } catch (error) {
      failedCount++
      const errorMessage = error instanceof Error ? error.message : String(error)
      allErrors.push(`${spec.id}: ${errorMessage}`)

      results.push({
        specId: spec.id,
        success: false,
        filesCreated: [],
        errors: [errorMessage],
        warnings: [],
        sourcePath: spec.path,
        outputDir,
      })
    }
  }

  if (!options.verbose) {
    clearProgress()
  }

  return {
    totalProcessed: discovered.length,
    successCount,
    failedCount,
    results,
    allWarnings,
    allErrors,
    timestamp: new Date().toISOString(),
  }
}

// =============================================
// Main Entry Point
// =============================================

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.showHelp) {
    showHelp()
    process.exit(0)
  }

  console.log('\n' + '='.repeat(60))
  console.log('OpenSpec to MoAI Migration Tool')
  console.log('SPEC-VISIBILITY-001 Phase 3')
  console.log('='.repeat(60))

  if (args.dryRun) {
    console.log('\n[DRY-RUN MODE] No files will be written.')
  }

  console.log(`\nProject Path: ${args.projectPath}`)
  console.log(`Output Dir: ${args.outputDir}`)
  console.log(`Verbose: ${args.verbose}`)

  // Verify project path exists
  if (!existsSync(args.projectPath)) {
    console.error(`\nError: Project path does not exist: ${args.projectPath}`)
    process.exit(1)
  }

  // Discover OpenSpec files
  console.log('\nScanning for OpenSpec files...')
  const discovered = await discoverOpenSpecs(args.projectPath)

  if (discovered.length === 0) {
    console.log('\nNo OpenSpec files found to migrate.')
    console.log('OpenSpec files should be located in:')
    console.log('  - openspec/specs/{change-id}/proposal.md')
    console.log('  - openspec/specs/{change-id}/spec.md')
    console.log('  - openspec/changes/{change-id}/proposal.md')
    process.exit(0)
  }

  // Confirm migration
  if (!args.skipConfirmation) {
    const confirmed = await confirmMigration(discovered, args.dryRun)
    if (!confirmed) {
      console.log('\nMigration cancelled.')
      process.exit(0)
    }
  } else {
    console.log(`\nFound ${discovered.length} OpenSpec file(s) to migrate.`)
  }

  // Run migration
  const outputDir = join(args.projectPath, args.outputDir)
  const result = await runBatchMigration(discovered, outputDir, {
    dryRun: args.dryRun,
    verbose: args.verbose,
  })

  // Show results
  console.log(formatBatchResult(result))

  // Exit with appropriate code
  if (result.failedCount > 0) {
    process.exit(1)
  }

  process.exit(0)
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
