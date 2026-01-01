/**
 * Changes Router
 *
 * OpenSpec Changes 관련 API 라우터
 */

import { Router } from 'express'
import { readdir, readFile, writeFile, access, stat } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getActiveProject, getProjectById } from '../config.js'
import { parseTasksFile, toggleTaskInFile } from '../parser.js'
import { initDb, getSqlite } from '../tasks/db/client.js'

const execAsync = promisify(exec)

export const changesRouter = Router()

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
    // Archive directories (three possible locations)
    archiveDir: join(project.path, 'openspec', 'changes', 'archive'), // openspec/changes/archive/
    legacyArchiveDir: join(project.path, 'openspec', 'archive'), // openspec/archive/
    archivedDir: join(project.path, 'openspec', 'archived'), // openspec/archived/
  }
}

// GET / - List all changes
changesRouter.get('/', async (_req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.json({ success: true, data: { changes: [] } })
    }

    let entries
    try {
      entries = await readdir(paths.openspecDir, { withFileTypes: true })
    } catch {
      return res.json({ success: true, data: { changes: [] } })
    }

    const changes = []

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue

      const changeId = entry.name
      const changeDir = join(paths.openspecDir, changeId)

      // Read proposal.md for title
      let title = changeId
      try {
        const proposalPath = join(changeDir, 'proposal.md')
        const proposalContent = await readFile(proposalPath, 'utf-8')
        const titleMatch = proposalContent.match(/^#\s+Change:\s+(.+)$/m)
        if (titleMatch) {
          title = titleMatch[1].trim()
        }
      } catch {
        // No proposal.md, use directory name
      }

      // Read tasks.md for progress
      let totalTasks = 0
      let completedTasks = 0
      try {
        const tasksPath = join(changeDir, 'tasks.md')
        const tasksContent = await readFile(tasksPath, 'utf-8')
        const parsed = parseTasksFile(changeId, tasksContent)

        for (const group of parsed.groups) {
          totalTasks += group.tasks.length
          completedTasks += group.tasks.filter((t) => t.completed).length
        }
      } catch {
        // No tasks.md
      }

      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      // Get last modified date from git (latest commit in change directory)
      let updatedAt: string | null = null
      try {
        // Get latest commit date for any file in the change directory
        // Use relative path from project root for git command
        const relativeChangeDir = `openspec/changes/${changeId}`
        const gitCmd = `git log -1 --format="%aI" -- "${relativeChangeDir}"`
        const { stdout } = await execAsync(gitCmd, { cwd: paths.projectPath })
        if (stdout.trim()) {
          updatedAt = stdout.trim()
        } else {
          // Fallback to file stat of tasks.md or proposal.md
          const tasksPath = join(changeDir, 'tasks.md')
          const proposalPath = join(changeDir, 'proposal.md')
          try {
            const s = await stat(tasksPath)
            updatedAt = s.mtime.toISOString()
          } catch {
            const s = await stat(proposalPath)
            updatedAt = s.mtime.toISOString()
          }
        }
      } catch (err) {
        // If all fails, use current time
        console.error('Git log error:', err)
        updatedAt = new Date().toISOString()
      }

      changes.push({
        id: changeId,
        title,
        progress,
        totalTasks,
        completedTasks,
        updatedAt,
      })
    }

    res.json({ success: true, data: { changes } })
  } catch (error) {
    console.error('Error listing changes:', error)
    res.status(500).json({ success: false, error: 'Failed to list changes' })
  }
})

// GET /archived - List all archived changes
changesRouter.get('/archived', async (_req, res) => {
  try {
    const project = await getActiveProject()
    if (!project) {
      return res.json({ success: true, data: { changes: [] } })
    }

    initDb()
    const sqlite = getSqlite()

    // DB에서 archived 상태인 changes 조회 (archived_at 포함)
    const dbChanges = sqlite.prepare(`
      SELECT c.id, c.title, c.progress, c.archived_at, c.updated_at,
        (SELECT COUNT(*) FROM tasks t WHERE t.change_id = c.id AND t.status != 'archived') as totalTasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.change_id = c.id AND t.status = 'done') as completedTasks
      FROM changes c
      WHERE c.project_id = ? AND c.status = 'archived'
      ORDER BY COALESCE(c.archived_at, c.updated_at) DESC
    `).all(project.id) as Array<{
      id: string
      title: string
      progress: number
      archived_at: number | null
      updated_at: number
      totalTasks: number
      completedTasks: number
    }>

    const archivedChanges = dbChanges.map(change => ({
      id: change.id,
      title: change.title,
      progress: change.progress,
      totalTasks: change.totalTasks,
      completedTasks: change.completedTasks,
      archivedAt: change.archived_at
        ? new Date(change.archived_at).toISOString()
        : new Date(change.updated_at).toISOString(),
      source: 'db' as const
    }))

    res.json({ success: true, data: { changes: archivedChanges } })
  } catch (error) {
    console.error('Error listing archived changes:', error)
    res.status(500).json({ success: false, error: 'Failed to list archived changes' })
  }
})

// GET /archived/:id - Get archived change detail
changesRouter.get('/archived/:id', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    let changeDir: string | null = null

    // Check all three archive locations
    const archiveLocations = [
      paths.archiveDir, // openspec/changes/archive/
      paths.legacyArchiveDir, // openspec/archive/
      paths.archivedDir, // openspec/archived/
    ]

    for (const archiveBase of archiveLocations) {
      const candidatePath = join(archiveBase, changeId)
      try {
        await access(candidatePath)
        changeDir = candidatePath
        break
      } catch {
        // Not found in this location, try next
      }
    }

    if (!changeDir) {
      return res.status(404).json({ success: false, error: 'Archived change not found' })
    }

    // Read all files in the change directory
    const files: Record<string, string> = {}
    const entries = await readdir(changeDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(changeDir, entry.name)
        const content = await readFile(filePath, 'utf-8')
        files[entry.name] = content
      }
      // Also check specs subdirectory
      if (entry.isDirectory() && entry.name === 'specs') {
        const specsDir = join(changeDir, 'specs')
        const specEntries = await readdir(specsDir, { withFileTypes: true })
        for (const specEntry of specEntries) {
          if (specEntry.isFile() && specEntry.name.endsWith('.md')) {
            const specPath = join(specsDir, specEntry.name)
            const content = await readFile(specPath, 'utf-8')
            files[`specs/${specEntry.name}`] = content
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        id: changeId,
        files,
      },
    })
  } catch (error) {
    console.error('Error getting archived change:', error)
    res.status(500).json({ success: false, error: 'Failed to get archived change' })
  }
})

// GET /:id/tasks - Get tasks for a change
changesRouter.get('/:id/tasks', async (req, res) => {
  try {
    // projectId 쿼리 파라미터가 있으면 해당 프로젝트 사용, 없으면 활성 프로젝트
    const projectId = req.query.projectId as string | undefined
    const project = projectId
      ? await getProjectById(projectId)
      : await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id

    // 원격 프로젝트인 경우 DB에서 tasks 조회
    if (project.remote) {
      initDb()
      const sqlite = getSqlite()

      const tasks = sqlite.prepare(`
        SELECT id, title, status, group_title, group_order, task_order,
               major_title, sub_order, priority, stage, created_at, updated_at
        FROM tasks
        WHERE change_id = ? AND project_id = ?
        ORDER BY group_order ASC, task_order ASC
      `).all(changeId, project.id) as Array<{
        id: string
        title: string
        status: string
        group_title: string | null
        group_order: number
        task_order: number
        major_title: string | null
        sub_order: number | null
        priority: string
        stage: string
        created_at: number
        updated_at: number
      }>

      // 그룹별로 정리
      const groupMap = new Map<string, {
        title: string
        order: number
        tasks: Array<{
          id: string
          title: string
          completed: boolean
          order: number
        }>
      }>()

      for (const task of tasks) {
        const groupTitle = task.group_title || 'Tasks'
        if (!groupMap.has(groupTitle)) {
          groupMap.set(groupTitle, {
            title: groupTitle,
            order: task.group_order,
            tasks: []
          })
        }
        groupMap.get(groupTitle)!.tasks.push({
          id: task.id,
          title: task.title,
          completed: task.status === 'done',
          order: task.task_order
        })
      }

      const groups = Array.from(groupMap.values())
        .sort((a, b) => a.order - b.order)
        .map(g => ({
          ...g,
          tasks: g.tasks.sort((a, b) => a.order - b.order)
        }))

      return res.json({
        success: true,
        data: {
          changeId,
          groups,
          remote: true
        }
      })
    }

    // 로컬 프로젝트인 경우 파일에서 직접 읽기
    const openspecDir = join(project.path, 'openspec', 'changes')
    const tasksPath = join(openspecDir, changeId, 'tasks.md')
    const content = await readFile(tasksPath, 'utf-8')
    const parsed = parseTasksFile(changeId, content)

    res.json({ success: true, data: parsed })
  } catch (error) {
    console.error('Error reading tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to read tasks' })
  }
})

// ==================== TASKS ====================

// PATCH /tasks/:changeId/:taskId - Toggle task checkbox
changesRouter.patch('/tasks/:changeId/:taskId', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { changeId, taskId } = req.params
    const tasksPath = join(paths.openspecDir, changeId, 'tasks.md')

    // Read current content
    const content = await readFile(tasksPath, 'utf-8')

    // Toggle the task
    const { newContent, task } = toggleTaskInFile(content, taskId)

    // Write back
    await writeFile(tasksPath, newContent, 'utf-8')

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error toggling task:', error)
    res.status(500).json({ success: false, error: 'Failed to toggle task' })
  }
})

// ==================== PLANS ====================

// GET /plans/:changeId/:taskId - Get detail plan
changesRouter.get('/plans/:changeId/:taskId', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { changeId, taskId } = req.params
    const planPath = join(paths.plansDir, changeId, `${taskId}.md`)

    try {
      const content = await readFile(planPath, 'utf-8')
      res.json({
        success: true,
        data: { taskId, changeId, content, exists: true },
      })
    } catch {
      res.json({
        success: true,
        data: { taskId, changeId, content: null, exists: false },
      })
    }
  } catch (error) {
    console.error('Error reading plan:', error)
    res.status(500).json({ success: false, error: 'Failed to read plan' })
  }
})
