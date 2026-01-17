import 'dotenv/config'
import { createServer } from 'http'
import { app } from './app.js'
import { initWebSocket } from './websocket.js'
import { startTasksWatcher, stopTasksWatcher } from './watcher.js'
import { startRemoteWatcher, stopAllRemoteWatchers } from './remote-watcher.js'
// RAG 기능 삭제됨 - LEANN 외부 MCP 서버로 대체
import { getActiveProject } from './config.js'
import { syncFlowChanges } from './flow-sync.js'
import { getProcessManager } from './cli-adapter/process-manager.js'
import { closeDb } from './tasks/index.js'

// Port configuration: API_PORT > PORT > default 3100
const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3100', 10)

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
      // 원격 프로젝트는 remote watcher 시작
      startRemoteWatcher(project, project.remote.serverId)
      console.log('[Info] Remote file watcher enabled for active project')
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

  // 1. 새 요청 거부 - watcher 중지
  stopTasksWatcher()
  stopAllRemoteWatchers()

  // 2. 활성 프로세스 정리
  try {
    const processManager = getProcessManager()
    processManager.cleanup(0) // 모든 완료된 프로세스 즉시 정리
    console.log('[Shutdown] Process manager cleaned up')
  } catch {
    // ProcessManager가 초기화되지 않은 경우 무시
  }

  // 3. DB 연결 종료
  try {
    closeDb()
    console.log('[Shutdown] Database connection closed')
  } catch {
    // DB가 초기화되지 않은 경우 무시
  }

  // 4. HTTP 서버 종료
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

// 프로세스 자동 정리 (5분 이상 된 완료 프로세스 정리, 매 1분마다)
setInterval(() => {
  try {
    const processManager = getProcessManager()
    processManager.cleanup(300000) // 5분 이상 된 완료 프로세스 정리
  } catch {
    // ProcessManager가 초기화되지 않은 경우 무시
  }
}, 60000)

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
