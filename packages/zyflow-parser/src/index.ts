/**
 * ZyFlow Parser
 * MoAI SPEC parser for plan.md, acceptance.md, spec.md
 *
 * @packageDocumentation
 */

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
