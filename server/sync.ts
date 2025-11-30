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
          // 새 태스크 생성 (3단계 계층 정보 포함)
          sqlite.prepare(`
            INSERT INTO tasks (
              change_id, stage, title, status, priority, "order",
              group_title, group_order, task_order, major_title, sub_order,
              created_at, updated_at
            )
            VALUES (?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, ?)
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

    console.log(`[Sync] ${changeId}: ${tasksCreated} created, ${tasksUpdated} updated`)
  } catch (error) {
    // tasks.md not found or parse error
    console.warn(`[Sync] Error syncing ${changeId}:`, error)
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
          // 새 태스크 생성 (3단계 계층 정보 포함)
          sqlite.prepare(`
            INSERT INTO tasks (
              change_id, stage, title, status, priority, "order",
              group_title, group_order, task_order, major_title, sub_order,
              created_at, updated_at
            )
            VALUES (?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, ?)
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
  } catch (error) {
    // tasks.md not found or parse error
    console.warn(`[Sync] Error syncing ${changeId} (${projectPath}):`, error)
  }

  return { changeId, tasksCreated, tasksUpdated }
}
