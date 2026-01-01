/**
 * Flow Router
 *
 * Flow Changes 및 Tasks 관련 API 라우터 (DB 기반)
 */

import { Router } from 'express'
import { readdir, readFile, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { loadConfig, getActiveProject } from '../config.js'
import { parseTasksFile } from '../parser.js'
import { initDb } from '../tasks/index.js'
import { getSqlite } from '../tasks/db/client.js'
import type { Stage, ChangeStatus } from '../tasks/db/schema.js'
import { emit } from '../websocket.js'
import { syncChangeTasksFromFile, syncChangeTasksForProject } from '../sync.js'

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

// Helper: Get stages for a change
function getChangeStages(changeId: string, _projectPath?: string) {
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

  const tasks = sqlite.prepare(`
    SELECT * FROM tasks
    WHERE change_id = ? AND status != 'archived'
    ORDER BY stage, group_order, sub_order, task_order, "order"
  `).all(changeId) as Array<{
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

// GET /changes/counts - 프로젝트별 Change 수 (상태별 집계)
flowRouter.get('/changes/counts', async (req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()
    const sqlite = getSqlite()

    const { status } = req.query

    const counts: Record<string, number> = {}
    const detailedCounts: Record<string, { active: number; completed: number; total: number }> = {}

    const projectIds = config.projects.map(p => p.id)
    const placeholders = projectIds.map(() => '?').join(',')

    const detailedResults = sqlite.prepare(`
      SELECT
        project_id,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        COUNT(*) as total
      FROM changes
      WHERE project_id IN (${placeholders})
      GROUP BY project_id
    `).all(...projectIds) as Array<{
      project_id: string
      active: number
      completed: number
      total: number
    }>

    for (const project of config.projects) {
      const projectResult = detailedResults.find(r => r.project_id === project.id)

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
        total: projectResult?.total ?? 0
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
    const dbChanges = sqlite.prepare(`
      SELECT * FROM changes
      WHERE project_id = ? AND status != 'archived'
      ORDER BY updated_at DESC
    `).all(project.id) as Array<{
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
      const stages = getChangeStages(c.id, project.path)
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

// GET /changes/:id - Flow Change 상세 (stages 포함)
flowRouter.get('/changes/:id', async (req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()

    const sqlite = getSqlite()
    const change = sqlite.prepare(`
      SELECT * FROM changes WHERE id = ?
    `).get(req.params.id) as {
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

    if (!change) {
      return res.status(404).json({ success: false, error: 'Change not found' })
    }

    const project = config.projects.find(p => p.id === change.project_id)
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found for this change' })
    }

    const stages = getChangeStages(change.id, project.path)
    const progress = calculateProgress(stages)
    const currentStage = determineCurrentStage(stages)

    let gitCreatedAt: string | null = null
    let gitUpdatedAt: string | null = null
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

        const existing = sqlite.prepare('SELECT id FROM changes WHERE id = ? AND project_id = ?').get(changeId, project.id)
        const now = Date.now()

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

        // Sync tasks from tasks.md
        try {
          const tasksPath = join(changeDir, 'tasks.md')
          const tasksContent = await readFile(tasksPath, 'utf-8')
          const parsed = parseTasksFile(changeId, tasksContent)

          interface ExtendedGroup {
            title: string
            tasks: Array<{ title: string; completed: boolean; lineNumber: number; displayId?: string }>
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
                existingTask = sqlite.prepare(`
                  SELECT id FROM tasks WHERE change_id = ? AND display_id = ?
                `).get(changeId, displayId) as { id: number } | undefined
              }

              if (!existingTask) {
                existingTask = sqlite.prepare(`
                  SELECT id FROM tasks WHERE change_id = ? AND title = ?
                `).get(changeId, task.title) as { id: number } | undefined
              }

              if (existingTask) {
                const newStatus = task.completed ? 'done' : 'todo'
                sqlite.prepare(`
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
                `).run(
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
                sqlite.prepare(`UPDATE sequences SET value = value + 1 WHERE name = 'task_openspec'`).run()
                const seqResult = sqlite.prepare(`SELECT value FROM sequences WHERE name = 'task_openspec'`).get() as { value: number }
                const newId = seqResult.value

                sqlite.prepare(`
                  INSERT INTO tasks (
                    id, project_id, change_id, stage, title, status, priority, "order",
                    group_title, group_order, task_order, major_title, sub_order,
                    display_id, origin, created_at, updated_at
                  )
                  VALUES (?, ?, ?, 'task', ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, 'openspec', ?, ?)
                `).run(
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
            const dbTasks = sqlite.prepare(`
              SELECT id, display_id FROM tasks
              WHERE change_id = ? AND display_id IS NOT NULL AND status != 'archived'
            `).all(changeId) as Array<{ id: number; display_id: string }>

            for (const dbTask of dbTasks) {
              if (!parsedDisplayIds.has(dbTask.display_id)) {
                sqlite.prepare(`
                  UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?
                `).run(now, now, dbTask.id)
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
        projects: projectsSynced
      }
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
    const { changeId, stage, status, standalone, includeArchived } = req.query

    const project = await getActiveProject()
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
      title: string
      description: string | null
      status: string
      priority: string
      tags: string | null
      assignee: string | null
      order: number
      display_id: string | null
      created_at: number
      updated_at: number
      archived_at: number | null
    }>

    const formatted = tasks.map((t) => ({
      id: t.id,
      changeId: t.change_id,
      stage: t.stage,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      tags: t.tags ? JSON.parse(t.tags) : [],
      assignee: t.assignee,
      order: t.order,
      displayId: t.display_id,
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

    const result = sqlite.prepare(`
      INSERT INTO tasks (project_id, change_id, stage, title, description, status, priority, "order", created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'todo', ?, 0, ?, ?)
    `).run(
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
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    const proposalPath = join(paths.openspecDir, changeId, 'proposal.md')

    try {
      const content = await readFile(proposalPath, 'utf-8')
      res.json({ success: true, data: { changeId, content } })
    } catch {
      res.json({ success: true, data: { changeId, content: null } })
    }
  } catch (error) {
    console.error('Error reading proposal:', error)
    res.status(500).json({ success: false, error: 'Failed to read proposal' })
  }
})

// GET /changes/:id/design - Change의 design.md 내용
flowRouter.get('/changes/:id/design', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    const designPath = join(paths.openspecDir, changeId, 'design.md')

    try {
      const content = await readFile(designPath, 'utf-8')
      res.json({ success: true, data: { changeId, content } })
    } catch {
      res.json({ success: true, data: { changeId, content: null } })
    }
  } catch (error) {
    console.error('Error reading design:', error)
    res.status(500).json({ success: false, error: 'Failed to read design' })
  }
})

// GET /changes/:id/spec - Change의 첫 번째 spec.md 내용
flowRouter.get('/changes/:id/spec', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    const specsDir = join(paths.openspecDir, changeId, 'specs')

    try {
      const specFolders = await readdir(specsDir)
      if (specFolders.length === 0) {
        return res.json({ success: true, data: { changeId, content: null, specId: null } })
      }

      const firstSpecId = specFolders[0]
      const specPath = join(specsDir, firstSpecId, 'spec.md')
      const content = await readFile(specPath, 'utf-8')
      res.json({ success: true, data: { changeId, content, specId: firstSpecId } })
    } catch {
      res.json({ success: true, data: { changeId, content: null, specId: null } })
    }
  } catch (error) {
    console.error('Error reading spec:', error)
    res.status(500).json({ success: false, error: 'Failed to read spec' })
  }
})

// GET /changes/:changeId/specs/:specId - 특정 spec.md 내용
flowRouter.get('/changes/:changeId/specs/:specId', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { changeId, specId } = req.params

    const changeSpecPath = join(paths.openspecDir, changeId, 'specs', specId, 'spec.md')
    try {
      const content = await readFile(changeSpecPath, 'utf-8')
      return res.json({ success: true, data: { specId, content, location: 'change' } })
    } catch {
      // Change 내에 없으면 archived specs에서 찾기
    }

    const archivedSpecPath = join(paths.specsDir, specId, 'spec.md')
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

    const result = await syncChangeTasksFromFile(changeId)

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
          const result = await syncChangeTasksForProject(changeId, project.path)
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
    const { skipSpecs, force } = req.body
    const project = await getActiveProject()

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
    let validationErrors: string[] = []

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

    let filesMoved = false
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

    await initTaskDb()
    const sqlite = getSqlite()
    const now = Date.now()

    sqlite.prepare(`
      UPDATE changes SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND project_id = ?
    `).run(now, now, changeId, project.id)

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
      let content = await fs.readFile(proposalPath, 'utf-8')
      const lines = content.split('\n')
      const fixedLines = lines.map(line => {
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
          let content = await fs.readFile(specPath, 'utf-8')
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
        message: proposalFixed || specsFixed > 0
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
