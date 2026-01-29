/**
 * ZyFlow Parser
 * OpenSpec 1.0 compliant tasks.md parser
 *
 * @packageDocumentation
 */

// Types
export type {
  // Core types
  TaskStatus,
  ParsedTask,
  ParsedGroup,
  ParsedPhase,
  ParseResult,
  ParseMetadata,
  ParseWarning,
  ResolvedTask,
  SyncTask,
  // Legacy types (backward compatibility)
  LegacyTask,
  LegacyTaskGroup,
  LegacyTasksFile,
  UpdateResult,
} from './types.js'

// Parser
export { TasksParser, parser, parseTasksFile } from './parser.js'

// ID Resolver
export { LegacyIdResolver, createResolver } from './id-resolver.js'

// Status updater
export {
  setTaskStatus,
  toggleTaskStatus,
  markTasksComplete,
  markTasksIncomplete,
} from './status.js'

// MoAI SPEC types
export type {
  SpecFrontmatter,
  ParsedTag,
  ParsedCondition,
  ParsedAcceptanceCriteria,
  ParsedRequirement,
  ParsedMoaiPlan,
  ParsedMoaiAcceptance,
  ParsedMoaiSpec,
} from './moai-types.js'

// MoAI SPEC parser
export {
  parseFrontmatter,
  parsePlanFile,
  parseAcceptanceFile,
  parseSpecFile,
} from './moai-parser.js'
