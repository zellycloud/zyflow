/**
 * claude-flow 모듈 (간소화)
 *
 * Phase 1 리팩토링으로 executor, consensus 제거됨
 * prompt-builder만 유지 (OpenSpec → 프롬프트 변환)
 *
 * @module server/claude-flow
 */

// 프롬프트 빌더만 export
export { OpenSpecPromptBuilder } from './prompt-builder.js'
export type { PromptSection, PromptBuildOptions, ExecutionMode } from './types.js'
