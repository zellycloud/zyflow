/**
 * ADK Orchestrator
 *
 * 멀티 에이전트 워크플로우를 조율하는 오케스트레이터
 */

import { analyzeError, extractErrorsFromCILog, type ErrorAnalysisResult } from './agents/error-analyzer'
import { generateFix, applyFixes, type CodeFix, type FixGenerationResult } from './agents/fix-generator'
import { validateFixes, analyzeValidationFailure, shouldRetry, type ValidationResult } from './agents/validator'
import { createAutoFixPR, waitForCIAndMerge, type PRCreationResult } from './agents/pr-agent'
import { loadConfig, validateConfig } from './config'

export interface AutoFixOptions {
  repository?: string
  baseBranch?: string
  alertId?: string
  dryRun?: boolean
  skipTests?: boolean
  maxRetries?: number
  autoMerge?: boolean
  onProgress?: (step: AutoFixStep) => void
}

export interface AutoFixStep {
  step: 'analyze' | 'generate' | 'validate' | 'retry' | 'pr' | 'merge' | 'complete' | 'failed'
  status: 'running' | 'success' | 'failed'
  message: string
  data?: unknown
}

export interface AutoFixResult {
  success: boolean
  steps: AutoFixStep[]
  analysis?: ErrorAnalysisResult
  fixes?: CodeFix[]
  validation?: ValidationResult
  pr?: PRCreationResult
  merged?: boolean
  error?: string
  duration: number
}

/**
 * 자동 수정 워크플로우 실행
 */
export async function runAutoFix(
  errorLog: string,
  options: AutoFixOptions = {}
): Promise<AutoFixResult> {
  const startTime = Date.now()
  const steps: AutoFixStep[] = []
  const maxRetries = options.maxRetries ?? 3

  const config = loadConfig()

  try {
    validateConfig(config)
  } catch (err) {
    return {
      success: false,
      steps: [],
      error: String(err),
      duration: Date.now() - startTime,
    }
  }

  const reportProgress = (step: AutoFixStep) => {
    steps.push(step)
    options.onProgress?.(step)
  }

  try {
    // Step 1: 에러 분석
    reportProgress({
      step: 'analyze',
      status: 'running',
      message: 'Analyzing error log...',
    })

    const errors = extractErrorsFromCILog(errorLog)
    const mainError = errors[0] || errorLog

    const analysis = await analyzeError(mainError)

    reportProgress({
      step: 'analyze',
      status: 'success',
      message: 'Analysis complete: ' + analysis.errorType + ' - ' + analysis.summary,
      data: analysis,
    })

    // Step 2: 수정 생성
    reportProgress({
      step: 'generate',
      status: 'running',
      message: 'Generating fix...',
    })

    let fixResult = await generateFix(analysis)
    let attemptCount = 0

    if (!fixResult.success || fixResult.fixes.length === 0) {
      reportProgress({
        step: 'generate',
        status: 'failed',
        message: 'Failed to generate fix',
        data: fixResult,
      })

      return {
        success: false,
        steps,
        analysis,
        error: 'Fix generation failed',
        duration: Date.now() - startTime,
      }
    }

    reportProgress({
      step: 'generate',
      status: 'success',
      message: 'Generated ' + fixResult.fixes.length + ' fix(es)',
      data: fixResult,
    })

    // Step 3: 수정 적용
    const { applied, failed } = await applyFixes(fixResult.fixes)

    if (failed.length > 0) {
      reportProgress({
        step: 'generate',
        status: 'failed',
        message: 'Failed to apply fixes: ' + failed.map(f => f.file).join(', '),
      })

      return {
        success: false,
        steps,
        analysis,
        fixes: fixResult.fixes,
        error: 'Fix application failed',
        duration: Date.now() - startTime,
      }
    }

    // Step 4: 검증 루프
    let validation: ValidationResult | null = null

    while (attemptCount < maxRetries) {
      attemptCount++

      reportProgress({
        step: attemptCount === 1 ? 'validate' : 'retry',
        status: 'running',
        message: 'Validating fix (attempt ' + attemptCount + '/' + maxRetries + ')...',
      })

      validation = await validateFixes(fixResult.fixes, {
        skipTests: options.skipTests,
      })

      if (validation.passed) {
        reportProgress({
          step: 'validate',
          status: 'success',
          message: 'Validation passed with score ' + validation.score + '/100',
          data: validation,
        })
        break
      }

      reportProgress({
        step: 'validate',
        status: 'failed',
        message: 'Validation failed: ' + validation.feedback,
        data: validation,
      })

      // 재시도 여부 결정
      if (!shouldRetry(validation, attemptCount)) {
        break
      }

      // 실패 분석 및 재생성
      reportProgress({
        step: 'retry',
        status: 'running',
        message: 'Analyzing failure and regenerating fix...',
      })

      const failureAnalysis = await analyzeValidationFailure(validation)

      // 분석 결과를 바탕으로 재수정
      const enhancedAnalysis: ErrorAnalysisResult = {
        ...analysis,
        suggestedFix: analysis.suggestedFix + '\n\nPrevious attempt failed: ' + failureAnalysis,
      }

      fixResult = await generateFix(enhancedAnalysis)

      if (fixResult.success && fixResult.fixes.length > 0) {
        await applyFixes(fixResult.fixes)
      }
    }

    if (!validation?.passed) {
      reportProgress({
        step: 'failed',
        status: 'failed',
        message: 'Max retries exceeded',
      })

      // 실패해도 PR은 생성 (수동 검토용)
      if (!options.dryRun && options.repository) {
        const pr = await createAutoFixPR(analysis, fixResult.fixes, {
          ...options,
          // 드래프트로 생성
        })

        if (pr.success) {
          reportProgress({
            step: 'pr',
            status: 'success',
            message: 'Created draft PR for manual review: ' + pr.prUrl,
            data: pr,
          })
        }
      }

      return {
        success: false,
        steps,
        analysis,
        fixes: fixResult.fixes,
        validation,
        error: 'Validation failed after ' + attemptCount + ' attempts',
        duration: Date.now() - startTime,
      }
    }

    // Step 5: PR 생성
    if (options.dryRun) {
      reportProgress({
        step: 'complete',
        status: 'success',
        message: 'Dry run complete - no PR created',
      })

      return {
        success: true,
        steps,
        analysis,
        fixes: fixResult.fixes,
        validation,
        duration: Date.now() - startTime,
      }
    }

    reportProgress({
      step: 'pr',
      status: 'running',
      message: 'Creating pull request...',
    })

    const pr = await createAutoFixPR(analysis, fixResult.fixes, options)

    if (!pr.success) {
      reportProgress({
        step: 'pr',
        status: 'failed',
        message: 'PR creation failed: ' + pr.error,
      })

      return {
        success: false,
        steps,
        analysis,
        fixes: fixResult.fixes,
        validation,
        error: pr.error,
        duration: Date.now() - startTime,
      }
    }

    reportProgress({
      step: 'pr',
      status: 'success',
      message: 'Created PR: ' + pr.prUrl,
      data: pr,
    })

    // Step 6: CI 대기 및 머지
    if (options.autoMerge && options.repository && pr.prNumber) {
      reportProgress({
        step: 'merge',
        status: 'running',
        message: 'Waiting for CI and merging...',
      })

      const mergeResult = await waitForCIAndMerge(options.repository, pr.prNumber, {
        autoMerge: true,
      })

      if (mergeResult.merged) {
        reportProgress({
          step: 'merge',
          status: 'success',
          message: 'PR merged successfully',
        })
      } else if (mergeResult.ciPassed) {
        reportProgress({
          step: 'merge',
          status: 'failed',
          message: 'CI passed but merge failed: ' + mergeResult.error,
        })
      } else {
        reportProgress({
          step: 'merge',
          status: 'failed',
          message: 'CI failed: ' + mergeResult.error,
        })
      }

      return {
        success: mergeResult.merged,
        steps,
        analysis,
        fixes: fixResult.fixes,
        validation,
        pr,
        merged: mergeResult.merged,
        duration: Date.now() - startTime,
      }
    }

    reportProgress({
      step: 'complete',
      status: 'success',
      message: 'Auto-fix complete',
    })

    return {
      success: true,
      steps,
      analysis,
      fixes: fixResult.fixes,
      validation,
      pr,
      duration: Date.now() - startTime,
    }
  } catch (err) {
    reportProgress({
      step: 'failed',
      status: 'failed',
      message: 'Unexpected error: ' + String(err),
    })

    return {
      success: false,
      steps,
      error: String(err),
      duration: Date.now() - startTime,
    }
  }
}

/**
 * 간단한 에러 분석만 실행
 */
export async function analyzeOnly(errorLog: string): Promise<ErrorAnalysisResult> {
  const config = loadConfig()
  validateConfig(config)

  const errors = extractErrorsFromCILog(errorLog)
  return analyzeError(errors[0] || errorLog)
}

/**
 * 수정 생성만 실행 (적용하지 않음)
 */
export async function generateOnly(analysis: ErrorAnalysisResult): Promise<FixGenerationResult> {
  const config = loadConfig()
  validateConfig(config)

  return generateFix(analysis)
}

/**
 * 검증만 실행
 */
export async function validateOnly(
  fixes: CodeFix[],
  options?: { skipTests?: boolean }
): Promise<ValidationResult> {
  return validateFixes(fixes, options)
}

// Export types
export type {
  ErrorAnalysisResult,
  CodeFix,
  FixGenerationResult,
  ValidationResult,
  PRCreationResult,
}
