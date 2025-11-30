import express from 'express'
import cors from 'cors'
import { readdir, readFile, writeFile, access, mkdir, type Dirent } from 'fs/promises'
import { join, basename } from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { parseTasksFile, toggleTaskInFile } from './parser.js'
import {
  loadConfig,
  addProject,
  removeProject,
  setActiveProject,
  getActiveProject,
} from './config.js'
import {
  initDb,
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  searchTasks,
  getTasksByStatus,
  archiveTask,
  unarchiveTask,
  TaskStatus,
  TaskPriority,
} from './tasks/index.js'
import { gitRouter, gitPull } from './git/index.js'
import { createTasksWatcher, getGlobalWatcher, setGlobalWatcher } from './watcher.js'
import { syncChangeTasksFromFile } from './sync.js'

const execAsync = promisify(exec)

// Store running Claude processes
const runningTasks = new Map<
  string,
  {
    process: ReturnType<typeof spawn>
    output: string[]
    status: 'running' | 'completed' | 'error'
    startedAt: Date
  }
>()

export const app = express()

app.use(cors())
app.use(express.json())

// Git API 라우터 등록
app.use('/api/git', gitRouter)

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  })
})

// Helper to get paths for active project
async function getProjectPaths() {
  const project = await getActiveProject()
  if (!project) {
    return null
  }
  return {
    openspecDir: join(project.path, 'openspec', 'changes'),
    specsDir: join(project.path, 'openspec', 'specs'),
    plansDir: join(project.path, '.zyflow', 'plans'),
  }
}

// ==================== PROJECT MANAGEMENT ====================

// POST /api/projects/browse - Open native folder picker dialog
app.post('/api/projects/browse', async (_req, res) => {
  try {
    // macOS: Use AppleScript to open folder picker
    const script = `
      osascript -e 'tell application "System Events"
        activate
        set folderPath to POSIX path of (choose folder with prompt "OpenSpec 프로젝트 폴더를 선택하세요")
        return folderPath
      end tell' 2>/dev/null
    `

    const { stdout } = await execAsync(script)
    const selectedPath = stdout.trim().replace(/\/$/, '') // Remove trailing slash

    if (!selectedPath) {
      return res.json({ success: true, data: { path: null, cancelled: true } })
    }

    res.json({ success: true, data: { path: selectedPath, cancelled: false } })
  } catch (error) {
    // User cancelled the dialog
    if ((error as Error).message?.includes('User canceled')) {
      return res.json({ success: true, data: { path: null, cancelled: true } })
    }
    console.error('Error opening folder picker:', error)
    res.json({ success: true, data: { path: null, cancelled: true } })
  }
})

// GET /api/projects - List all registered projects
app.get('/api/projects', async (_req, res) => {
  try {
    const config = await loadConfig()
    res.json({
      success: true,
      data: {
        projects: config.projects,
        activeProjectId: config.activeProjectId,
      },
    })
  } catch (error) {
    console.error('Error listing projects:', error)
    res.status(500).json({ success: false, error: 'Failed to list projects' })
  }
})

// POST /api/projects - Add a new project
app.post('/api/projects', async (req, res) => {
  try {
    const { path: projectPath } = req.body

    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'Path is required' })
    }

    // Check if openspec directory exists
    const openspecPath = join(projectPath, 'openspec')
    try {
      await access(openspecPath)
    } catch {
      return res.status(400).json({
        success: false,
        error: 'No openspec directory found in this project',
      })
    }

    // Use directory name as project name
    const name = basename(projectPath)
    const project = await addProject(name, projectPath)

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error adding project:', error)
    res.status(500).json({ success: false, error: 'Failed to add project' })
  }
})

// DELETE /api/projects/:id - Remove a project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    await removeProject(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error removing project:', error)
    res.status(500).json({ success: false, error: 'Failed to remove project' })
  }
})

// PUT /api/projects/:id/activate - Set active project
app.put('/api/projects/:id/activate', async (req, res) => {
  try {
    await setActiveProject(req.params.id)
    const project = await getActiveProject()

    // 프로젝트 활성화 시 자동으로 Git pull 및 OpenSpec 동기화 수행
    if (project) {
      // Git pull 먼저 실행 (원격 저장소와 동기화)
      try {
        const pullResult = await gitPull(project.path)
        if (pullResult.success) {
          console.log(`[Git] Pulled latest changes for "${project.name}"`)
        } else {
          console.warn(`[Git] Pull failed for "${project.name}": ${pullResult.error || pullResult.stderr}`)
        }
      } catch (gitError) {
        console.warn(`[Git] Pull error for "${project.name}":`, gitError)
        // Git pull 실패해도 활성화는 진행
      }

      try {
        initDb(project.path)
        const openspecDir = join(project.path, 'openspec', 'changes')
        let entries: Dirent[] = []
        try {
          entries = await readdir(openspecDir, { withFileTypes: true })
        } catch {
          entries = []
        }

        const sqlite = getSqlite()
        const now = Date.now()
        const activeChangeIds: string[] = []

        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name === 'archive') continue

          const changeId = entry.name
          activeChangeIds.push(changeId)
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
          const existing = sqlite.prepare('SELECT id FROM changes WHERE id = ?').get(changeId)

          if (existing) {
            sqlite.prepare(`
              UPDATE changes SET title = ?, spec_path = ?, status = 'active', updated_at = ? WHERE id = ?
            `).run(title, specPath, now, changeId)
          } else {
            sqlite.prepare(`
              INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
            `).run(changeId, project.id, title, specPath, now, now)
          }
        }

        // 파일시스템에 없는 Change는 archived로 변경
        if (activeChangeIds.length > 0) {
          const placeholders = activeChangeIds.map(() => '?').join(',')
          sqlite.prepare(`
            UPDATE changes SET status = 'archived', updated_at = ?
            WHERE project_id = ? AND status = 'active' AND id NOT IN (${placeholders})
          `).run(now, project.id, ...activeChangeIds)
        } else {
          // 모든 Change가 없으면 전부 archived
          sqlite.prepare(`
            UPDATE changes SET status = 'archived', updated_at = ?
            WHERE project_id = ? AND status = 'active'
          `).run(now, project.id)
        }

        console.log(`[Auto-sync] Project "${project.name}" synced on activation`)
      } catch (syncError) {
        console.error('Error auto-syncing project:', syncError)
        // sync 실패해도 활성화는 성공으로 처리
      }

      // File Watcher 재시작 (이전 watcher 중지 후 새 프로젝트용 watcher 시작)
      try {
        const existingWatcher = getGlobalWatcher()
        if (existingWatcher) {
          await existingWatcher.stop()
        }

        const watcher = createTasksWatcher({
          projectPath: project.path,
          onTasksChange: async (changeId, filePath) => {
            console.log(`[Watcher] Syncing ${changeId} due to file change: ${filePath}`)
            try {
              const result = await syncChangeTasksFromFile(changeId)
              console.log(`[Watcher] Sync complete: ${result.tasksCreated} created, ${result.tasksUpdated} updated`)
            } catch (error) {
              console.error(`[Watcher] Sync error for ${changeId}:`, error)
            }
          },
          debounceMs: 500,
        })

        watcher.start()
        setGlobalWatcher(watcher)
        console.log(`[Watcher] Started watching tasks.md files for "${project.name}"`)
      } catch (watcherError) {
        console.warn(`[Watcher] Failed to start watcher for "${project.name}":`, watcherError)
        // watcher 실패해도 활성화는 성공으로 처리
      }
    }

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error activating project:', error)
    res.status(500).json({ success: false, error: 'Failed to activate project' })
  }
})

// ==================== ALL PROJECTS DATA ====================

// Helper to parse affected specs from proposal content
function parseAffectedSpecs(proposalContent: string): string[] {
  const specs: string[] = []

  // Find ### Affected Specs section
  const affectedSpecsMatch = proposalContent.match(
    /###\s*Affected Specs\s*\n([\s\S]*?)(?=\n###|\n##|$)/i
  )
  if (!affectedSpecsMatch) return specs

  const section = affectedSpecsMatch[1]
  // Match patterns like: - **NEW**: `spec-name` or - **MODIFIED**: `spec-name`
  const specMatches = section.matchAll(/`([^`]+)`/g)
  for (const match of specMatches) {
    specs.push(match[1])
  }

  return specs
}

// Helper to get changes for a specific project path
async function getChangesForProject(projectPath: string) {
  const openspecDir = join(projectPath, 'openspec', 'changes')
  const changes = []

  let entries
  try {
    entries = await readdir(openspecDir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue

    const changeId = entry.name
    const changeDir = join(openspecDir, changeId)

    let title = changeId
    let relatedSpecs: string[] = []
    try {
      const proposalPath = join(changeDir, 'proposal.md')
      const proposalContent = await readFile(proposalPath, 'utf-8')
      // Try to match "# Change: ..." or just first "# ..." heading
      const titleMatch = proposalContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }
      // Parse affected specs
      relatedSpecs = parseAffectedSpecs(proposalContent)
    } catch {
      // proposal.md not found
    }

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
      // tasks.md not found
    }

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    changes.push({ id: changeId, title, progress, totalTasks, completedTasks, relatedSpecs })
  }

  return changes
}

// Helper to get specs for a specific project path
async function getSpecsForProject(projectPath: string) {
  const specsDir = join(projectPath, 'openspec', 'specs')
  const specs = []

  let entries
  try {
    entries = await readdir(specsDir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const specId = entry.name
    const specDir = join(specsDir, specId)

    let title = specId
    let requirementsCount = 0
    try {
      const specPath = join(specDir, 'spec.md')
      const specContent = await readFile(specPath, 'utf-8')
      const titleMatch = specContent.match(/^#\s+(.+)$/m)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }
      const reqMatches = specContent.match(/^###\s+Requirement:/gm)
      requirementsCount = reqMatches ? reqMatches.length : 0
    } catch {
      // spec.md not found
    }

    specs.push({ id: specId, title, requirementsCount })
  }

  return specs
}

// GET /api/projects/all-data - Get all projects with their changes and specs
app.get('/api/projects/all-data', async (_req, res) => {
  try {
    const config = await loadConfig()
    const projectsData = []

    for (const project of config.projects) {
      const changes = await getChangesForProject(project.path)
      const specs = await getSpecsForProject(project.path)
      projectsData.push({
        ...project,
        changes,
        specs,
      })
    }

    res.json({
      success: true,
      data: {
        projects: projectsData,
        activeProjectId: config.activeProjectId,
      },
    })
  } catch (error) {
    console.error('Error getting all projects data:', error)
    res.status(500).json({ success: false, error: 'Failed to get projects data' })
  }
})

// ==================== CHANGES ====================

// GET /api/changes - List all changes
app.get('/api/changes', async (_req, res) => {
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

      changes.push({
        id: changeId,
        title,
        progress,
        totalTasks,
        completedTasks,
      })
    }

    res.json({ success: true, data: { changes } })
  } catch (error) {
    console.error('Error listing changes:', error)
    res.status(500).json({ success: false, error: 'Failed to list changes' })
  }
})

// GET /api/changes/:id/tasks - Get tasks for a change
app.get('/api/changes/:id/tasks', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    const tasksPath = join(paths.openspecDir, changeId, 'tasks.md')
    const content = await readFile(tasksPath, 'utf-8')
    const parsed = parseTasksFile(changeId, content)

    res.json({ success: true, data: parsed })
  } catch (error) {
    console.error('Error reading tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to read tasks' })
  }
})

// PATCH /api/tasks/:changeId/:taskId - Toggle task checkbox
app.patch('/api/tasks/:changeId/:taskId', async (req, res) => {
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

// GET /api/plans/:changeId/:taskId - Get detail plan
app.get('/api/plans/:changeId/:taskId', async (req, res) => {
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
        data: { taskId, changeId, content: '', exists: false },
      })
    }
  } catch (error) {
    console.error('Error reading plan:', error)
    res.status(500).json({ success: false, error: 'Failed to read plan' })
  }
})

// ==================== SPECS ====================

// GET /api/specs - List all specs
app.get('/api/specs', async (_req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.json({ success: true, data: { specs: [] } })
    }

    let entries
    try {
      entries = await readdir(paths.specsDir, { withFileTypes: true })
    } catch {
      return res.json({ success: true, data: { specs: [] } })
    }

    const specs = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const specId = entry.name
      const specDir = join(paths.specsDir, specId)

      // Read spec.md for title and requirements count
      let title = specId
      let requirementsCount = 0
      try {
        const specPath = join(specDir, 'spec.md')
        const specContent = await readFile(specPath, 'utf-8')

        // Extract title from first # heading
        const titleMatch = specContent.match(/^#\s+(.+)$/m)
        if (titleMatch) {
          title = titleMatch[1].trim()
        }

        // Count requirements
        const reqMatches = specContent.match(/^###\s+Requirement:/gm)
        requirementsCount = reqMatches ? reqMatches.length : 0
      } catch {
        // No spec.md
      }

      specs.push({
        id: specId,
        title,
        requirementsCount,
      })
    }

    res.json({ success: true, data: { specs } })
  } catch (error) {
    console.error('Error listing specs:', error)
    res.status(500).json({ success: false, error: 'Failed to list specs' })
  }
})

// GET /api/specs/:id - Get spec content
app.get('/api/specs/:id', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const specId = req.params.id
    const specPath = join(paths.specsDir, specId, 'spec.md')
    const content = await readFile(specPath, 'utf-8')

    res.json({ success: true, data: { id: specId, content } })
  } catch (error) {
    console.error('Error reading spec:', error)
    res.status(500).json({ success: false, error: 'Failed to read spec' })
  }
})

// PATCH /api/tasks/reorder - Reorder tasks within a group
app.patch('/api/tasks/reorder', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { changeId, groupId, taskIds } = req.body
    const tasksPath = join(paths.openspecDir, changeId, 'tasks.md')

    const content = await readFile(tasksPath, 'utf-8')
    const lines = content.split('\n')

    // Find the group and its tasks
    const groupNumber = groupId.replace('group-', '')
    let inGroup = false
    let groupStartLine = -1
    let groupEndLine = -1
    const taskLines: { id: string; line: string; lineNum: number }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const groupMatch = line.match(/^##\s+(\d+)\.\s+/)

      if (groupMatch) {
        if (groupMatch[1] === groupNumber) {
          inGroup = true
          groupStartLine = i
        } else if (inGroup) {
          groupEndLine = i
          break
        }
      }

      if (inGroup) {
        const taskMatch = line.match(/^-\s+\[[ xX]\]\s+(\d+\.\d+)\s+/)
        if (taskMatch) {
          const taskId = `task-${taskMatch[1].replace('.', '-')}`
          taskLines.push({ id: taskId, line, lineNum: i })
        }
      }
    }

    if (groupEndLine === -1) groupEndLine = lines.length

    // Reorder task lines based on taskIds
    const reorderedTaskLines = taskIds
      .map((id: string) => {
        const found = taskLines.find((t) => t.id === id)
        return found ? found.line : null
      })
      .filter(Boolean)

    // Rebuild the file content
    const beforeGroup = lines.slice(0, groupStartLine + 1)
    const afterGroup = lines.slice(groupEndLine)

    // Find non-task lines in the group (empty lines, etc.)
    const groupNonTaskLines = lines
      .slice(groupStartLine + 1, groupEndLine)
      .filter((line) => !line.match(/^-\s+\[[ xX]\]/))
      .filter((line) => line.trim() === '')

    const newContent = [
      ...beforeGroup,
      '',
      ...reorderedTaskLines,
      ...groupNonTaskLines,
      ...afterGroup,
    ].join('\n')

    await writeFile(tasksPath, newContent, 'utf-8')

    res.json({ success: true })
  } catch (error) {
    console.error('Error reordering tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to reorder tasks' })
  }
})

// ==================== CLAUDE CODE EXECUTION ====================

// POST /api/claude/execute - Execute a task with Claude Code (SSE streaming)
app.post('/api/claude/execute', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { changeId, taskId, taskTitle, context } = req.body
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    // Build the prompt for Claude
    const prompt = `당신은 OpenSpec 프로젝트의 태스크를 실행하는 AI입니다.

## 현재 작업
- Change: ${changeId}
- Task ID: ${taskId}
- Task: ${taskTitle}

## 컨텍스트
${context || '추가 컨텍스트 없음'}

## 지시사항
1. 위 태스크를 완료하세요
2. 필요한 파일을 읽고, 수정하거나 생성하세요
3. 작업이 완료되면 결과를 요약해주세요
4. 에러가 발생하면 명확하게 보고해주세요

작업을 시작하세요.`

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Generate unique run ID
    const runId = `${changeId}-${taskId}-${Date.now()}`

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'start', runId, taskId, changeId })}\n\n`)

    // Spawn Claude CLI process
    const claudeProcess = spawn(
      'claude',
      ['--print', '--output-format', 'stream-json', '--dangerously-skip-permissions', prompt],
      {
        cwd: project.path,
        env: { ...process.env },
        shell: true,
      }
    )

    const taskState = {
      process: claudeProcess,
      output: [] as string[],
      status: 'running' as const,
      startedAt: new Date(),
    }
    runningTasks.set(runId, taskState)

    let buffer = ''

    claudeProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const parsed = JSON.parse(line)
          taskState.output.push(line)

          // Forward to client
          res.write(`data: ${JSON.stringify({ type: 'output', data: parsed })}\n\n`)
        } catch {
          // Non-JSON output, send as text
          res.write(`data: ${JSON.stringify({ type: 'text', content: line })}\n\n`)
        }
      }
    })

    claudeProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      res.write(`data: ${JSON.stringify({ type: 'stderr', content: text })}\n\n`)
    })

    claudeProcess.on('close', async (code) => {
      const status = code === 0 ? 'completed' : 'error'
      taskState.status = status

      // Save execution log
      try {
        const logsDir = join(project.path, '.zyflow', 'logs', changeId)
        await mkdir(logsDir, { recursive: true })
        const logPath = join(logsDir, `${taskId}-${Date.now()}.json`)
        await writeFile(
          logPath,
          JSON.stringify(
            {
              runId,
              changeId,
              taskId,
              taskTitle,
              status,
              startedAt: taskState.startedAt,
              completedAt: new Date(),
              output: taskState.output,
            },
            null,
            2
          )
        )
      } catch (err) {
        console.error('Failed to save log:', err)
      }

      // Auto-complete task on successful execution
      let taskAutoCompleted = false
      if (code === 0) {
        try {
          const tasksPath = join(paths!.openspecDir, changeId, 'tasks.md')
          const content = await readFile(tasksPath, 'utf-8')
          const { newContent, task } = toggleTaskInFile(content, taskId)

          // toggleTaskInFile returns the NEW state after toggle
          // If task.completed is true, it means it WAS uncompleted and is now completed
          if (task.completed) {
            await writeFile(tasksPath, newContent, 'utf-8')
            taskAutoCompleted = true
          }
          // If it was already completed (task.completed would be false after toggle),
          // we don't save the file
        } catch (err) {
          console.error('Failed to auto-complete task:', err)
        }
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'complete',
          runId,
          status,
          exitCode: code,
          taskAutoCompleted,
        })}\n\n`
      )
      res.end()

      // Cleanup after 5 minutes
      setTimeout(() => runningTasks.delete(runId), 5 * 60 * 1000)
    })

    claudeProcess.on('error', (err) => {
      taskState.status = 'error'
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
      res.end()
    })

    // Handle client disconnect
    req.on('close', () => {
      if (taskState.status === 'running') {
        claudeProcess.kill('SIGTERM')
      }
    })
  } catch (error) {
    console.error('Error executing Claude:', error)
    res.status(500).json({ success: false, error: 'Failed to execute Claude' })
  }
})

// GET /api/claude/status/:runId - Get status of a running task
app.get('/api/claude/status/:runId', (req, res) => {
  const task = runningTasks.get(req.params.runId)
  if (!task) {
    return res.json({ success: true, data: { status: 'not_found' } })
  }
  res.json({
    success: true,
    data: {
      status: task.status,
      startedAt: task.startedAt,
      outputLength: task.output.length,
    },
  })
})

// POST /api/claude/stop/:runId - Stop a running task
app.post('/api/claude/stop/:runId', (req, res) => {
  const task = runningTasks.get(req.params.runId)
  if (!task || task.status !== 'running') {
    return res.json({ success: false, error: 'Task not running' })
  }
  task.process.kill('SIGTERM')
  task.status = 'error'
  res.json({ success: true })
})

// GET /api/claude/logs/:changeId - Get execution logs for a change
app.get('/api/claude/logs/:changeId', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const logsDir = join(project.path, '.zyflow', 'logs', req.params.changeId)
    let files: string[] = []
    try {
      const entries = await readdir(logsDir)
      files = entries.filter((f) => f.endsWith('.json'))
    } catch {
      // No logs directory yet
    }

    const logs = []
    for (const file of files.slice(-20)) {
      // Last 20 logs
      try {
        const content = await readFile(join(logsDir, file), 'utf-8')
        logs.push(JSON.parse(content))
      } catch {
        // Skip invalid logs
      }
    }

    res.json({ success: true, data: { logs } })
  } catch (error) {
    console.error('Error reading logs:', error)
    res.status(500).json({ success: false, error: 'Failed to read logs' })
  }
})

// ==================== TASK MANAGEMENT (SQLite) ====================

// Initialize task DB for active project
async function initTaskDb() {
  const project = await getActiveProject()
  if (project) {
    initDb(project.path)
  }
}

// GET /api/tasks - List all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    await initTaskDb()
    const { status, priority, tags, kanban } = req.query

    if (kanban === 'true') {
      const tasksByStatus = getTasksByStatus()
      return res.json({ success: true, data: { tasksByStatus } })
    }

    const tasks = listTasks({
      status: status as TaskStatus | undefined,
      priority: priority as TaskPriority | undefined,
      tags: tags ? (tags as string).split(',') : undefined,
    })

    res.json({ success: true, data: { tasks } })
  } catch (error) {
    console.error('Error listing tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to list tasks' })
  }
})

// POST /api/tasks - Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    await initTaskDb()
    const { title, description, status, priority, tags, assignee } = req.body

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' })
    }

    const task = createTask({
      title,
      description,
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      tags,
      assignee,
    })

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error creating task:', error)
    res.status(500).json({ success: false, error: 'Failed to create task' })
  }
})

// GET /api/tasks/archived - Get archived tasks with pagination
// NOTE: This route MUST be defined before /api/tasks/:id to avoid 'archived' being matched as :id
app.get('/api/tasks/archived', async (req, res) => {
  try {
    await initTaskDb()
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 20
    const search = req.query.search as string | undefined

    // Get archived tasks only
    let archivedTasks = listTasks({
      status: 'archived',
      includeArchived: true,
      orderBy: 'updatedAt',
      orderDir: 'desc',
    })

    // Filter by search query
    if (search) {
      const query = search.toLowerCase()
      archivedTasks = archivedTasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.id.toLowerCase().includes(query)
      )
    }

    const total = archivedTasks.length
    const totalPages = Math.ceil(total / limit)
    const offset = (page - 1) * limit
    const tasks = archivedTasks.slice(offset, offset + limit)

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    })
  } catch (error) {
    console.error('Error getting archived tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to get archived tasks' })
  }
})

// GET /api/tasks/search - Search tasks
// NOTE: This route MUST be defined before /api/tasks/:id
app.get('/api/tasks/search', async (req, res) => {
  try {
    await initTaskDb()
    const { q, status, priority, limit } = req.query

    if (!q) {
      return res.status(400).json({ success: false, error: 'Query is required' })
    }

    const tasks = searchTasks(q as string, {
      status: status as string | undefined,
      priority: priority as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    })

    res.json({ success: true, data: { tasks } })
  } catch (error) {
    console.error('Error searching tasks:', error)
    res.status(500).json({ success: false, error: 'Failed to search tasks' })
  }
})

// GET /api/tasks/:id - Get a single task
app.get('/api/tasks/:id', async (req, res) => {
  try {
    await initTaskDb()
    const task = getTask(req.params.id)

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error getting task:', error)
    res.status(500).json({ success: false, error: 'Failed to get task' })
  }
})

// PATCH /api/tasks/:id - Update a task
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    await initTaskDb()
    const { title, description, status, priority, tags, assignee, order } = req.body

    const task = updateTask(req.params.id, {
      title,
      description,
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      tags,
      assignee,
      order,
    })

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error updating task:', error)
    res.status(500).json({ success: false, error: 'Failed to update task' })
  }
})

// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await initTaskDb()
    const deleted = deleteTask(req.params.id)

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    res.status(500).json({ success: false, error: 'Failed to delete task' })
  }
})

// POST /api/tasks/:id/archive - Archive a task
app.post('/api/tasks/:id/archive', async (req, res) => {
  try {
    await initTaskDb()
    const task = archiveTask(req.params.id)

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error archiving task:', error)
    res.status(500).json({ success: false, error: 'Failed to archive task' })
  }
})

// POST /api/tasks/:id/unarchive - Unarchive a task
app.post('/api/tasks/:id/unarchive', async (req, res) => {
  try {
    await initTaskDb()
    const task = unarchiveTask(req.params.id)

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found or not archived' })
    }

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error unarchiving task:', error)
    res.status(500).json({ success: false, error: 'Failed to unarchive task' })
  }
})

// ==================== FLOW API (DB 기반 Change 관리) ====================

import { getSqlite } from './tasks/db/client.js'
import type { Stage, ChangeStatus } from './tasks/db/schema.js'

const STAGES: Stage[] = ['spec', 'task', 'code', 'test', 'commit', 'docs']

// Helper: Change의 stages 집계 정보 계산
function getChangeStages(changeId: string, _projectPath?: string) {
  const sqlite = getSqlite()
  const stages: Record<Stage, { total: number; completed: number; tasks: unknown[] }> = {
    spec: { total: 0, completed: 0, tasks: [] },
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
      createdAt: new Date(task.created_at).toISOString(),
      updatedAt: new Date(task.updated_at).toISOString(),
      archivedAt: task.archived_at ? new Date(task.archived_at).toISOString() : null,
    })
  }

  return stages
}

// Helper: Change 진행률 계산
function calculateProgress(stages: Record<Stage, { total: number; completed: number }>): number {
  let totalTasks = 0
  let completedTasks = 0
  for (const stage of STAGES) {
    totalTasks += stages[stage].total
    completedTasks += stages[stage].completed
  }
  return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
}

// Helper: 현재 stage 결정 (가장 먼저 미완료된 stage)
function determineCurrentStage(stages: Record<Stage, { total: number; completed: number }>): Stage {
  for (const stage of STAGES) {
    if (stages[stage].total > stages[stage].completed) {
      return stage
    }
  }
  return 'docs' // 모든 stage 완료시
}

// GET /api/flow/changes/counts - 프로젝트별 활성 Change 수
app.get('/api/flow/changes/counts', async (_req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()
    const sqlite = getSqlite()

    const counts: Record<string, number> = {}

    for (const project of config.projects) {
      const result = sqlite.prepare(`
        SELECT COUNT(*) as count FROM changes
        WHERE project_id = ? AND status = 'active'
      `).get(project.id) as { count: number } | undefined

      counts[project.id] = result?.count ?? 0
    }

    res.json({ success: true, data: { counts } })
  } catch (error) {
    console.error('Error getting change counts:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// GET /api/flow/changes - Flow Changes 목록 (DB 기반)
app.get('/api/flow/changes', async (_req, res) => {
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

// GET /api/flow/changes/:id - Flow Change 상세 (stages 포함)
app.get('/api/flow/changes/:id', async (req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const sqlite = getSqlite()
    const change = sqlite.prepare(`
      SELECT * FROM changes WHERE id = ? AND project_id = ?
    `).get(req.params.id, project.id) as {
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

    const stages = getChangeStages(change.id, project.path)
    const progress = calculateProgress(stages)
    const currentStage = determineCurrentStage(stages)

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
          createdAt: new Date(change.created_at).toISOString(),
          updatedAt: new Date(change.updated_at).toISOString(),
        },
        stages,
      },
    })
  } catch (error) {
    console.error('Error getting flow change:', error)
    res.status(500).json({ success: false, error: 'Failed to get flow change' })
  }
})

// POST /api/flow/sync - OpenSpec에서 Changes 동기화
app.post('/api/flow/sync', async (_req, res) => {
  try {
    await initTaskDb()
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const openspecDir = join(project.path, 'openspec', 'changes')
    let entries
    try {
      entries = await readdir(openspecDir, { withFileTypes: true })
    } catch {
      return res.json({ success: true, data: { synced: 0, created: 0, updated: 0 } })
    }

    const sqlite = getSqlite()
    let created = 0
    let updated = 0

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
      const existing = sqlite.prepare('SELECT id FROM changes WHERE id = ?').get(changeId)
      const now = Date.now()

      if (existing) {
        sqlite.prepare(`
          UPDATE changes SET title = ?, spec_path = ?, updated_at = ? WHERE id = ?
        `).run(title, specPath, now, changeId)
        updated++
      } else {
        sqlite.prepare(`
          INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
        `).run(changeId, project.id, title, specPath, now, now)
        created++
      }

      // Sync tasks from tasks.md (3단계 계층 지원)
      try {
        const tasksPath = join(changeDir, 'tasks.md')
        const tasksContent = await readFile(tasksPath, 'utf-8')
        const parsed = parseTasksFile(changeId, tasksContent)

        // Extended group type with 3-level hierarchy
        interface ExtendedGroup {
          title: string
          tasks: Array<{ title: string; completed: boolean; lineNumber: number }>
          majorOrder?: number
          majorTitle?: string
          subOrder?: number
        }

        for (const group of parsed.groups as ExtendedGroup[]) {
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
              SELECT id FROM tasks WHERE change_id = ? AND title = ?
            `).get(changeId, task.title) as { id: number } | undefined

            if (existingTask) {
              // Update existing task with status and 3-level hierarchy info
              const newStatus = task.completed ? 'done' : 'todo'
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
              `).run(newStatus, groupTitle, majorOrder, taskOrder, majorTitle, subOrder, now, existingTask.id)
            } else {
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
                task.completed ? 'done' : 'todo',
                task.lineNumber,
                groupTitle,
                majorOrder,
                taskOrder,
                majorTitle,
                subOrder,
                now,
                now
              )
            }
          }
        }
      } catch {
        // tasks.md not found or parse error
      }
    }

    res.json({ success: true, data: { synced: created + updated, created, updated } })
  } catch (error) {
    console.error('Error syncing flow changes:', error)
    res.status(500).json({ success: false, error: 'Failed to sync flow changes' })
  }
})

// GET /api/flow/tasks - Flow Tasks 목록 (필터링)
app.get('/api/flow/tasks', async (req, res) => {
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

// POST /api/flow/tasks - Flow Task 생성
app.post('/api/flow/tasks', async (req, res) => {
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

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error creating flow task:', error)
    res.status(500).json({ success: false, error: 'Failed to create flow task' })
  }
})

// GET /api/flow/changes/:id/proposal - Change의 proposal.md 내용
app.get('/api/flow/changes/:id/proposal', async (req, res) => {
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

// GET /api/flow/changes/:id/design - Change의 design.md 내용
app.get('/api/flow/changes/:id/design', async (req, res) => {
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

// GET /api/flow/changes/:id/spec - Change의 첫 번째 spec.md 내용
app.get('/api/flow/changes/:id/spec', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeId = req.params.id
    const specsDir = join(paths.openspecDir, changeId, 'specs')

    try {
      // specs 디렉토리에서 첫 번째 spec 폴더 찾기
      const specFolders = await readdir(specsDir)
      if (specFolders.length === 0) {
        return res.json({ success: true, data: { changeId, content: null, specId: null } })
      }

      // 첫 번째 spec 폴더의 spec.md 읽기
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

// GET /api/flow/changes/:changeId/specs/:specId - 특정 spec.md 내용
app.get('/api/flow/changes/:changeId/specs/:specId', async (req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { changeId, specId } = req.params

    // 1. Change 내 specs 디렉토리 확인
    const changeSpecPath = join(paths.openspecDir, changeId, 'specs', specId, 'spec.md')
    try {
      const content = await readFile(changeSpecPath, 'utf-8')
      return res.json({ success: true, data: { specId, content, location: 'change' } })
    } catch {
      // Change 내에 없으면 archived specs에서 찾기
    }

    // 2. Archived specs 디렉토리에서 확인
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

// PATCH /api/flow/tasks/:id - Flow Task 수정
app.patch('/api/flow/tasks/:id', async (req, res) => {
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

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error updating flow task:', error)
    res.status(500).json({ success: false, error: 'Failed to update flow task' })
  }
})

