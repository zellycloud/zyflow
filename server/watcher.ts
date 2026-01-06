/**
 * File Watcher for tasks.md
 * tasks.md 파일 변경 감지 후 DB 동기화 및 WebSocket 알림
 */

import chokidar from 'chokidar'
import { join } from 'path'
import type { WSEvent } from './websocket.js'
import { broadcast } from './websocket.js'
import { syncChangeTasksForProject } from './sync-tasks.js'

let watcher: ReturnType<typeof chokidar.watch> | null = null
let currentProjectPath: string | null = null
let currentProjectId: string | null = null

export function startTasksWatcher(projectPath: string, projectId?: string) {
  if (watcher) {
    console.log('[Watcher] Already watching, restarting with new path...')
    stopTasksWatcher()
  }

  currentProjectPath = projectPath
  currentProjectId = projectId || null

  // 디렉토리를 직접 감시 (모든 파일)
  const changesDir = join(projectPath, 'openspec/changes')

  watcher = chokidar.watch(changesDir, {
    ignoreInitial: true,
    persistent: true,
    usePolling: true,
    interval: 300,
    depth: 2,
  })

  watcher.on('change', async (filePath) => {
    // tasks.md 파일만 처리
    if (!filePath.endsWith('tasks.md')) return

    console.log(`[Watcher] File changed: ${filePath}`)

    const match = filePath.match(/openspec\/changes\/([^/]+)\/tasks\.md/)
    if (!match) return

    const changeId = match[1]

    try {
      // DB에 동기화
      const result = await syncChangeTasksForProject(changeId, projectPath, currentProjectId || undefined)
      console.log(`[Watcher] Synced ${changeId}: created=${result.tasksCreated}, updated=${result.tasksUpdated}, archived=${result.tasksArchived}`)

      // WebSocket으로 클라이언트에 알림
      const event: WSEvent = {
        type: 'change:synced' as const,
        payload: {
          changeId,
          projectPath,
          tasksCreated: result.tasksCreated,
          tasksUpdated: result.tasksUpdated,
          tasksArchived: result.tasksArchived,
        },
        timestamp: Date.now(),
      }

      broadcast(event)
    } catch (error) {
      console.error(`[Watcher] Sync error for ${changeId}:`, error)
    }
  })

  watcher.on('add', async (filePath) => {
    // tasks.md 파일만 처리
    if (!filePath.endsWith('tasks.md')) return

    console.log(`[Watcher] File added: ${filePath}`)

    const match = filePath.match(/openspec\/changes\/([^/]+)\/tasks\.md/)
    if (!match) return

    const changeId = match[1]

    try {
      const result = await syncChangeTasksForProject(changeId, projectPath, currentProjectId || undefined)
      console.log(`[Watcher] Initial sync ${changeId}: created=${result.tasksCreated}`)

      const event: WSEvent = {
        type: 'change:synced' as const,
        payload: {
          changeId,
          projectPath,
          tasksCreated: result.tasksCreated,
          tasksUpdated: result.tasksUpdated,
          tasksArchived: result.tasksArchived,
        },
        timestamp: Date.now(),
      }

      broadcast(event)
    } catch (error) {
      console.error(`[Watcher] Initial sync error for ${changeId}:`, error)
    }
  })

  watcher.on('error', (error) => {
    console.error('[Watcher] Error:', error)
  })

  watcher.on('ready', () => {
    console.log('[Watcher] Ready and watching for changes')
  })

  console.log(`[Watcher] Started watching tasks.md in: ${projectPath}`)
  console.log(`[Watcher] Watching directory: ${changesDir}`)
}

export function stopTasksWatcher() {
  if (watcher) {
    watcher.close()
    watcher = null
    currentProjectPath = null
    currentProjectId = null
    console.log('[Watcher] Stopped')
  }
}

export function getWatcherStatus() {
  return {
    watching: watcher !== null,
    projectPath: currentProjectPath,
    projectId: currentProjectId,
  }
}
