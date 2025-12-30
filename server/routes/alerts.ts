/**
 * Alerts Router
 *
 * Alert System API 라우터
 * - Webhook 수신 엔드포인트
 * - Alert CRUD
 * - Activity Logs
 * - Webhook Config 관리
 * - Notification Config
 */

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSqlite } from '../tasks/db/client.js'
import {
  processAlert,
  triggerAnalysis,
  findSimilarAlerts,
  learnFromResolution,
  getTrends,
  getAdvancedStats,
  createPullRequest,
} from '../services/alertProcessor.js'
import {
  checkGhAuth,
  syncRepoWorkflows,
  syncAllRepos,
  getCurrentRepo,
  getPollerConfig,
  updatePollerConfig,
  startBackgroundPoller,
  stopBackgroundPoller,
  isPollerRunning,
} from '../services/githubActionsPoller.js'
import type {
  AlertSource,
  AlertSeverity,
  AlertStatus,
  AlertMetadata,
  AlertAnalysis,
  AlertResolution,
  RiskAssessment,
  RiskLevel,
  WebhookRules,
} from '../tasks/db/schema.js'
import { getProjectById } from '../config.js'

// WebSocket broadcast 함수 (app.ts에서 주입)
let broadcastAlert: ((alert: unknown) => void) | null = null

export function setBroadcastAlert(fn: (alert: unknown) => void): void {
  broadcastAlert = fn
}

export const alertsRouter = Router()

// =============================================
// Helper Functions
// =============================================

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function generateAlertId(): string {
  return randomUUID()
}

function generateSecret(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
}

function calculateExpiresAt(createdAt: number): number {
  return createdAt + NINETY_DAYS_MS
}

// Activity log 생성 헬퍼
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

// Webhook signature 검증 (GitHub)
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  } catch {
    return false
  }
}

// =============================================
// Webhook Parsers
// =============================================

interface ParsedAlert {
  source: AlertSource
  type: string
  severity: AlertSeverity
  title: string
  externalUrl?: string
  metadata: AlertMetadata
  payload: Record<string, unknown>
}

// GitHub Actions Webhook Parser
function parseGitHubWebhook(payload: Record<string, unknown>): ParsedAlert | null {
  // workflow_run event
  if (payload.workflow_run) {
    const workflowRun = payload.workflow_run as Record<string, unknown>
    const repo = payload.repository as Record<string, unknown>
    const conclusion = workflowRun.conclusion as string | null
    const action = payload.action as string

    // Only process completed workflows
    if (action !== 'completed') return null

    const isFailure = conclusion === 'failure'
    const severity: AlertSeverity = isFailure ? 'critical' : 'info'

    return {
      source: 'github',
      type: `workflow.${conclusion || action}`,
      severity,
      title: `${workflowRun.name} - ${conclusion || action}`,
      externalUrl: workflowRun.html_url as string,
      metadata: {
        repo: (repo.full_name as string) || undefined,
        branch: (workflowRun.head_branch as string) || undefined,
        commit: (workflowRun.head_sha as string) || undefined,
      },
      payload,
    }
  }

  // check_run event
  if (payload.check_run) {
    const checkRun = payload.check_run as Record<string, unknown>
    const repo = payload.repository as Record<string, unknown>
    const conclusion = checkRun.conclusion as string | null
    const action = payload.action as string

    if (action !== 'completed') return null

    const isFailure = conclusion === 'failure'

    return {
      source: 'github',
      type: `check.${conclusion || action}`,
      severity: isFailure ? 'warning' : 'info',
      title: `${checkRun.name} - ${conclusion || action}`,
      externalUrl: checkRun.html_url as string,
      metadata: {
        repo: (repo.full_name as string) || undefined,
      },
      payload,
    }
  }

  return null
}

// Vercel Webhook Parser
function parseVercelWebhook(payload: Record<string, unknown>): ParsedAlert | null {
  const type = payload.type as string
  const deployment = payload.deployment as Record<string, unknown> | undefined

  if (!deployment) return null

  const meta = deployment.meta as Record<string, unknown> | undefined
  const isError = type === 'deployment.error' || type === 'deployment-error'

  return {
    source: 'vercel',
    type: type.replace('-', '.'),
    severity: isError ? 'critical' : 'info',
    title: `Deploy ${deployment.name || 'unknown'} - ${type.replace('deployment.', '').replace('deployment-', '')}`,
    externalUrl: (deployment.inspectorUrl as string) || undefined,
    metadata: {
      repo: (meta?.githubRepo as string) || undefined,
      branch: (meta?.githubBranch as string) || undefined,
      commit: (meta?.githubCommitSha as string) || undefined,
      environment: (deployment.target as string) || undefined,
    },
    payload,
  }
}

// Sentry Webhook Parser
function parseSentryWebhook(payload: Record<string, unknown>): ParsedAlert | null {
  const action = payload.action as string
  const data = payload.data as Record<string, unknown> | undefined

  if (!data?.issue) return null

  const issue = data.issue as Record<string, unknown>
  const project = issue.project as Record<string, unknown> | undefined
  const level = issue.level as string

  const severityMap: Record<string, AlertSeverity> = {
    fatal: 'critical',
    error: 'warning',
    warning: 'info',
    info: 'info',
    debug: 'info',
  }

  return {
    source: 'sentry',
    type: `issue.${action}`,
    severity: severityMap[level] || 'info',
    title: issue.title as string,
    externalUrl: issue.permalink as string,
    metadata: {
      environment: project?.slug as string,
    },
    payload,
  }
}

// Supabase Webhook Parser
function parseSupabaseWebhook(payload: Record<string, unknown>): ParsedAlert | null {
  const type = payload.type as string
  const isError = String(type).includes('error') || String(type).includes('failed')

  return {
    source: 'supabase',
    type,
    severity: isError ? 'warning' : 'info',
    title: (payload.message as string) || type,
    metadata: {
      environment: payload.project_id as string,
    },
    payload,
  }
}

// =============================================
// Webhook Endpoints
// =============================================

// POST /webhooks/github
alertsRouter.post('/webhooks/github', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const payload = req.body
    const signature = req.headers['x-hub-signature-256'] as string

    // Get webhook config for GitHub
    const config = sqlite.prepare(`
      SELECT * FROM webhook_configs WHERE source = 'github' AND enabled = 1 LIMIT 1
    `).get() as { secret?: string } | undefined

    // Verify signature if secret is configured
    if (config?.secret && signature) {
      const rawBody = JSON.stringify(payload)
      if (!verifyGitHubSignature(rawBody, signature, config.secret)) {
        return res.status(401).json({ success: false, error: 'Invalid signature' })
      }
    }

    const parsed = parseGitHubWebhook(payload)
    if (!parsed) {
      return res.json({ success: true, message: 'Event ignored' })
    }

    // Only create alerts for failures
    if (parsed.severity === 'info') {
      return res.json({ success: true, message: 'Success event ignored' })
    }

    const now = Date.now()
    const alertId = generateAlertId()

    sqlite.prepare(`
      INSERT INTO alerts (id, source, type, severity, status, title, external_url, payload, metadata, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      parsed.source,
      parsed.type,
      parsed.severity,
      parsed.title,
      parsed.externalUrl || null,
      JSON.stringify(parsed.payload),
      JSON.stringify(parsed.metadata),
      now,
      now,
      calculateExpiresAt(now)
    )

    createActivityLog(alertId, 'system', 'webhook.received', `GitHub webhook received: ${parsed.type}`, {
      source: 'github',
      type: parsed.type,
    })

    // Alert 조회 후 WebSocket 브로드캐스트
    const newAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    if (broadcastAlert && newAlert) {
      broadcastAlert({ type: 'alert.created', alert: newAlert })
    }

    // 비동기로 Alert 처리 시작 (분석, 위험도 평가, auto-fix 등)
    processAlert(alertId).then(result => {
      // 처리 완료 후 업데이트된 Alert 브로드캐스트
      const updatedAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
      if (broadcastAlert && updatedAlert) {
        broadcastAlert({ type: 'alert.processed', alert: updatedAlert, result })
      }
    }).catch(err => {
      console.error('Error in background alert processing:', err)
    })

    res.json({ success: true, alertId })
  } catch (error) {
    console.error('Error processing GitHub webhook:', error)
    res.status(500).json({ success: false, error: 'Failed to process webhook' })
  }
})

// POST /webhooks/vercel
alertsRouter.post('/webhooks/vercel', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const payload = req.body

    const parsed = parseVercelWebhook(payload)
    if (!parsed) {
      return res.json({ success: true, message: 'Event ignored' })
    }

    // Only create alerts for errors
    if (parsed.severity === 'info') {
      return res.json({ success: true, message: 'Success event ignored' })
    }

    const now = Date.now()
    const alertId = generateAlertId()

    sqlite.prepare(`
      INSERT INTO alerts (id, source, type, severity, status, title, external_url, payload, metadata, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      parsed.source,
      parsed.type,
      parsed.severity,
      parsed.title,
      parsed.externalUrl || null,
      JSON.stringify(parsed.payload),
      JSON.stringify(parsed.metadata),
      now,
      now,
      calculateExpiresAt(now)
    )

    createActivityLog(alertId, 'system', 'webhook.received', `Vercel webhook received: ${parsed.type}`, {
      source: 'vercel',
      type: parsed.type,
    })

    // WebSocket 브로드캐스트 & 백그라운드 처리
    const newAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    if (broadcastAlert && newAlert) {
      broadcastAlert({ type: 'alert.created', alert: newAlert })
    }
    processAlert(alertId).then(result => {
      const updatedAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
      if (broadcastAlert && updatedAlert) {
        broadcastAlert({ type: 'alert.processed', alert: updatedAlert, result })
      }
    }).catch(err => console.error('Error in background alert processing:', err))

    res.json({ success: true, alertId })
  } catch (error) {
    console.error('Error processing Vercel webhook:', error)
    res.status(500).json({ success: false, error: 'Failed to process webhook' })
  }
})

// POST /webhooks/sentry
alertsRouter.post('/webhooks/sentry', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const payload = req.body

    const parsed = parseSentryWebhook(payload)
    if (!parsed) {
      return res.json({ success: true, message: 'Event ignored' })
    }

    const now = Date.now()
    const alertId = generateAlertId()

    sqlite.prepare(`
      INSERT INTO alerts (id, source, type, severity, status, title, external_url, payload, metadata, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      parsed.source,
      parsed.type,
      parsed.severity,
      parsed.title,
      parsed.externalUrl || null,
      JSON.stringify(parsed.payload),
      JSON.stringify(parsed.metadata),
      now,
      now,
      calculateExpiresAt(now)
    )

    createActivityLog(alertId, 'system', 'webhook.received', `Sentry webhook received: ${parsed.type}`, {
      source: 'sentry',
      type: parsed.type,
    })

    // WebSocket 브로드캐스트 & 백그라운드 처리
    const newAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    if (broadcastAlert && newAlert) {
      broadcastAlert({ type: 'alert.created', alert: newAlert })
    }
    processAlert(alertId).then(result => {
      const updatedAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
      if (broadcastAlert && updatedAlert) {
        broadcastAlert({ type: 'alert.processed', alert: updatedAlert, result })
      }
    }).catch(err => console.error('Error in background alert processing:', err))

    res.json({ success: true, alertId })
  } catch (error) {
    console.error('Error processing Sentry webhook:', error)
    res.status(500).json({ success: false, error: 'Failed to process webhook' })
  }
})

// POST /webhooks/supabase
alertsRouter.post('/webhooks/supabase', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const payload = req.body

    const parsed = parseSupabaseWebhook(payload)
    if (!parsed) {
      return res.json({ success: true, message: 'Event ignored' })
    }

    const now = Date.now()
    const alertId = generateAlertId()

    sqlite.prepare(`
      INSERT INTO alerts (id, source, type, severity, status, title, external_url, payload, metadata, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      parsed.source,
      parsed.type,
      parsed.severity,
      parsed.title,
      parsed.externalUrl || null,
      JSON.stringify(parsed.payload),
      JSON.stringify(parsed.metadata),
      now,
      now,
      calculateExpiresAt(now)
    )

    createActivityLog(alertId, 'system', 'webhook.received', `Supabase webhook received: ${parsed.type}`, {
      source: 'supabase',
      type: parsed.type,
    })

    // WebSocket 브로드캐스트 & 백그라운드 처리
    const newAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    if (broadcastAlert && newAlert) {
      broadcastAlert({ type: 'alert.created', alert: newAlert })
    }
    processAlert(alertId).then(result => {
      const updatedAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
      if (broadcastAlert && updatedAlert) {
        broadcastAlert({ type: 'alert.processed', alert: updatedAlert, result })
      }
    }).catch(err => console.error('Error in background alert processing:', err))

    res.json({ success: true, alertId })
  } catch (error) {
    console.error('Error processing Supabase webhook:', error)
    res.status(500).json({ success: false, error: 'Failed to process webhook' })
  }
})

// =============================================
// Alert CRUD Endpoints
// =============================================

// GET /alerts - List alerts
alertsRouter.get('/', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { source, severity, status, projectId, limit = '50', offset = '0' } = req.query

    let whereClause = 'WHERE expires_at > ?'
    const params: (string | number | null)[] = [Date.now()]

    // project_id 필터링 (프로젝트별 알림 분리)
    if (projectId) {
      whereClause += ' AND project_id = ?'
      params.push(projectId as string)
    }

    if (source) {
      whereClause += ' AND source = ?'
      params.push(source as string)
    }
    if (severity) {
      whereClause += ' AND severity = ?'
      params.push(severity as string)
    }
    if (status) {
      whereClause += ' AND status = ?'
      params.push(status as string)
    }

    const countResult = sqlite.prepare(`
      SELECT COUNT(*) as total FROM alerts ${whereClause}
    `).get(...params) as { total: number }

    const alerts = sqlite.prepare(`
      SELECT * FROM alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit as string), parseInt(offset as string))

    res.json({
      success: true,
      data: {
        alerts,
        total: countResult.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    })
  } catch (error) {
    console.error('Error listing alerts:', error)
    res.status(500).json({ success: false, error: 'Failed to list alerts' })
  }
})

// GET /alerts/stats - Get alert statistics
alertsRouter.get('/stats', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const now = Date.now()
    const { projectId } = req.query

    // project_id 필터 조건 생성
    const projectFilter = projectId ? ' AND project_id = ?' : ''
    const params = projectId ? [now, projectId as string] : [now]

    const total = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE expires_at > ?${projectFilter}
    `).get(...params) as { count: number }

    const bySeverity = sqlite.prepare(`
      SELECT severity, COUNT(*) as count FROM alerts WHERE expires_at > ?${projectFilter} GROUP BY severity
    `).all(...params) as { severity: string; count: number }[]

    const bySource = sqlite.prepare(`
      SELECT source, COUNT(*) as count FROM alerts WHERE expires_at > ?${projectFilter} GROUP BY source
    `).all(...params) as { source: string; count: number }[]

    const byStatus = sqlite.prepare(`
      SELECT status, COUNT(*) as count FROM alerts WHERE expires_at > ?${projectFilter} GROUP BY status
    `).all(...params) as { status: string; count: number }[]

    res.json({
      success: true,
      data: {
        total: total.count,
        bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, r.count])),
        bySource: Object.fromEntries(bySource.map(r => [r.source, r.count])),
        byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      },
    })
  } catch (error) {
    console.error('Error getting alert stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get stats' })
  }
})

// =============================================
// Non-parameterized routes (MUST be before /:id to avoid route conflict)
// =============================================

// GET /activities - List activity logs
alertsRouter.get('/activities', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { alertId, actor, limit = '50', offset = '0' } = req.query

    let whereClause = 'WHERE 1=1'
    const params: (string | number)[] = []

    if (alertId) {
      whereClause += ' AND alert_id = ?'
      params.push(alertId as string)
    }
    if (actor) {
      whereClause += ' AND actor = ?'
      params.push(actor as string)
    }

    const activities = sqlite.prepare(`
      SELECT * FROM activity_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit as string), parseInt(offset as string))

    res.json({ success: true, data: activities })
  } catch (error) {
    console.error('Error listing activities:', error)
    res.status(500).json({ success: false, error: 'Failed to list activities' })
  }
})

// GET /trends - Get alert trends data
alertsRouter.get('/trends', async (req, res) => {
  try {
    const { days = '30', source } = req.query
    const trends = getTrends(parseInt(days as string), source as string | undefined)

    res.json({ success: true, data: trends })
  } catch (error) {
    console.error('Error getting trends:', error)
    res.status(500).json({ success: false, error: 'Failed to get trends' })
  }
})

// GET /advanced-stats - Get advanced statistics
alertsRouter.get('/advanced-stats', async (_req, res) => {
  try {
    const stats = getAdvancedStats()
    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Error getting advanced stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get advanced stats' })
  }
})

// GET /patterns - Get learned alert patterns
alertsRouter.get('/patterns', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { source, limit = '20' } = req.query

    let query = 'SELECT * FROM alert_patterns'
    const params: (string | number)[] = []

    if (source) {
      query += ' WHERE source = ?'
      params.push(source as string)
    }

    query += ' ORDER BY resolution_count DESC LIMIT ?'
    params.push(parseInt(limit as string))

    const patterns = sqlite.prepare(query).all(...params)

    res.json({ success: true, data: patterns })
  } catch (error) {
    console.error('Error getting patterns:', error)
    res.status(500).json({ success: false, error: 'Failed to get patterns' })
  }
})

// GET /dashboard-stats - Get dashboard stats (combines multiple stats)
alertsRouter.get('/dashboard-stats', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    // Today's alerts
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayAlerts = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE created_at >= ?
    `).get(todayStart.getTime()) as { count: number }

    // Pending alerts
    const pendingAlerts = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE status = 'pending' AND expires_at > ?
    `).get(now) as { count: number }

    // Resolution rate (last 7 days)
    const totalLast7Days = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE created_at >= ?
    `).get(sevenDaysAgo) as { count: number }
    const resolvedLast7Days = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE status = 'resolved' AND created_at >= ?
    `).get(sevenDaysAgo) as { count: number }
    const resolutionRate = totalLast7Days.count > 0
      ? Math.round((resolvedLast7Days.count / totalLast7Days.count) * 100)
      : 0

    // Auto-fix success rate (last 30 days)
    const autoFixed = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE resolution LIKE '%"type":"auto"%' AND created_at >= ?
    `).get(thirtyDaysAgo) as { count: number }
    const manualFixed = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE status = 'resolved' AND (resolution IS NULL OR resolution NOT LIKE '%"type":"auto"%') AND created_at >= ?
    `).get(thirtyDaysAgo) as { count: number }
    const autoFixRate = (autoFixed.count + manualFixed.count) > 0
      ? Math.round((autoFixed.count / (autoFixed.count + manualFixed.count)) * 100)
      : 0

    // Average resolution time (in hours)
    const avgResTime = sqlite.prepare(`
      SELECT AVG((resolved_at - created_at) / 3600000.0) as avg_hours
      FROM alerts WHERE status = 'resolved' AND resolved_at IS NOT NULL AND created_at >= ?
    `).get(thirtyDaysAgo) as { avg_hours: number | null }

    // Critical alerts today
    const criticalToday = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE severity = 'critical' AND created_at >= ?
    `).get(todayStart.getTime()) as { count: number }

    // Trend comparison (this week vs last week)
    const thisWeekStart = now - 7 * 24 * 60 * 60 * 1000
    const lastWeekStart = now - 14 * 24 * 60 * 60 * 1000
    const thisWeek = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE created_at >= ? AND created_at < ?
    `).get(thisWeekStart, now) as { count: number }
    const lastWeek = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE created_at >= ? AND created_at < ?
    `).get(lastWeekStart, thisWeekStart) as { count: number }
    const weekOverWeekChange = lastWeek.count > 0
      ? Math.round(((thisWeek.count - lastWeek.count) / lastWeek.count) * 100)
      : 0

    res.json({
      success: true,
      data: {
        todayAlerts: todayAlerts.count,
        pendingAlerts: pendingAlerts.count,
        resolutionRate,
        autoFixRate,
        avgResolutionTimeHours: avgResTime.avg_hours ? Math.round(avgResTime.avg_hours * 10) / 10 : null,
        criticalToday: criticalToday.count,
        weekOverWeekChange,
        autoFixedCount: autoFixed.count,
        manualFixedCount: manualFixed.count,
      },
    })
  } catch (error) {
    console.error('Error getting dashboard stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get dashboard stats' })
  }
})

// =============================================
// Parameterized routes (/:id pattern)
// =============================================

// GET /alerts/:id - Get single alert
alertsRouter.get('/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id)

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' })
    }

    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Error getting alert:', error)
    res.status(500).json({ success: false, error: 'Failed to get alert' })
  }
})

// PATCH /alerts/:id - Update alert status
alertsRouter.patch('/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { status } = req.body
    const alertId = req.params.id

    if (!['pending', 'processing', 'resolved', 'ignored'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' })
    }

    const now = Date.now()
    const resolvedAt = status === 'resolved' ? now : null

    sqlite.prepare(`
      UPDATE alerts SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?
    `).run(status, now, resolvedAt, alertId)

    createActivityLog(alertId, 'user', 'status.changed', `Alert status changed to ${status}`)

    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Error updating alert:', error)
    res.status(500).json({ success: false, error: 'Failed to update alert' })
  }
})

// POST /alerts/:id/ignore - Mark alert as ignored
alertsRouter.post('/:id/ignore', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const alertId = req.params.id
    const now = Date.now()

    sqlite.prepare(`
      UPDATE alerts SET status = 'ignored', updated_at = ?, resolved_at = ?,
      resolution = ? WHERE id = ?
    `).run(now, now, JSON.stringify({ type: 'manual', action: 'ignored' }), alertId)

    createActivityLog(alertId, 'user', 'alert.ignored', 'Alert marked as ignored')

    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Error ignoring alert:', error)
    res.status(500).json({ success: false, error: 'Failed to ignore alert' })
  }
})

// POST /alerts/:id/analyze - Trigger manual analysis
alertsRouter.post('/:id/analyze', async (req, res) => {
  try {
    const alertId = req.params.id
    const analysis = await triggerAnalysis(alertId)

    const sqlite = getSqlite()
    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)

    // WebSocket 브로드캐스트
    if (broadcastAlert && alert) {
      broadcastAlert({ type: 'alert.analyzed', alert })
    }

    res.json({ success: true, data: { alert, analysis } })
  } catch (error) {
    console.error('Error analyzing alert:', error)
    res.status(500).json({ success: false, error: 'Failed to analyze alert' })
  }
})

// POST /alerts/:id/process - Trigger full processing workflow
alertsRouter.post('/:id/process', async (req, res) => {
  try {
    const alertId = req.params.id
    const result = await processAlert(alertId)

    const sqlite = getSqlite()
    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)

    // WebSocket 브로드캐스트
    if (broadcastAlert && alert) {
      broadcastAlert({ type: 'alert.processed', alert, result })
    }

    res.json({ success: true, data: { alert, result } })
  } catch (error) {
    console.error('Error processing alert:', error)
    res.status(500).json({ success: false, error: 'Failed to process alert' })
  }
})

// =============================================
// Webhook Config Endpoints
// =============================================

// GET /webhook-configs - List webhook configs
alertsRouter.get('/webhook-configs', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const configs = sqlite.prepare('SELECT * FROM webhook_configs ORDER BY created_at DESC').all()

    // Mask secrets
    const masked = (configs as Array<Record<string, unknown>>).map(c => ({
      ...c,
      secret: c.secret ? '••••••••' : null,
    }))

    res.json({ success: true, data: masked })
  } catch (error) {
    console.error('Error listing webhook configs:', error)
    res.status(500).json({ success: false, error: 'Failed to list webhook configs' })
  }
})

// POST /webhook-configs - Create webhook config
alertsRouter.post('/webhook-configs', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { source, name, rules, projectIds } = req.body

    if (!source || !name) {
      return res.status(400).json({ success: false, error: 'Source and name are required' })
    }

    const id = randomUUID()
    const secret = generateSecret()
    const endpoint = `/api/alerts/webhooks/${source}`
    const now = Date.now()

    sqlite.prepare(`
      INSERT INTO webhook_configs (id, source, name, endpoint, secret, enabled, rules, project_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      source,
      name,
      endpoint,
      secret,
      rules ? JSON.stringify(rules) : null,
      projectIds ? JSON.stringify(projectIds) : null,
      now,
      now
    )

    createActivityLog(null, 'user', 'webhook.created', `Webhook config created for ${source}`)

    res.json({
      success: true,
      data: { id, endpoint, secret },
    })
  } catch (error) {
    console.error('Error creating webhook config:', error)
    res.status(500).json({ success: false, error: 'Failed to create webhook config' })
  }
})

// PATCH /webhook-configs/:id - Update webhook config
alertsRouter.patch('/webhook-configs/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { name, enabled, rules, projectIds } = req.body
    const configId = req.params.id
    const now = Date.now()

    const updates: string[] = []
    const params: (string | number | null)[] = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?')
      params.push(enabled ? 1 : 0)
    }
    if (rules !== undefined) {
      updates.push('rules = ?')
      params.push(JSON.stringify(rules))
    }
    if (projectIds !== undefined) {
      updates.push('project_ids = ?')
      params.push(JSON.stringify(projectIds))
    }

    updates.push('updated_at = ?')
    params.push(now)
    params.push(configId)

    sqlite.prepare(`
      UPDATE webhook_configs SET ${updates.join(', ')} WHERE id = ?
    `).run(...params)

    const config = sqlite.prepare('SELECT * FROM webhook_configs WHERE id = ?').get(configId)
    res.json({ success: true, data: config })
  } catch (error) {
    console.error('Error updating webhook config:', error)
    res.status(500).json({ success: false, error: 'Failed to update webhook config' })
  }
})

// DELETE /webhook-configs/:id - Delete webhook config
alertsRouter.delete('/webhook-configs/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    sqlite.prepare('DELETE FROM webhook_configs WHERE id = ?').run(req.params.id)

    createActivityLog(null, 'user', 'webhook.deleted', 'Webhook config deleted')

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting webhook config:', error)
    res.status(500).json({ success: false, error: 'Failed to delete webhook config' })
  }
})

// POST /webhook-configs/:id/regenerate-secret - Regenerate webhook secret
alertsRouter.post('/webhook-configs/:id/regenerate-secret', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const secret = generateSecret()
    const now = Date.now()

    sqlite.prepare(`
      UPDATE webhook_configs SET secret = ?, updated_at = ? WHERE id = ?
    `).run(secret, now, req.params.id)

    res.json({ success: true, data: { secret } })
  } catch (error) {
    console.error('Error regenerating secret:', error)
    res.status(500).json({ success: false, error: 'Failed to regenerate secret' })
  }
})

// =============================================
// Notification Config Endpoints
// =============================================

// GET /notification-config - Get notification config
alertsRouter.get('/notification-config', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const config = sqlite.prepare("SELECT * FROM notification_config WHERE id = 'default'").get()

    if (!config) {
      return res.json({
        success: true,
        data: {
          slack: { enabled: false },
          rules: { onCritical: true, onAutofix: true, onAll: false },
        },
      })
    }

    const c = config as Record<string, unknown>
    res.json({
      success: true,
      data: {
        slack: {
          webhookUrl: c.slack_webhook_url ? '••••••••' : null,
          channel: c.slack_channel,
          enabled: Boolean(c.slack_enabled),
        },
        rules: {
          onCritical: Boolean(c.rule_on_critical),
          onAutofix: Boolean(c.rule_on_autofix),
          onAll: Boolean(c.rule_on_all),
        },
      },
    })
  } catch (error) {
    console.error('Error getting notification config:', error)
    res.status(500).json({ success: false, error: 'Failed to get notification config' })
  }
})

// PATCH /notification-config - Update notification config
alertsRouter.patch('/notification-config', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { slack, rules } = req.body
    const now = Date.now()

    const updates: string[] = []
    const params: (string | number | null)[] = []

    if (slack !== undefined) {
      if (slack.webhookUrl !== undefined) {
        updates.push('slack_webhook_url = ?')
        params.push(slack.webhookUrl)
      }
      if (slack.channel !== undefined) {
        updates.push('slack_channel = ?')
        params.push(slack.channel)
      }
      if (slack.enabled !== undefined) {
        updates.push('slack_enabled = ?')
        params.push(slack.enabled ? 1 : 0)
      }
    }

    if (rules !== undefined) {
      if (rules.onCritical !== undefined) {
        updates.push('rule_on_critical = ?')
        params.push(rules.onCritical ? 1 : 0)
      }
      if (rules.onAutofix !== undefined) {
        updates.push('rule_on_autofix = ?')
        params.push(rules.onAutofix ? 1 : 0)
      }
      if (rules.onAll !== undefined) {
        updates.push('rule_on_all = ?')
        params.push(rules.onAll ? 1 : 0)
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(now)

      sqlite.prepare(`
        UPDATE notification_config SET ${updates.join(', ')} WHERE id = 'default'
      `).run(...params)
    }

    createActivityLog(null, 'user', 'notification.updated', 'Notification config updated')

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating notification config:', error)
    res.status(500).json({ success: false, error: 'Failed to update notification config' })
  }
})

// POST /notification-config/test - Test Slack notification
alertsRouter.post('/notification-config/test', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const config = sqlite.prepare("SELECT slack_webhook_url FROM notification_config WHERE id = 'default'").get() as { slack_webhook_url?: string } | undefined

    if (!config?.slack_webhook_url) {
      return res.status(400).json({ success: false, error: 'Slack webhook URL not configured' })
    }

    // Send test message to Slack
    const response = await fetch(config.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '🔔 *Zyflow Alert System Test*\n\nThis is a test notification from your Zyflow Alert System. If you see this message, your Slack integration is working correctly!',
      }),
    })

    if (!response.ok) {
      return res.status(500).json({ success: false, error: 'Failed to send Slack message' })
    }

    createActivityLog(null, 'user', 'notification.tested', 'Slack notification test sent')

    res.json({ success: true })
  } catch (error) {
    console.error('Error testing notification:', error)
    res.status(500).json({ success: false, error: 'Failed to test notification' })
  }
})

// =============================================
// Maintenance Endpoints
// =============================================

// POST /cleanup - Delete expired alerts
alertsRouter.post('/cleanup', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const now = Date.now()

    const result = sqlite.prepare('DELETE FROM alerts WHERE expires_at < ?').run(now)

    createActivityLog(null, 'system', 'cleanup.completed', `Deleted ${result.changes} expired alerts`)

    res.json({ success: true, deleted: result.changes })
  } catch (error) {
    console.error('Error cleaning up alerts:', error)
    res.status(500).json({ success: false, error: 'Failed to cleanup' })
  }
})

// =============================================
// Phase 3: Advanced Features Endpoints (/:id dependent routes)
// =============================================

// GET /similar/:id - Get similar alerts for a specific alert
alertsRouter.get('/similar/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id)

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' })
    }

    const similar = findSimilarAlerts(alert as Parameters<typeof findSimilarAlerts>[0])

    res.json({ success: true, data: similar })
  } catch (error) {
    console.error('Error finding similar alerts:', error)
    res.status(500).json({ success: false, error: 'Failed to find similar alerts' })
  }
})

// POST /alerts/:id/create-pr - Create a PR for auto-fix
alertsRouter.post('/:id/create-pr', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { patchContent } = req.body
    const alertId = req.params.id

    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId) as {
      id: string
      source: string
      type: string
      severity: string
      title: string
      metadata?: string
      analysis?: string
    } | undefined

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' })
    }

    const analysis = alert.analysis ? JSON.parse(alert.analysis) : null
    if (!analysis) {
      return res.status(400).json({ success: false, error: 'Alert has not been analyzed yet' })
    }

    const result = await createPullRequest(
      alert as Parameters<typeof createPullRequest>[0],
      analysis,
      patchContent || ''
    )

    if (result.success) {
      // Update alert resolution
      const now = Date.now()
      sqlite.prepare(`
        UPDATE alerts SET
          status = 'resolved',
          resolution = ?,
          resolved_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        JSON.stringify({
          type: 'auto',
          action: 'pr_created',
          prUrl: result.prUrl,
          prNumber: result.prNumber,
        }),
        now,
        now,
        alertId
      )

      createActivityLog(alertId, 'agent', 'pr.created', `PR #${result.prNumber} created`)

      // Learn from resolution
      const updatedAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
      if (updatedAlert) {
        learnFromResolution(updatedAlert as Parameters<typeof learnFromResolution>[0])
      }

      // WebSocket broadcast
      if (broadcastAlert && updatedAlert) {
        broadcastAlert({ type: 'alert.pr_created', alert: updatedAlert, prUrl: result.prUrl })
      }
    }

    res.json({ success: result.success, data: result })
  } catch (error) {
    console.error('Error creating PR:', error)
    res.status(500).json({ success: false, error: 'Failed to create PR' })
  }
})

// PATCH /alerts/:id (extended) - Update alert status with pattern learning
const originalPatchHandler = alertsRouter.stack.find(
  r => r.route?.path === '/:id' && r.route?.methods?.patch
)
if (originalPatchHandler) {
  alertsRouter.stack = alertsRouter.stack.filter(r => r !== originalPatchHandler)
}

alertsRouter.patch('/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { status } = req.body
    const alertId = req.params.id

    if (!['pending', 'processing', 'resolved', 'ignored'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' })
    }

    const now = Date.now()
    const resolvedAt = status === 'resolved' || status === 'ignored' ? now : null

    sqlite.prepare(`
      UPDATE alerts SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?
    `).run(status, now, resolvedAt, alertId)

    createActivityLog(alertId, 'user', 'status.changed', `Alert status changed to ${status}`)

    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)

    // Learn from resolution
    if ((status === 'resolved' || status === 'ignored') && alert) {
      learnFromResolution(alert as Parameters<typeof learnFromResolution>[0])
    }

    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Error updating alert:', error)
    res.status(500).json({ success: false, error: 'Failed to update alert' })
  }
})

// =============================================
// GitHub Actions Poller Endpoints
// =============================================

// GET /github/auth-status - Check gh CLI authentication status
alertsRouter.get('/github/auth-status', async (_req, res) => {
  try {
    const result = await checkGhAuth()
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Error checking gh auth:', error)
    res.status(500).json({ success: false, error: 'Failed to check gh auth' })
  }
})

// projectId로 실제 경로를 조회하는 헬퍼 함수
// config.json에서 프로젝트 정보를 조회하여 정확한 경로 반환
async function getProjectPath(projectId: string): Promise<string | null> {
  if (!projectId) return null
  try {
    const project = await getProjectById(projectId)
    return project?.path || null
  } catch (error) {
    console.error('Error getting project path:', error)
    return null
  }
}

// POST /github/sync - Sync GitHub Actions failures for a repository
alertsRouter.post('/github/sync', async (req, res) => {
  try {
    const { repo, limit = 20, projectId } = req.body

    // repo가 지정되지 않으면 프로젝트 경로 또는 현재 디렉토리의 repo 사용
    let targetRepo = repo
    if (!targetRepo) {
      // projectId가 있으면 해당 프로젝트 경로에서 repo 정보 가져오기
      const projectPath = projectId ? await getProjectPath(projectId) : null
      targetRepo = await getCurrentRepo(projectPath || undefined)
      if (!targetRepo) {
        return res.status(400).json({
          success: false,
          error: 'Repository not specified and could not detect current repository',
        })
      }
    }

    const result = await syncRepoWorkflows(targetRepo, {
      limit,
      projectId,
      broadcastAlert: broadcastAlert || undefined,
    })

    createActivityLog(null, 'user', 'github.synced', `Synced GitHub Actions for ${targetRepo}`, {
      repo: targetRepo,
      projectId,
      newAlerts: result.newAlerts,
      skipped: result.skipped,
    })

    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Error syncing GitHub Actions:', error)
    res.status(500).json({ success: false, error: 'Failed to sync GitHub Actions' })
  }
})

// POST /github/sync-all - Sync GitHub Actions failures for all configured repositories
alertsRouter.post('/github/sync-all', async (req, res) => {
  try {
    const { repos, projectId } = req.body

    let targetRepos = repos
    if (!targetRepos || targetRepos.length === 0) {
      // 폴러 설정에서 repos 가져오기
      const config = getPollerConfig()
      targetRepos = config.repos

      // 여전히 없으면 프로젝트 경로 또는 현재 디렉토리의 repo 사용
      if (!targetRepos || targetRepos.length === 0) {
        const projectPath = projectId ? await getProjectPath(projectId) : null
        const currentRepo = await getCurrentRepo(projectPath || undefined)
        if (currentRepo) {
          targetRepos = [currentRepo]
        } else {
          return res.status(400).json({
            success: false,
            error: 'No repositories configured and could not detect current repository',
          })
        }
      }
    }

    const result = await syncAllRepos(targetRepos, {
      projectId,
      broadcastAlert: broadcastAlert || undefined,
    })

    createActivityLog(null, 'user', 'github.synced_all', `Synced GitHub Actions for ${targetRepos.length} repos`, {
      repos: targetRepos,
      projectId,
      totalNew: result.totalNew,
      totalSkipped: result.totalSkipped,
    })

    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Error syncing all repos:', error)
    res.status(500).json({ success: false, error: 'Failed to sync all repos' })
  }
})

// GET /github/poller-config - Get poller configuration
alertsRouter.get('/github/poller-config', async (_req, res) => {
  try {
    const config = getPollerConfig()
    res.json({
      success: true,
      data: {
        ...config,
        isRunning: isPollerRunning(),
      },
    })
  } catch (error) {
    console.error('Error getting poller config:', error)
    res.status(500).json({ success: false, error: 'Failed to get poller config' })
  }
})

// PATCH /github/poller-config - Update poller configuration
alertsRouter.patch('/github/poller-config', async (req, res) => {
  try {
    const { enabled, intervalMs, repos } = req.body

    updatePollerConfig({
      enabled: enabled !== undefined ? enabled : undefined,
      intervalMs: intervalMs !== undefined ? intervalMs : undefined,
      repos: repos !== undefined ? repos : undefined,
    })

    const config = getPollerConfig()

    // 폴러 상태 업데이트
    if (enabled === true) {
      startBackgroundPoller(broadcastAlert || undefined)
    } else if (enabled === false) {
      stopBackgroundPoller()
    }

    createActivityLog(null, 'user', 'poller.updated', 'GitHub Actions poller config updated', {
      enabled: config.enabled,
      intervalMs: config.intervalMs,
      repoCount: config.repos.length,
    })

    res.json({
      success: true,
      data: {
        ...config,
        isRunning: isPollerRunning(),
      },
    })
  } catch (error) {
    console.error('Error updating poller config:', error)
    res.status(500).json({ success: false, error: 'Failed to update poller config' })
  }
})

// POST /github/poller/start - Start background poller
alertsRouter.post('/github/poller/start', async (_req, res) => {
  try {
    startBackgroundPoller(broadcastAlert || undefined)

    createActivityLog(null, 'user', 'poller.started', 'GitHub Actions poller started')

    res.json({
      success: true,
      message: 'Poller started',
      isRunning: isPollerRunning(),
    })
  } catch (error) {
    console.error('Error starting poller:', error)
    res.status(500).json({ success: false, error: 'Failed to start poller' })
  }
})

// POST /github/poller/stop - Stop background poller
alertsRouter.post('/github/poller/stop', async (_req, res) => {
  try {
    stopBackgroundPoller()

    createActivityLog(null, 'user', 'poller.stopped', 'GitHub Actions poller stopped')

    res.json({
      success: true,
      message: 'Poller stopped',
      isRunning: isPollerRunning(),
    })
  } catch (error) {
    console.error('Error stopping poller:', error)
    res.status(500).json({ success: false, error: 'Failed to stop poller' })
  }
})
