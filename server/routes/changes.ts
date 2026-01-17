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

// Remote plugin is optional - only load if installed
let remotePlugin: {
  getRemoteServerById: (id: string) => Promise<unknown>
  listDirectory: (server: unknown, path: string) => Promise<{ entries: Array<{ type: string; name: string; modifiedAt?: string }> }>
  readRemoteFile: (server: unknown, path: string) => Promise<string>
  executeCommand: (server: unknown, cmd: string, opts?: { cwd?: string }) => Promise<{ stdout: string }>
} | null = null

async function getRemotePlugin() {
  if (remotePlugin) return remotePlugin
  try {
    const mod = await import('@zyflow/remote-plugin')
    remotePlugin = mod
    return remotePlugin
  } catch {
    return null
  }
}

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
    const project = await getActiveProject()
    if (!project) {
      return res.json({ success: true, data: { changes: [] } })
    }

    // 원격 프로젝트인 경우
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.json({ success: true, data: { changes: [] } })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.json({ success: true, data: { changes: [] } })
      }

      const openspecDir = `${project.path}/openspec/changes`

      // 원격 디렉토리 목록 조회
      let listing
      try {
        listing = await plugin.listDirectory(server, openspecDir)
      } catch {
        return res.json({ success: true, data: { changes: [] } })
      }

      // 디렉토리만 필터링 (archive 제외)
      const validEntries = listing.entries.filter(
        (entry) => entry.type === 'directory' && entry.name !== 'archive'
      )

      // 병렬로 각 change 처리
      const changes = await Promise.all(
        validEntries.map(async (entry) => {
          const changeId = entry.name
          const changeDir = `${openspecDir}/${changeId}`

          // 원격에서 proposal.md, tasks.md 읽기 및 git log 실행
          const [proposalResult, tasksResult, gitResult] = await Promise.allSettled([
            plugin.readRemoteFile(server, `${changeDir}/proposal.md`),
            plugin.readRemoteFile(server, `${changeDir}/tasks.md`),
            plugin.executeCommand(server, `git log -1 --format="%aI" -- "openspec/changes/${changeId}"`, {
              cwd: project.path,
            }),
          ])

          // Parse proposal
          let title = changeId
          if (proposalResult.status === 'fulfilled') {
            const titleMatch = proposalResult.value.match(/^#\s+Change:\s+(.+)$/m)
            if (titleMatch) title = titleMatch[1].trim()
          }

          // Parse tasks
          let totalTasks = 0
          let completedTasks = 0
          if (tasksResult.status === 'fulfilled') {
            const parsed = parseTasksFile(changeId, tasksResult.value)
            for (const group of parsed.groups) {
              totalTasks += group.tasks.length
              completedTasks += group.tasks.filter((t) => t.completed).length
            }
          }

          const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

          // Get updatedAt from git log or file modifiedAt
          let updatedAt: string | null = null
          if (gitResult.status === 'fulfilled' && gitResult.value.stdout.trim()) {
            updatedAt = gitResult.value.stdout.trim()
          } else {
            // 폴백: listDirectory에서 가져온 modifiedAt 사용
            updatedAt = entry.modifiedAt || new Date().toISOString()
          }

          return { id: changeId, title, progress, totalTasks, completedTasks, updatedAt }
        })
      )

      return res.json({ success: true, data: { changes } })
    }

    // 로컬 프로젝트인 경우
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

    // Filter valid entries
    const validEntries = entries.filter(
      (entry) => entry.isDirectory() && entry.name !== 'archive'
    )

    // Process all changes in parallel
    const changes = await Promise.all(
      validEntries.map(async (entry) => {
        const changeId = entry.name
        const changeDir = join(paths.openspecDir, changeId)

        // Read proposal, tasks, and git log in parallel
        const [proposalResult, tasksResult, gitResult] = await Promise.allSettled([
          readFile(join(changeDir, 'proposal.md'), 'utf-8'),
          readFile(join(changeDir, 'tasks.md'), 'utf-8'),
          execAsync(`git log -1 --format="%aI" -- "openspec/changes/${changeId}"`, {
            cwd: paths.projectPath,
          }),
        ])

        // Parse proposal
        let title = changeId
        if (proposalResult.status === 'fulfilled') {
          const titleMatch = proposalResult.value.match(/^#\s+Change:\s+(.+)$/m)
          if (titleMatch) title = titleMatch[1].trim()
        }

        // Parse tasks
        let totalTasks = 0
        let completedTasks = 0
        if (tasksResult.status === 'fulfilled') {
          const parsed = parseTasksFile(changeId, tasksResult.value)
          for (const group of parsed.groups) {
            totalTasks += group.tasks.length
            completedTasks += group.tasks.filter((t) => t.completed).length
          }
        }

        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

        // Get updatedAt
        let updatedAt: string | null = null
        if (gitResult.status === 'fulfilled' && gitResult.value.stdout.trim()) {
          updatedAt = gitResult.value.stdout.trim()
        } else {
          try {
            const s = await stat(join(changeDir, 'tasks.md'))
            updatedAt = s.mtime.toISOString()
          } catch {
            try {
              const s = await stat(join(changeDir, 'proposal.md'))
              updatedAt = s.mtime.toISOString()
            } catch {
              updatedAt = new Date().toISOString()
            }
          }
        }

        return { id: changeId, title, progress, totalTasks, completedTasks, updatedAt }
      })
    )

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
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    const files: Record<string, string> = {}

    // Remote project: use SSH plugin
    if (project.remote) {
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.status(400).json({ success: false, error: 'Remote plugin not available' })
      }

      const server = await plugin.getRemoteServerById(project.remote.serverId)
      if (!server) {
        return res.status(400).json({ success: false, error: 'Remote server not found' })
      }

      // Archive locations for remote projects
      const archiveLocations = [
        `${project.path}/openspec/changes/archive`,
        `${project.path}/openspec/archive`,
        `${project.path}/openspec/archived`,
      ]

      let changeDir: string | null = null

      // Search for the change folder in archive locations
      for (const archiveBase of archiveLocations) {
        try {
          const listing = await plugin.listDirectory(server, archiveBase)
          // Look for exact match or date-prefixed match (e.g., 2026-01-17-change-id)
          const matchingFolder = listing.entries.find(
            (entry) => entry.type === 'directory' && (entry.name === changeId || entry.name.endsWith(`-${changeId}`))
          )
          if (matchingFolder) {
            changeDir = `${archiveBase}/${matchingFolder.name}`
            break
          }
        } catch {
          // Archive location not found, try next
        }
      }

      if (!changeDir) {
        return res.status(404).json({ success: false, error: 'Archived change not found' })
      }

      // Read all .md files in the change directory
      try {
        const entries = await plugin.listDirectory(server, changeDir)
        for (const entry of entries.entries) {
          if (entry.type === 'file' && entry.name.endsWith('.md')) {
            try {
              const content = await plugin.readRemoteFile(server, `${changeDir}/${entry.name}`)
              files[entry.name] = content
            } catch {
              // Skip unreadable files
            }
          }
          // Also check specs subdirectory
          if (entry.type === 'directory' && entry.name === 'specs') {
            try {
              const specsDir = `${changeDir}/specs`
              const specEntries = await plugin.listDirectory(server, specsDir)
              for (const specEntry of specEntries.entries) {
                if (specEntry.type === 'directory') {
                  // Each spec is in its own folder
                  try {
                    const specPath = `${specsDir}/${specEntry.name}/spec.md`
                    const content = await plugin.readRemoteFile(server, specPath)
                    files[`specs/${specEntry.name}/spec.md`] = content
                  } catch {
                    // Skip unreadable spec files
                  }
                } else if (specEntry.type === 'file' && specEntry.name.endsWith('.md')) {
                  try {
                    const content = await plugin.readRemoteFile(server, `${specsDir}/${specEntry.name}`)
                    files[`specs/${specEntry.name}`] = content
                  } catch {
                    // Skip unreadable files
                  }
                }
              }
            } catch {
              // Skip if specs dir not accessible
            }
          }
        }
      } catch (error) {
        console.error('Error reading remote archived change:', error)
        return res.status(500).json({ success: false, error: 'Failed to read archived change' })
      }

      return res.json({
        success: true,
        data: {
          id: changeId,
          files,
        },
      })
    }

    // Local project: use filesystem
    const archiveLocations = [
      join(project.path, 'openspec', 'changes', 'archive'),
      join(project.path, 'openspec', 'archive'),
      join(project.path, 'openspec', 'archived'),
    ]

    let changeDir: string | null = null

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
