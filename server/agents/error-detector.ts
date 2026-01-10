/**
 * Error Detection Integration
 *
 * Webhook 알림과 에러 분석기 연결
 * - 알림에서 자동 수정 트리거
 * - 알림 상태 업데이트
 * - 완료 시 알림 처리
 */

import {
  parseGitHubActionsLog,
  parseVercelBuildLog,
  parseSentryIssue,
  parseSupabaseAlert,
  isAutoFixable,
  calculatePriority,
  type AnalysisResult,
  type ParsedError,
} from './error-analyzer'
import { generateBatchFix, applyChanges, type FixResult } from './fix-generator'
import { fullValidate, summarizeValidation, type ValidationResult } from './fix-validator'
import { decideMerge, waitForCI, autoMerge, summarizeMergeDecision, type AlertSource, type MergeDecision } from './merge-policy'
import { executeWorkflow, summarizeWorkflow, type PRConfig, type WorkflowResult } from './pr-workflow'
import { getGeminiClient } from '../ai/gemini-client'

export interface AlertData {
  id: string
  source: AlertSource
  subtype?: string
  title: string
  rawPayload: unknown
  projectPath: string
  projectId: string
  repository?: {
    owner: string
    repo: string
    branch: string
  }
}

export interface AutoFixResult {
  success: boolean
  alertId: string
  analysis: AnalysisResult | null
  fixResult: FixResult | null
  validation: ValidationResult | null
  mergeDecision: MergeDecision | null
  workflowResult: WorkflowResult | null
  error?: string
  duration: number
}

export interface AutoFixOptions {
  dryRun?: boolean // 실제 PR 생성 안 함
  skipValidation?: boolean // 검증 건너뛰기
  forceManual?: boolean // 강제 수동 리뷰
  maxErrors?: number // 최대 처리 에러 수
}

/**
 * 알림에서 자동 수정 트리거
 */
export async function triggerAutoFix(
  alert: AlertData,
  githubToken: string,
  options: AutoFixOptions = {}
): Promise<AutoFixResult> {
  const startTime = Date.now()
  const result: AutoFixResult = {
    success: false,
    alertId: alert.id,
    analysis: null,
    fixResult: null,
    validation: null,
    mergeDecision: null,
    workflowResult: null,
    duration: 0,
  }

  try {
    // 1. 알림 데이터 파싱
    console.log(`[AutoFix] Starting for alert ${alert.id}`)
    const analysis = await parseAlertData(alert)
    result.analysis = analysis

    if (analysis.errors.length === 0) {
      result.error = 'No errors found in alert'
      return finishResult(result, startTime)
    }

    // 자동 수정 가능한 에러 필터링
    const fixableErrors = analysis.errors
      .filter(isAutoFixable)
      .sort((a, b) => calculatePriority(b) - calculatePriority(a))
      .slice(0, options.maxErrors || 10)

    if (fixableErrors.length === 0) {
      result.error = 'No auto-fixable errors found'
      return finishResult(result, startTime)
    }

    console.log(`[AutoFix] Found ${fixableErrors.length} fixable errors`)

    // 2. 수정 생성
    const fixResult = await generateBatchFix(
      { ...analysis, errors: fixableErrors },
      alert.projectPath,
      getGeminiClient()
    )
    result.fixResult = fixResult

    if (!fixResult.success) {
      result.error = `Fix generation failed: ${fixResult.errors.join(', ')}`
      return finishResult(result, startTime)
    }

    console.log(`[AutoFix] Generated ${fixResult.changes.length} file changes`)

    // 3. 검증
    if (!options.skipValidation) {
      const validation = await fullValidate(fixResult.changes, alert.projectPath)
      result.validation = validation

      console.log(`[AutoFix] Validation: ${summarizeValidation(validation)}`)

      if (!validation.passed) {
        result.error = `Validation failed: ${validation.errors.join(', ')}`
        return finishResult(result, startTime)
      }
    } else {
      // 검증 건너뛰기 시 기본 통과
      result.validation = {
        passed: true,
        level: 'syntax',
        checks: {
          syntax: { passed: true, skipped: true, errors: [], warnings: [], duration: 0 },
          typecheck: { passed: true, skipped: true, errors: [], warnings: [], duration: 0 },
          lint: { passed: true, skipped: true, errors: [], warnings: [], duration: 0 },
          test: { passed: true, skipped: true, errors: [], warnings: [], duration: 0 },
        },
        overallScore: 1,
        errors: [],
        warnings: [],
      }
    }

    // 4. 머지 결정
    const mergeDecision = decideMerge(
      alert.source,
      alert.subtype,
      true, // CI는 PR 생성 후 확인
      result.validation,
      fixResult.metadata.confidence
    )
    result.mergeDecision = mergeDecision

    if (options.forceManual) {
      mergeDecision.shouldMerge = false
      mergeDecision.reason = 'Forced manual review by options'
    }

    console.log(`[AutoFix] Merge decision: ${summarizeMergeDecision(mergeDecision)}`)

    // 5. Dry run이면 여기서 종료
    if (options.dryRun) {
      result.success = true
      result.error = 'Dry run - PR not created'
      return finishResult(result, startTime)
    }

    // 6. 리포지토리 정보 확인
    if (!alert.repository) {
      result.error = 'Repository information not available'
      return finishResult(result, startTime)
    }

    // 7. PR 워크플로우 실행
    const prConfig: PRConfig = {
      owner: alert.repository.owner,
      repo: alert.repository.repo,
      baseBranch: alert.repository.branch,
      githubToken,
    }

    // 변경사항 적용
    await applyChanges(fixResult.changes, alert.projectPath)

    const workflowResult = await executeWorkflow(
      alert.id,
      fixResult,
      result.validation,
      mergeDecision,
      fixableErrors,
      prConfig,
      alert.projectPath
    )
    result.workflowResult = workflowResult

    console.log(`[AutoFix] Workflow: ${summarizeWorkflow(workflowResult)}`)

    if (!workflowResult.success) {
      result.error = 'PR workflow failed'
      return finishResult(result, startTime)
    }

    // 8. 자동 머지가 활성화되어 있으면 CI 대기 후 머지
    if (mergeDecision.shouldMerge && workflowResult.finalPR) {
      console.log('[AutoFix] Waiting for CI...')

      const ciResult = await waitForCI(
        prConfig.owner,
        prConfig.repo,
        `refs/pull/${workflowResult.finalPR.number}/head`,
        githubToken,
        300000 // 5분
      )

      if (ciResult.passed) {
        console.log('[AutoFix] CI passed, auto-merging...')
        const mergeResult = await autoMerge(
          prConfig.owner,
          prConfig.repo,
          workflowResult.finalPR.number,
          githubToken
        )

        if (!mergeResult.success) {
          console.log(`[AutoFix] Auto-merge failed: ${mergeResult.message}`)
        }
      } else if (ciResult.timedOut) {
        console.log('[AutoFix] CI timed out, skipping auto-merge')
      } else {
        console.log('[AutoFix] CI failed, skipping auto-merge')
      }
    }

    result.success = true
    return finishResult(result, startTime)
  } catch (err) {
    result.error = `Unexpected error: ${err}`
    return finishResult(result, startTime)
  }
}

/**
 * 알림 데이터 파싱
 */
async function parseAlertData(alert: AlertData): Promise<AnalysisResult> {
  const payload = alert.rawPayload as Record<string, unknown>

  switch (alert.source) {
    case 'github': {
      // GitHub Actions 로그 가져오기
      const log = extractGitHubLog(payload)
      return parseGitHubActionsLog(log)
    }

    case 'vercel': {
      // Vercel 빌드 로그
      const log = extractVercelLog(payload)
      return parseVercelBuildLog(log)
    }

    case 'sentry': {
      // Sentry 이슈 데이터
      const issueData = payload as {
        title: string
        culprit?: string
        metadata?: { filename?: string; function?: string }
        exception?: { values?: Array<{ type: string; value: string; stacktrace?: unknown }> }
      }
      return parseSentryIssue(issueData)
    }

    case 'supabase': {
      // Supabase 알림
      const alertData = payload as {
        type: string
        message: string
        details?: Record<string, unknown>
      }
      return parseSupabaseAlert(alertData)
    }

    default:
      return {
        errors: [],
        summary: {
          total: 0,
          byType: { syntax: 0, type: 0, logic: 0, runtime: 0, lint: 0, test: 0, build: 0, unknown: 0 },
          bySeverity: { critical: 0, error: 0, warning: 0, info: 0 },
        },
        source: 'custom',
      }
  }
}

/**
 * GitHub Actions 로그 추출
 */
function extractGitHubLog(payload: Record<string, unknown>): string {
  // workflow_run 이벤트
  if (payload.workflow_run) {
    const workflowRun = payload.workflow_run as Record<string, unknown>
    // 실제로는 logs_url을 통해 로그를 가져와야 함
    return String(workflowRun.conclusion || '') + '\n' + JSON.stringify(workflowRun, null, 2)
  }

  // check_run 이벤트
  if (payload.check_run) {
    const checkRun = payload.check_run as Record<string, unknown>
    return String(checkRun.output || '') + '\n' + JSON.stringify(checkRun, null, 2)
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Vercel 빌드 로그 추출
 */
function extractVercelLog(payload: Record<string, unknown>): string {
  // deployment 이벤트
  if (payload.deployment) {
    const deployment = payload.deployment as Record<string, unknown>
    return JSON.stringify(deployment, null, 2)
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * 결과 마무리
 */
function finishResult(result: AutoFixResult, startTime: number): AutoFixResult {
  result.duration = Date.now() - startTime
  console.log(`[AutoFix] Completed in ${result.duration}ms - ${result.success ? 'SUCCESS' : 'FAILED'}: ${result.error || 'OK'}`)
  return result
}

/**
 * 알림 상태 업데이트 (DB 연동)
 */
export async function updateAlertStatus(
  alertId: string,
  status: 'pending' | 'in_progress' | 'fixed' | 'failed',
  details?: string
): Promise<void> {
  // TODO: 실제 DB 업데이트 구현
  console.log(`[Alert ${alertId}] Status: ${status} - ${details || ''}`)
}

/**
 * 자동 수정 결과 요약
 */
export function summarizeAutoFix(result: AutoFixResult): string {
  const lines = [
    `Alert: ${result.alertId}`,
    `Success: ${result.success}`,
    `Duration: ${result.duration}ms`,
  ]

  if (result.analysis) {
    lines.push(`Errors Found: ${result.analysis.summary.total}`)
  }

  if (result.fixResult) {
    lines.push(`Files Changed: ${result.fixResult.changes.length}`)
    lines.push(`Confidence: ${(result.fixResult.metadata.confidence * 100).toFixed(0)}%`)
  }

  if (result.validation) {
    lines.push(`Validation: ${result.validation.passed ? 'PASSED' : 'FAILED'}`)
  }

  if (result.mergeDecision) {
    lines.push(`Auto-Merge: ${result.mergeDecision.shouldMerge ? 'YES' : 'NO'}`)
  }

  if (result.workflowResult?.finalPR) {
    lines.push(`PR: ${result.workflowResult.finalPR.url}`)
  }

  if (result.error) {
    lines.push(`Error: ${result.error}`)
  }

  return lines.join('\n')
}
