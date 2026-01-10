/**
 * Auto-Merge Policy
 *
 * CI 상태 확인 및 자동 머지 정책 관리
 * - GitHub CI 상태 체크
 * - 소스별 머지 정책
 * - Supabase Security/Performance 예외 처리
 * - 자동 머지 트리거
 */

import type { ValidationResult } from './fix-validator'

export type AlertSource = 'github' | 'vercel' | 'sentry' | 'supabase'
export type SupabaseAlertType = 'security' | 'performance' | 'edge_function' | 'database' | 'other'

export interface MergePolicy {
  source: AlertSource
  subtype?: string
  autoMerge: boolean
  requiresCIPass: boolean
  requiresManualApproval: boolean
  minimumConfidence: number
  description: string
}

export interface MergeDecision {
  shouldMerge: boolean
  reason: string
  policy: MergePolicy
  ciPassed: boolean
  validationPassed: boolean
  confidence: number
}

/**
 * 소스별 기본 머지 정책
 */
const DEFAULT_POLICIES: MergePolicy[] = [
  // GitHub Actions 실패
  {
    source: 'github',
    autoMerge: true,
    requiresCIPass: true,
    requiresManualApproval: false,
    minimumConfidence: 0.8,
    description: 'GitHub Actions failures can be auto-merged if CI passes',
  },

  // Vercel 빌드 실패
  {
    source: 'vercel',
    autoMerge: true,
    requiresCIPass: true,
    requiresManualApproval: false,
    minimumConfidence: 0.8,
    description: 'Vercel build failures can be auto-merged if CI passes',
  },

  // Sentry 런타임 에러
  {
    source: 'sentry',
    autoMerge: true,
    requiresCIPass: true,
    requiresManualApproval: false,
    minimumConfidence: 0.7,
    description: 'Sentry errors can be auto-merged if CI passes',
  },

  // Supabase Edge Function 에러
  {
    source: 'supabase',
    subtype: 'edge_function',
    autoMerge: true,
    requiresCIPass: true,
    requiresManualApproval: false,
    minimumConfidence: 0.8,
    description: 'Supabase Edge Function errors can be auto-merged',
  },

  // Supabase Security 알림 - 수동 승인 필요
  {
    source: 'supabase',
    subtype: 'security',
    autoMerge: false,
    requiresCIPass: true,
    requiresManualApproval: true,
    minimumConfidence: 0.9,
    description: 'Supabase security alerts require manual approval',
  },

  // Supabase Performance 알림 - 수동 승인 필요
  {
    source: 'supabase',
    subtype: 'performance',
    autoMerge: false,
    requiresCIPass: true,
    requiresManualApproval: true,
    minimumConfidence: 0.9,
    description: 'Supabase performance alerts require manual approval',
  },
]

/**
 * 머지 결정
 */
export function decideMerge(
  source: AlertSource,
  subtype: string | undefined,
  ciPassed: boolean,
  validation: ValidationResult,
  confidence: number
): MergeDecision {
  // 정책 조회 (subtype이 있으면 먼저 시도)
  let policy = DEFAULT_POLICIES.find(
    (p) => p.source === source && p.subtype === subtype
  )

  // subtype 매칭 실패 시 source만으로 조회
  if (!policy) {
    policy = DEFAULT_POLICIES.find(
      (p) => p.source === source && !p.subtype
    )
  }

  // 기본 정책
  if (!policy) {
    policy = {
      source,
      autoMerge: false,
      requiresCIPass: true,
      requiresManualApproval: true,
      minimumConfidence: 0.9,
      description: 'Unknown source - requires manual approval',
    }
  }

  // 결정 로직
  const reasons: string[] = []
  let shouldMerge = policy.autoMerge

  // CI 체크
  if (policy.requiresCIPass && !ciPassed) {
    shouldMerge = false
    reasons.push('CI did not pass')
  }

  // 검증 체크
  if (!validation.passed) {
    shouldMerge = false
    reasons.push(`Validation failed (score: ${(validation.overallScore * 100).toFixed(0)}%)`)
  }

  // 신뢰도 체크
  if (confidence < policy.minimumConfidence) {
    shouldMerge = false
    reasons.push(`Confidence ${(confidence * 100).toFixed(0)}% below threshold ${(policy.minimumConfidence * 100).toFixed(0)}%`)
  }

  // 수동 승인 필요
  if (policy.requiresManualApproval) {
    shouldMerge = false
    reasons.push('Manual approval required by policy')
  }

  return {
    shouldMerge,
    reason: reasons.length > 0 ? reasons.join('; ') : 'All checks passed',
    policy,
    ciPassed,
    validationPassed: validation.passed,
    confidence,
  }
}

/**
 * GitHub CI 상태 확인
 */
export async function checkGitHubCI(
  owner: string,
  repo: string,
  ref: string,
  githubToken: string
): Promise<{
  passed: boolean
  status: 'success' | 'failure' | 'pending' | 'unknown'
  checks: Array<{ name: string; conclusion: string }>
}> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      return { passed: false, status: 'unknown', checks: [] }
    }

    const data = await response.json() as {
      check_runs: Array<{
        name: string
        conclusion: string | null
        status: string
      }>
    }

    const checks = data.check_runs.map((run) => ({
      name: run.name,
      conclusion: run.conclusion || run.status,
    }))

    // 모든 체크가 성공인지 확인
    const allPassed = checks.every(
      (c) => c.conclusion === 'success' || c.conclusion === 'skipped'
    )
    const anyPending = checks.some((c) => c.conclusion === 'pending' || c.conclusion === 'in_progress')
    const anyFailed = checks.some((c) => c.conclusion === 'failure' || c.conclusion === 'cancelled')

    let status: 'success' | 'failure' | 'pending' | 'unknown'
    if (anyFailed) {
      status = 'failure'
    } else if (anyPending) {
      status = 'pending'
    } else if (allPassed) {
      status = 'success'
    } else {
      status = 'unknown'
    }

    return {
      passed: status === 'success',
      status,
      checks,
    }
  } catch {
    return { passed: false, status: 'unknown', checks: [] }
  }
}

/**
 * CI 완료 대기 (polling)
 */
export async function waitForCI(
  owner: string,
  repo: string,
  ref: string,
  githubToken: string,
  maxWaitMs: number = 300000, // 5분
  pollIntervalMs: number = 10000 // 10초
): Promise<{
  passed: boolean
  timedOut: boolean
}> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkGitHubCI(owner, repo, ref, githubToken)

    if (result.status === 'success') {
      return { passed: true, timedOut: false }
    }

    if (result.status === 'failure') {
      return { passed: false, timedOut: false }
    }

    // pending인 경우 계속 대기
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  return { passed: false, timedOut: true }
}

/**
 * 자동 머지 실행
 */
export async function autoMerge(
  owner: string,
  repo: string,
  pullNumber: number,
  githubToken: string,
  mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'
): Promise<{
  success: boolean
  message: string
}> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merge_method: mergeMethod,
          commit_title: `Auto-fix: Merge PR #${pullNumber}`,
          commit_message: 'Automatically merged by ZyFlow Auto-Fix Agent',
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json() as { message?: string }
      return {
        success: false,
        message: error.message || `Failed to merge: ${response.status}`,
      }
    }

    return {
      success: true,
      message: `Successfully merged PR #${pullNumber}`,
    }
  } catch (err) {
    return {
      success: false,
      message: `Merge failed: ${err}`,
    }
  }
}

/**
 * 정책 조회
 */
export function getPolicy(source: AlertSource, subtype?: string): MergePolicy | undefined {
  return DEFAULT_POLICIES.find(
    (p) => p.source === source && (!subtype || p.subtype === subtype)
  )
}

/**
 * 모든 정책 조회
 */
export function getAllPolicies(): MergePolicy[] {
  return [...DEFAULT_POLICIES]
}

/**
 * 머지 결정 요약
 */
export function summarizeMergeDecision(decision: MergeDecision): string {
  const lines = [
    `Merge Decision: ${decision.shouldMerge ? 'AUTO-MERGE' : 'MANUAL REVIEW'}`,
    `Reason: ${decision.reason}`,
    '',
    'Checks:',
    `  CI: ${decision.ciPassed ? '✓ Passed' : '✗ Failed/Pending'}`,
    `  Validation: ${decision.validationPassed ? '✓ Passed' : '✗ Failed'}`,
    `  Confidence: ${(decision.confidence * 100).toFixed(0)}% (min: ${(decision.policy.minimumConfidence * 100).toFixed(0)}%)`,
    '',
    `Policy: ${decision.policy.description}`,
  ]

  return lines.join('\n')
}
