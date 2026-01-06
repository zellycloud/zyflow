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

// POST /alerts/:id/ignore - Mark alert as ignored
alertsRouter.post('/:id/ignore', async (req, res) => {
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
