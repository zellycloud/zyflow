/**
 * File Watcher 모듈
 * tasks.md 파일 변경을 감지하여 자동으로 DB 동기화
 */

import { watch, type FSWatcher } from 'chokidar'
import { join } from 'path'

export interface WatcherOptions {
  /** 감시할 프로젝트 경로 */
  projectPath: string
  /** 파일 변경 시 호출될 콜백 */
  onTasksChange: (changeId: string, filePath: string) => void
  /** 디바운스 시간 (ms) - 기본 500ms */
  debounceMs?: number
}

export interface WatcherInstance {
  /** 감시 시작 */
  start: () => void
  /** 감시 중지 */
  stop: () => Promise<void>
  /** 현재 감시 중인지 여부 */
  isWatching: () => boolean
}

/**
 * tasks.md 파일 감시자 생성
 */
export function createTasksWatcher(options: WatcherOptions): WatcherInstance {
  const { projectPath, onTasksChange, debounceMs = 500 } = options

  let watcher: FSWatcher | null = null
  let debounceTimers: Map<string, NodeJS.Timeout> = new Map()

  const handleChange = (filePath: string) => {
    // 상대 경로에서 changeId 추출
    // 예: openspec/changes/integrate-git-workflow/tasks.md -> integrate-git-workflow
    const match = filePath.match(/openspec\/changes\/([^/]+)\/tasks\.md$/)
    if (!match) return

    const changeId = match[1]

    // 디바운스 처리 (파일 저장 중 여러 번 트리거 방지)
    const existingTimer = debounceTimers.get(changeId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      debounceTimers.delete(changeId)
      console.log(`[Watcher] Detected change in ${changeId}/tasks.md`)
      onTasksChange(changeId, filePath)
    }, debounceMs)

    debounceTimers.set(changeId, timer)
  }

  const start = () => {
    if (watcher) {
      console.warn('[Watcher] Already watching')
      return
    }

    // chokidar v5: 디렉토리를 감시하고 파일 필터링
    const watchDir = join(projectPath, 'openspec/changes')

    watcher = watch(watchDir, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      // .git 폴더와 archive 폴더 무시
      ignored: [/(^|[\/\\])\./, /\/archive\//],
      // 재귀적으로 감시
      depth: 2,
    })

    // tasks.md 파일만 필터링하여 처리
    const filterAndHandle = (filePath: string) => {
      if (filePath.endsWith('/tasks.md') || filePath.endsWith('\\tasks.md')) {
        handleChange(filePath)
      }
    }

    watcher
      .on('change', filterAndHandle)
      .on('add', filterAndHandle)
      .on('error', (error) => {
        console.error('[Watcher] Error:', error)
      })
      .on('ready', () => {
        console.log(`[Watcher] Watching tasks.md files in ${projectPath}`)
      })
  }

  const stop = async () => {
    // 모든 디바운스 타이머 정리
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
    debounceTimers.clear()

    if (watcher) {
      await watcher.close()
      watcher = null
      console.log('[Watcher] Stopped watching')
    }
  }

  const isWatching = () => watcher !== null

  return { start, stop, isWatching }
}

/**
 * 전역 watcher 인스턴스 관리
 */
let globalWatcher: WatcherInstance | null = null

export function getGlobalWatcher(): WatcherInstance | null {
  return globalWatcher
}

export function setGlobalWatcher(watcher: WatcherInstance | null): void {
  globalWatcher = watcher
}
