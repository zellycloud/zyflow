/**
 * ADK (Agent Development Kit) Module
 *
 * Gemini ADK 기반 멀티 에이전트 시스템
 *
 * 사용법:
 * ```typescript
 * import { runAutoFix, analyzeOnly } from './adk'
 *
 * // 전체 자동 수정 워크플로우
 * const result = await runAutoFix(errorLog, {
 *   repository: 'owner/repo',
 *   autoMerge: true,
 * })
 *
 * // 분석만
 * const analysis = await analyzeOnly(errorLog)
 * ```
 */

// Configuration
export { loadConfig, validateConfig, defaultConfig } from './config'
export type { ADKConfig } from './config'

// Orchestrator (main entry point)
export {
  runAutoFix,
  analyzeOnly,
  generateOnly,
  validateOnly,
} from './orchestrator'
export type {
  AutoFixOptions,
  AutoFixStep,
  AutoFixResult,
} from './orchestrator'

// Agents
export { errorAnalyzerAgent, analyzeError } from './agents/error-analyzer'
export type { ErrorAnalysisResult } from './agents/error-analyzer'

export { fixGeneratorAgent, generateFix, applyFixes } from './agents/fix-generator'
export type { CodeFix, FixGenerationResult } from './agents/fix-generator'

export { validatorAgent, validateFixes } from './agents/validator'
export type { ValidationResult } from './agents/validator'

export { prAgent, createAutoFixPR, waitForCIAndMerge } from './agents/pr-agent'
export type { PRCreationResult } from './agents/pr-agent'

// Tools
export { fileTools } from './tools/file-tools'
export { gitTools } from './tools/git-tools'
export { githubTools } from './tools/github-tools'
export { buildTools } from './tools/build-tools'

// Utilities
export {
  extractErrorsFromCILog,
  parseTypeScriptErrors,
  parseESLintErrors,
} from './agents/error-analyzer'

export { generateDiff } from './agents/fix-generator'

export {
  analyzeValidationFailure,
  shouldRetry,
} from './agents/validator'
