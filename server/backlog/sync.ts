/**
 * Backlog.md ↔ DB 동기화 모듈
 *
 * 마크다운 파일이 소스 오브 트루스:
 * - backlog/*.md 파일 변경 감지 → DB 업데이트
 * - UI에서 수정 시 → 마크다운 파일 업데이트 → DB 캐시 갱신
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import {
  parseBacklogFile,
  serializeBacklogTask,
  extractTaskIdFromFilename,
  generateBacklogFilename,
  type BacklogTask,
} from './parser.js'
import { getSqlite, getNextTaskId } from '../tasks/db/client.js'
import { tasks as tasksTable } from '../tasks/db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'

const BACKLOG_DIR = 'backlog'

/**
 * 프로젝트의 backlog 디렉토리 경로 반환
 */
export function getBacklogPath(projectPath: string): string {
  return join(projectPath, BACKLOG_DIR)
}

/**
 * backlog 디렉토리 존재 여부 확인 및 생성
 */
export async function ensureBacklogDir(projectPath: string): Promise<string> {
  const backlogPath = getBacklogPath(projectPath)

  if (!existsSync(backlogPath)) {
    await mkdir(backlogPath, { recursive: true })
  }

  return backlogPath
}

/**
 * 프로젝트의 모든 backlog 파일 읽기
 */
export async function readBacklogFiles(
  projectPath: string
): Promise<BacklogTask[]> {
  const backlogPath = getBacklogPath(projectPath)

  if (!existsSync(backlogPath)) {
    return []
  }

  const files = await readdir(backlogPath)
  const mdFiles = files.filter((f) => f.endsWith('.md'))

  const tasks: BacklogTask[] = []

  await Promise.all(
    mdFiles.map(async (filename) => {
      const filePath = join(backlogPath, filename)

      try {
        const content = await readFile(filePath, 'utf-8')
        const fileStats = await stat(filePath)
        const task = parseBacklogFile(content, filePath)

        if (task) {
          task.fileModifiedAt = fileStats.mtime.toISOString()
          tasks.push(task)
        }
      } catch (error) {
        console.error(`Failed to read backlog file: ${filename}`, error)
      }
    })
  )

  return tasks
}

/**
 * BacklogTask를 DB에 동기화 (upsert)
 */
export async function syncBacklogTaskToDb(
  projectId: string,
  task: BacklogTask
): Promise<number> {
  const db = getSqlite()
  const now = new Date()

  // 기존 태스크 찾기 (backlogFileId로)
  const existing = db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.projectId, projectId),
        eq(tasksTable.backlogFileId, task.backlogFileId)
      )
    )
    .get()

  if (existing) {
    // 업데이트
    db.update(tasksTable)
      .set({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        tags: task.labels ? JSON.stringify(task.labels) : null,
        assignee: task.assignees?.[0] || null,
        plan: task.plan,
        acceptanceCriteria: task.acceptanceCriteria,
        notes: task.notes,
        blockedBy: task.blockedBy ? JSON.stringify(task.blockedBy) : null,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        milestone: task.milestone,
        updatedAt: now,
      })
      .where(eq(tasksTable.id, existing.id))
      .run()

    return existing.id
  } else {
    // 새로 생성
    const newId = getNextTaskId('backlog')

    // parent 처리: backlogFileId로 parentTaskId 찾기
    let parentTaskId: number | null = null
    if (task.parent) {
      const parentTask = db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.projectId, projectId),
            eq(tasksTable.backlogFileId, task.parent)
          )
        )
        .get()

      if (parentTask) {
        parentTaskId = parentTask.id
      }
    }

    db.insert(tasksTable)
      .values({
        id: newId,
        projectId,
        changeId: null, // 독립 태스크
        stage: 'task',
        origin: 'backlog',
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        tags: task.labels ? JSON.stringify(task.labels) : null,
        assignee: task.assignees?.[0] || null,
        order: 0,
        plan: task.plan,
        acceptanceCriteria: task.acceptanceCriteria,
        notes: task.notes,
        blockedBy: task.blockedBy ? JSON.stringify(task.blockedBy) : null,
        parentTaskId,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        milestone: task.milestone,
        backlogFileId: task.backlogFileId,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return newId
  }
}

/**
 * 프로젝트의 모든 backlog 파일을 DB에 동기화
 */
export async function syncBacklogToDb(
  projectId: string,
  projectPath: string
): Promise<{ synced: number; created: number; updated: number; deleted: number }> {
  const tasks = await readBacklogFiles(projectPath)
  const db = getSqlite()

  let created = 0
  let updated = 0

  // 현재 DB에 있는 backlog 태스크의 fileId 목록
  const existingTasks = db
    .select({ id: tasksTable.id, backlogFileId: tasksTable.backlogFileId })
    .from(tasksTable)
    .where(
      and(eq(tasksTable.projectId, projectId), eq(tasksTable.origin, 'backlog'))
    )
    .all()

  const existingFileIds = new Set(
    existingTasks.map((t) => t.backlogFileId).filter(Boolean)
  )
  const newFileIds = new Set(tasks.map((t) => t.backlogFileId))

  // 파일에서 삭제된 태스크 처리
  const deletedFileIds = [...existingFileIds].filter(
    (id) => id && !newFileIds.has(id)
  )
  let deleted = 0

  if (deletedFileIds.length > 0) {
    // 삭제된 파일의 태스크는 archived로 변경
    db.update(tasksTable)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasksTable.projectId, projectId),
          eq(tasksTable.origin, 'backlog'),
          inArray(tasksTable.backlogFileId, deletedFileIds as string[])
        )
      )
      .run()
    deleted = deletedFileIds.length
  }

  // 각 태스크 동기화
  for (const task of tasks) {
    const wasExisting = existingFileIds.has(task.backlogFileId)
    await syncBacklogTaskToDb(projectId, task)

    if (wasExisting) {
      updated++
    } else {
      created++
    }
  }

  return {
    synced: tasks.length,
    created,
    updated,
    deleted,
  }
}

/**
 * DB 태스크를 backlog 파일로 저장
 * (UI에서 수정 시 호출)
 */
export async function saveTaskToBacklogFile(
  projectPath: string,
  task: BacklogTask
): Promise<string> {
  const backlogPath = await ensureBacklogDir(projectPath)
  const filename = generateBacklogFilename(task.backlogFileId, task.title)
  const filePath = join(backlogPath, filename)

  const content = serializeBacklogTask(task)
  await writeFile(filePath, content, 'utf-8')

  return filePath
}

/**
 * 새 태스크 ID 생성 (가장 큰 ID + 1)
 */
export async function generateNewBacklogTaskId(
  projectPath: string
): Promise<string> {
  const tasks = await readBacklogFiles(projectPath)

  let maxId = 0
  for (const task of tasks) {
    const match = task.backlogFileId.match(/^task-(\d+)$/)
    if (match) {
      const id = parseInt(match[1])
      if (id > maxId) {
        maxId = id
      }
    }
  }

  return `task-${String(maxId + 1).padStart(3, '0')}`
}

/**
 * DB에서 backlog 태스크 조회
 */
export function getBacklogTasksFromDb(projectId: string) {
  const db = getSqlite()

  return db
    .select()
    .from(tasksTable)
    .where(
      and(eq(tasksTable.projectId, projectId), eq(tasksTable.origin, 'backlog'))
    )
    .all()
}

/**
 * 단일 backlog 태스크를 DB에서 조회
 */
export function getBacklogTaskFromDb(projectId: string, backlogFileId: string) {
  const db = getSqlite()

  return db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.projectId, projectId),
        eq(tasksTable.backlogFileId, backlogFileId)
      )
    )
    .get()
}
