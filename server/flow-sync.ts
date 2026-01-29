/**
 * Flow Changes 동기화 서비스
 * OpenSpec 파일 시스템에서 DB로 changes와 tasks를 동기화
 */
import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadConfig } from './config.js'
import { initDb } from './tasks/index.js'
import { getSqlite } from './tasks/db/client.js'
import { parseTasksFile } from './parser.js'
import { parseSpecFile } from '@zyflow/parser'
import { syncSpecTagsFromFile, syncSpecAcceptanceFromFile, type MoaiSyncResult } from './sync-tasks.js'

export interface SyncResult {
  synced: number
  created: number
  updated: number
  projects: number
}

/**
 * 모든 프로젝트의 OpenSpec changes를 DB에 동기화
 */
export async function syncFlowChanges(): Promise<SyncResult> {
  // DB 초기화
  initDb()
  
  const config = await loadConfig()
  
  if (!config.projects.length) {
    return { synced: 0, created: 0, updated: 0, projects: 0 }
  }

  const sqlite = getSqlite()
  let totalCreated = 0
  let totalUpdated = 0
  let projectsSynced = 0

  // 모든 프로젝트 순회
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

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue

      const changeId = entry.name
      const changeDir = join(openspecDir, changeId)

      // Read proposal.md for title
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

      // Check if change exists
      const existing = sqlite
        .prepare('SELECT id FROM changes WHERE id = ? AND project_id = ?')
        .get(changeId, project.id)
      const now = Date.now()

      if (existing) {
        sqlite
          .prepare(`
            UPDATE changes SET title = ?, spec_path = ?, updated_at = ? WHERE id = ? AND project_id = ?
          `)
          .run(title, specPath, now, changeId, project.id)
        totalUpdated++
      } else {
        sqlite
          .prepare(`
            INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
          `)
          .run(changeId, project.id, title, specPath, now, now)
        totalCreated++
      }

      // Sync tasks from tasks.md
      try {
        const tasksPath = join(changeDir, 'tasks.md')
        const tasksContent = await readFile(tasksPath, 'utf-8')
        const parsed = parseTasksFile(changeId, tasksContent)

        // Extended group type with 3-level hierarchy
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

        // 파일에서 파싱된 모든 displayId 수집 (삭제 감지용)
        const parsedDisplayIds = new Set<string>()

        for (const group of parsed.groups as ExtendedGroup[]) {
          // 3단계 계층 정보 추출
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
                  project.id,
                  now,
                  existingTask.id
                )
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
                  project.id,
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
            }
          }
        }

        // 파일에서 삭제된 태스크 정리
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
            }
          }
        }
      } catch {
        // tasks.md not found or parse error
      }
    }
  }

  return {
    synced: totalCreated + totalUpdated,
    created: totalCreated,
    updated: totalUpdated,
    projects: projectsSynced,
  }
}

// =============================================
// MoAI SPEC Scan Functions (TAG-004)
// =============================================

/**
 * Result of scanning MoAI SPEC directories
 */
export interface MoaiScanResult {
  specsFound: number
  specsProcessed: number
  totalCreated: number
  totalUpdated: number
  totalArchived: number
  errors: string[]
}

/**
 * Scan .moai/specs directory and sync all SPECs to DB
 * Creates/updates changes records and syncs TAGs and acceptance criteria
 */
export async function scanMoaiSpecs(
  projectPath: string,
  projectId: string
): Promise<MoaiScanResult> {
  const result: MoaiScanResult = {
    specsFound: 0,
    specsProcessed: 0,
    totalCreated: 0,
    totalUpdated: 0,
    totalArchived: 0,
    errors: [],
  }

  const specsDir = join(projectPath, '.moai', 'specs')

  if (!existsSync(specsDir)) {
    return result
  }

  try {
    const entries = await readdir(specsDir)
    const specDirs = entries.filter((e) => e.startsWith('SPEC-'))
    result.specsFound = specDirs.length

    const sqlite = getSqlite()
    const now = Date.now()

    for (const specId of specDirs) {
      const specDir = join(specsDir, specId)

      try {
        // Verify it's a directory
        const specStat = await stat(specDir)
        if (!specStat.isDirectory()) continue

        // Read spec.md for title
        let title = specId
        const specPath = join(specDir, 'spec.md')

        if (existsSync(specPath)) {
          try {
            const specContent = await readFile(specPath, 'utf-8')
            const parsed = parseSpecFile(specContent)
            if (parsed.frontmatter.title) {
              title = String(parsed.frontmatter.title)
            }
          } catch {
            // Parse error, use specId as title
          }
        }

        // Upsert change record
        const existing = sqlite
          .prepare(`SELECT id FROM changes WHERE id = ? AND project_id = ?`)
          .get(specId, projectId)

        if (!existing) {
          sqlite
            .prepare(`
              INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
            `)
            .run(specId, projectId, title, `.moai/specs/${specId}/spec.md`, now, now)
        } else {
          sqlite
            .prepare(`UPDATE changes SET title = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
            .run(title, now, specId, projectId)
        }

        // Sync TAG chain from plan.md
        const tagResult = await syncSpecTagsFromFile(specId, projectPath, projectId)
        result.totalCreated += tagResult.created
        result.totalUpdated += tagResult.updated
        result.totalArchived += tagResult.archived
        result.errors.push(...tagResult.errors)

        // Sync acceptance criteria from acceptance.md
        const acResult = await syncSpecAcceptanceFromFile(specId, projectPath, projectId)
        result.totalCreated += acResult.created
        result.totalUpdated += acResult.updated
        result.totalArchived += acResult.archived
        result.errors.push(...acResult.errors)

        result.specsProcessed++
      } catch (err) {
        result.errors.push(
          `Failed to process ${specId}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  } catch (err) {
    result.errors.push(
      `Failed to scan specs directory: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return result
}

/**
 * Sync all MoAI SPECs from all projects
 * Wrapper around scanMoaiSpecs that iterates through all configured projects
 */
export async function syncAllMoaiSpecs(): Promise<{
  projectsSynced: number
  totalCreated: number
  totalUpdated: number
  totalArchived: number
  errors: string[]
}> {
  const config = await loadConfig()

  if (!config.projects.length) {
    return {
      projectsSynced: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalArchived: 0,
      errors: [],
    }
  }

  let projectsSynced = 0
  let totalCreated = 0
  let totalUpdated = 0
  let totalArchived = 0
  const allErrors: string[] = []

  for (const project of config.projects) {
    try {
      const result = await scanMoaiSpecs(project.path, project.id)

      if (result.specsProcessed > 0) {
        projectsSynced++
      }

      totalCreated += result.totalCreated
      totalUpdated += result.totalUpdated
      totalArchived += result.totalArchived
      allErrors.push(...result.errors)
    } catch (err) {
      allErrors.push(
        `Failed to sync MoAI specs for project ${project.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  return {
    projectsSynced,
    totalCreated,
    totalUpdated,
    totalArchived,
    errors: allErrors,
  }
}
