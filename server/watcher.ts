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
 * Unified Multi-Project Watcher Manager 생성
 * 단일 chokidar 인스턴스로 모든 프로젝트를 감시하여 EMFILE 에러 방지
 */
export function createMultiWatcherManager(
  onTasksChange: (changeId: string, filePath: string, projectPath: string) => void,
  debounceMs = 500,
  scanOnStart = false,
  onNewChange?: (changeId: string, projectPath: string) => void
): MultiWatcherManager {
  // 프로젝트 정보 저장 (projectId -> projectPath)
  const projects = new Map<string, string>()
  // projectPath -> projectId 역방향 매핑
  const pathToId = new Map<string, string>()
  // 통합 watcher 인스턴스
  let unifiedWatcher: FSWatcher | null = null
  // 디바운스 타이머
  const debounceTimers = new Map<string, NodeJS.Timeout>()
  // 처리된 새 Change 폴더 추적
  const processedNewChanges = new Set<string>()

  /**
   * 파일 경로에서 프로젝트 경로 찾기
   */
  const findProjectPath = (filePath: string): string | null => {
    for (const projectPath of projects.values()) {
      if (filePath.startsWith(projectPath)) {
        return projectPath
      }
    }
    return null
  }

  /**
   * 파일 변경 핸들러
   */
  const handleChange = async (filePath: string) => {
    const match = filePath.match(/openspec[/\\]changes[/\\]([^/\\]+)[/\\]tasks\.md$/)
    if (!match) return

    const changeId = match[1]
    const projectPath = findProjectPath(filePath)
    if (!projectPath) return

    const timerKey = `${projectPath}:${changeId}`
    const existingTimer = debounceTimers.get(timerKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(async () => {
      debounceTimers.delete(timerKey)
      console.log(`[Watcher] Syncing ${changeId} due to file change: ${filePath}`)
      onTasksChange(changeId, filePath, projectPath)
    }, debounceMs)

    debounceTimers.set(timerKey, timer)
  }

  /**
   * 새 Change 폴더 핸들러
   */
  const handleNewChangeFolder = async (filePath: string) => {
    const match = filePath.match(/openspec[/\\]changes[/\\]([^/\\]+)[/\\](proposal|design|tasks)\.md$/)
    if (!match) return

    const changeId = match[1]
    const projectPath = findProjectPath(filePath)
    if (!projectPath) return

    const key = `${projectPath}:${changeId}`
    if (processedNewChanges.has(key)) return
    processedNewChanges.add(key)

    console.log(`[Watcher] New change folder detected: ${changeId} in ${projectPath}`)
    onNewChange?.(changeId, projectPath)
  }

  /**
   * Watcher 재시작 (새 프로젝트 추가 시)
   */
  const restartWatcher = async () => {
    // 기존 watcher 중지
    if (unifiedWatcher) {
      await unifiedWatcher.close()
      unifiedWatcher = null
    }

    // 감시할 경로가 없으면 종료
    if (projects.size === 0) return

    // 모든 프로젝트의 openspec/changes 경로 수집
    const watchPaths = Array.from(projects.values())
      .filter(p => !p.startsWith('/opt/')) // 원격 프로젝트 제외 (SSH로 접근)
      .map(p => join(p, 'openspec/changes'))

    if (watchPaths.length === 0) return

    // 단일 watcher로 모든 경로 감시
    unifiedWatcher = watch(watchPaths, {
      ignoreInitial: !scanOnStart,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      ignored: [/(^|[/\\])\./, /[/\\]archive[/\\]/, /node_modules/],
      depth: 2,
      usePolling: false,
      persistent: true,
    })

    unifiedWatcher
      .on('change', async (filePath) => {
        if (filePath.endsWith('/tasks.md') || filePath.endsWith('\\tasks.md')) {
          await handleChange(filePath)
        }
      })
      .on('add', async (filePath) => {
        if (filePath.endsWith('/tasks.md') || filePath.endsWith('\\tasks.md')) {
          await handleChange(filePath)
        }
        if (onNewChange) {
          await handleNewChangeFolder(filePath)
        }
      })
      .on('error', (error) => {
        console.error(`[Watcher] Error:`, error)
      })
      .on('ready', () => {
        console.log(`[Watcher] Unified watcher ready for ${watchPaths.length} project(s)`)
      })
  }

  // 지연 시작을 위한 타이머
  let startTimer: NodeJS.Timeout | null = null

  const addProject = (projectId: string, projectPath: string) => {
    if (projects.has(projectId)) {
      console.log(`[MultiWatcher] Project ${projectId} already being watched`)
      return
    }

    projects.set(projectId, projectPath)
    pathToId.set(projectPath, projectId)
    console.log(`[MultiWatcher] Added project: ${projectId} (${projectPath})`)

    // 원격 프로젝트가 아닌 경우에만 watcher에 추가
    if (!projectPath.startsWith('/opt/')) {
      if (unifiedWatcher) {
        // watcher가 이미 있으면 경로만 추가
        const watchPath = join(projectPath, 'openspec/changes')
        unifiedWatcher.add(watchPath)
        console.log(`[Watcher] Added path to unified watcher: ${watchPath}`)
      } else {
        // 모든 프로젝트가 추가될 때까지 대기 후 한 번에 시작 (debounce)
        if (startTimer) clearTimeout(startTimer)
        startTimer = setTimeout(() => {
          startTimer = null
          restartWatcher()
        }, 100)
      }
    }
  }

  const removeProject = async (projectId: string) => {
    const projectPath = projects.get(projectId)
    if (!projectPath) return

    projects.delete(projectId)
    pathToId.delete(projectPath)

    // 해당 프로젝트의 디바운스 타이머 정리
    for (const [key, timer] of debounceTimers.entries()) {
      if (key.startsWith(`${projectPath}:`)) {
        clearTimeout(timer)
        debounceTimers.delete(key)
      }
    }

    // watcher에서 경로 제거
    if (unifiedWatcher && !projectPath.startsWith('/opt/')) {
      const watchPath = join(projectPath, 'openspec/changes')
      unifiedWatcher.unwatch(watchPath)
    }

    console.log(`[MultiWatcher] Removed project: ${projectId}`)
  }

  const stopAll = async () => {
    // 모든 타이머 정리
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
    debounceTimers.clear()

    // watcher 종료
    if (unifiedWatcher) {
      await unifiedWatcher.close()
      unifiedWatcher = null
    }

    projects.clear()
    pathToId.clear()
    processedNewChanges.clear()
    console.log('[MultiWatcher] Stopped unified watcher')
  }

  const getWatchedProjects = () => {
    return Array.from(projects.entries()).map(([projectId, projectPath]) => ({
      projectId,
      projectPath,
    }))
  }

  const isWatching = (projectId: string) => {
    return projects.has(projectId)
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
