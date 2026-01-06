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

  for (const group of parsed.groups as ExtendedGroup[]) {
    const majorOrder = group.majorOrder ?? 1
    const majorTitle = group.majorTitle ?? group.title
    const subOrder = group.subOrder ?? 1
    const groupTitle = group.groupTitle ?? group.title

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
            majorOrder,
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
            majorOrder,
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

  for (const group of parsed.groups as ExtendedGroup[]) {
    const majorOrder = group.majorOrder ?? 1
    const majorTitle = group.majorTitle ?? group.title
    const subOrder = group.subOrder ?? 1
    const groupTitle = group.groupTitle ?? group.title

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
            majorOrder,
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
            majorOrder,
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
