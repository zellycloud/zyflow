/**
 * Task Sync Module
 *
 * tasks.md 파일에서 DB로 동기화하는 로직
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import { parseTasksFile } from './parser.js'
import { getSqlite } from './tasks/db/client.js'
import { getActiveProject, getProjectById } from './config.js'
import { getChangeStatus, isOpenSpecAvailable } from './cli-adapter/index.js'

export interface SyncResult {
  tasksCreated: number
  tasksUpdated: number
  tasksArchived: number
}

/**
 * 특정 Change의 tasks.md를 DB에 동기화 (현재 활성 프로젝트)
 */
export async function syncChangeTasksFromFile(changeId: string): Promise<SyncResult> {
  const project = await getActiveProject()
  if (!project) {
    throw new Error('No active project')
  }
  return syncChangeTasksForProject(changeId, project.path, project.id)
}

/**
 * 특정 프로젝트의 Change tasks.md를 DB에 동기화
 */
export async function syncChangeTasksForProject(
  changeId: string,
  projectPath: string,
  projectId?: string
): Promise<SyncResult> {
  const sqlite = getSqlite()
  const now = Date.now()

  let tasksCreated = 0
  let tasksUpdated = 0
  let tasksArchived = 0

  const tasksPath = join(projectPath, 'openspec', 'changes', changeId, 'tasks.md')
  const tasksContent = await readFile(tasksPath, 'utf-8')
  const parsed = parseTasksFile(changeId, tasksContent)

  interface ExtendedGroup {
    title: string
    tasks: Array<{
      title: string
      completed: boolean
      lineNumber: number
      displayId?: string
    }>
    majorOrder?: number
    majorTitle?: string
    subOrder?: number
    groupTitle?: string
  }

  const parsedDisplayIds = new Set<string>()

  // Track global group index for proper group_order (1-based)
  // This ensures group_order represents the actual sequential order across all phases
  let globalGroupIndex = 0

  for (const group of parsed.groups as ExtendedGroup[]) {
    globalGroupIndex++
    const majorOrder = group.majorOrder ?? 1
    const majorTitle = group.majorTitle ?? group.title
    const subOrder = group.subOrder ?? 1
    const groupTitle = group.groupTitle ?? group.title
    // Use globalGroupIndex for correct group ordering across all phases
    // Previously majorOrder was used here, which only represents the Phase number
    const groupOrder = globalGroupIndex

    for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
      const task = group.tasks[taskIdx]
      const taskOrder = taskIdx + 1
      const displayId = task.displayId || null

      if (displayId) {
        parsedDisplayIds.add(displayId)
      }

      let existingTask: { id: number } | undefined

      if (displayId) {
        existingTask = sqlite
          .prepare(`SELECT id FROM tasks WHERE change_id = ? AND display_id = ?`)
          .get(changeId, displayId) as { id: number } | undefined
      }

      if (!existingTask) {
        existingTask = sqlite
          .prepare(`SELECT id FROM tasks WHERE change_id = ? AND title = ?`)
          .get(changeId, task.title) as { id: number } | undefined
      }

      if (existingTask) {
        const newStatus = task.completed ? 'done' : 'todo'
        sqlite
          .prepare(`
            UPDATE tasks
            SET title = ?,
                status = ?,
                group_title = ?,
                group_order = ?,
                task_order = ?,
                major_title = ?,
                sub_order = ?,
                display_id = ?,
                project_id = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .run(
            task.title,
            newStatus,
            groupTitle,
            groupOrder,
            taskOrder,
            majorTitle,
            subOrder,
            displayId,
            projectId,
            now,
            existingTask.id
          )
        tasksUpdated++
      } else {
        sqlite
          .prepare(`UPDATE sequences SET value = value + 1 WHERE name = 'task_openspec'`)
          .run()
        const seqResult = sqlite
          .prepare(`SELECT value FROM sequences WHERE name = 'task_openspec'`)
          .get() as { value: number }
        const newId = seqResult.value

        sqlite
          .prepare(`
            INSERT INTO tasks (
              id, project_id, change_id, stage, title, status, priority, "order",
              group_title, group_order, task_order, major_title, sub_order,
              display_id, origin, created_at, updated_at
            )
            VALUES (?, ?, ?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
          `)
          .run(
            newId,
            projectId,
            changeId,
            task.title,
            task.completed ? 'done' : 'todo',
            task.lineNumber,
            groupTitle,
            groupOrder,
            taskOrder,
            majorTitle,
            subOrder,
            displayId,
            now,
            now
          )
        tasksCreated++
      }
    }
  }

  // 파일에서 제거된 태스크는 archived로 변경
  if (parsedDisplayIds.size > 0) {
    const dbTasks = sqlite
      .prepare(`
        SELECT id, display_id FROM tasks
        WHERE change_id = ? AND display_id IS NOT NULL AND status != 'archived'
      `)
      .all(changeId) as Array<{ id: number; display_id: string }>

    for (const dbTask of dbTasks) {
      if (!parsedDisplayIds.has(dbTask.display_id)) {
        sqlite
          .prepare(`
            UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?
          `)
          .run(now, now, dbTask.id)
        tasksArchived++
      }
    }
  }

  // Calculate and update progress in changes table
  const progressResult = sqlite.prepare(`
    SELECT 
      count(*) as total,
      sum(case when status = 'done' then 1 else 0 end) as completed
    FROM tasks 
    WHERE change_id = ? AND status != 'archived'
  `).get(changeId) as { total: number; completed: number }

  const progress = progressResult.total > 0 
    ? Math.round((progressResult.completed / progressResult.total) * 100) 
    : 0

  sqlite.prepare('UPDATE changes SET progress = ?, updated_at = ? WHERE id = ?')
    .run(progress, now, changeId)

  return { tasksCreated, tasksUpdated, tasksArchived }
}

/**
 * 원격 프로젝트의 Change tasks.md를 DB에 동기화 (SSH를 통해 파일 읽기)
 */
export async function syncRemoteChangeTasksForProject(
  changeId: string,
  projectPath: string,
  server: unknown,
  projectId: string
): Promise<{ tasksCreated: number; tasksUpdated: number }> {
  // Remote plugin 동적 로드
  let readRemoteFile: (server: unknown, path: string) => Promise<string>
  try {
    const plugin = await import('@zyflow/remote-plugin')
    readRemoteFile = plugin.readRemoteFile
  } catch {
    throw new Error('Remote plugin not installed')
  }

  const sqlite = getSqlite()
  const now = Date.now()

  let tasksCreated = 0
  let tasksUpdated = 0

  const tasksPath = `${projectPath}/openspec/changes/${changeId}/tasks.md`
  const tasksContent = await readRemoteFile(server, tasksPath)
  const parsed = parseTasksFile(changeId, tasksContent)

  interface ExtendedGroup {
    title: string
    tasks: Array<{
      title: string
      completed: boolean
      lineNumber: number
      displayId?: string
    }>
    majorOrder?: number
    majorTitle?: string
    subOrder?: number
    groupTitle?: string
  }

  const parsedDisplayIds = new Set<string>()

  // Track global group index for proper group_order (1-based)
  // This ensures group_order represents the actual sequential order across all phases
  let globalGroupIndex = 0

  for (const group of parsed.groups as ExtendedGroup[]) {
    globalGroupIndex++
    const majorOrder = group.majorOrder ?? 1
    const majorTitle = group.majorTitle ?? group.title
    const subOrder = group.subOrder ?? 1
    const groupTitle = group.groupTitle ?? group.title
    // Use globalGroupIndex for correct group ordering across all phases
    // Previously majorOrder was used here, which only represents the Phase number
    const groupOrder = globalGroupIndex

    for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
      const task = group.tasks[taskIdx]
      const taskOrder = taskIdx + 1
      const displayId = task.displayId || null

      if (displayId) {
        parsedDisplayIds.add(displayId)
      }

      let existingTask: { id: number } | undefined

      if (displayId) {
        existingTask = sqlite
          .prepare(`SELECT id FROM tasks WHERE change_id = ? AND display_id = ?`)
          .get(changeId, displayId) as { id: number } | undefined
      }

      if (!existingTask) {
        existingTask = sqlite
          .prepare(`SELECT id FROM tasks WHERE change_id = ? AND title = ?`)
          .get(changeId, task.title) as { id: number } | undefined
      }

      if (existingTask) {
        const newStatus = task.completed ? 'done' : 'todo'
        sqlite
          .prepare(`
            UPDATE tasks
            SET title = ?,
                status = ?,
                group_title = ?,
                group_order = ?,
                task_order = ?,
                major_title = ?,
                sub_order = ?,
                display_id = ?,
                project_id = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .run(
            task.title,
            newStatus,
            groupTitle,
            groupOrder,
            taskOrder,
            majorTitle,
            subOrder,
            displayId,
            projectId,
            now,
            existingTask.id
          )
        tasksUpdated++
      } else {
        sqlite
          .prepare(`UPDATE sequences SET value = value + 1 WHERE name = 'task_openspec'`)
          .run()
        const seqResult = sqlite
          .prepare(`SELECT value FROM sequences WHERE name = 'task_openspec'`)
          .get() as { value: number }
        const newId = seqResult.value

        sqlite
          .prepare(`
            INSERT INTO tasks (
              id, project_id, change_id, stage, title, status, priority, "order",
              group_title, group_order, task_order, major_title, sub_order,
              display_id, origin, created_at, updated_at
            )
            VALUES (?, ?, ?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
          `)
          .run(
            newId,
            projectId,
            changeId,
            task.title,
            task.completed ? 'done' : 'todo',
            task.lineNumber,
            groupTitle,
            groupOrder,
            taskOrder,
            majorTitle,
            subOrder,
            displayId,
            now,
            now
          )
        tasksCreated++
      }
    }
  }

  // Calculate and update progress in changes table
  const progressResult = sqlite.prepare(`
    SELECT 
      count(*) as total,
      sum(case when status = 'done' then 1 else 0 end) as completed
    FROM tasks 
    WHERE change_id = ? AND status != 'archived'
  `).get(changeId) as { total: number; completed: number }

  const progress = progressResult.total > 0 
    ? Math.round((progressResult.completed / progressResult.total) * 100) 
    : 0

  sqlite.prepare('UPDATE changes SET progress = ?, updated_at = ? WHERE id = ?')
    .run(progress, now, changeId)

  return { tasksCreated, tasksUpdated }
}

/**
 * OpenSpec 아티팩트 상태를 DB에 캐싱
 * CLI 호출 비용을 줄이기 위해 상태를 DB에 저장
 */
export async function updateArtifactStatusCache(
  changeId: string,
  projectPath: string,
  projectId: string
): Promise<boolean> {
  // OpenSpec CLI가 없으면 스킵
  if (!(await isOpenSpecAvailable())) {
    return false
  }

  try {
    const result = await getChangeStatus({
      change: changeId,
      cwd: projectPath,
    })

    if (!result.success || !result.data) {
      return false
    }

    const sqlite = getSqlite()
    const now = Date.now()

    // JSON으로 저장
    const artifactStatus = JSON.stringify(result.data)

    sqlite.prepare(`
      UPDATE changes
      SET artifact_status = ?, artifact_status_updated_at = ?, updated_at = ?
      WHERE id = ? AND project_id = ?
    `).run(artifactStatus, now, now, changeId, projectId)

    return true
  } catch (error) {
    console.warn(`Failed to update artifact status cache for ${changeId}:`, error)
    return false
  }
}

/**
 * 캐싱된 아티팩트 상태 조회
 * 캐시가 없거나 만료된 경우 null 반환
 *
 * @param maxAgeMs - 캐시 최대 유효 시간 (기본값: 5분)
 */
export function getCachedArtifactStatus(
  changeId: string,
  projectId: string,
  maxAgeMs: number = 5 * 60 * 1000
): { artifacts: unknown[]; progress: unknown } | null {
  const sqlite = getSqlite()

  const row = sqlite.prepare(`
    SELECT artifact_status, artifact_status_updated_at
    FROM changes
    WHERE id = ? AND project_id = ?
  `).get(changeId, projectId) as {
    artifact_status: string | null
    artifact_status_updated_at: number | null
  } | undefined

  if (!row?.artifact_status || !row.artifact_status_updated_at) {
    return null
  }

  // 캐시 만료 체크
  const age = Date.now() - row.artifact_status_updated_at
  if (age > maxAgeMs) {
    return null
  }

  try {
    return JSON.parse(row.artifact_status)
  } catch {
    return null
  }
}

/**
 * 모든 활성 Change의 아티팩트 상태 캐시 갱신
 */
export async function refreshAllArtifactStatusCache(
  projectPath: string,
  projectId: string
): Promise<{ updated: number; failed: number }> {
  const sqlite = getSqlite()

  const activeChanges = sqlite.prepare(`
    SELECT id FROM changes
    WHERE project_id = ? AND status = 'active'
  `).all(projectId) as Array<{ id: string }>

  let updated = 0
  let failed = 0

  for (const change of activeChanges) {
    const success = await updateArtifactStatusCache(change.id, projectPath, projectId)
    if (success) {
      updated++
    } else {
      failed++
    }
  }

  return { updated, failed }
}
