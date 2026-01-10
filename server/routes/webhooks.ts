/**
 * Webhooks Router
 *
 * 외부 서비스 Webhook 수신 엔드포인트
 * - GitHub Actions 실패
 * - Vercel 배포 실패
 * - Sentry 에러
 * - Supabase 이슈
 */

import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { getSqlite } from '../tasks/db/client.js'
import type { AlertSource, AlertSeverity } from '../tasks/db/schema.js'
import { verifyGitHubSignature, verifyVercelSignature, verifySentrySignature, verifySupabaseSignature } from '../utils/webhook-verify.js'
import { sendSlackNotification } from '../services/slackNotifier.js'

// WebSocket broadcast 함수 (app.ts에서 주입)
let broadcastAlert: ((alert: unknown) => void) | null = null

export function setWebhookBroadcast(fn: (alert: unknown) => void): void {
  broadcastAlert = fn
}

export const webhooksRouter = Router()

// =============================================
// Types
// =============================================

interface CreateAlertParams {
  source: AlertSource
  severity: AlertSeverity
  projectId: string
  projectName: string
  title: string
  message: string
  metadata: Record<string, unknown>
  externalUrl?: string
}

// =============================================
// Helper Functions
// =============================================

/**
 * Alert 생성 및 저장
 */
async function createAlert(params: CreateAlertParams): Promise<string> {
  const sqlite = getSqlite()
  const now = Date.now()
  const alertId = randomUUID()
  const expiresAt = now + 90 * 24 * 60 * 60 * 1000 // 90일 후 만료

  sqlite.prepare(`
    INSERT INTO alerts (
      id, source, severity, status, project_id, project_name,
      title, message, metadata, external_url, created_at, updated_at, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    alertId,
    params.source,
    params.severity,
    'pending',
    params.projectId,
    params.projectName,
    params.title,
    params.message,
    JSON.stringify(params.metadata),
    params.externalUrl || null,
    now,
    now,
    expiresAt
  )

  // Activity log 생성
  sqlite.prepare(`
    INSERT INTO activity_logs (id, alert_id, actor, action, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    alertId,
    'system',
    'alert_created',
    `Alert created from ${params.source} webhook`,
    now
  )

  // WebSocket broadcast
  if (broadcastAlert) {
    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    broadcastAlert(alert)
  }

  // Slack 알림 발송
  try {
    await sendSlackNotification({
      alertId,
      source: params.source,
      severity: params.severity,
      projectName: params.projectName,
      title: params.title,
      message: params.message,
      externalUrl: params.externalUrl,
    })
  } catch (error) {
    console.error('[Webhook] Failed to send Slack notification:', error)
  }

  return alertId
}

/**
 * 프로젝트 그룹 판별 (zellyy vs jayoo)
 */
function getProjectGroup(projectName: string): 'zellyy' | 'jayoo' {
  const zellyProjects = ['zellyy-money', 'zellyy-admin', 'zyflow']
  return zellyProjects.some(p => projectName.toLowerCase().includes(p.toLowerCase()))
    ? 'zellyy'
    : 'jayoo'
}

// =============================================
// GitHub Webhook
// =============================================

interface GitHubWorkflowRunPayload {
  action: string
  workflow_run?: {
    id: number
    name: string
    conclusion: string | null
    html_url: string
    head_branch: string
    head_sha: string
    repository: {
      full_name: string
      name: string
    }
    head_commit?: {
      message: string
      author: {
        name: string
      }
    }
  }
  repository?: {
    full_name: string
    name: string
  }
}

webhooksRouter.post('/github', async (req: Request, res: Response) => {
  try {
    // 서명 검증
    const signature = req.headers['x-hub-signature-256'] as string
    if (!verifyGitHubSignature(req.body, signature)) {
      console.warn('[Webhook] GitHub signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const payload = req.body as GitHubWorkflowRunPayload
    const event = req.headers['x-github-event'] as string

    // workflow_run 이벤트만 처리
    if (event !== 'workflow_run') {
      return res.status(200).json({ message: 'Event ignored', event })
    }

    // completed + failure만 처리
    if (payload.action !== 'completed' || payload.workflow_run?.conclusion !== 'failure') {
      return res.status(200).json({ message: 'Success or in-progress, ignored' })
    }

    const workflowRun = payload.workflow_run
    const repoName = workflowRun.repository.name
    const repoFullName = workflowRun.repository.full_name

    const alertId = await createAlert({
      source: 'github',
      severity: 'critical',
      projectId: repoFullName,
      projectName: repoName,
      title: `GitHub Actions 실패: ${workflowRun.name}`,
      message: `Workflow "${workflowRun.name}" failed on branch ${workflowRun.head_branch}`,
      metadata: {
        workflowId: workflowRun.id,
        workflowName: workflowRun.name,
        branch: workflowRun.head_branch,
        sha: workflowRun.head_sha,
        commitMessage: workflowRun.head_commit?.message,
        commitAuthor: workflowRun.head_commit?.author.name,
      },
      externalUrl: workflowRun.html_url,
    })

    console.log(`[Webhook] GitHub alert created: ${alertId} for ${repoFullName}`)
    res.status(200).json({ success: true, alertId })
  } catch (error) {
    console.error('[Webhook] GitHub webhook error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// =============================================
// Vercel Webhook
// =============================================

interface VercelDeploymentPayload {
  type: string
  payload: {
    deployment: {
      id: string
      name: string
      url: string
      state: string
      meta?: {
        githubCommitRef?: string
        githubCommitSha?: string
        githubCommitMessage?: string
        githubCommitAuthorName?: string
      }
    }
    project: {
      id: string
      name: string
    }
  }
}

webhooksRouter.post('/vercel', async (req: Request, res: Response) => {
  try {
    // 서명 검증
    const signature = req.headers['x-vercel-signature'] as string
    if (!verifyVercelSignature(req.body, signature)) {
      console.warn('[Webhook] Vercel signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const payload = req.body as VercelDeploymentPayload

    // deployment.error 이벤트만 처리
    if (payload.type !== 'deployment.error') {
      return res.status(200).json({ message: 'Event ignored', type: payload.type })
    }

    const deployment = payload.payload.deployment
    const project = payload.payload.project

    const alertId = await createAlert({
      source: 'vercel',
      severity: 'critical',
      projectId: project.id,
      projectName: project.name,
      title: `Vercel 배포 실패: ${project.name}`,
      message: `Deployment ${deployment.id} failed`,
      metadata: {
        deploymentId: deployment.id,
        deploymentUrl: deployment.url,
        branch: deployment.meta?.githubCommitRef,
        sha: deployment.meta?.githubCommitSha,
        commitMessage: deployment.meta?.githubCommitMessage,
        commitAuthor: deployment.meta?.githubCommitAuthorName,
      },
      externalUrl: `https://vercel.com/${project.name}/${deployment.id}`,
    })

    console.log(`[Webhook] Vercel alert created: ${alertId} for ${project.name}`)
    res.status(200).json({ success: true, alertId })
  } catch (error) {
    console.error('[Webhook] Vercel webhook error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// =============================================
// Sentry Webhook
// =============================================

interface SentryIssuePayload {
  action: string
  data: {
    issue: {
      id: string
      title: string
      culprit: string
      shortId: string
      permalink: string
      level: string
      firstSeen: string
      lastSeen: string
      count: number
      project: {
        id: string
        name: string
        slug: string
      }
    }
    event?: {
      eventID: string
      message?: string
      environment?: string
      tags?: Array<{ key: string; value: string }>
    }
  }
}

webhooksRouter.post('/sentry', async (req: Request, res: Response) => {
  try {
    // 서명 검증
    const signature = req.headers['sentry-hook-signature'] as string
    if (!verifySentrySignature(req.body, signature)) {
      console.warn('[Webhook] Sentry signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const payload = req.body as SentryIssuePayload

    // issue 관련 이벤트만 처리 (created, resolved 등)
    if (!['issue.created', 'event.alert'].includes(payload.action)) {
      return res.status(200).json({ message: 'Event ignored', action: payload.action })
    }

    const issue = payload.data.issue
    const event = payload.data.event

    // Severity 매핑
    const severityMap: Record<string, AlertSeverity> = {
      fatal: 'critical',
      error: 'critical',
      warning: 'warning',
      info: 'info',
    }
    const severity = severityMap[issue.level] || 'warning'

    const alertId = await createAlert({
      source: 'sentry',
      severity,
      projectId: issue.project.id,
      projectName: issue.project.name,
      title: `Sentry 에러: ${issue.title}`,
      message: issue.culprit || issue.title,
      metadata: {
        issueId: issue.id,
        shortId: issue.shortId,
        level: issue.level,
        count: issue.count,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        eventId: event?.eventID,
        environment: event?.environment,
        tags: event?.tags,
      },
      externalUrl: issue.permalink,
    })

    console.log(`[Webhook] Sentry alert created: ${alertId} for ${issue.project.name}`)
    res.status(200).json({ success: true, alertId })
  } catch (error) {
    console.error('[Webhook] Sentry webhook error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// =============================================
// Supabase Webhook
// =============================================

interface SupabaseAlertPayload {
  type: string
  table?: string
  record?: {
    id: string
    name: string
    severity: string
    message: string
    project_ref: string
  }
  // Edge Function 에러
  function_id?: string
  function_name?: string
  error?: {
    message: string
    stack?: string
  }
  // Security/Performance alerts
  alert_type?: 'security' | 'performance' | 'edge_function' | 'database'
  project_ref?: string
  details?: Record<string, unknown>
}

webhooksRouter.post('/supabase', async (req: Request, res: Response) => {
  try {
    // 서명 검증
    const signature = req.headers['x-supabase-signature'] as string
    if (!verifySupabaseSignature(req.body, signature)) {
      console.warn('[Webhook] Supabase signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const payload = req.body as SupabaseAlertPayload

    // DB 마이그레이션은 무시
    if (payload.type === 'migration' || payload.table === 'migrations') {
      return res.status(200).json({ message: 'Migration event ignored' })
    }

    // Alert 타입 결정
    let severity: AlertSeverity = 'warning'
    let title = 'Supabase Alert'
    let message = ''
    const projectRef = payload.project_ref || payload.record?.project_ref || 'unknown'

    if (payload.alert_type === 'security') {
      severity = 'critical'
      title = `Supabase Security Alert: ${projectRef}`
      message = JSON.stringify(payload.details || {})
    } else if (payload.alert_type === 'performance') {
      severity = 'warning'
      title = `Supabase Performance Alert: ${projectRef}`
      message = JSON.stringify(payload.details || {})
    } else if (payload.function_name || payload.alert_type === 'edge_function') {
      severity = 'critical'
      title = `Supabase Edge Function 에러: ${payload.function_name || 'Unknown'}`
      message = payload.error?.message || 'Edge Function error'
    } else if (payload.record) {
      severity = (payload.record.severity as AlertSeverity) || 'warning'
      title = `Supabase Alert: ${payload.record.name}`
      message = payload.record.message
    }

    const alertId = await createAlert({
      source: 'supabase',
      severity,
      projectId: projectRef,
      projectName: projectRef,
      title,
      message,
      metadata: {
        alertType: payload.alert_type,
        functionId: payload.function_id,
        functionName: payload.function_name,
        error: payload.error,
        details: payload.details,
        record: payload.record,
      },
      externalUrl: `https://supabase.com/dashboard/project/${projectRef}`,
    })

    console.log(`[Webhook] Supabase alert created: ${alertId} for ${projectRef}`)
    res.status(200).json({ success: true, alertId })
  } catch (error) {
    console.error('[Webhook] Supabase webhook error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// =============================================
// Custom Webhook (Generic)
// =============================================

interface CustomWebhookPayload {
  source?: string
  severity?: AlertSeverity
  projectId: string
  projectName: string
  title: string
  message: string
  metadata?: Record<string, unknown>
  externalUrl?: string
}

webhooksRouter.post('/custom/:configId?', async (req: Request, res: Response) => {
  try {
    const { configId } = req.params
    const payload = req.body as CustomWebhookPayload

    // configId가 있으면 해당 설정의 시크릿으로 검증
    if (configId) {
      const sqlite = getSqlite()
      const config = sqlite.prepare(
        'SELECT * FROM webhook_configs WHERE id = ?'
      ).get(configId) as { secret: string } | undefined

      if (!config) {
        return res.status(404).json({ error: 'Webhook config not found' })
      }

      const signature = req.headers['x-webhook-signature'] as string
      // TODO: 커스텀 시크릿 검증 구현
    }

    // 필수 필드 검증
    if (!payload.projectId || !payload.title) {
      return res.status(400).json({ error: 'Missing required fields: projectId, title' })
    }

    const alertId = await createAlert({
      source: 'custom',
      severity: payload.severity || 'info',
      projectId: payload.projectId,
      projectName: payload.projectName || payload.projectId,
      title: payload.title,
      message: payload.message || '',
      metadata: payload.metadata || {},
      externalUrl: payload.externalUrl,
    })

    console.log(`[Webhook] Custom alert created: ${alertId}`)
    res.status(200).json({ success: true, alertId })
  } catch (error) {
    console.error('[Webhook] Custom webhook error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { getProjectGroup }
