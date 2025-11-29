import { app } from './app.js'
import { createTasksWatcher, setGlobalWatcher } from './watcher.js'
import { syncChangeTasksFromFile } from './sync.js'
import { getActiveProject } from './config.js'

const PORT = 3001

// 서버 시작
const server = app.listen(PORT, async () => {
  console.log(`ZyFlow API server running on http://localhost:${PORT}`)

  // 활성 프로젝트가 있으면 watcher 시작
  const project = await getActiveProject()
  if (project) {
    startWatcher(project.path)
  }
})

// Watcher 시작 함수
function startWatcher(projectPath: string) {
  const watcher = createTasksWatcher({
    projectPath,
    onTasksChange: async (changeId, filePath) => {
      console.log(`[Watcher] Syncing ${changeId} due to file change: ${filePath}`)
      try {
        const result = await syncChangeTasksFromFile(changeId)
        console.log(`[Watcher] Sync complete: ${result.tasksCreated} created, ${result.tasksUpdated} updated`)
      } catch (error) {
        console.error(`[Watcher] Sync error for ${changeId}:`, error)
      }
    },
    debounceMs: 500,
  })

  watcher.start()
  setGlobalWatcher(watcher)
  console.log(`[Watcher] Started watching tasks.md files in ${projectPath}`)
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  const { getGlobalWatcher } = await import('./watcher.js')
  const watcher = getGlobalWatcher()
  if (watcher) {
    await watcher.stop()
  }
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

// 프로젝트 변경 시 watcher 재시작을 위한 함수 export
export { startWatcher }
