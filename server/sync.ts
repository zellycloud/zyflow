/**
 * OpenSpec Changes 동기화 모듈
 * tasks.md 파일을 파싱하여 DB에 동기화
 *
 * 3단계 계층 구조 지원:
 * ## 1. Major Section (majorOrder, majorTitle)
 * ### 1.1 Sub Section (subOrder, groupTitle)
 * - [ ] 1.1.1 Task (taskOrder)
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import { parseTasksFile } from './parser.js'
import { getSqlite } from './tasks/db/client.js'
import { getActiveProject } from './config.js'
import { getChangeLogManager } from './change-log.js'
import { validateGroupStructure, reorderGroups, resolveDuplicateGroupTitles } from './parser-utils.js'

export interface SyncResult {
  changeId: string
  tasksUpdated: number
  tasksCreated: number
}

/**
 * Extended TaskGroup with 3-level hierarchy info
 */
interface ExtendedTaskGroup {
  id: string
  title: string
  tasks: Array<{
    id: string
    title: string
    completed: boolean
    groupId: string
    lineNumber: number
  }>
  majorOrder?: number
  majorTitle?: string
  subOrder?: number
}

/**
 * ChangeLogManager 안전 호출 헬퍼
 * 초기화되지 않았으면 로깅을 건너뛰고 계속 진행
 */
async function safeLogSyncOperation(
  data: { operationType: string; tableName: string; recordId: string; status: string; result?: unknown; error?: unknown },
  severity: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO'
): Promise<string | null> {
  try {
    const changeLogManager = getChangeLogManager()
    return await changeLogManager.logSyncOperation(data as Parameters<typeof changeLogManager.logSyncOperation>[0], severity)
  } catch {
    // ChangeLogManager가 초기화되지 않음 - 로깅 건너뛰기
    return null
  }
}

async function safeLogDBChange(
  data: { tableName: string; operation: string; recordId: string | undefined; oldValues?: unknown; newValues?: unknown; transactionId?: string },
  severity: 'INFO' | 'ERROR' | 'DEBUG' = 'DEBUG'
): Promise<string | null> {
  try {
    const changeLogManager = getChangeLogManager()
    return await changeLogManager.logDBChange(data as Parameters<typeof changeLogManager.logDBChange>[0], severity)
  } catch {
    // ChangeLogManager가 초기화되지 않음 - 로깅 건너뛰기
    return null
  }
}

/**
 * 특정 Change의 tasks.md를 DB에 동기화
 */
export async function syncChangeTasksFromFile(changeId: string): Promise<SyncResult> {
  const project = await getActiveProject()
  if (!project) {
    throw new Error('No active project')
  }

  const tasksPath = join(project.path, 'openspec', 'changes', changeId, 'tasks.md')
  const sqlite = getSqlite()
  const now = Date.now()

  let tasksCreated = 0
  let tasksUpdated = 0

  // 이벤트 로깅 시작 (초기화 안 됐으면 건너뛰기)
  await safeLogSyncOperation({
    operationType: 'LOCAL_TO_REMOTE',
    tableName: 'tasks',
    recordId: changeId,
    status: 'STARTED'
  }, 'INFO')

  try {
    const tasksContent = await readFile(tasksPath, 'utf-8')
    const parsed = parseTasksFile(changeId, tasksContent)

    // 그룹 구조 유효성 검사 및 후처리
    const validation = validateGroupStructure(parsed.groups as any[])
    if (!validation.isValid) {
      console.warn(`[Sync] ${changeId}: 그룹 구조 유효성 검사 실패:`, validation.errors)
    }
    if (validation.warnings.length > 0) {
      console.warn(`[Sync] ${changeId}: 그룹 구조 경고:`, validation.warnings)
    }

    // 중복 제목 처리 및 재정렬
    let processedGroups = resolveDuplicateGroupTitles(parsed.groups as any[])
    processedGroups = reorderGroups(processedGroups)

    for (const group of processedGroups as ExtendedTaskGroup[]) {
      // 3단계 계층 정보 추출
      const majorOrder = group.majorOrder ?? 1
      const majorTitle = group.majorTitle ?? group.title
      const subOrder = group.subOrder ?? 1
      const groupTitle = group.title // ### 1.1 Subsection Title

      for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
        const task = group.tasks[taskIdx]
        const taskOrder = taskIdx + 1

        // Check if task with same title exists for this change
        const existingTask = sqlite.prepare(`
          SELECT id, status FROM tasks WHERE change_id = ? AND title = ?
        `).get(changeId, task.title) as { id: number; status: string } | undefined

        const newStatus = task.completed ? 'done' : 'todo'

        if (existingTask) {
          // 기존 태스크 업데이트 (상태 + 그룹 정보)
          const oldStatus = existingTask.status
          
          sqlite.prepare(`
            UPDATE tasks
            SET status = ?,
                group_title = ?,
                group_order = ?,
                task_order = ?,
                major_title = ?,
                sub_order = ?,
                updated_at = ?
            WHERE id = ?
          `).run(
            newStatus,
            groupTitle,
            majorOrder,
            taskOrder,
            majorTitle,
            subOrder,
            now,
            existingTask.id
          )
          tasksUpdated++

          // DB 변경 이벤트 로깅 (초기화 안 됐으면 건너뛰기)
          await safeLogDBChange({
            tableName: 'tasks',
            operation: 'UPDATE',
            recordId: existingTask.id.toString(),
            oldValues: { status: oldStatus },
            newValues: {
              status: newStatus,
              groupTitle,
              groupOrder: majorOrder,
              taskOrder,
              majorTitle,
              subOrder
            },
            transactionId: changeId
          }, 'DEBUG')
        } else {
          // 새 태스크 생성 (3단계 계층 정보 포함, origin='openspec')
          const insertResult = sqlite.prepare(`
            INSERT INTO tasks (
              change_id, stage, title, status, priority, "order",
              group_title, group_order, task_order, major_title, sub_order,
              origin, created_at, updated_at
            )
            VALUES (?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
          `).run(
            changeId,
            task.title,
            newStatus,
            task.lineNumber,
            groupTitle,
            majorOrder,
            taskOrder,
            majorTitle,
            subOrder,
            now,
            now
          )
          tasksCreated++

          // DB 변경 이벤트 로깅 (초기화 안 됐으면 건너뛰기)
          await safeLogDBChange({
            tableName: 'tasks',
            operation: 'INSERT',
            recordId: insertResult.lastInsertRowid?.toString(),
            newValues: {
              changeId,
              title: task.title,
              status: newStatus,
              groupTitle,
              groupOrder: majorOrder,
              taskOrder,
              majorTitle,
              subOrder,
              origin: 'openspec'
            },
            transactionId: changeId
          }, 'DEBUG')
        }
      }
    }

    console.log(`[Sync] ${changeId}: ${tasksCreated} created, ${tasksUpdated} updated`)

    // 동기화 완료 이벤트 로깅 (초기화 안 됐으면 건너뛰기)
    await safeLogSyncOperation({
      operationType: 'LOCAL_TO_REMOTE',
      tableName: 'tasks',
      recordId: changeId,
      status: 'COMPLETED',
      result: {
        recordsProcessed: tasksCreated + tasksUpdated,
        recordsSucceeded: tasksCreated + tasksUpdated,
        recordsFailed: 0,
        duration: Date.now() - now
      }
    }, 'INFO')
  } catch (error) {
    // tasks.md not found or parse error
    console.warn(`[Sync] Error syncing ${changeId}:`, error)

    // 동기화 실패 이벤트 로깅 (초기화 안 됐으면 건너뛰기)
    await safeLogSyncOperation({
      operationType: 'LOCAL_TO_REMOTE',
      tableName: 'tasks',
      recordId: changeId,
      status: 'FAILED',
      error: {
        code: 'SYNC_FAILED',
        message: (error as Error).message,
        details: { changeId, tasksPath }
      }
    }, 'ERROR')
  }

  return { changeId, tasksCreated, tasksUpdated }
}

/**
 * 특정 프로젝트의 Change tasks.md를 DB에 동기화
 * Multi-Project Watcher에서 사용
 */
export async function syncChangeTasksForProject(
  changeId: string,
  projectPath: string
): Promise<SyncResult> {
  const tasksPath = join(projectPath, 'openspec', 'changes', changeId, 'tasks.md')
  const sqlite = getSqlite()
  const now = Date.now()

  let tasksCreated = 0
  let tasksUpdated = 0

  // 이벤트 로깅 시작 (초기화 안 됐으면 건너뛰기)
  await safeLogSyncOperation({
    operationType: 'LOCAL_TO_REMOTE',
    tableName: 'tasks',
    recordId: changeId,
    status: 'STARTED'
  }, 'INFO')

  try {
    const tasksContent = await readFile(tasksPath, 'utf-8')
    const parsed = parseTasksFile(changeId, tasksContent)

    for (const group of parsed.groups as ExtendedTaskGroup[]) {
      // 3단계 계층 정보 추출
      const majorOrder = group.majorOrder ?? 1
      const majorTitle = group.majorTitle ?? group.title
      const subOrder = group.subOrder ?? 1
      const groupTitle = group.title // ### 1.1 Subsection Title

      for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
        const task = group.tasks[taskIdx]
        const taskOrder = taskIdx + 1

        // Check if task with same title exists for this change
        const existingTask = sqlite.prepare(`
          SELECT id, status FROM tasks WHERE change_id = ? AND title = ?
        `).get(changeId, task.title) as { id: number; status: string } | undefined

        const newStatus = task.completed ? 'done' : 'todo'

        if (existingTask) {
          // 기존 태스크 업데이트 (상태 + 그룹 정보)
          sqlite.prepare(`
            UPDATE tasks
            SET status = ?,
                group_title = ?,
                group_order = ?,
                task_order = ?,
                major_title = ?,
                sub_order = ?,
                updated_at = ?
            WHERE id = ?
          `).run(
            newStatus,
            groupTitle,
            majorOrder,
            taskOrder,
            majorTitle,
            subOrder,
            now,
            existingTask.id
          )
          tasksUpdated++
        } else {
          // 새 태스크 생성 (3단계 계층 정보 포함, origin='openspec')
          sqlite.prepare(`
            INSERT INTO tasks (
              change_id, stage, title, status, priority, "order",
              group_title, group_order, task_order, major_title, sub_order,
              origin, created_at, updated_at
            )
            VALUES (?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
          `).run(
            changeId,
            task.title,
            newStatus,
            task.lineNumber,
            groupTitle,
            majorOrder,
            taskOrder,
            majorTitle,
            subOrder,
            now,
            now
          )
          tasksCreated++
        }
      }
    }

    console.log(`[Sync] ${changeId} (${projectPath}): ${tasksCreated} created, ${tasksUpdated} updated`)

    // 동기화 완료 이벤트 로깅 (초기화 안 됐으면 건너뛰기)
    await safeLogSyncOperation({
      operationType: 'LOCAL_TO_REMOTE',
      tableName: 'tasks',
      recordId: changeId,
      status: 'COMPLETED',
      result: {
        recordsProcessed: tasksCreated + tasksUpdated,
        recordsSucceeded: tasksCreated + tasksUpdated,
        recordsFailed: 0,
        duration: Date.now() - now
      }
    }, 'INFO')
  } catch (error) {
    // tasks.md not found or parse error
    console.warn(`[Sync] Error syncing ${changeId} (${projectPath}):`, error)

    // 동기화 실패 이벤트 로깅 (초기화 안 됐으면 건너뛰기)
    await safeLogSyncOperation({
      operationType: 'LOCAL_TO_REMOTE',
      tableName: 'tasks',
      recordId: changeId,
      status: 'FAILED',
      error: {
        code: 'SYNC_FAILED',
        message: (error as Error).message,
        details: { changeId, projectPath, tasksPath }
      }
    }, 'ERROR')
  }

  return { changeId, tasksCreated, tasksUpdated }
}

/**
 * Change가 DB에 없으면 등록 (새 Change 생성 시 자동 등록)
 * proposal.md에서 제목을 추출하여 Change 레코드 생성
 */
export async function ensureChangeExists(
  changeId: string,
  projectPath: string
): Promise<boolean> {
  const sqlite = getSqlite()

  // 프로젝트 ID 계산 (경로 기반)
  const projectId = projectPath.toLowerCase().replace(/[^a-z0-9]/g, '-')

  // 이미 존재하는지 확인
  const existing = sqlite.prepare(`
    SELECT id FROM changes WHERE id = ? AND project_id = ?
  `).get(changeId, projectId)

  if (existing) {
    return false // 이미 존재
  }

  // proposal.md에서 제목 추출
  let title = changeId
  try {
    const proposalPath = join(projectPath, 'openspec', 'changes', changeId, 'proposal.md')
    const proposalContent = await readFile(proposalPath, 'utf-8')
    const titleMatch = proposalContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }
  } catch {
    // proposal.md 없으면 changeId를 제목으로 사용
  }

  const now = Date.now()
  const specPath = `openspec/changes/${changeId}/proposal.md`

  // Change 레코드 생성
  sqlite.prepare(`
    INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', 'task', 0, ?, ?)
  `).run(changeId, projectId, title, specPath, now, now)

  console.log(`[Sync] Created new Change: ${changeId} (${title})`)
  return true
}

/**
 * 모든 프로젝트의 모든 Changes를 초기 동기화
 * 서버 시작 시 호출되어 tasks.md 파일을 DB에 동기화
 */
export async function syncAllChangesOnStartup(): Promise<{
  totalCreated: number
  totalUpdated: number
  projectsSynced: number
}> {
  // Lazy import to avoid circular dependency
  const { loadConfig } = await import('./config.js')
  const { readdir, readFile } = await import('fs/promises')
  const { join } = await import('path')
  const { parseTasksFile } = await import('./parser.js')

  const sqlite = getSqlite()
  const config = await loadConfig()

  if (config.projects.length === 0) {
    console.log('[Sync] No projects registered, skipping initial sync')
    return { totalCreated: 0, totalUpdated: 0, projectsSynced: 0 }
  }

  let totalCreated = 0
  let totalUpdated = 0
  let projectsSynced = 0

  console.log(`[Sync] Starting initial sync for ${config.projects.length} project(s)...`)

  for (const project of config.projects) {
    const openspecDir = join(project.path, 'openspec', 'changes')
    let entries

    try {
      entries = await readdir(openspecDir, { withFileTypes: true })
    } catch {
      // openspec/changes 폴더가 없는 프로젝트는 스킵
      continue
    }

    projectsSynced++
    const now = Date.now()

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue

      const changeId = entry.name
      const changeDir = join(openspecDir, changeId)

      // proposal.md에서 제목 추출
      let title = changeId
      const specPath = `openspec/changes/${changeId}/proposal.md`
      try {
        const proposalPath = join(changeDir, 'proposal.md')
        const proposalContent = await readFile(proposalPath, 'utf-8')
        const titleMatch = proposalContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
        if (titleMatch) {
          title = titleMatch[1].trim()
        }
      } catch {
        // proposal.md not found
      }

      // Change가 존재하는지 확인
      const existing = sqlite.prepare('SELECT id FROM changes WHERE id = ? AND project_id = ?').get(changeId, project.id)

      if (existing) {
        sqlite.prepare(`
          UPDATE changes SET title = ?, spec_path = ?, updated_at = ? WHERE id = ? AND project_id = ?
        `).run(title, specPath, now, changeId, project.id)
        totalUpdated++
      } else {
        sqlite.prepare(`
          INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
        `).run(changeId, project.id, title, specPath, now, now)
        totalCreated++
      }

      // tasks.md 동기화
      try {
        const tasksPath = join(changeDir, 'tasks.md')
        const tasksContent = await readFile(tasksPath, 'utf-8')
        const parsed = parseTasksFile(changeId, tasksContent)

        interface ExtendedGroup {
          title: string
          tasks: Array<{ title: string; completed: boolean; lineNumber: number }>
          majorOrder?: number
          majorTitle?: string
          subOrder?: number
        }

        for (const group of parsed.groups as ExtendedGroup[]) {
          const majorOrder = group.majorOrder ?? 1
          const majorTitle = group.majorTitle ?? group.title
          const subOrder = group.subOrder ?? 1
          const groupTitle = group.title

          for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
            const task = group.tasks[taskIdx]
            const taskOrder = taskIdx + 1

            const existingTask = sqlite.prepare(`
              SELECT id FROM tasks WHERE change_id = ? AND title = ?
            `).get(changeId, task.title) as { id: number } | undefined

            if (existingTask) {
              const newStatus = task.completed ? 'done' : 'todo'
              sqlite.prepare(`
                UPDATE tasks
                SET status = ?,
                    group_title = ?,
                    group_order = ?,
                    task_order = ?,
                    major_title = ?,
                    sub_order = ?,
                    updated_at = ?
                WHERE id = ?
              `).run(newStatus, groupTitle, majorOrder, taskOrder, majorTitle, subOrder, now, existingTask.id)
            } else {
              sqlite.prepare(`
                INSERT INTO tasks (
                  change_id, stage, title, status, priority, "order",
                  group_title, group_order, task_order, major_title, sub_order,
                  origin, created_at, updated_at
                )
                VALUES (?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
              `).run(
                changeId,
                task.title,
                task.completed ? 'done' : 'todo',
                task.lineNumber,
                groupTitle,
                majorOrder,
                taskOrder,
                majorTitle,
                subOrder,
                now,
                now
              )
            }
          }
        }
      } catch {
        // tasks.md not found or parse error
      }
    }
  }

  console.log(`[Sync] Initial sync complete: ${totalCreated} created, ${totalUpdated} updated across ${projectsSynced} project(s)`)

  return { totalCreated, totalUpdated, projectsSynced }
}
