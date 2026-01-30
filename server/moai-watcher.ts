/**
 * MoAI SPEC Watcher
 * .moai/specs/ 디렉토리 변경 감지 후 DB 동기화 및 WebSocket 알림
 */

import chokidar from 'chokidar'
import { join } from 'path'
import type { WSEvent } from './websocket.js'
import { broadcast } from './websocket.js'
import { scanMoaiSpecs } from './flow-sync.js'

let moaiWatcher: ReturnType<typeof chokidar.watch> | null = null
let currentProjectPath: string | null = null
let currentProjectId: string | null = null

// Debounce timer to prevent multiple syncs for rapid file changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_DELAY = 500 // ms

export function startMoaiWatcher(projectPath: string, projectId: string) {
  if (moaiWatcher) {
    console.log('[MoAI Watcher] Already watching, restarting with new path...')
    stopMoaiWatcher()
  }

  currentProjectPath = projectPath
  currentProjectId = projectId

  const specsDir = join(projectPath, '.moai', 'specs')

  moaiWatcher = chokidar.watch(specsDir, {
    ignoreInitial: true,
    persistent: true,
    usePolling: true,
    interval: 300,
    depth: 2,
  })

  // Handle file changes with debouncing
  const handleFileChange = async (filePath: string, eventType: string) => {
    // Only process spec.md, plan.md, acceptance.md files
    if (!filePath.match(/\/(spec|plan|acceptance)\.md$/)) return

    console.log(`[MoAI Watcher] File ${eventType}: ${filePath}`)

    // Debounce to prevent multiple syncs
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(async () => {
      try {
        const result = await scanMoaiSpecs(projectPath, projectId)
        console.log(
          `[MoAI Watcher] Synced: processed=${result.specsProcessed}, created=${result.totalCreated}, updated=${result.totalUpdated}`
        )

        // Broadcast WebSocket event to clients
        const event: WSEvent = {
          type: 'spec:synced' as const,
          payload: {
            projectPath,
            projectId,
            specsProcessed: result.specsProcessed,
            created: result.totalCreated,
            updated: result.totalUpdated,
          },
          timestamp: Date.now(),
        }

        broadcast(event)
      } catch (error) {
        console.error(`[MoAI Watcher] Sync error:`, error)
      }
    }, DEBOUNCE_DELAY)
  }

  moaiWatcher.on('change', (filePath) => handleFileChange(filePath, 'changed'))
  moaiWatcher.on('add', (filePath) => handleFileChange(filePath, 'added'))
  moaiWatcher.on('unlink', (filePath) => handleFileChange(filePath, 'deleted'))

  // Handle new SPEC directory creation
  moaiWatcher.on('addDir', async (dirPath) => {
    if (!dirPath.match(/\.moai\/specs\/SPEC-[A-Z0-9-]+$/)) return

    console.log(`[MoAI Watcher] New SPEC directory: ${dirPath}`)

    // Wait a bit for files to be created
    setTimeout(async () => {
      try {
        const result = await scanMoaiSpecs(projectPath, projectId)
        console.log(`[MoAI Watcher] New SPEC synced: created=${result.totalCreated}`)

        const event: WSEvent = {
          type: 'spec:synced' as const,
          payload: {
            projectPath,
            projectId,
            specsProcessed: result.specsProcessed,
            created: result.totalCreated,
            updated: result.totalUpdated,
          },
          timestamp: Date.now(),
        }

        broadcast(event)
      } catch (error) {
        console.error(`[MoAI Watcher] New SPEC sync error:`, error)
      }
    }, 1000) // Wait 1 second for files to be written
  })

  moaiWatcher.on('error', (error) => {
    console.error('[MoAI Watcher] Error:', error)
  })

  moaiWatcher.on('ready', () => {
    console.log(`[MoAI Watcher] Ready, watching: ${specsDir}`)
  })

  console.log(`[MoAI Watcher] Started watching .moai/specs in: ${projectPath}`)
}

export function stopMoaiWatcher() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  if (moaiWatcher) {
    moaiWatcher.close()
    moaiWatcher = null
    currentProjectPath = null
    currentProjectId = null
    console.log('[MoAI Watcher] Stopped')
  }
}

export function getMoaiWatcherStatus() {
  return {
    watching: moaiWatcher !== null,
    projectPath: currentProjectPath,
    projectId: currentProjectId,
  }
}
