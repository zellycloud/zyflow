/**
 * Migration Orchestrator (TAG-016)
 *
 * Main migration logic that coordinates all generators to convert
 * OpenSpec format to MoAI 3-file structure (spec.md, plan.md, acceptance.md).
 *
 * Features:
 * - Dry-run mode for preview without filesystem writes
 * - Validation of generated content
 * - Comprehensive migration report
 * - Original file preservation
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import { readFile, mkdir, writeFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, basename } from 'path'

import { parseOpenSpec, validateParsedOpenSpec, type ParsedOpenSpec } from './openspec-parser.js'
import { generateEarsSpec, type GeneratedEarsSpec } from './ears-generator.js'
import { generateTagChain, type GeneratedPlan } from './tag-generator.js'
import { generateGherkinCriteria, type GeneratedAcceptance } from './gherkin-generator.js'

// =============================================
// Types
// =============================================

/**
 * Options for migration
 */
export interface MigrationOptions {
  /** If true, preview without writing files */
  dryRun?: boolean
  /** If true, delete original after successful migration */
  deleteOriginal?: boolean
  /** Custom output directory (default: .moai/specs/{SPEC-ID}/) */
  outputDir?: string
  /** Include verbose logging */
  verbose?: boolean
}

/**
 * Result of a single file migration
 */
export interface MigrationResult {
  /** Original SPEC/Change ID */
  specId: string
  /** Whether migration was successful */
  success: boolean
  /** Files created (or would be created in dry-run) */
  filesCreated: string[]
  /** Errors encountered */
  errors: string[]
  /** Warnings (non-fatal issues) */
  warnings: string[]
  /** Original file path */
  sourcePath: string
  /** Output directory */
  outputDir: string
  /** Parsed content for preview */
  parsed?: ParsedOpenSpec
  /** Generated content for preview */
  generated?: {
    spec: GeneratedEarsSpec
    plan: GeneratedPlan
    acceptance: GeneratedAcceptance
  }
}

/**
 * Batch migration result
 */
export interface BatchMigrationResult {
  /** Total files processed */
  totalProcessed: number
  /** Successfully migrated count */
  successCount: number
  /** Failed migration count */
  failedCount: number
  /** Individual results */
  results: MigrationResult[]
  /** Aggregate warnings */
  allWarnings: string[]
  /** Aggregate errors */
  allErrors: string[]
  /** Migration timestamp */
  timestamp: string
}

// =============================================
// Validation
// =============================================

/**
 * Validate generated spec content
 */
function validateGeneratedSpec(spec: GeneratedEarsSpec): string[] {
  const errors: string[] = []

  if (!spec.content || spec.content.length < 100) {
    errors.push('Generated spec.md content is too short')
  }

  if (!spec.content.includes('---')) {
    errors.push('Generated spec.md missing YAML frontmatter')
  }

  if (!spec.content.includes('## Functional Requirements')) {
    errors.push('Generated spec.md missing Functional Requirements section')
  }

  return errors
}

/**
 * Validate generated plan content
 */
function validateGeneratedPlan(plan: GeneratedPlan): string[] {
  const errors: string[] = []

  if (!plan.content || plan.content.length < 100) {
    errors.push('Generated plan.md content is too short')
  }

  if (plan.tags.length === 0) {
    errors.push('Generated plan.md has no TAGs')
  }

  return errors
}

/**
 * Validate generated acceptance content
 */
function validateGeneratedAcceptance(acceptance: GeneratedAcceptance): string[] {
  const errors: string[] = []

  if (!acceptance.content || acceptance.content.length < 100) {
    errors.push('Generated acceptance.md content is too short')
  }

  if (!acceptance.content.includes('```gherkin')) {
    errors.push('Generated acceptance.md missing Gherkin code block')
  }

  if (acceptance.feature.scenarios.length === 0) {
    errors.push('Generated acceptance.md has no scenarios')
  }

  return errors
}

// =============================================
// File Operations
// =============================================

/**
 * Ensure output directory exists
 */
async function ensureOutputDir(outputDir: string): Promise<void> {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }
}

/**
 * Write file with backup if exists
 */
async function writeFileWithBackup(
  filePath: string,
  content: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) {
    return true // Simulate success in dry-run
  }

  // Check if file exists and create backup
  if (existsSync(filePath)) {
    const backupPath = `${filePath}.backup.${Date.now()}`
    const existingContent = await readFile(filePath, 'utf-8')
    await writeFile(backupPath, existingContent, 'utf-8')
  }

  await writeFile(filePath, content, 'utf-8')
  return true
}

// =============================================
// Main Migration Function
// =============================================

/**
 * Migrate a single OpenSpec file to MoAI 3-file format
 *
 * @param openspecPath - Path to the OpenSpec file (proposal.md or spec.md)
 * @param outputDir - Output directory for MoAI files
 * @param options - Migration options
 * @returns Migration result
 */
export async function migrateOpenSpecToMoai(
  openspecPath: string,
  outputDir: string,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const { dryRun = false, verbose = false } = options

  const result: MigrationResult = {
    specId: '',
    success: false,
    filesCreated: [],
    errors: [],
    warnings: [],
    sourcePath: openspecPath,
    outputDir,
  }

  try {
    // Step 1: Read source file
    if (verbose) console.log(`[Migration] Reading ${openspecPath}...`)

    if (!existsSync(openspecPath)) {
      result.errors.push(`Source file not found: ${openspecPath}`)
      return result
    }

    const content = await readFile(openspecPath, 'utf-8')

    // Step 2: Parse OpenSpec content
    if (verbose) console.log('[Migration] Parsing OpenSpec content...')

    const defaultId = basename(dirname(openspecPath))
    const parsed = parseOpenSpec(content, defaultId)
    result.parsed = parsed
    result.specId = parsed.id

    // Validate parsed content
    const parseValidation = validateParsedOpenSpec(parsed)
    if (!parseValidation.isValid) {
      result.errors.push(...parseValidation.errors)
      return result
    }
    result.warnings.push(...parseValidation.warnings)

    // Step 3: Generate EARS spec.md
    if (verbose) console.log('[Migration] Generating EARS spec.md...')

    const generatedSpec = generateEarsSpec(parsed)
    result.warnings.push(...generatedSpec.warnings)

    const specErrors = validateGeneratedSpec(generatedSpec)
    if (specErrors.length > 0) {
      result.errors.push(...specErrors)
      return result
    }

    // Step 4: Generate TAG chain plan.md
    if (verbose) console.log('[Migration] Generating TAG chain plan.md...')

    const generatedPlan = generateTagChain(parsed, generatedSpec.requirements)
    result.warnings.push(...generatedPlan.warnings)

    const planErrors = validateGeneratedPlan(generatedPlan)
    if (planErrors.length > 0) {
      result.errors.push(...planErrors)
      return result
    }

    // Step 5: Generate Gherkin acceptance.md
    if (verbose) console.log('[Migration] Generating Gherkin acceptance.md...')

    const generatedAcceptance = generateGherkinCriteria(parsed, generatedSpec.requirements)
    result.warnings.push(...generatedAcceptance.warnings)

    const acceptanceErrors = validateGeneratedAcceptance(generatedAcceptance)
    if (acceptanceErrors.length > 0) {
      result.errors.push(...acceptanceErrors)
      return result
    }

    // Store generated content for preview
    result.generated = {
      spec: generatedSpec,
      plan: generatedPlan,
      acceptance: generatedAcceptance,
    }

    // Step 6: Determine output paths
    const specId = parsed.id.startsWith('SPEC-')
      ? parsed.id
      : `SPEC-${parsed.id.toUpperCase()}`

    const finalOutputDir = options.outputDir || join(outputDir, specId)
    result.outputDir = finalOutputDir

    const specPath = join(finalOutputDir, 'spec.md')
    const planPath = join(finalOutputDir, 'plan.md')
    const acceptancePath = join(finalOutputDir, 'acceptance.md')

    result.filesCreated = [specPath, planPath, acceptancePath]

    // Step 7: Write files (or skip in dry-run)
    if (!dryRun) {
      if (verbose) console.log(`[Migration] Writing files to ${finalOutputDir}...`)

      await ensureOutputDir(finalOutputDir)

      await writeFileWithBackup(specPath, generatedSpec.content, false)
      await writeFileWithBackup(planPath, generatedPlan.content, false)
      await writeFileWithBackup(acceptancePath, generatedAcceptance.content, false)

      if (verbose) console.log('[Migration] Files written successfully')
    } else {
      if (verbose) console.log('[Migration] Dry-run mode - no files written')
    }

    result.success = true
    return result

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    result.errors.push(`Migration failed: ${errorMessage}`)
    return result
  }
}

// =============================================
// Preview Functions
// =============================================

/**
 * Generate migration preview without writing files
 *
 * @param openspecPath - Path to the OpenSpec file
 * @returns Migration preview
 */
export async function previewMigration(
  openspecPath: string
): Promise<MigrationResult> {
  return migrateOpenSpecToMoai(
    openspecPath,
    '.moai/specs',
    { dryRun: true, verbose: false }
  )
}

/**
 * Format migration result for console output
 */
export function formatMigrationResult(result: MigrationResult): string {
  const lines: string[] = []

  lines.push(`\n${'='.repeat(60)}`)
  lines.push(`Migration Result: ${result.specId}`)
  lines.push(`${'='.repeat(60)}`)

  lines.push(`\nSource: ${result.sourcePath}`)
  lines.push(`Output: ${result.outputDir}`)
  lines.push(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`)

  if (result.filesCreated.length > 0) {
    lines.push(`\nFiles ${result.success ? 'Created' : 'Would Create'}:`)
    for (const file of result.filesCreated) {
      lines.push(`  - ${file}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`)
    for (const warning of result.warnings) {
      lines.push(`  ⚠ ${warning}`)
    }
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`)
    for (const error of result.errors) {
      lines.push(`  ✗ ${error}`)
    }
  }

  if (result.parsed) {
    lines.push(`\nParsed Content:`)
    lines.push(`  Requirements: ${result.parsed.requirements.length}`)
    lines.push(`  Tasks: ${result.parsed.tasks.length}`)
    lines.push(`  Acceptance Criteria: ${result.parsed.acceptanceCriteria.length}`)
    lines.push(`  Found Sections: ${result.parsed.foundSections.join(', ') || 'none'}`)
    lines.push(`  Missing Sections: ${result.parsed.missingSections.join(', ') || 'none'}`)
  }

  if (result.generated) {
    lines.push(`\nGenerated Content:`)
    lines.push(`  EARS Requirements: ${result.generated.spec.requirements.length}`)
    lines.push(`  TAGs: ${result.generated.plan.tags.length}`)
    lines.push(`  Gherkin Scenarios: ${result.generated.acceptance.feature.scenarios.length}`)
  }

  lines.push(`\n${'='.repeat(60)}\n`)

  return lines.join('\n')
}

/**
 * Format batch migration result for console output
 */
export function formatBatchResult(result: BatchMigrationResult): string {
  const lines: string[] = []

  lines.push(`\n${'='.repeat(60)}`)
  lines.push(`Batch Migration Report`)
  lines.push(`${'='.repeat(60)}`)
  lines.push(`Timestamp: ${result.timestamp}`)
  lines.push(`\nSummary:`)
  lines.push(`  Total Processed: ${result.totalProcessed}`)
  lines.push(`  Successful: ${result.successCount}`)
  lines.push(`  Failed: ${result.failedCount}`)
  lines.push(`  Success Rate: ${((result.successCount / result.totalProcessed) * 100).toFixed(1)}%`)

  if (result.allWarnings.length > 0) {
    lines.push(`\nAll Warnings (${result.allWarnings.length}):`)
    const uniqueWarnings = [...new Set(result.allWarnings)]
    for (const warning of uniqueWarnings.slice(0, 10)) {
      lines.push(`  ⚠ ${warning}`)
    }
    if (uniqueWarnings.length > 10) {
      lines.push(`  ... and ${uniqueWarnings.length - 10} more`)
    }
  }

  if (result.allErrors.length > 0) {
    lines.push(`\nAll Errors (${result.allErrors.length}):`)
    for (const error of result.allErrors) {
      lines.push(`  ✗ ${error}`)
    }
  }

  lines.push(`\nIndividual Results:`)
  for (const r of result.results) {
    const status = r.success ? '✓' : '✗'
    lines.push(`  ${status} ${r.specId}: ${r.success ? 'migrated' : r.errors[0] || 'failed'}`)
  }

  lines.push(`\n${'='.repeat(60)}\n`)

  return lines.join('\n')
}

// =============================================
// Content Preview
// =============================================

/**
 * Get preview of generated spec.md content
 */
export function getSpecPreview(result: MigrationResult): string {
  if (!result.generated?.spec) {
    return 'No spec content generated'
  }
  // Return first 100 lines
  return result.generated.spec.content
    .split('\n')
    .slice(0, 100)
    .join('\n')
}

/**
 * Get preview of generated plan.md content
 */
export function getPlanPreview(result: MigrationResult): string {
  if (!result.generated?.plan) {
    return 'No plan content generated'
  }
  // Return first 100 lines
  return result.generated.plan.content
    .split('\n')
    .slice(0, 100)
    .join('\n')
}

/**
 * Get preview of generated acceptance.md content
 */
export function getAcceptancePreview(result: MigrationResult): string {
  if (!result.generated?.acceptance) {
    return 'No acceptance content generated'
  }
  // Return first 100 lines
  return result.generated.acceptance.content
    .split('\n')
    .slice(0, 100)
    .join('\n')
}
