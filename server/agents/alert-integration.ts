/**
 * Alert-Agent Integration
 *
 * 알림 시스템과 자동 수정 에이전트 연결
 * - 알림 처리기 확장
 * - 심각도 기반 자동 트리거
 * - 상태 업데이트 플로우
 * - 활동 로깅
 */

import { triggerAutoFix, summarizeAutoFix, type AlertData, type AutoFixResult, type AutoFixOptions } from './error-detector'
import type { Alert } from '../routes/alerts'

export interface AgentConfig {
  enabled: boolean
  githubToken: string
  triggerOnSeverity: ('critical' | 'high' | 'medium')[]
  autoMergeEnabled: boolean
  dryRunMode: boolean
  maxConcurrentRuns: number
}

// 기본 설정
const DEFAULT_CONFIG: AgentConfig = {
  enabled: true,
  githubToken: process.env.GITHUB_TOKEN || '',
  triggerOnSeverity: ['critical', 'high'],
  autoMergeEnabled: true,
  dryRunMode: false,
  maxConcurrentRuns: 3,
}

// 현재 실행 중인 작업 추적
const runningJobs = new Map<string, Promise<AutoFixResult>>()

// 실행 이력
const executionHistory: Array<{
  alertId: string
  result: AutoFixResult
  timestamp: string
}> = []

/**
 * 알림 처리 후 자동 수정 트리거
 */
export async function processAlertForAutoFix(
  alert: Alert,
  projectPath: string,
  repository?: { owner: string; repo: string; branch: string },
  config: Partial<AgentConfig> = {}
): Promise<AutoFixResult | null> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // 에이전트 비활성화 체크
  if (!mergedConfig.enabled) {
    console.log(`[Agent] Disabled, skipping alert ${alert.id}`)
    return null
  }

  // GitHub 토큰 체크
  if (!mergedConfig.githubToken) {
    console.log(`[Agent] No GitHub token configured, skipping alert ${alert.id}`)
    return null
  }

  // 심각도 체크
  if (!mergedConfig.triggerOnSeverity.includes(alert.severity as 'critical' | 'high' | 'medium')) {
    console.log(`[Agent] Severity ${alert.severity} not in trigger list, skipping alert ${alert.id}`)
    return null
  }

  // 동시 실행 제한 체크
  if (runningJobs.size >= mergedConfig.maxConcurrentRuns) {
    console.log(`[Agent] Max concurrent runs reached (${runningJobs.size}), queueing alert ${alert.id}`)
    // TODO: 큐에 추가
    return null
  }

  // 이미 실행 중인지 체크
  if (runningJobs.has(alert.id)) {
    console.log(`[Agent] Already processing alert ${alert.id}`)
    return null
  }

  // 알림 데이터 변환
  const alertData: AlertData = {
    id: alert.id,
    source: alert.source as AlertData['source'],
    subtype: extractSubtype(alert),
    title: alert.title,
    rawPayload: alert.data || {},
    projectPath,
    projectId: alert.projectId || 'default',
    repository,
  }

  // 옵션 설정
  const options: AutoFixOptions = {
    dryRun: mergedConfig.dryRunMode,
    skipValidation: false,
    forceManual: !mergedConfig.autoMergeEnabled,
    maxErrors: 10,
  }

  // 자동 수정 실행
  console.log(`[Agent] Starting auto-fix for alert ${alert.id}`)
  const job = triggerAutoFix(alertData, mergedConfig.githubToken, options)
  runningJobs.set(alert.id, job)

  try {
    const result = await job

    // 이력 저장
    executionHistory.push({
      alertId: alert.id,
      result,
      timestamp: new Date().toISOString(),
    })

    // 이력 크기 제한 (최근 100개만 유지)
    while (executionHistory.length > 100) {
      executionHistory.shift()
    }

    console.log(`[Agent] Completed: ${summarizeAutoFix(result)}`)
    return result
  } finally {
    runningJobs.delete(alert.id)
  }
}

/**
 * 알림에서 subtype 추출
 */
function extractSubtype(alert: Alert): string | undefined {
  const data = alert.data as Record<string, unknown> | undefined

  if (alert.source === 'supabase' && data?.type) {
    return String(data.type)
  }

  if (alert.source === 'github' && data?.action) {
    return String(data.action)
  }

  return undefined
}

/**
 * 현재 실행 중인 작업 조회
 */
export function getRunningJobs(): string[] {
  return Array.from(runningJobs.keys())
}

/**
 * 실행 이력 조회
 */
export function getExecutionHistory(limit = 20): typeof executionHistory {
  return executionHistory.slice(-limit)
}

/**
 * 에이전트 통계
 */
export function getAgentStats(): {
  running: number
  completed: number
  successful: number
  failed: number
  averageDuration: number
} {
  const completed = executionHistory.length
  const successful = executionHistory.filter((e) => e.result.success).length
  const failed = completed - successful
  const totalDuration = executionHistory.reduce((sum, e) => sum + e.result.duration, 0)

  return {
    running: runningJobs.size,
    completed,
    successful,
    failed,
    averageDuration: completed > 0 ? Math.round(totalDuration / completed) : 0,
  }
}

/**
 * 수동 트리거
 */
export async function manualTrigger(
  alertId: string,
  projectPath: string,
  repository: { owner: string; repo: string; branch: string },
  config: Partial<AgentConfig> = {}
): Promise<AutoFixResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  const alertData: AlertData = {
    id: alertId,
    source: 'github', // 기본값
    title: 'Manual trigger',
    rawPayload: {},
    projectPath,
    projectId: 'manual',
    repository,
  }

  return triggerAutoFix(alertData, mergedConfig.githubToken, {
    dryRun: mergedConfig.dryRunMode,
    forceManual: !mergedConfig.autoMergeEnabled,
  })
}

/**
 * Webhook에서 자동 수정 트리거 (Express 라우터용)
 */
export async function handleWebhookForAutoFix(
  source: AlertData['source'],
  payload: unknown,
  projectPath: string,
  repository: { owner: string; repo: string; branch: string },
  githubToken: string
): Promise<AutoFixResult | null> {
  // 알림 ID 생성
  const alertId = `${source}-${Date.now()}`

  const alertData: AlertData = {
    id: alertId,
    source,
    title: extractTitle(source, payload as Record<string, unknown>),
    rawPayload: payload,
    projectPath,
    projectId: repository.repo,
    repository,
  }

  // 심각도 확인 (webhook에서는 항상 트리거)
  return triggerAutoFix(alertData, githubToken, {
    dryRun: false,
    forceManual: false,
    maxErrors: 10,
  })
}

/**
 * Payload에서 제목 추출
 */
function extractTitle(source: AlertData['source'], payload: Record<string, unknown>): string {
  switch (source) {
    case 'github':
      if (payload.workflow_run) {
        const run = payload.workflow_run as Record<string, unknown>
        return `GitHub Actions: ${run.name} - ${run.conclusion}`
      }
      return 'GitHub Actions failure'

    case 'vercel':
      if (payload.deployment) {
        const deployment = payload.deployment as Record<string, unknown>
        return `Vercel: ${deployment.name} - ${deployment.state}`
      }
      return 'Vercel build failure'

    case 'sentry':
      return String(payload.title || 'Sentry issue')

    case 'supabase':
      return String(payload.message || 'Supabase alert')

    default:
      return 'Unknown alert'
  }
}

/**
 * 에이전트 상태 요약
 */
export function getAgentStatusSummary(): string {
  const stats = getAgentStats()
  const running = getRunningJobs()

  const lines = [
    '=== Auto-Fix Agent Status ===',
    `Running: ${stats.running}`,
    `Completed: ${stats.completed}`,
    `Success Rate: ${stats.completed > 0 ? ((stats.successful / stats.completed) * 100).toFixed(1) : 0}%`,
    `Avg Duration: ${stats.averageDuration}ms`,
  ]

  if (running.length > 0) {
    lines.push('')
    lines.push('Currently Processing:')
    running.forEach((id) => lines.push(`  - ${id}`))
  }

  return lines.join('\n')
}
