import { app } from './app.js'
import {
  createMultiWatcherManager,
  setGlobalMultiWatcher,
  getGlobalMultiWatcher,
} from './watcher.js'
import { syncChangeTasksForProject } from './sync.js'
import { loadConfig } from './config.js'

const PORT = 3001

// 서버 시작
const server = app.listen(PORT, async () => {
  console.log(`ZyFlow API server running on http://localhost:${PORT}`)

  // Multi-Project Watcher 초기화 - 모든 등록된 프로젝트 감시
  await initMultiWatcher()
})

/**
 * Multi-Project Watcher 초기화
 * 모든 등록된 프로젝트를 동시에 감시
 */
async function initMultiWatcher() {
  try {
    const config = await loadConfig()

    if (config.projects.length === 0) {
      console.log('[MultiWatcher] No projects registered yet')
      return
    }

    // Multi-Watcher Manager 생성
    const multiWatcher = createMultiWatcherManager(
      async (changeId, filePath, projectPath) => {
        console.log(`[Watcher] Syncing ${changeId} due to file change: ${filePath}`)
        try {
          const result = await syncChangeTasksForProject(changeId, projectPath)
          console.log(
            `[Watcher] Sync complete for ${changeId}: ${result.tasksCreated} created, ${result.tasksUpdated} updated`
          )
        } catch (error) {
          console.error(`[Watcher] Sync error for ${changeId}:`, error)
        }
      },
      500 // debounceMs
    )

    // 모든 프로젝트에 대해 watcher 추가
    for (const project of config.projects) {
      multiWatcher.addProject(project.id, project.path)
    }

    setGlobalMultiWatcher(multiWatcher)
    console.log(`[MultiWatcher] Initialized for ${config.projects.length} project(s)`)
  } catch (error) {
    console.error('[MultiWatcher] Failed to initialize:', error)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  const multiWatcher = getGlobalMultiWatcher()
  if (multiWatcher) {
    await multiWatcher.stopAll()
  }
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

// 프로젝트 추가 시 watcher 추가를 위한 함수 export
export function addProjectToWatcher(projectId: string, projectPath: string) {
  const multiWatcher = getGlobalMultiWatcher()
  if (multiWatcher) {
    multiWatcher.addProject(projectId, projectPath)
  }
}

// 프로젝트 삭제 시 watcher 제거를 위한 함수 export
export async function removeProjectFromWatcher(projectId: string) {
  const multiWatcher = getGlobalMultiWatcher()
  if (multiWatcher) {
    await multiWatcher.removeProject(projectId)
  }
}
