/**
 * OpenSpec to MoAI Migration Module (SPEC-VISIBILITY-001 Phase 3)
 *
 * Provides tools for migrating OpenSpec format documents to MoAI 3-file structure:
 * - spec.md (EARS requirements)
 * - plan.md (TAG chain)
 * - acceptance.md (Gherkin scenarios)
 *
 * @example
 * ```typescript
 * import { migrateOpenSpecToMoai, previewMigration } from './migrations'
 *
 * // Preview migration without writing files
 * const preview = await previewMigration('/path/to/proposal.md')
 * console.log(preview.generated?.spec.content)
 *
 * // Execute migration
 * const result = await migrateOpenSpecToMoai(
 *   '/path/to/proposal.md',
 *   '.moai/specs'
 * )
 * ```
 */

// OpenSpec Parser (TAG-012)
export {
  parseOpenSpec,
  validateParsedOpenSpec,
  type ParsedOpenSpec,
  type OpenSpecTask,
  type OpenSpecRequirement,
  type OpenSpecCriterion,
} from './openspec-parser.js'

// EARS Generator (TAG-013)
export {
  generateEarsSpec,
  type EarsPattern,
  type EarsRequirement,
  type GeneratedEarsSpec,
} from './ears-generator.js'

// TAG Chain Generator (TAG-014)
export {
  generateTagChain,
  formatTagList,
  type GeneratedTag,
  type GeneratedPlan,
} from './tag-generator.js'

// Gherkin Generator (TAG-015)
export {
  generateGherkinCriteria,
  type GherkinStepType,
  type GherkinStep,
  type GherkinScenario,
  type GherkinFeature,
  type GeneratedAcceptance,
} from './gherkin-generator.js'

// Migration Orchestrator (TAG-016)
export {
  migrateOpenSpecToMoai,
  previewMigration,
  formatMigrationResult,
  formatBatchResult,
  getSpecPreview,
  getPlanPreview,
  getAcceptancePreview,
  type MigrationOptions,
  type MigrationResult,
  type BatchMigrationResult,
} from './migrate-spec-format.js'
