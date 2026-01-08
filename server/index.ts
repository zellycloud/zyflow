import 'dotenv/config'
import { createServer } from 'http'
import { app } from './app.js'
import { initWebSocket } from './websocket.js'
import { startTasksWatcher, stopTasksWatcher } from './watcher.js'
import { getActiveProject } from './config.js'
import { syncFlowChanges } from './flow-sync.js'

const PORT = parseInt(process.env.PORT || '3100', 10)

// 처리되지 않은 예외 핸들러 - 서버 크래시 방지 및 로깅
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error)
  console.error('[FATAL] Stack:', error.stack)
  // 심각한 오류이므로 graceful shutdown 시도
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Promise Rejection:', reason)
  console.error('[ERROR] Promise:', promise)
  // Promise 거부는 로깅만 하고 서버는 계속 실행
})

// HTTP 서버 생성 (Express + WebSocket 공유)
const httpServer = createServer(app)

// WebSocket 서버 초기화
initWebSocket(httpServer)

// 서버 시작
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`ZyFlow API server running on http://localhost:${PORT}`)

  // 서버 시작 시 Flow changes DB 동기화 (파일 시스템 → DB)
  try {
    const syncResult = await syncFlowChanges()
    if (syncResult.synced > 0) {
      console.log(`[Sync] Flow changes synced: ${syncResult.created} created, ${syncResult.updated} updated (${syncResult.projects} projects)`)
    } else {
      console.log('[Sync] Flow changes sync completed (no changes)')
    }
  } catch (error) {
    console.error('[Warning] Failed to sync flow changes:', error)
  }

  // 활성 프로젝트가 있으면 watcher 시작
  try {
    const project = await getActiveProject()
    if (project && !project.remote?.serverId) {
      // 로컬 프로젝트만 watcher 시작
      startTasksWatcher(project.path, project.id)
      console.log('[Info] File watcher enabled for active project')
    } else if (project?.remote?.serverId) {
      console.log('[Info] Remote project - file watcher disabled')
    } else {
      console.log('[Info] No active project - file watcher not started')
    }
  } catch (error) {
    console.error('[Warning] Failed to start file watcher:', error)
  }
})

// Graceful shutdown 함수
async function gracefulShutdown(reason: string) {
  console.log(`\n[Shutdown] Initiating graceful shutdown (reason: ${reason})...`)
  stopTasksWatcher()
  httpServer.close(() => {
    console.log('[Shutdown] Server closed')
    process.exit(reason === 'SIGINT' ? 0 : 1)
  })
  // 강제 종료 타임아웃 (10초)
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
