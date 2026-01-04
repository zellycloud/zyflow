/**
 * Inbox → Backlog 마이그레이션 모듈
 *
 * 기존 Inbox (origin='inbox') 태스크를 backlog/*.md 파일로 변환
 * 변환 후 origin을 'backlog'로 업데이트
 */

import { getDb, getSqlite } from '../tasks/db/client.js'
import { tasks as tasksTable } from '../tasks/db/schema.js'
import { eq, and, isNull, ne } from 'drizzle-orm'
import {
  ensureBacklogDir,
  generateNewBacklogTaskId,
  saveTaskToBacklogFile,
  syncBacklogTaskToDb,
} from './sync.js'
import { type BacklogTask, serializeBacklogTask } from './parser.js'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export interface MigrationResult {
  success: boolean
  migratedCount: number
  skippedCount: number
  errors: string[]
  tasks: Array<{
    id: number
    title: string
    backlogFileId: string
    status: 'migrated' | 'skipped' | 'error'
    reason?: string
  }>
}

export interface InboxTaskInfo {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  tags: string | null
  assignee: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 마이그레이션 대상 Inbox 태스크 목록 조회
 * - origin이 'inbox'이고
 * - changeId가 null (독립 태스크)이고
 * - status가 'archived'가 아닌 것
 */
export function getInboxTasksForMigration(projectId: string): InboxTaskInfo[] {
  const db = getDb()

  const result = db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      tags: tasksTable.tags,
      assignee: tasksTable.assignee,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.projectId, projectId),
        eq(tasksTable.origin, 'inbox'),
        isNull(tasksTable.changeId),
        ne(tasksTable.status, 'archived')
      )
    )
    .all()

  return result as InboxTaskInfo[]
}

/**
 * 단일 Inbox 태스크를 Backlog 파일로 변환
 */
async function migrateInboxTask(
  projectId: string,
  projectPath: string,
  task: InboxTaskInfo,
  backlogFileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Inbox 태스크를 BacklogTask 형식으로 변환
    const backlogTask: BacklogTask = {
      backlogFileId,
      title: task.title,
      status: task.status as BacklogTask['status'],
      priority: task.priority as BacklogTask['priority'],
      description: task.description || undefined,
      assignees: task.assignee ? [task.assignee] : undefined,
      labels: task.tags ? JSON.parse(task.tags) : undefined,
      filePath: '', // 아직 미정
    }

    // 마크다운 파일 생성
    const backlogPath = await ensureBacklogDir(projectPath)
    const slugTitle = task.title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
    const filename = `${backlogFileId}-${slugTitle}.md`
    const filePath = join(backlogPath, filename)

    backlogTask.filePath = filePath
    const content = serializeBacklogTask(backlogTask)
    await writeFile(filePath, content, 'utf-8')

    // DB 업데이트: origin을 'backlog'로, backlogFileId 설정
    const db = getDb()
    db.update(tasksTable)
      .set({
        origin: 'backlog',
        backlogFileId,
        updatedAt: new Date(),
      })
      .where(eq(tasksTable.id, task.id))
      .run()

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * 프로젝트의 모든 Inbox 태스크를 Backlog로 마이그레이션
 */
export async function migrateInboxToBacklog(
  projectId: string,
  projectPath: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    tasks: [],
  }

  try {
    // 마이그레이션 대상 태스크 조회
    const inboxTasks = getInboxTasksForMigration(projectId)

    if (inboxTasks.length === 0) {
      return result
    }

    // backlog 디렉토리 준비
    await ensureBacklogDir(projectPath)

    // 각 태스크 마이그레이션
    for (const task of inboxTasks) {
      // 새 backlog file ID 생성
      const backlogFileId = await generateNewBacklogTaskId(projectPath)

      const migrationResult = await migrateInboxTask(
        projectId,
        projectPath,
        task,
        backlogFileId
      )

      if (migrationResult.success) {
        result.migratedCount++
        result.tasks.push({
          id: task.id,
          title: task.title,
          backlogFileId,
          status: 'migrated',
        })
      } else {
        result.errors.push(`Task ${task.id}: ${migrationResult.error}`)
        result.tasks.push({
          id: task.id,
          title: task.title,
          backlogFileId,
          status: 'error',
          reason: migrationResult.error,
        })
      }
    }

    result.success = result.errors.length === 0
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.success = false
    result.errors.push(message)
    return result
  }
}

/**
 * 선택된 Inbox 태스크들만 Backlog로 마이그레이션
 */
export async function migrateSelectedInboxTasks(
  projectId: string,
  projectPath: string,
  taskIds: number[]
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    tasks: [],
  }

  try {
    const db = getDb()
    await ensureBacklogDir(projectPath)

    for (const taskId of taskIds) {
      // 태스크 조회
      const task = db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, taskId))
        .get()

      if (!task) {
        result.skippedCount++
        result.tasks.push({
          id: taskId,
          title: '(not found)',
          backlogFileId: '',
          status: 'skipped',
          reason: 'Task not found',
        })
        continue
      }

      // 이미 backlog인 경우 스킵
      if (task.origin === 'backlog') {
        result.skippedCount++
        result.tasks.push({
          id: taskId,
          title: task.title,
          backlogFileId: task.backlogFileId || '',
          status: 'skipped',
          reason: 'Already a backlog task',
        })
        continue
      }

      // Change에 연결된 태스크는 스킵
      if (task.changeId) {
        result.skippedCount++
        result.tasks.push({
          id: taskId,
          title: task.title,
          backlogFileId: '',
          status: 'skipped',
          reason: 'Task is linked to a Change',
        })
        continue
      }

      const backlogFileId = await generateNewBacklogTaskId(projectPath)

      const migrationResult = await migrateInboxTask(
        projectId,
        projectPath,
        {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          tags: task.tags,
          assignee: task.assignee,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        },
        backlogFileId
      )

      if (migrationResult.success) {
        result.migratedCount++
        result.tasks.push({
          id: task.id,
          title: task.title,
          backlogFileId,
          status: 'migrated',
        })
      } else {
        result.errors.push(`Task ${task.id}: ${migrationResult.error}`)
        result.tasks.push({
          id: task.id,
          title: task.title,
          backlogFileId,
          status: 'error',
          reason: migrationResult.error,
        })
      }
    }

    result.success = result.errors.length === 0
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.success = false
    result.errors.push(message)
    return result
  }
}

/**
 * 마이그레이션 미리보기 (실제 변환 없이 대상 목록만 반환)
 */
export function previewMigration(projectId: string): {
  count: number
  tasks: InboxTaskInfo[]
} {
  const tasks = getInboxTasksForMigration(projectId)
  return {
    count: tasks.length,
    tasks,
  }
}
