/**
 * Alerts Router (Simplified)
 *
 * 간소화된 Alert System API 라우터
 * - GitHub Actions 실패 알림 조회
 * - Alert 기본 CRUD
 * - 프로젝트별 Alert 필터링
 */

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getSqlite } from '../tasks/db/client.js'
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
import { getProjectById } from '../config.js'
import { encrypt, safeDecrypt, maskUrl, generateSecret } from '../utils/crypto.js'
import { sendTestNotification } from '../services/slackNotifier.js'

// WebSocket broadcast 함수 (app.ts에서 주입)
let broadcastAlert: ((alert: unknown) => void) | null = null

export function setBroadcastAlert(fn: (alert: unknown) => void): void {
  broadcastAlert = fn
}

export const alertsRouter = Router()

// =============================================
// Helper Functions
// =============================================

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

// =============================================
// Alert CRUD Endpoints
// =============================================

// GET /alerts - List alerts
alertsRouter.get('/', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { source, severity, status, projectId, limit = '50', offset = '0' } = req.query
    const now = Date.now()

    let whereClause = 'WHERE expires_at > ?'
    const params: (string | number | null)[] = [now]

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

// GET /dashboard-stats - Get dashboard stats
alertsRouter.get('/dashboard-stats', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayAlerts = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE created_at >= ?
    `).get(todayStart.getTime()) as { count: number }

    const pendingAlerts = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE status = 'pending' AND expires_at > ?
    `).get(now) as { count: number }

    const totalLast7Days = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE created_at >= ?
    `).get(sevenDaysAgo) as { count: number }

    const resolvedLast7Days = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE status = 'resolved' AND created_at >= ?
    `).get(sevenDaysAgo) as { count: number }

    const resolutionRate = totalLast7Days.count > 0
      ? Math.round((resolvedLast7Days.count / totalLast7Days.count) * 100)
      : 0

    const criticalToday = sqlite.prepare(`
      SELECT COUNT(*) as count FROM alerts WHERE severity = 'critical' AND created_at >= ?
    `).get(todayStart.getTime()) as { count: number }

    res.json({
      success: true,
      data: {
        todayAlerts: todayAlerts.count,
        pendingAlerts: pendingAlerts.count,
        resolutionRate,
        criticalToday: criticalToday.count,
      },
    })
  } catch (error) {
    console.error('Error getting dashboard stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get dashboard stats' })
  }
})

// GET /alerts/:id - Get single alert (UUID format only)
alertsRouter.get('/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', async (req, res) => {
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

// PATCH /alerts/:id - Update alert status (UUID format only)
alertsRouter.patch('/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', async (req, res) => {
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
    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Error updating alert:', error)
    res.status(500).json({ success: false, error: 'Failed to update alert' })
  }
})

// POST /alerts/:id/ignore - Mark alert as ignored (UUID format only)
alertsRouter.post('/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/ignore', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const alertId = req.params.id
    const now = Date.now()

    sqlite.prepare(`
      UPDATE alerts SET status = 'ignored', updated_at = ?, resolved_at = ? WHERE id = ?
    `).run(now, now, alertId)

    createActivityLog(alertId, 'user', 'alert.ignored', 'Alert marked as ignored')

    const alert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Error ignoring alert:', error)
    res.status(500).json({ success: false, error: 'Failed to ignore alert' })
  }
})

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
// GitHub Actions Poller Endpoints
// =============================================

// projectId로 실제 경로를 조회하는 헬퍼 함수
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

// POST /github/sync - Sync GitHub Actions failures for a repository
alertsRouter.post('/github/sync', async (req, res) => {
  try {
    const { repo, limit = 20, projectId } = req.body

    let targetRepo = repo
    if (!targetRepo) {
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
      const config = getPollerConfig()
      targetRepos = config.repos

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
    res.json({ success: true, message: 'Poller started', isRunning: isPollerRunning() })
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
    res.json({ success: true, message: 'Poller stopped', isRunning: isPollerRunning() })
  } catch (error) {
    console.error('Error stopping poller:', error)
    res.status(500).json({ success: false, error: 'Failed to stop poller' })
  }
})

// =============================================
// Notification Config Endpoints
// =============================================

// GET /notification-config - 알림 설정 조회
alertsRouter.get('/notification-config', async (_req, res) => {
  try {
    const sqlite = getSqlite()

    // 기본 설정 생성 (없으면)
    const existing = sqlite.prepare('SELECT * FROM notification_config WHERE id = ?').get('default')
    if (!existing) {
      const now = Date.now()
      sqlite.prepare(`
        INSERT INTO notification_config (id, slack_enabled, rule_on_critical, rule_on_autofix, rule_on_all, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('default', 0, 1, 1, 0, now, now)
    }

    const config = sqlite.prepare('SELECT * FROM notification_config WHERE id = ?').get('default') as {
      id: string
      slack_webhook_url: string | null
      slack_channel: string | null
      slack_enabled: number
      rule_on_critical: number
      rule_on_autofix: number
      rule_on_all: number
      created_at: number
      updated_at: number
    }

    // 프론트엔드가 기대하는 중첩 형식으로 변환
    res.json({
      success: true,
      data: {
        slack: {
          webhookUrl: config.slack_webhook_url ? maskUrl(safeDecrypt(config.slack_webhook_url)) : undefined,
          channel: config.slack_channel || undefined,
          enabled: Boolean(config.slack_enabled),
        },
        rules: {
          onCritical: Boolean(config.rule_on_critical),
          onAutofix: Boolean(config.rule_on_autofix),
          onAll: Boolean(config.rule_on_all),
        },
      },
    })
  } catch (error) {
    console.error('Error getting notification config:', error)
    res.status(500).json({ success: false, error: 'Failed to get notification config' })
  }
})

// PATCH /notification-config - 알림 설정 수정
// 프론트엔드 형식: { slack: { webhookUrl, channel, enabled }, rules: { onCritical, onAutofix, onAll } }
alertsRouter.patch('/notification-config', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { slack, rules } = req.body as {
      slack?: { webhookUrl?: string; channel?: string; enabled?: boolean }
      rules?: { onCritical?: boolean; onAutofix?: boolean; onAll?: boolean }
    }
    const now = Date.now()

    // 현재 설정 조회/생성
    const existing = sqlite.prepare('SELECT id FROM notification_config WHERE id = ?').get('default')
    if (!existing) {
      sqlite.prepare(`
        INSERT INTO notification_config (id, slack_enabled, rule_on_critical, rule_on_autofix, rule_on_all, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('default', 0, 1, 1, 0, now, now)
    }

    const updates: string[] = []
    const params: (string | number | null)[] = []

    // Slack 설정
    if (slack?.webhookUrl !== undefined) {
      updates.push('slack_webhook_url = ?')
      params.push(slack.webhookUrl ? encrypt(slack.webhookUrl) : null)
    }
    if (slack?.channel !== undefined) {
      updates.push('slack_channel = ?')
      params.push(slack.channel || null)
    }
    if (slack?.enabled !== undefined) {
      updates.push('slack_enabled = ?')
      params.push(slack.enabled ? 1 : 0)
    }

    // 알림 규칙
    if (rules?.onCritical !== undefined) {
      updates.push('rule_on_critical = ?')
      params.push(rules.onCritical ? 1 : 0)
    }
    if (rules?.onAutofix !== undefined) {
      updates.push('rule_on_autofix = ?')
      params.push(rules.onAutofix ? 1 : 0)
    }
    if (rules?.onAll !== undefined) {
      updates.push('rule_on_all = ?')
      params.push(rules.onAll ? 1 : 0)
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(now)
      params.push('default')

      sqlite.prepare(`
        UPDATE notification_config SET ${updates.join(', ')} WHERE id = ?
      `).run(...params)

      createActivityLog(null, 'user', 'notification_config.updated', 'Notification config updated')
    }

    res.json({ success: true, message: 'Notification config updated' })
  } catch (error) {
    console.error('Error updating notification config:', error)
    res.status(500).json({ success: false, error: 'Failed to update notification config' })
  }
})

// POST /notification-config/test - Slack 테스트 알림 발송
alertsRouter.post('/notification-config/test', async (req, res) => {
  try {
    const { webhook_url } = req.body

    let url = webhook_url

    // webhook_url이 없으면 저장된 URL 사용
    if (!url) {
      const sqlite = getSqlite()
      const config = sqlite.prepare('SELECT slack_webhook_url FROM notification_config WHERE id = ?').get('default') as {
        slack_webhook_url: string | null
      } | undefined

      if (!config?.slack_webhook_url) {
        return res.status(400).json({ success: false, error: 'No webhook URL configured' })
      }

      url = safeDecrypt(config.slack_webhook_url)
    }

    const result = await sendTestNotification(url)

    if (result.success) {
      createActivityLog(null, 'user', 'notification.test', 'Test notification sent successfully')
      res.json({ success: true, message: 'Test notification sent' })
    } else {
      res.status(400).json({ success: false, error: result.error })
    }
  } catch (error) {
    console.error('Error sending test notification:', error)
    res.status(500).json({ success: false, error: 'Failed to send test notification' })
  }
})

// =============================================
// Webhook Config CRUD Endpoints
// =============================================

// GET /webhook-configs - Webhook 설정 목록 조회
alertsRouter.get('/webhook-configs', async (_req, res) => {
  try {
    const sqlite = getSqlite()
    const configs = sqlite.prepare(`
      SELECT id, name, source, endpoint_path, enabled, created_at, updated_at
      FROM webhook_configs
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string
      name: string
      source: string
      endpoint_path: string
      enabled: number
      created_at: number
      updated_at: number
    }>

    res.json({
      success: true,
      data: configs.map(c => ({
        id: c.id,
        name: c.name,
        source: c.source,
        endpoint: c.endpoint_path, // frontend expects 'endpoint'
        enabled: Boolean(c.enabled),
        created_at: c.created_at,
        updated_at: c.updated_at,
        // 시크릿은 노출하지 않음
        has_secret: true,
      })),
    })
  } catch (error) {
    console.error('Error getting webhook configs:', error)
    res.status(500).json({ success: false, error: 'Failed to get webhook configs' })
  }
})

// POST /webhook-configs - 새 Webhook 설정 생성
alertsRouter.post('/webhook-configs', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { name, source, project_filter } = req.body

    if (!name || !source) {
      return res.status(400).json({ success: false, error: 'name and source are required' })
    }

    const id = randomUUID()
    const secret = generateSecret()
    const endpointPath = `/api/alerts/webhooks/custom/${id}`
    const now = Date.now()

    sqlite.prepare(`
      INSERT INTO webhook_configs (id, name, source, secret, endpoint_path, project_filter, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      source,
      encrypt(secret),
      endpointPath,
      project_filter ? JSON.stringify(project_filter) : null,
      1,
      now,
      now
    )

    createActivityLog(null, 'user', 'webhook_config.created', `Webhook config "${name}" created`)

    res.json({
      success: true,
      data: {
        id,
        name,
        source,
        endpoint: endpointPath, // frontend expects 'endpoint'
        secret, // 생성 시에만 시크릿 반환
        enabled: true,
      },
    })
  } catch (error) {
    console.error('Error creating webhook config:', error)
    res.status(500).json({ success: false, error: 'Failed to create webhook config' })
  }
})

// PATCH /webhook-configs/:id - Webhook 설정 수정
alertsRouter.patch('/webhook-configs/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { id } = req.params
    const { name, source, project_filter, enabled } = req.body

    const existing = sqlite.prepare('SELECT * FROM webhook_configs WHERE id = ?').get(id)
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Webhook config not found' })
    }

    const updates: string[] = []
    const params: (string | number | null)[] = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }

    if (source !== undefined) {
      updates.push('source = ?')
      params.push(source)
    }

    if (project_filter !== undefined) {
      updates.push('project_filter = ?')
      params.push(project_filter ? JSON.stringify(project_filter) : null)
    }

    if (enabled !== undefined) {
      updates.push('enabled = ?')
      params.push(enabled ? 1 : 0)
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(Date.now())
      params.push(id)

      sqlite.prepare(`
        UPDATE webhook_configs SET ${updates.join(', ')} WHERE id = ?
      `).run(...params)

      createActivityLog(null, 'user', 'webhook_config.updated', `Webhook config "${id}" updated`)
    }

    res.json({ success: true, message: 'Webhook config updated' })
  } catch (error) {
    console.error('Error updating webhook config:', error)
    res.status(500).json({ success: false, error: 'Failed to update webhook config' })
  }
})

// DELETE /webhook-configs/:id - Webhook 설정 삭제
alertsRouter.delete('/webhook-configs/:id', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { id } = req.params

    const existing = sqlite.prepare('SELECT name FROM webhook_configs WHERE id = ?').get(id) as { name: string } | undefined
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Webhook config not found' })
    }

    sqlite.prepare('DELETE FROM webhook_configs WHERE id = ?').run(id)
    createActivityLog(null, 'user', 'webhook_config.deleted', `Webhook config "${existing.name}" deleted`)

    res.json({ success: true, message: 'Webhook config deleted' })
  } catch (error) {
    console.error('Error deleting webhook config:', error)
    res.status(500).json({ success: false, error: 'Failed to delete webhook config' })
  }
})

// POST /webhook-configs/:id/regenerate-secret - 시크릿 재생성
alertsRouter.post('/webhook-configs/:id/regenerate-secret', async (req, res) => {
  try {
    const sqlite = getSqlite()
    const { id } = req.params

    const existing = sqlite.prepare('SELECT name FROM webhook_configs WHERE id = ?').get(id) as { name: string } | undefined
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Webhook config not found' })
    }

    const newSecret = generateSecret()

    sqlite.prepare(`
      UPDATE webhook_configs SET secret = ?, updated_at = ? WHERE id = ?
    `).run(encrypt(newSecret), Date.now(), id)

    createActivityLog(null, 'user', 'webhook_config.secret_regenerated', `Webhook config "${existing.name}" secret regenerated`)

    res.json({
      success: true,
      data: {
        secret: newSecret, // 재생성 시에만 반환
      },
    })
  } catch (error) {
    console.error('Error regenerating webhook secret:', error)
    res.status(500).json({ success: false, error: 'Failed to regenerate webhook secret' })
  }
})
