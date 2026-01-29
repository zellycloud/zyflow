/**
 * Flow Router
 *
 * Flow Changes 및 Tasks 관련 API 라우터 (DB 기반)
 */

import { Router } from 'express'
import { readdir, readFile, writeFile, access, unlink, rename, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { loadConfig, getActiveProject, getProjectById } from '../config.js'
import { parseTasksFile } from '../parser.js'
import { parsePlanFile, parseAcceptanceFile } from '@zyflow/parser'
import { initDb } from '../tasks/index.js'
import { getSqlite } from '../tasks/db/client.js'
import type { Stage, ChangeStatus, TaskOrigin } from '../tasks/db/schema.js'
import { emit } from '../websocket.js'

// Remote plugin is optional - only load if installed
interface RemotePlugin {
  getRemoteServerById: (id: string) => Promise<unknown>
  listDirectory: (server: unknown, path: string) => Promise<{ entries: Array<{ type: string; name: string }> }>
  readRemoteFile: (server: unknown, path: string) => Promise<string>
}

let remotePlugin: RemotePlugin | null = null

async function getRemotePlugin(): Promise<RemotePlugin | null> {
  if (remotePlugin) return remotePlugin
  try {
    const mod = await import('@zyflow/remote-plugin')
    remotePlugin = mod as unknown as RemotePlugin
    return remotePlugin
  } catch {
    return null
  }
}

import {
  syncBacklogToDb,
  saveTaskToBacklogFile,
  generateNewBacklogTaskId,
  getBacklogPath,
  ensureBacklogDir,
  type BacklogTask,
  // Migration
  previewMigration,
  migrateInboxToBacklog,
  migrateSelectedInboxTasks,
} from '../backlog/index.js'
import { serializeBacklogTask, generateBacklogFilename } from '../backlog/parser.js'
import { syncChangeTasksFromFile, syncChangeTasksForProject, syncRemoteChangeTasksForProject } from '../sync-tasks.js'

const execAsync = promisify(exec)

export const flowRouter = Router()

// Stage order for progress calculation
const STAGES: Stage[] = ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']

// Initialize task database
async function initTaskDb() {
  initDb()
}

// Helper to get paths for active project
async function getProjectPaths() {
  const project = await getActiveProject()
  if (!project) {
    return null
  }
  return {
    projectPath: project.path,
    openspecDir: join(project.path, 'openspec', 'changes'),
    specsDir: join(project.path, 'openspec', 'specs'),
    plansDir: join(project.path, '.zyflow', 'plans'),
  }
}

// Helper to get project info for a specific change (supports remote projects)
async function getProjectForChange(changeId: string) {
  initDb()
  const config = await loadConfig()
  const sqlite = getSqlite()

  // Find the change in database to get project_id
  const change = sqlite
    .prepare('SELECT project_id FROM changes WHERE id = ?')
    .get(changeId) as { project_id: string } | undefined

  if (!change) return null

  // Find the project from config
  const project = config.projects.find((p) => p.id === change.project_id)
  return project || null
}

// Helper to find archive folder path for a change (remote projects use date-prefixed folders)
async function findRemoteArchivePath(
  plugin: RemotePlugin,
  server: unknown,
  archiveDir: string,
  changeId: string
): Promise<string | null> {
  try {
    const result = await plugin.listDirectory(server, archiveDir)
    // Archive folders are named like "2026-01-17-change-id" or just "change-id"
    const matchingFolder = result.entries.find(
      (entry) => entry.type === 'directory' && (entry.name === changeId || entry.name.endsWith(`-${changeId}`))
    )
    return matchingFolder ? `${archiveDir}/${matchingFolder.name}` : null
  } catch {
    return null
  }
}

// Helper: Get stages for a change
function getChangeStages(changeId: string, projectId?: string) {
  const sqlite = getSqlite()
  const stages: Record<Stage, { total: number; completed: number; tasks: unknown[] }> = {
    spec: { total: 0, completed: 0, tasks: [] },
    changes: { total: 0, completed: 0, tasks: [] },
    task: { total: 0, completed: 0, tasks: [] },
    code: { total: 0, completed: 0, tasks: [] },
    test: { total: 0, completed: 0, tasks: [] },
    commit: { total: 0, completed: 0, tasks: [] },
    docs: { total: 0, completed: 0, tasks: [] },
  }

  // project_id가 있으면 함께 조건 추가
  const sql = projectId
    ? `SELECT * FROM tasks WHERE change_id = ? AND project_id = ? AND status != 'archived' ORDER BY stage, group_order, sub_order, task_order, "order"`
    : `SELECT * FROM tasks WHERE change_id = ? AND status != 'archived' ORDER BY stage, group_order, sub_order, task_order, "order"`
  const params = projectId ? [changeId, projectId] : [changeId]

  let tasks = sqlite.prepare(sql).all(...params) as Array<{
    id: number
    change_id: string
    stage: Stage
    title: string
    description: string | null
    status: string
    priority: string
    tags: string | null
    assignee: string | null
    order: number
    group_title: string | null
    group_order: number
    task_order: number
    major_title: string | null
    sub_order: number | null
    display_id: string | null
    created_at: number
    updated_at: number
    archived_at: number | null
  }>

  // Fallback: project_id로 필터링했는데 결과가 없으면, project_id 없이 재시도 (레거시 데이터 지원)
  if (tasks.length === 0 && projectId) {
    const fallbackSql = `SELECT * FROM tasks WHERE change_id = ? AND status != 'archived' ORDER BY stage, group_order, sub_order, task_order, "order"`
    tasks = sqlite.prepare(fallbackSql).all(changeId) as typeof tasks
  }

  for (const task of tasks) {
    const stage = task.stage as Stage
    stages[stage].total++
    if (task.status === 'done') {
      stages[stage].completed++
    }
    stages[stage].tasks.push({
      id: task.id,
      changeId: task.change_id,
      stage: task.stage,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      tags: task.tags ? JSON.parse(task.tags) : [],
      assignee: task.assignee,
      order: task.order,
      groupTitle: task.group_title,
      groupOrder: task.group_order,
      taskOrder: task.task_order,
      majorTitle: task.major_title,
      subOrder: task.sub_order,
      displayId: task.display_id,
      createdAt: new Date(task.created_at).toISOString(),
      updatedAt: new Date(task.updated_at).toISOString(),
      archivedAt: task.archived_at ? new Date(task.archived_at).toISOString() : null,
    })
  }

  return stages
}

// Helper: Calculate progress
function calculateProgress(stages: Record<Stage, { total: number; completed: number }>): number {
  let totalTasks = 0
  let completedTasks = 0
  for (const stage of STAGES) {
    totalTasks += stages[stage].total
    completedTasks += stages[stage].completed
  }
  return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
}

// Helper: Determine current stage
function determineCurrentStage(stages: Record<Stage, { total: number; completed: number }>): Stage {
  for (const stage of STAGES) {
    if (stages[stage].total > stages[stage].completed) {
      return stage
    }
  }
  return 'docs'
}

// Helper: Get stages for a remote change via SSH
async function getRemoteChangeStages(
  changeId: string,
  project: { path: string; remote: { serverId: string } }
): Promise<Record<Stage, { total: number; completed: number; tasks: unknown[] }>> {
  const stages: Record<Stage, { total: number; completed: number; tasks: unknown[] }> = {
    spec: { total: 0, completed: 0, tasks: [] },
    changes: { total: 0, completed: 0, tasks: [] },
    task: { total: 0, completed: 0, tasks: [] },
    code: { total: 0, completed: 0, tasks: [] },
    test: { total: 0, completed: 0, tasks: [] },
    commit: { total: 0, completed: 0, tasks: [] },
    docs: { total: 0, completed: 0, tasks: [] },
  }

  try {
    const plugin = await import('@zyflow/remote-plugin')
    const server = await plugin.getRemoteServerById(project.remote.serverId)
    if (!server) return stages

    const tasksPath = `${project.path}/openspec/changes/${changeId}/tasks.md`
    const tasksContent = await plugin.readRemoteFile(server, tasksPath)

    const parsed = parseTasksFile(changeId, tasksContent)

    // ExtendedTaskGroup 타입으로 캐스팅하여 확장 필드 접근
    interface ExtendedGroup {
      title: string
      tasks: Array<{
        id: string
        title: string
        completed: boolean
        lineNumber: number
        displayId?: string
      }>
      majorOrder?: number
      majorTitle?: string
      subOrder?: number
      groupTitle?: string
      groupOrder?: number
    }

    // tasks.md의 모든 태스크는 'task' stage에 매핑
    for (const group of parsed.groups as ExtendedGroup[]) {
      const majorOrder = group.majorOrder ?? 1
      const majorTitle = group.majorTitle ?? group.title
      const subOrder = group.subOrder ?? 1
      const groupTitle = group.groupTitle ?? group.title
      const groupOrder = group.groupOrder ?? majorOrder

      for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
        const task = group.tasks[taskIdx]
        const taskOrder = taskIdx + 1

        stages.task.total++
        if (task.completed) {
          stages.task.completed++
        }
        stages.task.tasks.push({
          id: task.id,
          changeId,
          stage: 'task',
          title: task.title,
          description: null,
          status: task.completed ? 'done' : 'todo',
          priority: 'medium',
          tags: [],
          assignee: null,
          order: taskOrder,
          groupTitle,
          groupOrder,
          taskOrder,
          majorTitle,
          subOrder,
          displayId: task.displayId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: null,
        })
      }
    }
  } catch (error) {
    console.error('Failed to get remote change stages:', error)
  }

  return stages
}

// =============================================
// MoAI SPEC Support Functions (TAG-005)
// =============================================

// Helper: Check if ID is MoAI SPEC format (SPEC-XXX)
function isMoaiSpecId(id: string): boolean {
  return id.startsWith('SPEC-')
}

// Helper: Calculate TAG progress from plan.md
async function calculateTagProgress(
  specId: string,
  projectPath: string
): Promise<{ completed: number; total: number; percentage: number } | null> {
  try {
    const planPath = join(projectPath, '.moai', 'specs', specId, 'plan.md')
    if (!existsSync(planPath)) {
      return null
    }

    const content = await readFile(planPath, 'utf-8')
    const parsed = parsePlanFile(content)

    const completed = parsed.tags.filter((t) => t.completed).length
    const total = parsed.tags.length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { completed, total, percentage }
  } catch {
    return null
  }
}

// Helper: Get MoAI SPEC detail with spec.md, plan.md, acceptance.md content
async function getMoaiSpecDetail(
  specId: string,
  projectId?: string
): Promise<{
  id: string
  title: string
  type: 'spec'
  status: string
  currentStage: Stage
  progress: number
  createdAt: string
  updatedAt: string
  spec: { content: string | null; title?: string } | null
  plan: { content: string | null; tags: unknown[] | null; progress: { completed: number; total: number; percentage: number } | null } | null
  acceptance: { content: string | null; criteria: unknown[] | null } | null
  stages: Record<Stage, { total: number; completed: number; tasks: unknown[] }>
} | null> {
  try {
    const sqlite = getSqlite()

    // Get change record from DB
    let change
    if (projectId) {
      change = sqlite
        .prepare(`SELECT * FROM changes WHERE id = ? AND project_id = ?`)
        .get(specId, projectId) as {
        id: string
        project_id: string
        title: string
        spec_path: string | null
        status: ChangeStatus
        current_stage: Stage
        progress: number
        created_at: number
        updated_at: number
      } | undefined
    } else {
      change = sqlite
        .prepare(`SELECT * FROM changes WHERE id = ?`)
        .get(specId) as typeof change
    }

    if (!change) {
      return null
    }

    // Get project path
    const config = await loadConfig()
    const project = config.projects.find((p) => p.id === change.project_id)
    if (!project) {
      return null
    }

    const projectPath = project.path
    const specsDir = join(projectPath, '.moai', 'specs', specId)

    // Read spec.md
    let specContent = null
    let specTitle = change.title
    const specPath = join(specsDir, 'spec.md')
    if (existsSync(specPath)) {
      try {
        specContent = await readFile(specPath, 'utf-8')
        // Try to extract title from spec.md frontmatter
        const titleMatch = specContent.match(/^title:\s+(.+)$/m)
        if (titleMatch) {
          specTitle = titleMatch[1].trim().replace(/^["']|["']$/g, '')
        }
      } catch {
        // spec.md not readable
      }
    }

    // Read plan.md and parse TAGs
    let planContent = null
    let tags = null
    let tagProgress = null
    const planPath = join(specsDir, 'plan.md')
    if (existsSync(planPath)) {
      try {
        planContent = await readFile(planPath, 'utf-8')
        const parsed = parsePlanFile(planContent)
        tags = parsed.tags
        tagProgress = await calculateTagProgress(specId, projectPath)
      } catch {
        // plan.md not readable or parse error
      }
    }

    // Read acceptance.md and parse criteria
    let acceptanceContent = null
    let criteria = null
    const acceptancePath = join(specsDir, 'acceptance.md')
    if (existsSync(acceptancePath)) {
      try {
        acceptanceContent = await readFile(acceptancePath, 'utf-8')
        const parsed = parseAcceptanceFile(acceptanceContent)
        criteria = parsed.criteria
      } catch {
        // acceptance.md not readable or parse error
      }
    }

    // Get stages for compatibility with OpenSpec format
    const stages = getChangeStages(specId, change.project_id)

    return {
      id: change.id,
      title: specTitle,
      type: 'spec',
      status: change.status,
      currentStage: change.current_stage,
      progress: change.progress,
      createdAt: new Date(change.created_at).toISOString(),
      updatedAt: new Date(change.updated_at).toISOString(),
      spec: specContent ? { content: specContent, title: specTitle } : null,
      plan: planContent ? { content: planContent, tags, progress: tagProgress } : null,
      acceptance: acceptanceContent ? { content: acceptanceContent, criteria } : null,
      stages,
    }
  } catch (error) {
    console.error('Error getting MoAI SPEC detail:', error)
    return null
  }
}

// GET /changes/counts - 프로젝트별 Change 수 (상태별 집계)
flowRouter.get('/changes/counts', async (req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()
    const sqlite = getSqlite()

    const { status } = req.query

    const counts: Record<string, number> = {}
    const detailedCounts: Record<string, { active: number; completed: number; total: number }> = {}

    const projectIds = config.projects.map((p) => p.id)
    const placeholders = projectIds.map(() => '?').join(',')

    const detailedResults = sqlite
      .prepare(
        `
      SELECT
        project_id,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        COUNT(*) as total
      FROM changes
      WHERE project_id IN (${placeholders})
      GROUP BY project_id
    `
      )
      .all(...projectIds) as Array<{
      project_id: string
      active: number
      completed: number
      total: number
    }>

    for (const project of config.projects) {
      const projectResult = detailedResults.find((r) => r.project_id === project.id)

      let count = 0
      if (status === 'active') {
        count = projectResult?.active ?? 0
      } else if (status === 'completed') {
        count = projectResult?.completed ?? 0
      } else {
        count = projectResult?.total ?? 0
      }
      counts[project.id] = count

      detailedCounts[project.id] = {
        active: projectResult?.active ?? 0,
        completed: projectResult?.completed ?? 0,
        total: projectResult?.total ?? 0,
      }
    }

    const responseData = { counts, detailed: detailedCounts }

    res.json({ success: true, data: responseData })
  } catch (error) {
    console.error('Error getting change counts:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// GET /changes - Flow Changes 목록 (DB 기반)
flowRouter.get('/changes', async (_req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()
    if (!project) {
      return res.json({ success: true, data: { changes: [] } })
    }

    const sqlite = getSqlite()
    const dbChanges = sqlite
      .prepare(
        `
      SELECT * FROM changes
      WHERE project_id = ? AND status != 'archived'
      ORDER BY updated_at DESC
    `
      )
      .all(project.id) as Array<{
      id: string
      project_id: string
      title: string
      spec_path: string | null
      status: ChangeStatus
      current_stage: Stage
      progress: number
      created_at: number
      updated_at: number
    }>

    const changes = dbChanges.map((c) => {
      const stages = getChangeStages(c.id, project.id)
      const progress = calculateProgress(stages)
      const currentStage = determineCurrentStage(stages)

      return {
        id: c.id,
        projectId: c.project_id,
        title: c.title,
        specPath: c.spec_path,
        status: c.status,
        currentStage,
        progress,
        createdAt: new Date(c.created_at).toISOString(),
        updatedAt: new Date(c.updated_at).toISOString(),
        stages,
      }
    })

    res.json({ success: true, data: { changes } })
  } catch (error) {
    console.error('Error listing flow changes:', error)
    res.status(500).json({ success: false, error: 'Failed to list flow changes' })
  }
})

// GET /changes/:id - Flow Change 상세 (stages 포함, MoAI SPEC 지원)
flowRouter.get('/changes/:id', async (req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()
    const activeProjectId = config.activeProjectId

    // Check if this is a MoAI SPEC ID (SPEC-XXX format)
    if (isMoaiSpecId(req.params.id)) {
      const specDetail = await getMoaiSpecDetail(req.params.id, activeProjectId)
      if (specDetail) {
        return res.json({
          success: true,
          data: {
            change: specDetail,
          },
        })
      }
    }

    const sqlite = getSqlite()

    // 활성 프로젝트에서 우선 조회 (같은 changeId가 여러 프로젝트에 있을 수 있음)
    let change = activeProjectId
      ? (sqlite
          .prepare(`SELECT * FROM changes WHERE id = ? AND project_id = ?`)
          .get(req.params.id, activeProjectId) as {
            id: string
            project_id: string
            title: string
            spec_path: string | null
            status: ChangeStatus
            current_stage: Stage
            progress: number
            created_at: number
            updated_at: number
          } | undefined)
      : undefined

    // 활성 프로젝트에 없으면 전체에서 조회 (fallback)
    if (!change) {
      change = sqlite
        .prepare(`SELECT * FROM changes WHERE id = ?`)
        .get(req.params.id) as typeof change
    }

    if (!change) {
      return res.status(404).json({ success: false, error: 'Change not found' })
    }

    const project = config.projects.find((p) => p.id === change.project_id)
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found for this change' })
    }

    // 원격 프로젝트인 경우 SSH로 tasks.md 읽어서 stages 계산
    // 로컬 프로젝트인 경우 DB에서 조회
    const stages = project.remote
      ? await getRemoteChangeStages(change.id, project as { path: string; remote: { serverId: string } })
      : getChangeStages(change.id, project.id)
    const progress = calculateProgress(stages)
    const currentStage = determineCurrentStage(stages)

    let gitCreatedAt: string | null = null
    let gitUpdatedAt: string | null = null
    // 원격 프로젝트가 아닌 경우에만 git 명령 실행
    if (!project.remote) {
      try {
        const relativeChangeDir = `openspec/changes/${change.id}`
        const { stdout: updatedStdout } = await execAsync(
          `git log -1 --format="%aI" -- "${relativeChangeDir}"`,
          { cwd: project.path }
        )
        if (updatedStdout.trim()) {
          gitUpdatedAt = updatedStdout.trim()
        }
        const { stdout: createdStdout } = await execAsync(
          `git log --diff-filter=A --format="%aI" -- "${relativeChangeDir}" | tail -1`,
          { cwd: project.path }
        )
        if (createdStdout.trim()) {
          gitCreatedAt = createdStdout.trim()
        }
      } catch {
        // Git 명령 실패 시 DB 값 사용
      }
    }

    res.json({
      success: true,
      data: {
        change: {
          id: change.id,
          projectId: change.project_id,
          title: change.title,
          specPath: change.spec_path,
          status: change.status,
          currentStage,
          progress,
          createdAt: gitCreatedAt || new Date(change.created_at).toISOString(),
          updatedAt: gitUpdatedAt || new Date(change.updated_at).toISOString(),
        },
        stages,
      },
    })
  } catch (error) {
    console.error('Error getting flow change:', error)
    res.status(500).json({ success: false, error: 'Failed to get flow change' })
  }
})

// POST /sync - OpenSpec에서 Changes 동기화 (모든 프로젝트)
flowRouter.post('/sync', async (_req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()

    if (!config.projects.length) {
      return res.json({ success: true, data: { synced: 0, created: 0, updated: 0, projects: 0 } })
    }

    const sqlite = getSqlite()
    let totalCreated = 0
    let totalUpdated = 0
    let projectsSynced = 0

    for (const project of config.projects) {
      const openspecDir = join(project.path, 'openspec', 'changes')
      let entries
      try {
        entries = await readdir(openspecDir, { withFileTypes: true })
      } catch {
        continue
      }

      projectsSynced++

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'archive') continue

        const changeId = entry.name
        const changeDir = join(openspecDir, changeId)

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

        const existing = sqlite
          .prepare('SELECT id FROM changes WHERE id = ? AND project_id = ?')
          .get(changeId, project.id)
        const now = Date.now()

        if (existing) {
          sqlite
            .prepare(
              `
            UPDATE changes SET title = ?, spec_path = ?, updated_at = ? WHERE id = ? AND project_id = ?
          `
            )
            .run(title, specPath, now, changeId, project.id)
          totalUpdated++
        } else {
          sqlite
            .prepare(
              `
            INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
          `
            )
            .run(changeId, project.id, title, specPath, now, now)
          totalCreated++
        }

        // Sync tasks from tasks.md
        try {
          const tasksPath = join(changeDir, 'tasks.md')
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
                  .prepare(
                    `
                  SELECT id FROM tasks WHERE change_id = ? AND display_id = ?
                `
                  )
                  .get(changeId, displayId) as { id: number } | undefined
              }

              if (!existingTask) {
                existingTask = sqlite
                  .prepare(
                    `
                  SELECT id FROM tasks WHERE change_id = ? AND title = ?
                `
                  )
                  .get(changeId, task.title) as { id: number } | undefined
              }

              if (existingTask) {
                const newStatus = task.completed ? 'done' : 'todo'
                sqlite
                  .prepare(
                    `
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
                `
                  )
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
                  .prepare(
                    `
                  INSERT INTO tasks (
                    id, project_id, change_id, stage, title, status, priority, "order",
                    group_title, group_order, task_order, major_title, sub_order,
                    display_id, origin, created_at, updated_at
                  )
                  VALUES (?, ?, ?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
                `
                  )
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

          if (parsedDisplayIds.size > 0) {
            const dbTasks = sqlite
              .prepare(
                `
              SELECT id, display_id FROM tasks
              WHERE change_id = ? AND display_id IS NOT NULL AND status != 'archived'
            `
              )
              .all(changeId) as Array<{ id: number; display_id: string }>

            for (const dbTask of dbTasks) {
              if (!parsedDisplayIds.has(dbTask.display_id)) {
                sqlite
                  .prepare(
                    `
                  UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?
                `
                  )
                  .run(now, now, dbTask.id)
              }
            }
          }
        } catch {
          // tasks.md not found or parse error
        }
      }
    }

    res.json({
      success: true,
      data: {
        synced: totalCreated + totalUpdated,
        created: totalCreated,
        updated: totalUpdated,
        projects: projectsSynced,
      },
    })
  } catch (error) {
    console.error('Error syncing flow changes:', error)
    res.status(500).json({ success: false, error: 'Failed to sync flow changes' })
  }
})

// GET /tasks - Flow Tasks 목록 (필터링)
flowRouter.get('/tasks', async (req, res) => {
  try {
    await initTaskDb()
    const { changeId, stage, status, standalone, includeArchived, projectId, origin } = req.query

    // projectId 쿼리 파라미터가 있으면 해당 프로젝트 사용, 없으면 활성 프로젝트
    const project = projectId ? await getProjectById(projectId as string) : await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const sqlite = getSqlite()
    let sql = 'SELECT * FROM tasks WHERE project_id = ?'
    const params: unknown[] = [project.id]

    if (standalone === 'true') {
      sql += ' AND change_id IS NULL'
    } else if (changeId) {
      sql += ' AND change_id = ?'
      params.push(changeId)
    }

    // origin 필터 지원 (backlog, inbox, openspec, imported)
    if (origin) {
      sql += ' AND origin = ?'
      params.push(origin)
    }

    if (stage) {
      sql += ' AND stage = ?'
      params.push(stage)
    }

    if (status) {
      sql += ' AND status = ?'
      params.push(status)
    } else if (includeArchived !== 'true') {
      sql += " AND status != 'archived'"
    }

    sql += ' ORDER BY "order", created_at'

    const tasks = sqlite.prepare(sql).all(...params) as Array<{
      id: number
      change_id: string | null
      stage: Stage
      origin: TaskOrigin | null
      title: string
      description: string | null
      status: string
      priority: string
      tags: string | null
      assignee: string | null
      order: number
      display_id: string | null
      // Backlog 확장 필드
      parent_task_id: number | null
      blocked_by: string | null
      plan: string | null
      acceptance_criteria: string | null
      notes: string | null
      due_date: number | null
      milestone: string | null
      backlog_file_id: string | null
      created_at: number
      updated_at: number
      archived_at: number | null
    }>

    const formatted = tasks.map((t) => ({
      id: t.id,
      changeId: t.change_id,
      stage: t.stage,
      origin: t.origin,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      tags: t.tags ? JSON.parse(t.tags) : [],
      assignee: t.assignee,
      order: t.order,
      displayId: t.display_id,
      // Backlog 확장 필드
      parentTaskId: t.parent_task_id,
      blockedBy: t.blocked_by ? JSON.parse(t.blocked_by) : null,
      plan: t.plan,
      acceptanceCriteria: t.acceptance_criteria,
      notes: t.notes,
      dueDate: t.due_date ? new Date(t.due_date).toISOString() : null,
      milestone: t.milestone,
      backlogFileId: t.backlog_file_id,
      createdAt: new Date(t.created_at).toISOString(),
      updatedAt: new Date(t.updated_at).toISOString(),
      archivedAt: t.archived_at ? new Date(t.archived_at).toISOString() : null,
    }))

    res.json({ success: true, data: { tasks: formatted } })
  } catch (error) {
    console.error('Error listing flow tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to list flow tasks' })
  }
})

// POST /tasks - Flow Task 생성
flowRouter.post('/tasks', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }
    const { changeId, stage, title, description, priority } = req.body

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' })
    }

    const sqlite = getSqlite()
    const now = Date.now()

    const result = sqlite
      .prepare(
        `
      INSERT INTO tasks (project_id, change_id, stage, title, description, status, priority, "order", created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'todo', ?, 0, ?, ?)
    `
      )
      .run(
        project.id,
        changeId || null,
        stage || 'task',
        title,
        description || null,
        priority || 'medium',
        now,
        now
      )

    const task = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid)

    emit('task:created', { task })

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error creating flow task:', error)
    res.status(500).json({ success: false, error: 'Failed to create flow task' })
  }
})

// GET /changes/:id/proposal - Change의 proposal.md 내용
flowRouter.get('/changes/:id/proposal', async (req, res) => {
  try {
    const changeId = req.params.id
    const project = await getProjectForChange(changeId)

    if (!project) {
      return res.status(400).json({ success: false, error: 'Project not found for change' })
    }

    const proposalPath = `${project.path}/openspec/changes/${changeId}/proposal.md`
    const archiveDir = `${project.path}/openspec/changes/archive`

    // Remote project: use SSH plugin
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.json({ success: true, data: { changeId, content: null } })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.json({ success: true, data: { changeId, content: null } })
      }

      // Try active changes folder first
      try {
        const content = await plugin.readRemoteFile(server, proposalPath)
        return res.json({ success: true, data: { changeId, content } })
      } catch {
        // Fallback: try archive folder
        const archiveFolderPath = await findRemoteArchivePath(plugin, server, archiveDir, changeId)
        if (archiveFolderPath) {
          try {
            const content = await plugin.readRemoteFile(server, `${archiveFolderPath}/proposal.md`)
            return res.json({ success: true, data: { changeId, content } })
          } catch {
            return res.json({ success: true, data: { changeId, content: null } })
          }
        }
        return res.json({ success: true, data: { changeId, content: null } })
      }
    }

    // Local project: use filesystem
    try {
      const content = await readFile(proposalPath, 'utf-8')
      res.json({ success: true, data: { changeId, content } })
    } catch {
      // Fallback: try archive folder
      const archivePath = join(project.path, 'openspec', 'changes', 'archive', changeId, 'proposal.md')
      try {
        const content = await readFile(archivePath, 'utf-8')
        res.json({ success: true, data: { changeId, content } })
      } catch {
        res.json({ success: true, data: { changeId, content: null } })
      }
    }
  } catch (error) {
    console.error('Error reading proposal:', error)
    res.status(500).json({ success: false, error: 'Failed to read proposal' })
  }
})

// GET /changes/:id/design - Change의 design.md 내용
flowRouter.get('/changes/:id/design', async (req, res) => {
  try {
    const changeId = req.params.id
    const project = await getProjectForChange(changeId)

    if (!project) {
      return res.status(400).json({ success: false, error: 'Project not found for change' })
    }

    const designPath = `${project.path}/openspec/changes/${changeId}/design.md`
    const archiveDir = `${project.path}/openspec/changes/archive`

    // Remote project: use SSH plugin
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.json({ success: true, data: { changeId, content: null } })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.json({ success: true, data: { changeId, content: null } })
      }

      // Try active changes folder first
      try {
        const content = await plugin.readRemoteFile(server, designPath)
        return res.json({ success: true, data: { changeId, content } })
      } catch {
        // Fallback: try archive folder
        const archiveFolderPath = await findRemoteArchivePath(plugin, server, archiveDir, changeId)
        if (archiveFolderPath) {
          try {
            const content = await plugin.readRemoteFile(server, `${archiveFolderPath}/design.md`)
            return res.json({ success: true, data: { changeId, content } })
          } catch {
            return res.json({ success: true, data: { changeId, content: null } })
          }
        }
        return res.json({ success: true, data: { changeId, content: null } })
      }
    }

    // Local project: use filesystem
    try {
      const content = await readFile(designPath, 'utf-8')
      res.json({ success: true, data: { changeId, content } })
    } catch {
      // Fallback: try archive folder
      const archivePath = join(project.path, 'openspec', 'changes', 'archive', changeId, 'design.md')
      try {
        const content = await readFile(archivePath, 'utf-8')
        res.json({ success: true, data: { changeId, content } })
      } catch {
        res.json({ success: true, data: { changeId, content: null } })
      }
    }
  } catch (error) {
    console.error('Error reading design:', error)
    res.status(500).json({ success: false, error: 'Failed to read design' })
  }
})

// GET /changes/:id/spec - Change의 첫 번째 spec.md 내용
flowRouter.get('/changes/:id/spec', async (req, res) => {
  try {
    const changeId = req.params.id
    const project = await getProjectForChange(changeId)

    if (!project) {
      return res.status(400).json({ success: false, error: 'Project not found for change' })
    }

    const specsDir = `${project.path}/openspec/changes/${changeId}/specs`
    const archiveDir = `${project.path}/openspec/changes/archive`

    // Remote project: use SSH plugin
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.json({ success: true, data: { changeId, content: null, specId: null } })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.json({ success: true, data: { changeId, content: null, specId: null } })
      }

      // Try active changes folder first
      try {
        const listing = await plugin.listDirectory(server, specsDir)
        const specFolders = listing.entries
          .filter((e) => e.type === 'directory')
          .map((e) => e.name)

        if (specFolders.length > 0) {
          const firstSpecId = specFolders[0]
          const specPath = `${specsDir}/${firstSpecId}/spec.md`
          const content = await plugin.readRemoteFile(server, specPath)
          return res.json({ success: true, data: { changeId, content, specId: firstSpecId } })
        }
      } catch {
        // Active folder not found, try archive
      }

      // Fallback: try archive folder
      const archiveFolderPath = await findRemoteArchivePath(plugin, server, archiveDir, changeId)
      if (archiveFolderPath) {
        try {
          const archiveSpecsDir = `${archiveFolderPath}/specs`
          const listing = await plugin.listDirectory(server, archiveSpecsDir)
          const specFolders = listing.entries
            .filter((e) => e.type === 'directory')
            .map((e) => e.name)

          if (specFolders.length > 0) {
            const firstSpecId = specFolders[0]
            const specPath = `${archiveSpecsDir}/${firstSpecId}/spec.md`
            const content = await plugin.readRemoteFile(server, specPath)
            return res.json({ success: true, data: { changeId, content, specId: firstSpecId } })
          }
        } catch {
          // Archive specs not found
        }
      }

      return res.json({ success: true, data: { changeId, content: null, specId: null } })
    }

    // Local project: use filesystem
    try {
      const specFolders = await readdir(specsDir)
      if (specFolders.length > 0) {
        const firstSpecId = specFolders[0]
        const specPath = join(specsDir, firstSpecId, 'spec.md')
        const content = await readFile(specPath, 'utf-8')
        return res.json({ success: true, data: { changeId, content, specId: firstSpecId } })
      }
    } catch {
      // Active folder not found, try archive
    }

    // Fallback: try archive folder
    try {
      const archiveSpecsDir = join(project.path, 'openspec', 'changes', 'archive', changeId, 'specs')
      const specFolders = await readdir(archiveSpecsDir)
      if (specFolders.length > 0) {
        const firstSpecId = specFolders[0]
        const specPath = join(archiveSpecsDir, firstSpecId, 'spec.md')
        const content = await readFile(specPath, 'utf-8')
        return res.json({ success: true, data: { changeId, content, specId: firstSpecId } })
      }
    } catch {
      // Archive specs not found
    }

    res.json({ success: true, data: { changeId, content: null, specId: null } })
  } catch (error) {
    console.error('Error reading spec:', error)
    res.status(500).json({ success: false, error: 'Failed to read spec' })
  }
})

// GET /changes/:changeId/specs/:specId - 특정 spec.md 내용
flowRouter.get('/changes/:changeId/specs/:specId', async (req, res) => {
  try {
    const { changeId, specId } = req.params
    const project = await getProjectForChange(changeId)

    if (!project) {
      return res.status(400).json({ success: false, error: 'Project not found for change' })
    }

    const changeSpecPath = `${project.path}/openspec/changes/${changeId}/specs/${specId}/spec.md`
    const archivedSpecPath = `${project.path}/openspec/specs/${specId}/spec.md`

    // Remote project: use SSH plugin
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.json({ success: true, data: { specId, content: null, location: null } })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.json({ success: true, data: { specId, content: null, location: null } })
      }

      // Try change specs first
      try {
        const content = await plugin.readRemoteFile(server, changeSpecPath)
        return res.json({ success: true, data: { specId, content, location: 'change' } })
      } catch {
        // Not found in change, try archived
      }

      // Try archived specs
      try {
        const content = await plugin.readRemoteFile(server, archivedSpecPath)
        return res.json({ success: true, data: { specId, content, location: 'archived' } })
      } catch {
        return res.json({ success: true, data: { specId, content: null, location: null } })
      }
    }

    // Local project: use filesystem
    try {
      const content = await readFile(changeSpecPath, 'utf-8')
      return res.json({ success: true, data: { specId, content, location: 'change' } })
    } catch {
      // Change 내에 없으면 archived specs에서 찾기
    }

    try {
      const content = await readFile(archivedSpecPath, 'utf-8')
      return res.json({ success: true, data: { specId, content, location: 'archived' } })
    } catch {
      return res.json({ success: true, data: { specId, content: null, location: null } })
    }
  } catch (error) {
    console.error('Error reading change spec:', error)
    res.status(500).json({ success: false, error: 'Failed to read spec' })
  }
})

// PATCH /tasks/:id - Flow Task 수정
flowRouter.patch('/tasks/:id', async (req, res) => {
  try {
    await initTaskDb()
    const { changeId, stage, title, description, status, priority, order } = req.body

    const sqlite = getSqlite()
    const existing = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    const updates: string[] = []
    const params: unknown[] = []

    if (changeId !== undefined) {
      updates.push('change_id = ?')
      params.push(changeId)
    }
    if (stage !== undefined) {
      updates.push('stage = ?')
      params.push(stage)
    }
    if (title !== undefined) {
      updates.push('title = ?')
      params.push(title)
    }
    if (description !== undefined) {
      updates.push('description = ?')
      params.push(description)
    }
    if (status !== undefined) {
      updates.push('status = ?')
      params.push(status)
    }
    if (priority !== undefined) {
      updates.push('priority = ?')
      params.push(priority)
    }
    if (order !== undefined) {
      updates.push('"order" = ?')
      params.push(order)
    }

    updates.push('updated_at = ?')
    params.push(Date.now())
    params.push(req.params.id)

    sqlite.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const task = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)

    emit('task:updated', { task })

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error updating flow task:', error)
    res.status(500).json({ success: false, error: 'Failed to update flow task' })
  }
})

// POST /changes/:id/sync - 특정 Change의 tasks.md를 DB에 수동 동기화
flowRouter.post('/changes/:id/sync', async (req, res) => {
  try {
    await initTaskDb()
    const changeId = req.params.id
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    let result: { tasksCreated: number; tasksUpdated: number }

    // 원격 프로젝트인 경우 SSH를 통해 동기화
    if (project.remote?.serverId) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.status(400).json({ success: false, error: 'Remote plugin not installed' })
      }
      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.status(400).json({ success: false, error: 'Remote server not found' })
      }
      result = await syncRemoteChangeTasksForProject(changeId, project.path, server, project.id)
    } else {
      // 로컬 프로젝트
      result = await syncChangeTasksFromFile(changeId)
    }

    emit('change:synced', {
      changeId,
      projectPath: project.path,
      tasksCreated: result.tasksCreated,
      tasksUpdated: result.tasksUpdated,
    })

    res.json({
      success: true,
      data: {
        changeId,
        tasksCreated: result.tasksCreated,
        tasksUpdated: result.tasksUpdated,
      },
    })
  } catch (error) {
    console.error('Error syncing change:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync change',
    })
  }
})

// POST /sync/all - 모든 프로젝트의 모든 Changes 동기화
flowRouter.post('/sync/all', async (_req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()

    if (config.projects.length === 0) {
      return res.json({
        success: true,
        data: { synced: 0, created: 0, updated: 0, projects: 0 },
      })
    }

    let totalCreated = 0
    let totalUpdated = 0
    let projectsSynced = 0

    for (const project of config.projects) {
      const openspecDir = join(project.path, 'openspec', 'changes')
      let entries
      try {
        entries = await readdir(openspecDir, { withFileTypes: true })
      } catch {
        continue
      }

      projectsSynced++

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'archive') continue

        const changeId = entry.name
        try {
          const result = await syncChangeTasksForProject(changeId, project.path, project.id)
          totalCreated += result.tasksCreated
          totalUpdated += result.tasksUpdated
        } catch (syncError) {
          console.error(`Error syncing ${changeId}:`, syncError)
        }
      }
    }

    emit('sync:completed', {
      totalCreated,
      totalUpdated,
      projectsSynced,
    })

    res.json({
      success: true,
      data: {
        synced: totalCreated + totalUpdated,
        created: totalCreated,
        updated: totalUpdated,
        projects: projectsSynced,
      },
    })
  } catch (error) {
    console.error('Error syncing all changes:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync all changes',
    })
  }
})

// POST /changes/:id/archive - Change를 아카이브로 이동
flowRouter.post('/changes/:id/archive', async (req, res) => {
  try {
    const changeId = req.params.id
    const { skipSpecs, force, projectId } = req.body

    // projectId가 있으면 해당 프로젝트 사용, 없으면 활성 프로젝트
    const project = projectId ? await getProjectById(projectId) : await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const args = ['archive', changeId, '-y']
    if (skipSpecs) {
      args.push('--skip-specs')
    }
    if (force) {
      args.push('--no-validate')
    }

    let stdout = ''
    let stderr = ''
    let validationFailed = false
    const validationErrors: string[] = []
    let filesMoved = false

    // 원격 프로젝트인 경우 SSH를 통해 아카이브 실행
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.status(400).json({ success: false, error: 'Remote plugin not installed' })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.status(400).json({ success: false, error: 'Remote server not found' })
      }

      // Remote plugin functions
      const executeCommand = (plugin as unknown as { executeCommand: (s: unknown, cmd: string) => Promise<{ stdout: string }> }).executeCommand
      const exists = async (s: unknown, p: string) => {
        try {
          await executeCommand(s, `test -e "${p}"`)
          return true
        } catch {
          return false
        }
      }

      // 원격에서 openspec archive 명령 실행 또는 직접 mv 명령 실행
      const archivePath = `${project.path}/openspec/changes/archive`
      const sourcePath = `${project.path}/openspec/changes/${changeId}`
      const targetPath = `${archivePath}/${new Date().toISOString().split('T')[0]}-${changeId}`

      try {
        // 먼저 archive 폴더 존재 확인
        const archiveExists = await exists(server, archivePath)
        if (!archiveExists) {
          await executeCommand(server, `mkdir -p "${archivePath}"`, { cwd: project.path })
        }

        // 소스 폴더 존재 확인
        const sourceExists = await exists(server, sourcePath)
        if (!sourceExists) {
          return res.status(404).json({
            success: false,
            error: `Change folder not found: ${changeId}`,
          })
        }

        // mv 명령으로 아카이브 폴더로 이동
        const mvResult = await executeCommand(server, `mv "${sourcePath}" "${targetPath}"`, {
          cwd: project.path,
        })

        stdout = mvResult.stdout
        stderr = mvResult.stderr

        if (mvResult.exitCode === 0) {
          filesMoved = true
          console.log(`[Archive] Remote archive successful: ${changeId} -> ${targetPath}`)
        } else {
          throw new Error(`Failed to move change folder: ${stderr}`)
        }
      } catch (execError) {
        const error = execError as { stdout?: string; stderr?: string; message?: string }
        console.error('[Archive] Remote archive error:', error)
        throw new Error(error.message || 'Failed to archive change on remote server')
      }
    } else {
      // 로컬 프로젝트인 경우 기존 로직 사용
      try {
        const result = await execAsync(`openspec ${args.join(' ')}`, {
          cwd: project.path,
        })
        stdout = result.stdout
        stderr = result.stderr
      } catch (execError) {
        const error = execError as { stdout?: string; stderr?: string; message?: string }
        stdout = error.stdout || ''
        stderr = error.stderr || ''

        if (stdout.includes('Validation failed') || stdout.includes('Validation errors')) {
          validationFailed = true
          const lines = stdout.split('\n')
          for (const line of lines) {
            if (line.includes('✗') || line.includes('⚠')) {
              validationErrors.push(line.trim())
            }
          }
        } else {
          throw execError
        }
      }

      if (validationFailed && !force) {
        console.log(`[Archive] Validation failed for ${changeId}, returning error to client`)
        return res.status(422).json({
          success: false,
          error: 'Validation failed',
          validationErrors,
          canForce: true,
          hint: 'Use force option to archive without validation, or fix the spec errors first',
        })
      }

      const archivePath = join(project.path, 'openspec', 'changes', 'archive', changeId)
      const originalPath = join(project.path, 'openspec', 'changes', changeId)

      try {
        await access(archivePath)
        filesMoved = true
      } catch {
        try {
          await access(originalPath)
          filesMoved = false
        } catch {
          filesMoved = false
        }
      }
    }

    // DB 업데이트 (로컬/원격 공통)
    await initTaskDb()
    const sqlite = getSqlite()
    const now = Date.now()

    sqlite
      .prepare(
        `
      UPDATE changes SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND project_id = ?
    `
      )
      .run(now, now, changeId, project.id)

    // tasks도 archived로 업데이트
    sqlite
      .prepare(
        `
      UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ? WHERE change_id = ? AND project_id = ?
    `
      )
      .run(now, now, changeId, project.id)

    emit('change:archived', { changeId, projectId: project.id })

    res.json({
      success: true,
      data: {
        changeId,
        archived: true,
        filesMoved,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      },
    })
  } catch (error) {
    console.error('Error archiving change:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive change',
    })
  }
})

// POST /changes/:id/fix-validation - 자동으로 validation 에러 수정
flowRouter.post('/changes/:id/fix-validation', async (req, res) => {
  try {
    const changeId = req.params.id
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeDir = join(project.path, 'openspec', 'changes', changeId)
    const fs = await import('fs/promises')

    const proposalPath = join(changeDir, 'proposal.md')
    let proposalFixed = false
    try {
      const content = await fs.readFile(proposalPath, 'utf-8')
      const lines = content.split('\n')
      const fixedLines = lines.map((line) => {
        if (line.match(/^[-*]\s+/) && !line.match(/\b(SHALL|MUST)\b/i)) {
          if (line.match(/^[-*]\s+\w/)) {
            return line.replace(/^([-*]\s+)/, '$1The system SHALL ')
          }
        }
        return line
      })
      const newContent = fixedLines.join('\n')
      if (newContent !== content) {
        await fs.writeFile(proposalPath, newContent)
        proposalFixed = true
      }
    } catch {
      // proposal.md not found or not readable
    }

    const specsDir = join(changeDir, 'specs')
    let specsFixed = 0
    try {
      const specEntries = await fs.readdir(specsDir, { withFileTypes: true })
      for (const entry of specEntries) {
        if (!entry.isDirectory()) continue
        const specPath = join(specsDir, entry.name, 'spec.md')
        try {
          const content = await fs.readFile(specPath, 'utf-8')
          const lines = content.split('\n')
          const fixedLines = lines.map((line) => {
            if (line.match(/^###\s+Requirement:/)) {
              if (!line.match(/\b(SHALL|MUST)\b/i)) {
                return line.replace(/(###\s+Requirement:\s*)(.+)/, (_, prefix, reqText) => {
                  return `${prefix}The system SHALL provide ${reqText}`
                })
              }
            }
            return line
          })
          const newContent = fixedLines.join('\n')
          if (newContent !== content) {
            await fs.writeFile(specPath, newContent)
            specsFixed++
          }
        } catch {
          // spec.md not found
        }
      }
    } catch {
      // specs directory not found
    }

    res.json({
      success: true,
      data: {
        changeId,
        proposalFixed,
        specsFixed,
        message:
          proposalFixed || specsFixed > 0
            ? `Fixed validation errors: proposal=${proposalFixed}, specs=${specsFixed}`
            : 'No fixes needed or possible',
      },
    })
  } catch (error) {
    console.error('Error fixing validation:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fix validation',
    })
  }
})

// =============================================
// Backlog API 엔드포인트
// =============================================

// POST /backlog/sync - Backlog 파일을 DB에 동기화
flowRouter.post('/backlog/sync', async (_req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const result = await syncBacklogToDb(project.id, project.path)

    emit('backlog:synced', {
      projectId: project.id,
      ...result,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Error syncing backlog:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync backlog',
    })
  }
})

// POST /backlog/tasks - Backlog 태스크 생성 (마크다운 파일 생성)
flowRouter.post('/backlog/tasks', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const {
      title,
      description,
      status = 'todo',
      priority = 'medium',
      assignees,
      labels,
      blockedBy,
      parent,
      dueDate,
      milestone,
      plan,
      acceptanceCriteria,
      notes,
    } = req.body

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' })
    }

    // 새 backlogFileId 생성
    const backlogFileId = await generateNewBacklogTaskId(project.path)

    // BacklogTask 객체 생성
    const task: BacklogTask = {
      backlogFileId,
      title,
      description,
      status,
      priority,
      assignees,
      labels,
      blockedBy,
      parent,
      dueDate,
      milestone,
      plan,
      acceptanceCriteria,
      notes,
      filePath: '', // saveTaskToBacklogFile에서 설정됨
    }

    // 마크다운 파일 저장
    const filePath = await saveTaskToBacklogFile(project.path, task)
    task.filePath = filePath

    // DB에 동기화
    const result = await syncBacklogToDb(project.id, project.path)

    emit('backlog:task:created', {
      projectId: project.id,
      backlogFileId,
      filePath,
    })

    res.json({
      success: true,
      data: {
        backlogFileId,
        filePath,
        synced: result,
      },
    })
  } catch (error) {
    console.error('Error creating backlog task:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create backlog task',
    })
  }
})

// PATCH /backlog/tasks/:backlogFileId - Backlog 태스크 수정 (마크다운 파일 수정)
flowRouter.patch('/backlog/tasks/:backlogFileId', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { backlogFileId } = req.params
    const updates = req.body

    // 기존 태스크 조회
    const sqlite = getSqlite()
    const existing = sqlite
      .prepare(
        `
      SELECT * FROM tasks
      WHERE project_id = ? AND backlog_file_id = ? AND origin = 'backlog'
    `
      )
      .get(project.id, backlogFileId) as
      | {
          id: number
          title: string
          description: string | null
          status: string
          priority: string
          tags: string | null
          assignee: string | null
          parent_task_id: number | null
          blocked_by: string | null
          plan: string | null
          acceptance_criteria: string | null
          notes: string | null
          due_date: number | null
          milestone: string | null
          backlog_file_id: string
        }
      | undefined

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Backlog task not found' })
    }

    // BacklogTask 객체 생성 (기존 + 업데이트)
    const task: BacklogTask = {
      backlogFileId: existing.backlog_file_id,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description ?? undefined,
      status: updates.status ?? existing.status,
      priority: updates.priority ?? existing.priority,
      assignees: updates.assignees ?? (existing.assignee ? [existing.assignee] : undefined),
      labels: updates.labels ?? (existing.tags ? JSON.parse(existing.tags) : undefined),
      blockedBy:
        updates.blockedBy ?? (existing.blocked_by ? JSON.parse(existing.blocked_by) : undefined),
      parent: updates.parent,
      dueDate:
        updates.dueDate ??
        (existing.due_date ? new Date(existing.due_date).toISOString().split('T')[0] : undefined),
      milestone: updates.milestone ?? existing.milestone ?? undefined,
      plan: updates.plan ?? existing.plan ?? undefined,
      acceptanceCriteria: updates.acceptanceCriteria ?? existing.acceptance_criteria ?? undefined,
      notes: updates.notes ?? existing.notes ?? undefined,
      filePath: '',
    }

    // 마크다운 파일 저장
    const filePath = await saveTaskToBacklogFile(project.path, task)

    // DB에 동기화
    const result = await syncBacklogToDb(project.id, project.path)

    emit('backlog:task:updated', {
      projectId: project.id,
      backlogFileId,
      filePath,
    })

    res.json({
      success: true,
      data: {
        backlogFileId,
        filePath,
        synced: result,
      },
    })
  } catch (error) {
    console.error('Error updating backlog task:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update backlog task',
    })
  }
})

// DELETE /backlog/tasks/:backlogFileId - Backlog 태스크 삭제 (마크다운 파일 삭제)
flowRouter.delete('/backlog/tasks/:backlogFileId', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { backlogFileId } = req.params
    const { archive = false } = req.query

    // 기존 태스크 조회
    const sqlite = getSqlite()
    const existing = sqlite
      .prepare(
        `
      SELECT id, title FROM tasks
      WHERE project_id = ? AND backlog_file_id = ? AND origin = 'backlog'
    `
      )
      .get(project.id, backlogFileId) as { id: number; title: string } | undefined

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Backlog task not found' })
    }

    const backlogPath = getBacklogPath(project.path)
    const filename = generateBacklogFilename(backlogFileId, existing.title)
    const filePath = join(backlogPath, filename)

    if (archive === 'true') {
      // 아카이브 폴더로 이동
      const archivePath = join(backlogPath, 'archive')
      await ensureBacklogDir(
        join(project.path, 'backlog', 'archive').replace('/backlog/archive', '')
      )
      try {
        await access(archivePath)
      } catch {
        const { mkdir } = await import('fs/promises')
        await mkdir(archivePath, { recursive: true })
      }
      await rename(filePath, join(archivePath, filename))
    } else {
      // 파일 삭제
      await unlink(filePath)
    }

    // DB에 동기화 (삭제된 파일은 archived로 처리됨)
    const result = await syncBacklogToDb(project.id, project.path)

    emit('backlog:task:deleted', {
      projectId: project.id,
      backlogFileId,
      archived: archive === 'true',
    })

    res.json({
      success: true,
      data: {
        backlogFileId,
        deleted: true,
        archived: archive === 'true',
        synced: result,
      },
    })
  } catch (error) {
    console.error('Error deleting backlog task:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete backlog task',
    })
  }
})

// GET /backlog/tasks/:backlogFileId - Backlog 태스크 상세 조회
flowRouter.get('/backlog/tasks/:backlogFileId', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { backlogFileId } = req.params

    const sqlite = getSqlite()
    const task = sqlite
      .prepare(
        `
      SELECT * FROM tasks
      WHERE project_id = ? AND backlog_file_id = ? AND origin = 'backlog'
    `
      )
      .get(project.id, backlogFileId) as
      | {
          id: number
          change_id: string | null
          stage: Stage
          origin: TaskOrigin | null
          title: string
          description: string | null
          status: string
          priority: string
          tags: string | null
          assignee: string | null
          order: number
          parent_task_id: number | null
          blocked_by: string | null
          plan: string | null
          acceptance_criteria: string | null
          notes: string | null
          due_date: number | null
          milestone: string | null
          backlog_file_id: string | null
          created_at: number
          updated_at: number
          archived_at: number | null
        }
      | undefined

    if (!task) {
      return res.status(404).json({ success: false, error: 'Backlog task not found' })
    }

    // 서브태스크 조회
    const subtasks = sqlite
      .prepare(
        `
      SELECT id, title, status, priority FROM tasks
      WHERE project_id = ? AND parent_task_id = ? AND origin = 'backlog' AND status != 'archived'
    `
      )
      .all(project.id, task.id) as Array<{
      id: number
      title: string
      status: string
      priority: string
    }>

    const formatted = {
      id: task.id,
      changeId: task.change_id,
      stage: task.stage,
      origin: task.origin,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      tags: task.tags ? JSON.parse(task.tags) : [],
      assignee: task.assignee,
      order: task.order,
      parentTaskId: task.parent_task_id,
      blockedBy: task.blocked_by ? JSON.parse(task.blocked_by) : null,
      plan: task.plan,
      acceptanceCriteria: task.acceptance_criteria,
      notes: task.notes,
      dueDate: task.due_date ? new Date(task.due_date).toISOString() : null,
      milestone: task.milestone,
      backlogFileId: task.backlog_file_id,
      subtasks,
      createdAt: new Date(task.created_at).toISOString(),
      updatedAt: new Date(task.updated_at).toISOString(),
      archivedAt: task.archived_at ? new Date(task.archived_at).toISOString() : null,
    }

    res.json({ success: true, data: { task: formatted } })
  } catch (error) {
    console.error('Error getting backlog task:', error)
    res.status(500).json({ success: false, error: 'Failed to get backlog task' })
  }
})

// GET /backlog/stats - Backlog 통계
flowRouter.get('/backlog/stats', async (_req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const sqlite = getSqlite()

    // 상태별 집계
    const byStatus = sqlite
      .prepare(
        `
      SELECT status, COUNT(*) as count
      FROM tasks
      WHERE project_id = ? AND origin = 'backlog' AND status != 'archived'
      GROUP BY status
    `
      )
      .all(project.id) as Array<{ status: string; count: number }>

    // 우선순위별 집계
    const byPriority = sqlite
      .prepare(
        `
      SELECT priority, COUNT(*) as count
      FROM tasks
      WHERE project_id = ? AND origin = 'backlog' AND status != 'archived'
      GROUP BY priority
    `
      )
      .all(project.id) as Array<{ priority: string; count: number }>

    // 마일스톤별 집계
    const byMilestone = sqlite
      .prepare(
        `
      SELECT milestone, COUNT(*) as count
      FROM tasks
      WHERE project_id = ? AND origin = 'backlog' AND status != 'archived' AND milestone IS NOT NULL
      GROUP BY milestone
    `
      )
      .all(project.id) as Array<{ milestone: string; count: number }>

    // 총 태스크 수
    const total = sqlite
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE project_id = ? AND origin = 'backlog' AND status != 'archived'
    `
      )
      .get(project.id) as { count: number }

    res.json({
      success: true,
      data: {
        total: total.count,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
        byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r.count])),
        byMilestone: Object.fromEntries(byMilestone.map((r) => [r.milestone, r.count])),
      },
    })
  } catch (error) {
    console.error('Error getting backlog stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get backlog stats' })
  }
})

// =============================================
// Migration API 엔드포인트
// =============================================

// GET /backlog/migration/preview - 마이그레이션 대상 Inbox 태스크 미리보기
flowRouter.get('/backlog/migration/preview', async (_req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const preview = previewMigration(project.id)

    res.json({
      success: true,
      data: preview,
    })
  } catch (error) {
    console.error('Error previewing migration:', error)
    res.status(500).json({ success: false, error: 'Failed to preview migration' })
  }
})

// POST /backlog/migration - Inbox 전체를 Backlog로 마이그레이션
flowRouter.post('/backlog/migration', async (_req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const result = await migrateInboxToBacklog(project.id, project.path)

    // 마이그레이션 성공 시 WebSocket 이벤트 발생
    if (result.migratedCount > 0) {
      emit('backlog:synced', {
        projectId: project.id,
        synced: result.migratedCount,
        created: result.migratedCount,
        updated: 0,
        deleted: 0,
      })
    }

    res.json({
      success: result.success,
      data: result,
    })
  } catch (error) {
    console.error('Error migrating inbox to backlog:', error)
    res.status(500).json({ success: false, error: 'Failed to migrate inbox to backlog' })
  }
})

// POST /backlog/migration/selected - 선택된 Inbox 태스크만 Backlog로 마이그레이션
flowRouter.post('/backlog/migration/selected', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { taskIds } = req.body

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, error: 'taskIds array is required' })
    }

    const result = await migrateSelectedInboxTasks(project.id, project.path, taskIds)

    // 마이그레이션 성공 시 WebSocket 이벤트 발생
    if (result.migratedCount > 0) {
      emit('backlog:synced', {
        projectId: project.id,
        synced: result.migratedCount,
        created: result.migratedCount,
        updated: 0,
        deleted: 0,
      })
    }

    res.json({
      success: result.success,
      data: result,
    })
  } catch (error) {
    console.error('Error migrating selected tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to migrate selected tasks' })
  }
})
