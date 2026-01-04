/**
 * claude-flow 타입 정의 (간소화)
 *
 * Phase 1 리팩토링으로 executor, consensus 관련 타입 제거
 * prompt-builder가 사용하는 타입만 유지
 *
 * @module server/claude-flow/types
 */

// =============================================
// 프롬프트 빌더 타입
// =============================================

/** 실행 모드 */
export type ExecutionMode = 'full' | 'single' | 'analysis'

/** 프롬프트 섹션 */
export interface PromptSection {
  title: string
  content: string
}

/** 프롬프트 빌드 옵션 */
export interface PromptBuildOptions {
  /** CLAUDE.md 전체 포함 여부 (기본: 요약만) */
  includeFullClaudeMd?: boolean
  /** design.md 포함 여부 */
  includeDesign?: boolean
  /** 관련 specs 포함 여부 */
  includeSpecs?: boolean
  /** 최대 토큰 수 제한 */
  maxTokens?: number
}
