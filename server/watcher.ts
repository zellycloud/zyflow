/**
 * Multi-Project File Watcher 모듈
 * 모든 등록된 프로젝트의 tasks.md 파일 변경을 감지하여 자동으로 DB 동기화
 */

import { watch, type FSWatcher } from 'chokidar'
import { join } from 'path'
import { getChangeLogManager } from './change-log.js'

export interface WatcherOptions {
  /** 감시할 프로젝트 경로 */
  projectPath: string
  /** 프로젝트 ID (멀티 프로젝트용) */
  projectId?: string
  /** 파일 변경 시 호출될 콜백 */
  onTasksChange: (changeId: string, filePath: string, projectPath: string) => void
  /** 새 Change 폴더 생성 시 호출될 콜백 */
  onNewChange?: (changeId: string, projectPath: string) => void
  /** 디바운스 시간 (ms) - 기본 500ms */
  debounceMs?: number
  /** 시작 시 기존 파일도 스캔할지 여부 - 기본 false */
  scanOnStart?: boolean
}

export interface WatcherInstance {
  /** 감시 시작 */
  start: () => void
  /** 감시 중지 */
  stop: () => Promise<void>
  /** 현재 감시 중인지 여부 */
  isWatching: () => boolean
  /** 프로젝트 경로 */
  projectPath: string
  /** 프로젝트 ID */
  projectId?: string
}

/**
 * 단일 프로젝트 tasks.md 파일 감시자 생성
 */
export function createTasksWatcher(options: WatcherOptions): WatcherInstance {
  const { projectPath, projectId, onTasksChange, onNewChange, debounceMs = 500, scanOnStart = false } = options

  let watcher: FSWatcher | null = null
  const debounceTimers: Map<string, NodeJS.Timeout> = new Map()
  // 이미 처리한 새 Change 폴더 추적 (중복 호출 방지)
  const processedNewChanges: Set<string> = new Set()

  /**
   * 새 Change 폴더 생성 감지 핸들러
   * proposal.md, design.md, tasks.md 등 OpenSpec 파일 생성 시 트리거
   */
  const handleNewChangeFolder = async (filePath: string) => {
    // OpenSpec 주요 파일 패턴 매칭: proposal.md, design.md, tasks.md
    // (depth 2 제한으로 specs/xxx/spec.md는 감지 불가 - proposal.md 등으로 대체)
    const match = filePath.match(/openspec[/\\]changes[/\\]([^/\\]+)[/\\](proposal|design|tasks)\.md$/)
    if (!match) return

    const changeId = match[1]

    // 이미 처리된 Change는 스킵
    if (processedNewChanges.has(changeId)) return
    processedNewChanges.add(changeId)

    console.log(`[Watcher] New change folder detected: ${changeId} (via ${match[2]}.md)`)

    // 새 Change 콜백 호출
    onNewChange?.(changeId, projectPath)
  }

  const handleChange = async (filePath: string) => {
    // 상대 경로에서 changeId 추출 (Windows/Unix 모두 지원)
    // 예: openspec/changes/integrate-git-workflow/tasks.md -> integrate-git-workflow
    const match = filePath.match(/openspec[/\\]changes[/\\]([^/\\]+)[/\\]tasks\.md$/)
    if (!match) return

    const changeId = match[1]

    // 파일 변경 이벤트 로깅 (ChangeLogManager가 초기화된 경우에만)
    try {
      const changeLogManager = getChangeLogManager()
      await changeLogManager.logFileChange({
        filePath,
        changeType: 'MODIFIED',
        metadata: {
          changeId,
          projectPath,
          timestamp: Date.now()
        }
      }, 'DEBUG')
    } catch {
      // ChangeLogManager가 아직 초기화되지 않은 경우 무시
    }

    // 디바운스 처리 (파일 저장 중 여러 번 트리거 방지)
    const timerKey = `${projectPath}:${changeId}`
    const existingTimer = debounceTimers.get(timerKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(async () => {
      debounceTimers.delete(timerKey)
      console.log(`[Watcher] Detected change in ${changeId}/tasks.md (project: ${projectPath})`)

      // 파일 변경 완료 이벤트 로깅 (ChangeLogManager가 초기화된 경우에만)
      try {
        const logManager = getChangeLogManager()
        await logManager.logFileChange({
          filePath,
          changeType: 'MODIFIED',
          metadata: {
            changeId,
            projectPath,
            action: 'debounced_change_processed',
            timestamp: Date.now()
          }
        }, 'INFO')
      } catch {
        // ChangeLogManager가 아직 초기화되지 않은 경우 무시
      }

      onTasksChange(changeId, filePath, projectPath)
    }, debounceMs)

    debounceTimers.set(timerKey, timer)
  }

  const start = () => {
    if (watcher) {
      console.warn(`[Watcher] Already watching ${projectPath}`)
      return
    }

    // chokidar v5: 디렉토리를 감시하고 파일 필터링
    const watchDir = join(projectPath, 'openspec/changes')

    watcher = watch(watchDir, {
      // scanOnStart가 true이면 기존 파일도 스캔 (add 이벤트 발생)
      ignoreInitial: !scanOnStart,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      // .git 폴더, archive 폴더, node_modules 무시
      ignored: [/(^|[/\\])\./, /[/\\]archive[/\\]/, /node_modules/],
      // depth 2: change폴더/{proposal,design,tasks}.md 감지 가능
      // (specs 폴더 내 spec.md는 proposal.md 등으로 대체 감지)
      depth: 2,
      // 파일 핸들 수 제한을 위해 polling 사용 안함 (native fs events 사용)
      usePolling: false,
      persistent: true,
    })

    // tasks.md 파일 변경 필터링
    const filterAndHandleChange = async (filePath: string) => {
      if (filePath.endsWith('/tasks.md') || filePath.endsWith('\\tasks.md')) {
        await handleChange(filePath)
      }
    }

    // 새 파일 추가 시: tasks.md 처리 + 새 Change 폴더 감지
    const filterAndHandleAdd = async (filePath: string) => {
      // tasks.md 추가 시 동기화
      if (filePath.endsWith('/tasks.md') || filePath.endsWith('\\tasks.md')) {
        await handleChange(filePath)
      }
      // 새 Change 폴더 감지 (proposal.md, design.md, tasks.md, spec.md)
      if (onNewChange) {
        await handleNewChangeFolder(filePath)
      }
    }

    watcher
      .on('change', filterAndHandleChange)
      .on('add', filterAndHandleAdd)
      .on('error', (error) => {
        console.error(`[Watcher] Error for ${projectPath}:`, error)
      })
      .on('ready', () => {
        console.log(`[Watcher] Watching tasks.md files in ${projectPath}`)
      })
  }

  const stop = async () => {
    // 이 프로젝트의 디바운스 타이머만 정리
    for (const [key, timer] of debounceTimers.entries()) {
      if (key.startsWith(`${projectPath}:`)) {
        clearTimeout(timer)
        debounceTimers.delete(key)
      }
    }

    if (watcher) {
      await watcher.close()
      watcher = null
      console.log(`[Watcher] Stopped watching ${projectPath}`)
    }
  }

  const isWatching = () => watcher !== null

  return { start, stop, isWatching, projectPath, projectId }
}

/**
 * Multi-Project Watcher Manager
 * 여러 프로젝트를 동시에 감시
 */
export interface MultiWatcherManager {
  /** 프로젝트 추가 및 감시 시작 */
  addProject: (projectId: string, projectPath: string) => void
  /** 프로젝트 감시 중지 및 제거 */
  removeProject: (projectId: string) => Promise<void>
  /** 모든 감시 중지 */
  stopAll: () => Promise<void>
  /** 감시 중인 프로젝트 목록 */
  getWatchedProjects: () => Array<{ projectId: string; projectPath: string }>
  /** 특정 프로젝트가 감시 중인지 확인 */
  isWatching: (projectId: string) => boolean
}

/**
 * Multi-Project Watcher Manager 생성
 */
export function createMultiWatcherManager(
  onTasksChange: (changeId: string, filePath: string, projectPath: string) => void,
  debounceMs = 500,
  scanOnStart = false,
  onNewChange?: (changeId: string, projectPath: string) => void
): MultiWatcherManager {
  const watchers = new Map<string, WatcherInstance>()

  const addProject = (projectId: string, projectPath: string) => {
    // 이미 감시 중이면 스킵
    if (watchers.has(projectId)) {
      console.log(`[MultiWatcher] Project ${projectId} already being watched`)
      return
    }

    const watcher = createTasksWatcher({
      projectPath,
      projectId,
      onTasksChange,
      onNewChange,
      debounceMs,
      scanOnStart,
    })

    watcher.start()
    watchers.set(projectId, watcher)
    console.log(`[MultiWatcher] Added project: ${projectId} (${projectPath})`)
  }

  const removeProject = async (projectId: string) => {
    const watcher = watchers.get(projectId)
    if (watcher) {
      await watcher.stop()
      watchers.delete(projectId)
      console.log(`[MultiWatcher] Removed project: ${projectId}`)
    }
  }

  const stopAll = async () => {
    const stopPromises = Array.from(watchers.values()).map((w) => w.stop())
    await Promise.all(stopPromises)
    watchers.clear()
    console.log('[MultiWatcher] Stopped all watchers')
  }

  const getWatchedProjects = () => {
    return Array.from(watchers.entries()).map(([projectId, watcher]) => ({
      projectId,
      projectPath: watcher.projectPath,
    }))
  }

  const isWatching = (projectId: string) => {
    return watchers.has(projectId) && watchers.get(projectId)!.isWatching()
  }

  return {
    addProject,
    removeProject,
    stopAll,
    getWatchedProjects,
    isWatching,
  }
}

/**
 * 전역 Multi-Watcher Manager 인스턴스
 */
let globalMultiWatcher: MultiWatcherManager | null = null

export function getGlobalMultiWatcher(): MultiWatcherManager | null {
  return globalMultiWatcher
}

export function setGlobalMultiWatcher(manager: MultiWatcherManager | null): void {
  globalMultiWatcher = manager
}

/**
 * 하위 호환성을 위한 전역 watcher 인스턴스 관리
 * @deprecated Use getGlobalMultiWatcher instead
 */
let globalWatcher: WatcherInstance | null = null

export function getGlobalWatcher(): WatcherInstance | null {
  return globalWatcher
}

export function setGlobalWatcher(watcher: WatcherInstance | null): void {
  globalWatcher = watcher
}
