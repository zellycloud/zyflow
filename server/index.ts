import express from 'express'
import cors from 'cors'
import { readdir, readFile, writeFile, access } from 'fs/promises'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import { parseTasksFile, toggleTaskInFile } from './parser.js'

const execAsync = promisify(exec)
import {
  loadConfig,
  saveConfig,
  addProject,
  removeProject,
  setActiveProject,
  getActiveProject,
  type Project,
} from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

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
app.post('/api/projects/browse', async (req, res) => {
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
app.get('/api/projects', async (req, res) => {
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
    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error activating project:', error)
    res.status(500).json({ success: false, error: 'Failed to activate project' })
  }
})

// ==================== CHANGES ====================

// GET /api/changes - List all changes
app.get('/api/changes', async (req, res) => {
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
app.get('/api/specs', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`ZyFlow API server running on http://localhost:${PORT}`)
})
