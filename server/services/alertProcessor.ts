/**
 * Alert Processor Service
 *
 * Alert 처리 워크플로우:
 * 1. Webhook 수신 → Alert 생성
 * 2. Agent 분석 (analyzeAlert)
 * 3. 위험도 평가 (assessRisk)
 * 4. Auto-fix 실행 (executeAutoFix)
 * 5. Slack 알림 발송 (sendSlackNotification)
 * 6. WebSocket 실시간 알림
 */

import { randomUUID } from 'crypto'
import { getSqlite } from '../tasks/db/client.js'
import type {
  AlertSource,
  AlertSeverity,
  AlertStatus,
  AlertMetadata,
  AlertAnalysis,
  AlertResolution,
  RiskAssessment,
  RiskLevel,
} from '../tasks/db/schema.js'

// =============================================
// Types
// =============================================

interface Alert {
  id: string
  source: AlertSource
  type: string
  severity: AlertSeverity
  status: AlertStatus
  title: string
  external_url?: string
  payload: string
  metadata: string
  analysis?: string
  resolution?: string
  risk_assessment?: string
  created_at: number
  updated_at: number
  resolved_at?: number
  expires_at: number
}

interface ProcessingResult {
  alertId: string
  analyzed: boolean
  riskLevel?: RiskLevel
  autoFixAttempted: boolean
  autoFixSuccess?: boolean
  notificationSent: boolean
}

// =============================================
// Activity Log Helper
// =============================================

function createActivityLog(
  alertId: string | null,
  actor: 'system' | 'agent' | 'user',
  action: string,
  description: string,
  metadata?: Record<string, unknown>
): void {
  const sqlite = getSqlite()
  const now = Date.now()

  sqlite.prepare(`
    INSERT INTO activity_logs (id, alert_id, actor, action, description, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    alertId,
    actor,
    action,
    description,
    metadata ? JSON.stringify(metadata) : null,
    now
  )
}

// =============================================
// Agent Analysis
// =============================================

/**
 * Alert 분석 - 패턴 매칭 기반 근본 원인 분석
 */
export function analyzeAlert(alert: Alert): AlertAnalysis {
  const payload = JSON.parse(alert.payload)
  const metadata = JSON.parse(alert.metadata || '{}') as AlertMetadata

  // 기본 분석 결과
  const analysis: AlertAnalysis = {
    rootCause: '',
    suggestedFix: '',
    relatedFiles: [],
    confidence: 0.5,
    autoFixable: false,
    autoFixAction: undefined,
  }

  // Source별 분석 로직
  switch (alert.source) {
    case 'github':
      analyzeGitHubAlert(alert, payload, metadata, analysis)
      break
    case 'vercel':
      analyzeVercelAlert(alert, payload, metadata, analysis)
      break
    case 'sentry':
      analyzeSentryAlert(alert, payload, metadata, analysis)
      break
    case 'supabase':
      analyzeSupabaseAlert(alert, payload, metadata, analysis)
      break
  }

  return analysis
}

function analyzeGitHubAlert(
  alert: Alert,
  payload: Record<string, unknown>,
  _metadata: AlertMetadata,
  analysis: AlertAnalysis
): void {
  const workflowRun = payload.workflow_run as Record<string, unknown> | undefined

  if (alert.type.startsWith('workflow.')) {
    // Workflow 실패 분석
    if (workflowRun) {
      const conclusion = workflowRun.conclusion as string

      if (conclusion === 'failure') {
        // 일반적인 실패 원인 패턴
        analysis.rootCause = 'GitHub Actions workflow failed during execution'
        analysis.suggestedFix = 'Check the workflow logs for specific failure details. Common causes include: test failures, linting errors, build errors, or dependency issues.'
        analysis.confidence = 0.6

        // Retry 가능 여부 판단
        const name = (workflowRun.name as string)?.toLowerCase() || ''
        if (name.includes('lint') || name.includes('format')) {
          analysis.autoFixable = true
          analysis.autoFixAction = 'retry_workflow'
          analysis.confidence = 0.8
          analysis.suggestedFix = 'This appears to be a linting/formatting issue. Auto-retry may resolve transient failures.'
        } else if (name.includes('test')) {
          analysis.suggestedFix = 'Test failures detected. Review the test logs and fix failing tests.'
          analysis.confidence = 0.7
        } else if (name.includes('build') || name.includes('deploy')) {
          analysis.suggestedFix = 'Build/deploy failure. Check for dependency issues or configuration problems.'
          analysis.confidence = 0.7
        }
      }
    }
  } else if (alert.type.startsWith('check.')) {
    // Check run 분석
    analysis.rootCause = 'GitHub Check run failed'
    analysis.suggestedFix = 'Review the check details and fix the reported issues.'
    analysis.confidence = 0.5
  }
}

function analyzeVercelAlert(
  alert: Alert,
  payload: Record<string, unknown>,
  metadata: AlertMetadata,
  analysis: AlertAnalysis
): void {
  const deployment = payload.deployment as Record<string, unknown> | undefined

  if (alert.type.includes('error')) {
    analysis.rootCause = 'Vercel deployment failed'

    // 환경별 분석
    if (metadata.environment === 'production') {
      analysis.suggestedFix = 'Production deployment failed. Check build logs and ensure all environment variables are set correctly.'
      analysis.confidence = 0.7
    } else {
      analysis.suggestedFix = 'Preview deployment failed. This may be due to branch-specific issues or missing environment variables.'
      analysis.confidence = 0.6
      analysis.autoFixable = true
      analysis.autoFixAction = 'redeploy'
    }

    // 에러 메시지 기반 분석
    const errorMessage = (deployment?.error as Record<string, unknown>)?.message as string
    if (errorMessage) {
      if (errorMessage.includes('build')) {
        analysis.suggestedFix = `Build error: ${errorMessage}. Check package.json scripts and dependencies.`
      } else if (errorMessage.includes('timeout')) {
        analysis.autoFixable = true
        analysis.autoFixAction = 'redeploy'
        analysis.suggestedFix = 'Deployment timed out. Auto-retry recommended.'
      }
    }
  }
}

function analyzeSentryAlert(
  alert: Alert,
  payload: Record<string, unknown>,
  _metadata: AlertMetadata,
  analysis: AlertAnalysis
): void {
  const data = payload.data as Record<string, unknown> | undefined
  const issue = data?.issue as Record<string, unknown> | undefined

  if (issue) {
    const culprit = issue.culprit as string
    const type = issue.type as string

    analysis.rootCause = `${type}: ${culprit || 'Unknown location'}`

    if (culprit) {
      // 파일 경로 추출
      const fileMatch = culprit.match(/([a-zA-Z0-9_/.-]+\.(js|ts|tsx|jsx|py|rb|go))/)
      if (fileMatch) {
        analysis.relatedFiles = [fileMatch[1]]
      }
    }

    // 에러 타입별 제안
    if (type === 'TypeError') {
      analysis.suggestedFix = 'Type error detected. Check for null/undefined values or incorrect type usage.'
    } else if (type === 'ReferenceError') {
      analysis.suggestedFix = 'Reference error detected. Check for undefined variables or missing imports.'
    } else if (type === 'SyntaxError') {
      analysis.suggestedFix = 'Syntax error in code. Review the file for syntax issues.'
    } else {
      analysis.suggestedFix = 'Review the error stacktrace in Sentry for detailed debugging information.'
    }

    analysis.confidence = 0.65
  }
}

function analyzeSupabaseAlert(
  alert: Alert,
  payload: Record<string, unknown>,
  _metadata: AlertMetadata,
  analysis: AlertAnalysis
): void {
  const type = alert.type

  if (type.includes('database')) {
    analysis.rootCause = 'Database operation failed'
    analysis.suggestedFix = 'Check database connectivity and query syntax. Verify RLS policies if applicable.'
    analysis.confidence = 0.5
  } else if (type.includes('auth')) {
    analysis.rootCause = 'Authentication issue detected'
    analysis.suggestedFix = 'Review auth configuration and JWT settings.'
    analysis.confidence = 0.6
  } else if (type.includes('storage')) {
    analysis.rootCause = 'Storage operation failed'
    analysis.suggestedFix = 'Check storage bucket policies and file permissions.'
    analysis.confidence = 0.6
  } else {
    analysis.rootCause = `Supabase ${type} event`
    analysis.suggestedFix = 'Check Supabase dashboard for detailed logs.'
    analysis.confidence = 0.4
  }
}

// =============================================
// Risk Assessment
// =============================================

/**
 * 위험도 평가 - Auto-fix 실행 여부 결정
 */
export function assessRisk(alert: Alert, analysis: AlertAnalysis): RiskAssessment {
  const metadata = JSON.parse(alert.metadata || '{}') as AlertMetadata

  const assessment: RiskAssessment = {
    level: 'medium',
    factors: [],
    recommendation: 'manual_review',
  }

  // 기본 위험도 설정
  if (alert.severity === 'critical') {
    assessment.level = 'high'
    assessment.factors.push('Critical severity alert')
  } else if (alert.severity === 'info') {
    assessment.level = 'low'
    assessment.factors.push('Info severity - low impact')
  }

  // 환경 기반 위험도 조정
  if (metadata.environment === 'production') {
    if (assessment.level === 'low') {
      assessment.level = 'medium'
    } else {
      assessment.level = 'high'
    }
    assessment.factors.push('Production environment')
  }

  // Auto-fix 가능 여부에 따른 조정
  if (analysis.autoFixable) {
    const action = analysis.autoFixAction

    // Low-risk actions
    if (action === 'retry_workflow' || action === 'redeploy') {
      if (assessment.level === 'high' && metadata.environment === 'production') {
        assessment.level = 'medium'
        assessment.recommendation = 'pr_with_review'
        assessment.factors.push('Auto-retry in production requires review')
      } else {
        assessment.level = 'low'
        assessment.recommendation = 'auto_approve'
        assessment.factors.push('Retry operation is safe')
      }
    }

    // Medium-risk actions
    else if (action === 'lint_fix' || action === 'format_fix') {
      assessment.level = 'low'
      assessment.recommendation = 'auto_approve'
      assessment.factors.push('Formatting/linting changes are low risk')
    }

    // High-risk actions
    else if (action === 'code_change' || action === 'dependency_update') {
      assessment.level = 'high'
      assessment.recommendation = 'pr_with_required_review'
      assessment.factors.push('Code changes require careful review')
    }
  } else {
    assessment.recommendation = 'manual_review'
    assessment.factors.push('No auto-fix available')
  }

  // Confidence 기반 조정
  if (analysis.confidence < 0.5) {
    if (assessment.level === 'low') {
      assessment.level = 'medium'
    }
    assessment.factors.push('Low confidence analysis')
  }

  return assessment
}

// =============================================
// Auto-Fix Execution
// =============================================

interface AutoFixResult {
  success: boolean
  action: string
  details?: string
  prUrl?: string
}

/**
 * Auto-fix 실행
 */
export async function executeAutoFix(
  alert: Alert,
  analysis: AlertAnalysis,
  riskAssessment: RiskAssessment
): Promise<AutoFixResult | null> {
  // Auto-fix 불가능하면 null 반환
  if (!analysis.autoFixable || !analysis.autoFixAction) {
    return null
  }

  // High risk + required review면 자동 실행 안함
  if (riskAssessment.recommendation === 'pr_with_required_review') {
    return null
  }

  const metadata = JSON.parse(alert.metadata || '{}') as AlertMetadata
  const action = analysis.autoFixAction

  try {
    switch (action) {
      case 'retry_workflow':
        return await retryGitHubWorkflow(alert, metadata)

      case 'redeploy':
        return await triggerRedeploy(alert, metadata)

      case 'lint_fix':
      case 'format_fix':
        // 이 경우는 PR 생성이 필요 - Phase 3에서 구현
        return {
          success: false,
          action,
          details: 'Code modification actions will be implemented in Phase 3',
        }

      default:
        return {
          success: false,
          action,
          details: `Unknown action: ${action}`,
        }
    }
  } catch (error) {
    return {
      success: false,
      action,
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function retryGitHubWorkflow(
  alert: Alert,
  metadata: AlertMetadata
): Promise<AutoFixResult> {
  // GitHub API로 workflow 재실행
  // 실제 구현은 GitHub token이 필요
  const payload = JSON.parse(alert.payload)
  const workflowRun = payload.workflow_run as Record<string, unknown>
  const runId = workflowRun?.id

  if (!runId || !metadata.repo) {
    return {
      success: false,
      action: 'retry_workflow',
      details: 'Missing workflow run ID or repository info',
    }
  }

  // GitHub Token 확인
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    return {
      success: false,
      action: 'retry_workflow',
      details: 'GITHUB_TOKEN not configured. Set it in environment variables to enable auto-retry.',
    }
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${metadata.repo}/actions/runs/${runId}/rerun`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (response.ok) {
      return {
        success: true,
        action: 'retry_workflow',
        details: `Workflow ${runId} rerun triggered`,
      }
    } else {
      const error = await response.text()
      return {
        success: false,
        action: 'retry_workflow',
        details: `GitHub API error: ${error}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      action: 'retry_workflow',
      details: error instanceof Error ? error.message : 'Network error',
    }
  }
}

async function triggerRedeploy(
  _alert: Alert,
  metadata: AlertMetadata
): Promise<AutoFixResult> {
  // Vercel API로 재배포
  const vercelToken = process.env.VERCEL_TOKEN
  if (!vercelToken) {
    return {
      success: false,
      action: 'redeploy',
      details: 'VERCEL_TOKEN not configured. Set it in environment variables to enable auto-redeploy.',
    }
  }

  // Vercel redeploy 로직
  // 프로젝트 ID나 배포 정보가 필요
  return {
    success: false,
    action: 'redeploy',
    details: 'Vercel redeploy requires project configuration. Configure in webhook settings.',
  }
}

// =============================================
// Slack Notification
// =============================================

interface SlackMessage {
  text: string
  blocks?: unknown[]
}

/**
 * Slack 알림 발송
 */
export async function sendSlackNotification(
  alert: Alert,
  analysis?: AlertAnalysis,
  autoFixResult?: AutoFixResult | null
): Promise<boolean> {
  const sqlite = getSqlite()
  const config = sqlite.prepare(`
    SELECT slack_webhook_url, slack_enabled, rule_on_critical, rule_on_autofix, rule_on_all
    FROM notification_config WHERE id = 'default'
  `).get() as {
    slack_webhook_url?: string
    slack_enabled: number
    rule_on_critical: number
    rule_on_autofix: number
    rule_on_all: number
  } | undefined

  if (!config?.slack_webhook_url || !config.slack_enabled) {
    return false
  }

  // 규칙 확인
  const shouldNotify =
    config.rule_on_all ||
    (config.rule_on_critical && alert.severity === 'critical') ||
    (config.rule_on_autofix && autoFixResult?.success)

  if (!shouldNotify) {
    return false
  }

  // 메시지 구성
  const severityEmoji = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
  }[alert.severity]

  const statusEmoji = autoFixResult?.success
    ? '✅'
    : autoFixResult
      ? '❌'
      : '⏳'

  const metadata = JSON.parse(alert.metadata || '{}') as AlertMetadata

  const message: SlackMessage = {
    text: `${severityEmoji} [${alert.source.toUpperCase()}] ${alert.title}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} ${alert.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Source:*\n${alert.source}`,
          },
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${alert.severity}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${alert.type}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${statusEmoji} ${alert.status}`,
          },
        ],
      },
    ],
  }

  // 메타데이터 추가
  if (metadata.repo || metadata.environment) {
    (message.blocks as unknown[]).push({
      type: 'section',
      fields: [
        metadata.repo && {
          type: 'mrkdwn',
          text: `*Repository:*\n${metadata.repo}`,
        },
        metadata.environment && {
          type: 'mrkdwn',
          text: `*Environment:*\n${metadata.environment}`,
        },
        metadata.branch && {
          type: 'mrkdwn',
          text: `*Branch:*\n${metadata.branch}`,
        },
      ].filter(Boolean),
    })
  }

  // 분석 결과 추가
  if (analysis?.rootCause) {
    (message.blocks as unknown[]).push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Analysis:*\n${analysis.rootCause}\n\n*Suggested Fix:*\n${analysis.suggestedFix}`,
      },
    })
  }

  // Auto-fix 결과 추가
  if (autoFixResult) {
    const resultText = autoFixResult.success
      ? `✅ Auto-fix applied: ${autoFixResult.action}`
      : `❌ Auto-fix failed: ${autoFixResult.details}`

    ;(message.blocks as unknown[]).push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: resultText,
      },
    })
  }

  // 링크 추가
  if (alert.external_url) {
    (message.blocks as unknown[]).push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Details',
            emoji: true,
          },
          url: alert.external_url,
        },
      ],
    })
  }

  try {
    const response = await fetch(config.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    return response.ok
  } catch (error) {
    console.error('Failed to send Slack notification:', error)
    return false
  }
}

// =============================================
// Main Processing Workflow
// =============================================

/**
 * Alert 전체 처리 워크플로우
 */
export async function processAlert(alertId: string): Promise<ProcessingResult> {
  const sqlite = getSqlite()
  const now = Date.now()

  const result: ProcessingResult = {
    alertId,
    analyzed: false,
    autoFixAttempted: false,
    notificationSent: false,
  }

  // Alert 조회
  const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId) as Alert | undefined
  if (!alert) {
    throw new Error(`Alert not found: ${alertId}`)
  }

  // Status를 processing으로 변경
  sqlite.prepare(`
    UPDATE alerts SET status = 'processing', updated_at = ? WHERE id = ?
  `).run(now, alertId)

  createActivityLog(alertId, 'agent', 'processing.started', 'Alert processing started')

  try {
    // 1. 분석 실행
    const analysis = analyzeAlert(alert)
    result.analyzed = true

    sqlite.prepare(`
      UPDATE alerts SET analysis = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(analysis), Date.now(), alertId)

    createActivityLog(alertId, 'agent', 'analysis.completed', `Analysis completed with ${Math.round(analysis.confidence * 100)}% confidence`, {
      autoFixable: analysis.autoFixable,
      autoFixAction: analysis.autoFixAction,
    })

    // 2. 위험도 평가
    const riskAssessment = assessRisk(alert, analysis)
    result.riskLevel = riskAssessment.level

    sqlite.prepare(`
      UPDATE alerts SET risk_assessment = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(riskAssessment), Date.now(), alertId)

    createActivityLog(alertId, 'agent', 'risk.assessed', `Risk level: ${riskAssessment.level}`, {
      factors: riskAssessment.factors,
      recommendation: riskAssessment.recommendation,
    })

    // 3. Auto-fix 시도
    let autoFixResult: AutoFixResult | null = null
    if (analysis.autoFixable && riskAssessment.recommendation === 'auto_approve') {
      result.autoFixAttempted = true
      autoFixResult = await executeAutoFix(alert, analysis, riskAssessment)
      result.autoFixSuccess = autoFixResult?.success

      if (autoFixResult) {
        createActivityLog(alertId, 'agent', 'autofix.executed',
          autoFixResult.success ? 'Auto-fix applied successfully' : `Auto-fix failed: ${autoFixResult.details}`,
          autoFixResult
        )

        // 성공 시 resolved로 변경
        if (autoFixResult.success) {
          const resolution: AlertResolution = {
            type: 'auto',
            action: autoFixResult.action,
            details: autoFixResult.details,
            prUrl: autoFixResult.prUrl,
          }

          sqlite.prepare(`
            UPDATE alerts SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?
          `).run(JSON.stringify(resolution), Date.now(), Date.now(), alertId)
        }
      }
    }

    // 4. Slack 알림 발송
    const notificationSent = await sendSlackNotification(alert, analysis, autoFixResult)
    result.notificationSent = notificationSent

    if (notificationSent) {
      createActivityLog(alertId, 'system', 'notification.sent', 'Slack notification sent')
    }

    // 최종 상태 업데이트 (아직 resolved가 아니면 pending으로 복구)
    const currentAlert = sqlite.prepare('SELECT status FROM alerts WHERE id = ?').get(alertId) as { status: string }
    if (currentAlert.status === 'processing') {
      sqlite.prepare(`
        UPDATE alerts SET status = 'pending', updated_at = ? WHERE id = ?
      `).run(Date.now(), alertId)
    }

    createActivityLog(alertId, 'agent', 'processing.completed', 'Alert processing completed')

  } catch (error) {
    console.error('Error processing alert:', error)
    createActivityLog(alertId, 'agent', 'processing.failed',
      error instanceof Error ? error.message : 'Unknown error'
    )

    // 에러 시 pending으로 복구
    sqlite.prepare(`
      UPDATE alerts SET status = 'pending', updated_at = ? WHERE id = ?
    `).run(Date.now(), alertId)
  }

  return result
}

/**
 * 수동 분석 트리거 API용
 */
export async function triggerAnalysis(alertId: string): Promise<AlertAnalysis> {
  const sqlite = getSqlite()
  const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId) as Alert | undefined

  if (!alert) {
    throw new Error(`Alert not found: ${alertId}`)
  }

  const analysis = analyzeAlert(alert)
  const riskAssessment = assessRisk(alert, analysis)

  // 유사 Alert 찾기
  const similarAlerts = findSimilarAlerts(alert)
  if (similarAlerts.length > 0) {
    analysis.relatedFiles = analysis.relatedFiles || []
    // 유사 Alert에서 해결 패턴 추천
    const pattern = getPatternRecommendation(alert.source, alert.type, extractPatternSignature(alert))
    if (pattern?.recommendedFix) {
      analysis.suggestedFix = `${analysis.suggestedFix || ''}\n\n📊 Based on ${pattern.resolutionCount} similar alerts: ${pattern.recommendedFix}`
    }
  }

  sqlite.prepare(`
    UPDATE alerts SET
      analysis = ?,
      risk_assessment = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(analysis),
    JSON.stringify(riskAssessment),
    Date.now(),
    alertId
  )

  createActivityLog(alertId, 'agent', 'analysis.triggered', 'Manual analysis triggered')

  return analysis
}

// =============================================
// Phase 3: 유사 Alert 매칭
// =============================================

interface SimilarAlert {
  id: string
  title: string
  similarity: number
  resolution?: string
  resolvedAt?: number
}

interface PatternInfo {
  id: string
  source: string
  type: string
  resolutionCount: number
  autoFixCount: number
  manualFixCount: number
  avgResolutionTime?: number
  recommendedAction?: string
  recommendedFix?: string
  successRate?: number
}

/**
 * Alert 제목과 타입에서 패턴 시그니처 추출
 */
function extractPatternSignature(alert: Alert): string {
  const title = alert.title.toLowerCase()
  // 제목에서 숫자, 해시, 타임스탬프 등 가변 부분 제거
  const normalized = title
    .replace(/[0-9a-f]{7,40}/g, '<hash>') // git hashes
    .replace(/\d{10,}/g, '<timestamp>') // timestamps
    .replace(/\d+\.\d+\.\d+/g, '<version>') // versions
    .replace(/#\d+/g, '<issue>') // issue numbers
    .replace(/\b\d+\b/g, '<num>') // other numbers
    .replace(/\s+/g, ' ')
    .trim()

  return `${alert.source}:${alert.type}:${normalized}`
}

/**
 * 유사 Alert 찾기
 */
export function findSimilarAlerts(alert: Alert, limit: number = 5): SimilarAlert[] {
  const sqlite = getSqlite()
  const signature = extractPatternSignature(alert)

  // 같은 source, type의 resolved된 Alert 찾기
  const candidates = sqlite.prepare(`
    SELECT id, title, resolution, resolved_at
    FROM alerts
    WHERE source = ? AND type = ? AND status = 'resolved' AND id != ?
    ORDER BY resolved_at DESC
    LIMIT 50
  `).all(alert.source, alert.type, alert.id) as Array<{
    id: string
    title: string
    resolution?: string
    resolved_at?: number
  }>

  // 유사도 계산
  const results: SimilarAlert[] = []
  for (const candidate of candidates) {
    const candidateSignature = `${alert.source}:${alert.type}:${candidate.title.toLowerCase()}`
    const similarity = calculateSimilarity(signature, candidateSignature)

    if (similarity > 0.5) { // 50% 이상 유사한 경우만
      results.push({
        id: candidate.id,
        title: candidate.title,
        similarity,
        resolution: candidate.resolution,
        resolvedAt: candidate.resolved_at,
      })
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

/**
 * 문자열 유사도 계산 (Jaccard similarity)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(/\s+/))
  const set2 = new Set(str2.split(/\s+/))

  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])

  return intersection.size / union.size
}

/**
 * Alert 해결 시 패턴 학습
 */
export function learnFromResolution(alert: Alert): void {
  const sqlite = getSqlite()
  const signature = extractPatternSignature(alert)
  const now = Date.now()

  // 기존 패턴 찾기
  const existing = sqlite.prepare(`
    SELECT * FROM alert_patterns WHERE pattern_signature = ?
  `).get(signature) as PatternInfo | undefined

  const resolution = alert.resolution ? JSON.parse(alert.resolution) : null
  const isAutoFix = resolution?.type === 'auto'
  const resolutionTime = alert.resolved_at ? (alert.resolved_at as unknown as number) - (alert.created_at as unknown as number) : null

  if (existing) {
    // 기존 패턴 업데이트
    const alertIds = JSON.parse((existing as unknown as { alert_ids: string }).alert_ids || '[]') as string[]
    if (!alertIds.includes(alert.id)) {
      alertIds.push(alert.id)
    }

    const newResolutionCount = existing.resolutionCount + 1
    const newAutoFixCount = existing.autoFixCount + (isAutoFix ? 1 : 0)
    const newManualFixCount = existing.manualFixCount + (isAutoFix ? 0 : 1)
    const newAvgTime = resolutionTime
      ? Math.round(((existing.avgResolutionTime || 0) * existing.resolutionCount + resolutionTime) / newResolutionCount)
      : existing.avgResolutionTime

    sqlite.prepare(`
      UPDATE alert_patterns SET
        resolution_count = ?,
        auto_fix_count = ?,
        manual_fix_count = ?,
        avg_resolution_time = ?,
        recommended_action = COALESCE(?, recommended_action),
        recommended_fix = COALESCE(?, recommended_fix),
        success_rate = ?,
        alert_ids = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      newResolutionCount,
      newAutoFixCount,
      newManualFixCount,
      newAvgTime,
      resolution?.action,
      resolution?.details,
      newAutoFixCount / newResolutionCount,
      JSON.stringify(alertIds),
      now,
      existing.id
    )
  } else {
    // 새 패턴 생성
    const keywords = extractKeywords(alert.title)

    sqlite.prepare(`
      INSERT INTO alert_patterns (
        id, source, type, pattern_signature, pattern_keywords,
        resolution_count, auto_fix_count, manual_fix_count,
        avg_resolution_time, recommended_action, recommended_fix,
        success_rate, alert_ids, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      alert.source,
      alert.type,
      signature,
      JSON.stringify(keywords),
      1,
      isAutoFix ? 1 : 0,
      isAutoFix ? 0 : 1,
      resolutionTime,
      resolution?.action,
      resolution?.details,
      isAutoFix ? 1.0 : 0.0,
      JSON.stringify([alert.id]),
      now,
      now
    )
  }

  // 일별 트렌드 업데이트
  updateDailyTrends(alert)
}

/**
 * 제목에서 키워드 추출
 */
function extractKeywords(title: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for'])
  return title
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
}

/**
 * 패턴 추천 가져오기
 */
function getPatternRecommendation(source: string, type: string, signature: string): PatternInfo | null {
  const sqlite = getSqlite()

  // 정확한 시그니처 매칭 먼저 시도
  const exact = sqlite.prepare(`
    SELECT * FROM alert_patterns WHERE pattern_signature = ?
  `).get(signature) as PatternInfo | undefined

  if (exact) return exact

  // 같은 source, type의 가장 성공적인 패턴 찾기
  const fallback = sqlite.prepare(`
    SELECT * FROM alert_patterns
    WHERE source = ? AND type = ?
    ORDER BY success_rate DESC, resolution_count DESC
    LIMIT 1
  `).get(source, type) as PatternInfo | undefined

  return fallback || null
}

// =============================================
// Phase 3: 통계 및 트렌드
// =============================================

/**
 * 일별 트렌드 업데이트
 */
function updateDailyTrends(alert: Alert): void {
  const sqlite = getSqlite()
  const date = new Date(alert.created_at as unknown as number).toISOString().split('T')[0]
  const now = Date.now()
  const resolution = alert.resolution ? JSON.parse(alert.resolution) : null
  const isAutoFix = resolution?.type === 'auto'

  // 소스별 트렌드 업데이트
  for (const source of [alert.source, 'all'] as const) {
    const existing = sqlite.prepare(`
      SELECT * FROM alert_trends WHERE date = ? AND source = ?
    `).get(date, source) as {
      id: number
      resolved_count: number
      ignored_count: number
      auto_fixed_count: number
      avg_resolution_time?: number
    } | undefined

    if (existing) {
      const resolutionTime = alert.resolved_at
        ? (alert.resolved_at as unknown as number) - (alert.created_at as unknown as number)
        : null

      let newAvgTime = existing.avg_resolution_time
      if (resolutionTime && alert.status === 'resolved') {
        const resolvedCount = existing.resolved_count + 1
        newAvgTime = Math.round(((existing.avg_resolution_time || 0) * existing.resolved_count + resolutionTime) / resolvedCount)
      }

      sqlite.prepare(`
        UPDATE alert_trends SET
          resolved_count = resolved_count + ?,
          ignored_count = ignored_count + ?,
          auto_fixed_count = auto_fixed_count + ?,
          avg_resolution_time = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        alert.status === 'resolved' ? 1 : 0,
        alert.status === 'ignored' ? 1 : 0,
        isAutoFix ? 1 : 0,
        newAvgTime,
        now,
        existing.id
      )
    }
  }
}

/**
 * 트렌드 데이터 조회
 */
export function getTrends(days: number = 30, source?: string): Array<{
  date: string
  totalCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
  resolvedCount: number
  ignoredCount: number
  autoFixedCount: number
  avgResolutionTime?: number
}> {
  const sqlite = getSqlite()
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = source
    ? `SELECT * FROM alert_trends WHERE date >= ? AND source = ? ORDER BY date DESC`
    : `SELECT * FROM alert_trends WHERE date >= ? AND source = 'all' ORDER BY date DESC`

  const params = source ? [startDate, source] : [startDate]

  const results = sqlite.prepare(query).all(...params) as Array<{
    date: string
    total_count: number
    critical_count: number
    warning_count: number
    info_count: number
    resolved_count: number
    ignored_count: number
    auto_fixed_count: number
    avg_resolution_time?: number
  }>

  return results.map(r => ({
    date: r.date,
    totalCount: r.total_count,
    criticalCount: r.critical_count,
    warningCount: r.warning_count,
    infoCount: r.info_count,
    resolvedCount: r.resolved_count,
    ignoredCount: r.ignored_count,
    autoFixedCount: r.auto_fixed_count,
    avgResolutionTime: r.avg_resolution_time,
  }))
}

/**
 * 고급 통계 계산
 */
export function getAdvancedStats(): {
  totalAlerts: number
  resolvedAlerts: number
  avgResolutionTime: number
  autoFixRate: number
  topPatterns: PatternInfo[]
  sourceBreakdown: Record<string, number>
  severityBreakdown: Record<string, number>
  resolutionTimeBySource: Record<string, number>
} {
  const sqlite = getSqlite()
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  // 기본 통계
  const total = sqlite.prepare(`SELECT COUNT(*) as count FROM alerts WHERE created_at > ?`).get(thirtyDaysAgo) as { count: number }
  const resolved = sqlite.prepare(`SELECT COUNT(*) as count FROM alerts WHERE status = 'resolved' AND created_at > ?`).get(thirtyDaysAgo) as { count: number }

  // 평균 해결 시간
  const avgTime = sqlite.prepare(`
    SELECT AVG(resolved_at - created_at) as avg_time
    FROM alerts WHERE status = 'resolved' AND resolved_at IS NOT NULL AND created_at > ?
  `).get(thirtyDaysAgo) as { avg_time: number | null }

  // Auto-fix 성공률
  const autoFixed = sqlite.prepare(`
    SELECT COUNT(*) as count FROM alerts
    WHERE status = 'resolved' AND resolution LIKE '%"type":"auto"%' AND created_at > ?
  `).get(thirtyDaysAgo) as { count: number }

  // Top 패턴
  const topPatterns = sqlite.prepare(`
    SELECT * FROM alert_patterns ORDER BY resolution_count DESC LIMIT 5
  `).all() as PatternInfo[]

  // 소스별 분포
  const sourceStats = sqlite.prepare(`
    SELECT source, COUNT(*) as count FROM alerts WHERE created_at > ? GROUP BY source
  `).all(thirtyDaysAgo) as Array<{ source: string; count: number }>

  // 심각도별 분포
  const severityStats = sqlite.prepare(`
    SELECT severity, COUNT(*) as count FROM alerts WHERE created_at > ? GROUP BY severity
  `).all(thirtyDaysAgo) as Array<{ severity: string; count: number }>

  // 소스별 평균 해결 시간
  const resolutionTimeBySource = sqlite.prepare(`
    SELECT source, AVG(resolved_at - created_at) as avg_time
    FROM alerts WHERE status = 'resolved' AND resolved_at IS NOT NULL AND created_at > ?
    GROUP BY source
  `).all(thirtyDaysAgo) as Array<{ source: string; avg_time: number }>

  return {
    totalAlerts: total.count,
    resolvedAlerts: resolved.count,
    avgResolutionTime: avgTime.avg_time || 0,
    autoFixRate: resolved.count > 0 ? autoFixed.count / resolved.count : 0,
    topPatterns,
    sourceBreakdown: Object.fromEntries(sourceStats.map(s => [s.source, s.count])),
    severityBreakdown: Object.fromEntries(severityStats.map(s => [s.severity, s.count])),
    resolutionTimeBySource: Object.fromEntries(resolutionTimeBySource.map(r => [r.source, r.avg_time])),
  }
}

// =============================================
// Phase 3: GitHub PR 생성
// =============================================

interface PRCreationResult {
  success: boolean
  prUrl?: string
  prNumber?: number
  error?: string
}

/**
 * GitHub PR 생성
 */
export async function createPullRequest(
  alert: Alert,
  analysis: AlertAnalysis,
  patchContent: string
): Promise<PRCreationResult> {
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    return { success: false, error: 'GITHUB_TOKEN not configured' }
  }

  const metadata = JSON.parse(alert.metadata || '{}') as AlertMetadata
  if (!metadata.repo) {
    return { success: false, error: 'Repository information not available' }
  }

  const [owner, repo] = metadata.repo.split('/')
  const branchName = `fix/alert-${alert.id.slice(0, 8)}`
  const baseBranch = metadata.branch || 'main'

  try {
    // 1. base branch의 최신 SHA 가져오기
    const refResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!refResponse.ok) {
      return { success: false, error: `Failed to get base branch: ${await refResponse.text()}` }
    }

    const refData = await refResponse.json() as { object: { sha: string } }
    const baseSha = refData.object.sha

    // 2. 새 브랜치 생성
    const createBranchResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      }
    )

    if (!createBranchResponse.ok && createBranchResponse.status !== 422) {
      return { success: false, error: `Failed to create branch: ${await createBranchResponse.text()}` }
    }

    // 3. 파일 업데이트 (patchContent가 있는 경우)
    if (patchContent && analysis.relatedFiles && analysis.relatedFiles.length > 0) {
      const filePath = analysis.relatedFiles[0]

      // 파일 내용 가져오기
      const fileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branchName}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      )

      if (fileResponse.ok) {
        const fileData = await fileResponse.json() as { sha: string; content: string }

        // 파일 업데이트
        await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `fix: Auto-fix for alert ${alert.id.slice(0, 8)}`,
              content: Buffer.from(patchContent).toString('base64'),
              sha: fileData.sha,
              branch: branchName,
            }),
          }
        )
      }
    }

    // 4. PR 생성
    const prResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `🤖 Auto-fix: ${alert.title}`,
          body: `## Alert Details

- **Source**: ${alert.source}
- **Type**: ${alert.type}
- **Severity**: ${alert.severity}

## Analysis

${analysis.rootCause || 'N/A'}

## Suggested Fix

${analysis.suggestedFix || 'N/A'}

---
*This PR was automatically created by the Zyflow Alert System*`,
          head: branchName,
          base: baseBranch,
          labels: ['auto-fix', `severity:${alert.severity}`],
        }),
      }
    )

    if (!prResponse.ok) {
      return { success: false, error: `Failed to create PR: ${await prResponse.text()}` }
    }

    const prData = await prResponse.json() as { html_url: string; number: number }

    return {
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
