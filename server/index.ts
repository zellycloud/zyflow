import 'dotenv/config'
import { createServer } from 'http'
import { app } from './app.js'
import {
  createMultiWatcherManager,
  setGlobalMultiWatcher,
  getGlobalMultiWatcher,
} from './watcher.js'
import { syncChangeTasksForProject, ensureChangeExists, syncAllChangesOnStartup } from './sync.js'
import { loadConfig } from './config.js'
import { initWebSocket, emit } from './websocket.js'

const PORT = 3001

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

  // 1. 서버 시작 시 모든 프로젝트의 Changes 초기 동기화
  try {
    const syncResult = await syncAllChangesOnStartup()
    console.log(`[Startup] Initial sync: ${syncResult.totalCreated} created, ${syncResult.totalUpdated} updated`)
  } catch (error) {
    console.error('[Startup] Initial sync failed:', error)
  }

  // 2. Multi-Project Watcher 초기화 - 파일 변경 감시
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
    // 참고: scanOnStart는 기본 false - syncAllChangesOnStartup이 이미 초기 동기화를 수행하므로 중복 방지
    const multiWatcher = createMultiWatcherManager(
      // onTasksChange: tasks.md 파일 변경 시 호출
      async (changeId, filePath, projectPath) => {
        console.log(`[Watcher] Syncing ${changeId} due to file change: ${filePath}`)
        try {
          // 1. Change가 DB에 없으면 먼저 등록 (새 Change 생성 시)
          await ensureChangeExists(changeId, projectPath)

          // 2. tasks.md 파싱하여 DB에 동기화
          const result = await syncChangeTasksForProject(changeId, projectPath)
          console.log(
            `[Watcher] Sync complete for ${changeId}: ${result.tasksCreated} created, ${result.tasksUpdated} updated`
          )

          // 3. WebSocket으로 클라이언트에 변경 알림
          emit('change:synced', {
            changeId,
            projectPath,
            tasksCreated: result.tasksCreated,
            tasksUpdated: result.tasksUpdated
          })
        } catch (error) {
          console.error(`[Watcher] Sync error for ${changeId}:`, error)
        }
      },
      1000, // debounceMs - 1초로 늘려서 파일 쓰기 완료 대기
      false, // scanOnStart
      // onNewChange: 새 Change 폴더 생성 시 호출 (proposal.md, design.md, tasks.md 등)
      async (changeId, projectPath) => {
        console.log(`[Watcher] New change folder detected: ${changeId} in ${projectPath}`)
        try {
          // DB에 Change 등록
          await ensureChangeExists(changeId, projectPath)

          // tasks.md가 있으면 태스크도 동기화
          const result = await syncChangeTasksForProject(changeId, projectPath)
          console.log(
            `[Watcher] New change synced: ${changeId} (${result.tasksCreated} tasks created)`
          )

          // WebSocket으로 클라이언트에 새 Change 알림
          emit('change:created', {
            changeId,
            projectPath,
            tasksCreated: result.tasksCreated
          })
        } catch (error) {
          console.error(`[Watcher] New change sync error for ${changeId}:`, error)
        }
      }
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

// Graceful shutdown 함수
async function gracefulShutdown(reason: string) {
  console.log(`\n[Shutdown] Initiating graceful shutdown (reason: ${reason})...`)
  const multiWatcher = getGlobalMultiWatcher()
  if (multiWatcher) {
    await multiWatcher.stopAll()
  }
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
