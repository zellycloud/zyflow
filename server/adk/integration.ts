/**
 * ADK Integration
 *
 * 기존 alert-integration 시스템과 ADK 오케스트레이터 연결
 */

import { runAutoFix, analyzeOnly, type AutoFixResult, type AutoFixOptions } from './orchestrator'
import type { Alert } from '../agents/alert-integration'

/**
 * Alert 데이터를 ADK 형식으로 변환
 */
function alertToErrorLog(alert: Alert): string {
  const lines: string[] = []

  lines.push('Source: ' + alert.source)
  lines.push('Severity: ' + alert.severity)
  lines.push('Title: ' + alert.title)

  if (alert.message) {
    lines.push('')
    lines.push('Message:')
    lines.push(alert.message)
  }

  if (alert.metadata) {
    lines.push('')
    lines.push('Metadata:')

    // 에러 로그가 있으면 추출
    const meta = alert.metadata as Record<string, unknown>

    if (meta.error) {
      lines.push(String(meta.error))
    }

    if (meta.logs) {
      lines.push(String(meta.logs))
    }

    if (meta.output) {
      lines.push(String(meta.output))
    }

    // workflow_run 정보
    if (meta.workflow_run) {
      const run = meta.workflow_run as Record<string, unknown>
      lines.push('Workflow: ' + (run.name || 'unknown'))
      lines.push('Conclusion: ' + (run.conclusion || 'unknown'))
      lines.push('Branch: ' + (run.head_branch || 'unknown'))
    }

    // deployment 정보
    if (meta.deployment) {
      const dep = meta.deployment as Record<string, unknown>
      lines.push('Deployment: ' + (dep.name || 'unknown'))
      lines.push('State: ' + (dep.state || 'unknown'))
    }
  }

  return lines.join('\n')
}

/**
 * ADK 기반 자동 수정 실행
 */
export async function runADKAutoFix(
  alert: Alert,
  repository?: string,
  options?: {
    baseBranch?: string
    dryRun?: boolean
    skipTests?: boolean
    autoMerge?: boolean
    onProgress?: (step: { step: string; status: string; message: string }) => void
  }
): Promise<AutoFixResult> {
  const errorLog = alertToErrorLog(alert)

  const adkOptions: AutoFixOptions = {
    repository,
    baseBranch: options?.baseBranch || 'main',
    alertId: alert.id,
    dryRun: options?.dryRun ?? false,
    skipTests: options?.skipTests ?? false,
    maxRetries: 3,
    autoMerge: options?.autoMerge ?? true,
    onProgress: options?.onProgress,
  }

  return runAutoFix(errorLog, adkOptions)
}

/**
 * 에러 분석만 실행
 */
export async function analyzeAlert(alert: Alert) {
  const errorLog = alertToErrorLog(alert)
  return analyzeOnly(errorLog)
}

/**
 * 심각도에 따라 ADK 자동 수정 트리거 여부 결정
 */
export function shouldTriggerADK(
  alert: Alert,
  config?: {
    triggerOnSeverity?: ('critical' | 'high' | 'medium')[]
    enabledSources?: ('github' | 'vercel' | 'sentry' | 'supabase')[]
  }
): boolean {
  const triggerSeverities = config?.triggerOnSeverity || ['critical', 'high']
  const enabledSources = config?.enabledSources || ['github', 'vercel', 'sentry']

  // 소스 체크
  if (!enabledSources.includes(alert.source as 'github' | 'vercel' | 'sentry' | 'supabase')) {
    return false
  }

  // 심각도 체크
  if (!triggerSeverities.includes(alert.severity as 'critical' | 'high' | 'medium')) {
    return false
  }

  // Supabase Security/Performance는 수동 승인 필요
  if (alert.source === 'supabase') {
    const metadata = alert.metadata as Record<string, unknown> | undefined
    if (metadata?.type === 'security' || metadata?.type === 'performance') {
      return false
    }
  }

  return true
}

/**
 * ADK 머지 정책 결정
 */
export function getADKMergePolicy(alert: Alert): {
  autoMerge: boolean
  reason: string
} {
  // Supabase Security/Performance는 수동 승인
  if (alert.source === 'supabase') {
    const metadata = alert.metadata as Record<string, unknown> | undefined
    if (metadata?.type === 'security') {
      return { autoMerge: false, reason: 'Supabase security alerts require manual review' }
    }
    if (metadata?.type === 'performance') {
      return { autoMerge: false, reason: 'Supabase performance alerts require manual review' }
    }
  }

  // 그 외는 CI 통과 시 자동 머지
  return { autoMerge: true, reason: 'Auto-merge on CI pass' }
}

/**
 * ADK 결과를 기존 AutoFixResult 형식으로 변환
 */
export function convertToLegacyResult(adkResult: AutoFixResult): {
  success: boolean
  message: string
  prUrl?: string
  duration: number
  analysis?: {
    errorType: string
    summary: string
  }
} {
  return {
    success: adkResult.success,
    message: adkResult.error || (adkResult.success ? 'Auto-fix completed' : 'Auto-fix failed'),
    prUrl: adkResult.pr?.prUrl,
    duration: adkResult.duration,
    analysis: adkResult.analysis
      ? {
          errorType: adkResult.analysis.errorType,
          summary: adkResult.analysis.summary,
        }
      : undefined,
  }
}

/**
 * Webhook 이벤트에서 ADK 트리거
 */
export async function handleWebhookWithADK(
  source: 'github' | 'vercel' | 'sentry' | 'supabase',
  payload: unknown,
  repository: string,
  options?: {
    baseBranch?: string
    dryRun?: boolean
  }
): Promise<AutoFixResult | null> {
  // Alert 객체 생성
  const alert: Alert = {
    id: source + '-' + Date.now(),
    project_id: repository.split('/')[1] || 'unknown',
    source,
    severity: determineSeverity(source, payload),
    status: 'new',
    title: extractTitle(source, payload),
    message: extractMessage(source, payload),
    metadata: payload as Record<string, unknown>,
    created_at: Date.now(),
    updated_at: Date.now(),
  }

  // 트리거 여부 확인
  if (!shouldTriggerADK(alert)) {
    console.log('[ADK] Skipping alert:', alert.id, '- not in trigger criteria')
    return null
  }

  // 머지 정책 결정
  const mergePolicy = getADKMergePolicy(alert)

  console.log('[ADK] Processing alert:', alert.id, '- merge policy:', mergePolicy.reason)

  return runADKAutoFix(alert, repository, {
    baseBranch: options?.baseBranch,
    dryRun: options?.dryRun,
    autoMerge: mergePolicy.autoMerge,
    onProgress: step => {
      console.log('[ADK]', step.step, '-', step.status, ':', step.message)
    },
  })
}

// Helper functions
function determineSeverity(
  source: string,
  payload: unknown
): 'critical' | 'high' | 'medium' | 'low' {
  const p = payload as Record<string, unknown>

  if (source === 'github') {
    const conclusion = (p.workflow_run as Record<string, unknown>)?.conclusion
    if (conclusion === 'failure') return 'high'
    if (conclusion === 'cancelled') return 'medium'
  }

  if (source === 'vercel') {
    const state = (p.deployment as Record<string, unknown>)?.state
    if (state === 'error') return 'high'
    if (state === 'cancelled') return 'medium'
  }

  if (source === 'sentry') {
    const level = p.level as string
    if (level === 'fatal') return 'critical'
    if (level === 'error') return 'high'
    if (level === 'warning') return 'medium'
  }

  if (source === 'supabase') {
    const type = p.type as string
    if (type === 'security') return 'critical'
    if (type === 'error') return 'high'
    if (type === 'performance') return 'medium'
  }

  return 'medium'
}

function extractTitle(source: string, payload: unknown): string {
  const p = payload as Record<string, unknown>

  switch (source) {
    case 'github': {
      const run = p.workflow_run as Record<string, unknown>
      return 'GitHub Actions: ' + (run?.name || 'unknown') + ' - ' + (run?.conclusion || 'unknown')
    }
    case 'vercel': {
      const dep = p.deployment as Record<string, unknown>
      return 'Vercel: ' + (dep?.name || 'unknown') + ' - ' + (dep?.state || 'unknown')
    }
    case 'sentry':
      return 'Sentry: ' + (p.title || 'unknown issue')
    case 'supabase':
      return 'Supabase: ' + (p.message || 'unknown alert')
    default:
      return 'Unknown alert'
  }
}

function extractMessage(source: string, payload: unknown): string {
  const p = payload as Record<string, unknown>

  if (p.message) return String(p.message)
  if (p.error) return String(p.error)
  if (p.logs) return String(p.logs)

  return JSON.stringify(payload, null, 2).slice(0, 1000)
}
