/**
 * Remote File Watcher for SSH projects
 * 원격 프로젝트의 tasks.md 파일 변경을 폴링으로 감지하고 DB 동기화 및 WebSocket 알림
 */

import { join } from 'path'
import type { WSEvent } from './websocket.js'
import { broadcast } from './websocket.js'
import { syncRemoteChangeTasksForProject } from './sync-tasks.js'

// Polling intervals (ms)
const POLL_INTERVAL_MIN = 10_000     // 10 seconds (burst mode)
const POLL_INTERVAL_DEFAULT = 30_000 // 30 seconds (normal mode)
const POLL_INTERVAL_MAX = 60_000     // 60 seconds (idle mode)
const BURST_MODE_DURATION = 120_000  // 2 minutes in burst mode after change detected
const IDLE_THRESHOLD = 300_000       // 5 minutes without changes -> idle mode

interface WatchedProject {
  projectId: string
  projectPath: string
  serverId: string
  mtimeCache: Map<string, number>  // changeId -> mtime (ms)
  pollInterval: number
  timer: NodeJS.Timeout | null
  lastChangeAt: number
  lastPollAt: number
  errorCount: number
}

const watchedProjects = new Map<string, WatchedProject>()

// Remote plugin functions (loaded dynamically)
let remotePlugin: {
  getRemoteServerById: (serverId: string) => Promise<unknown>
  listDirectory: (server: unknown, path: string) => Promise<{ entries: Array<{ name: string; type: string }> }>
  readRemoteFile: (server: unknown, path: string) => Promise<string>
  getSFTP: (server: unknown) => Promise<{ stat: (path: string) => Promise<{ mtime: number }> }>
} | null = null

async function loadRemotePlugin() {
  if (remotePlugin) return remotePlugin

  try {
    const plugin = await import('@zyflow/remote-plugin')
    remotePlugin = {
      getRemoteServerById: plugin.getRemoteServerById,
      listDirectory: plugin.listDirectory,
      readRemoteFile: plugin.readRemoteFile,
      getSFTP: plugin.getSFTP,
    }
    return remotePlugin
  } catch {
    console.error('[RemoteWatcher] Remote plugin not installed')
    return null
  }
}

/**
 * Start watching a remote project for tasks.md changes
 */
export async function startRemoteWatcher(
  project: { id: string; path: string },
  serverId: string
): Promise<void> {
  // Stop existing watcher for this project if any
  if (watchedProjects.has(project.id)) {
    stopRemoteWatcher(project.id)
  }

  const plugin = await loadRemotePlugin()
  if (!plugin) {
    console.log('[RemoteWatcher] Cannot start - remote plugin not available')
    return
  }

  const state: WatchedProject = {
    projectId: project.id,
    projectPath: project.path,
    serverId,
    mtimeCache: new Map(),
    pollInterval: POLL_INTERVAL_DEFAULT,
    timer: null,
    lastChangeAt: 0,
    lastPollAt: 0,
    errorCount: 0,
  }

  watchedProjects.set(project.id, state)

  console.log(`[RemoteWatcher] Started watching project: ${project.id}`)

  // Start first poll immediately
  await pollRemoteChanges(state)

  // Schedule next poll
  scheduleNextPoll(state)
}

/**
 * Stop watching a remote project
 */
export function stopRemoteWatcher(projectId: string): void {
  const state = watchedProjects.get(projectId)
  if (state) {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }
    watchedProjects.delete(projectId)
    console.log(`[RemoteWatcher] Stopped watching project: ${projectId}`)
  }
}

/**
 * Stop all remote watchers
 */
export function stopAllRemoteWatchers(): void {
  for (const [projectId] of watchedProjects) {
    stopRemoteWatcher(projectId)
  }
  console.log('[RemoteWatcher] All watchers stopped')
}

/**
 * Get status of all remote watchers
 */
export function getRemoteWatcherStatus(): Array<{
  projectId: string
  projectPath: string
  serverId: string
  pollInterval: number
  lastPollAt: number
  lastChangeAt: number
  errorCount: number
  watchedChanges: number
}> {
  return Array.from(watchedProjects.values()).map(state => ({
    projectId: state.projectId,
    projectPath: state.projectPath,
    serverId: state.serverId,
    pollInterval: state.pollInterval,
    lastPollAt: state.lastPollAt,
    lastChangeAt: state.lastChangeAt,
    errorCount: state.errorCount,
    watchedChanges: state.mtimeCache.size,
  }))
}

/**
 * Schedule the next poll
 */
function scheduleNextPoll(state: WatchedProject): void {
  if (state.timer) {
    clearTimeout(state.timer)
  }

  state.timer = setTimeout(async () => {
    await pollRemoteChanges(state)
    scheduleNextPoll(state)
  }, state.pollInterval)
}

/**
 * Adjust poll interval based on activity
 */
function adjustPollInterval(state: WatchedProject, changesDetected: boolean): void {
  const now = Date.now()

  if (changesDetected) {
    // Enter burst mode
    state.pollInterval = POLL_INTERVAL_MIN
    state.lastChangeAt = now
  } else if (state.lastChangeAt > 0 && now - state.lastChangeAt < BURST_MODE_DURATION) {
    // Stay in burst mode
    state.pollInterval = POLL_INTERVAL_MIN
  } else if (state.lastChangeAt > 0 && now - state.lastChangeAt > IDLE_THRESHOLD) {
    // Enter idle mode
    state.pollInterval = POLL_INTERVAL_MAX
  } else {
    // Normal mode
    state.pollInterval = POLL_INTERVAL_DEFAULT
  }
}

/**
 * Main polling logic - check remote tasks.md files for changes
 */
async function pollRemoteChanges(state: WatchedProject): Promise<void> {
  const plugin = await loadRemotePlugin()
  if (!plugin) return

  state.lastPollAt = Date.now()

  try {
    // Get SSH server connection
    const server = await plugin.getRemoteServerById(state.serverId)
    if (!server) {
      throw new Error(`Server not found: ${state.serverId}`)
    }

    // List change directories
    const changesDir = join(state.projectPath, 'openspec/changes')
    let listing: { entries: Array<{ name: string; type: string }> }

    try {
      listing = await plugin.listDirectory(server, changesDir)
    } catch {
      // Directory might not exist yet
      return
    }

    let changesDetected = false

    // Get SFTP for stat operations
    const sftp = await plugin.getSFTP(server)

    for (const entry of listing.entries) {
      if (entry.type !== 'directory' || entry.name === 'archive') continue

      const changeId = entry.name
      const tasksPath = join(changesDir, changeId, 'tasks.md')

      try {
        // Check file mtime using SFTP stat
        let currentMtime: number

        try {
          const stat = await sftp.stat(tasksPath)
          currentMtime = stat.mtime * 1000 // Convert to ms
        } catch {
          continue // File doesn't exist
        }

        const cachedMtime = state.mtimeCache.get(changeId)

        if (cachedMtime === undefined) {
          // First time seeing this file - just cache it
          state.mtimeCache.set(changeId, currentMtime)
        } else if (currentMtime !== cachedMtime) {
          // File changed!
          console.log(`[RemoteWatcher] Detected change in ${changeId}`)
          changesDetected = true

          // Update cache
          state.mtimeCache.set(changeId, currentMtime)

          // Sync to database
          try {
            const result = await syncRemoteChangeTasksForProject(
              changeId,
              state.projectPath,
              server,
              state.projectId
            )

            console.log(`[RemoteWatcher] Synced ${changeId}: created=${result.tasksCreated}, updated=${result.tasksUpdated}`)

            // Broadcast WebSocket event
            const event: WSEvent = {
              type: 'change:synced' as const,
              payload: {
                changeId,
                projectPath: state.projectPath,
                tasksCreated: result.tasksCreated,
                tasksUpdated: result.tasksUpdated,
                tasksArchived: 0,
              },
              timestamp: Date.now(),
            }

            broadcast(event)
          } catch (syncError) {
            console.error(`[RemoteWatcher] Sync error for ${changeId}:`, syncError)
          }
        }
      } catch (fileError) {
        // Individual file error - continue with others
        // Don't log to avoid spam for missing files
      }
    }

    // Reset error count on successful poll
    state.errorCount = 0

    // Adjust interval based on activity
    adjustPollInterval(state, changesDetected)

  } catch (error) {
    state.errorCount++
    const backoff = Math.min(5000 * Math.pow(2, state.errorCount), 60000)
    console.error(`[RemoteWatcher] Poll error (retry in ${backoff}ms):`, error)
    state.pollInterval = backoff
  }
}
