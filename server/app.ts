import express from 'express'
import cors from 'cors'
import { readdir, readFile, writeFile, access, mkdir } from 'fs/promises'
import type { Dirent } from 'fs'
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
  updateProjectPath,
  updateProjectName,
  reorderProjects,
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
import { emit } from './websocket.js'
import { integrationsRouter, initIntegrationsDb } from './integrations/index.js'
import { getSqlite } from './tasks/db/client.js'
import type { Stage, ChangeStatus } from './tasks/db/schema.js'
import { cliRoutes } from './cli-adapter/index.js'
import { postTaskRouter } from './routes/post-task.js'
import { docsRouter } from './routes/docs.js'
import { projectsRouter } from './routes/projects.js'
import { startTasksWatcher, stopTasksWatcher } from './watcher.js'
import { changesRouter } from './routes/changes.js'
import { flowRouter } from './routes/flow.js'
import { alertsRouter, setBroadcastAlert } from './routes/alerts.js'
import { aiRouter } from './ai/index.js'
// Remote plugin (optional - only if installed)
let remoteRouter: import('express').Router | null = null
let getRemoteServerById: ((id: string) => Promise<import('@zyflow/remote-plugin').RemoteServer | null>) | null = null
let listDirectory: ((server: import('@zyflow/remote-plugin').RemoteServer, path: string) => Promise<import('@zyflow/remote-plugin').RemoteDirectoryListing>) | null = null
let readRemoteFile: ((server: import('@zyflow/remote-plugin').RemoteServer, path: string) => Promise<string>) | null = null
let executeCommand: ((server: import('@zyflow/remote-plugin').RemoteServer, command: string, options?: { cwd?: string; timeout?: number }) => Promise<import('@zyflow/remote-plugin').RemoteCommandResult>) | null = null

// Try to load remote plugin
try {
  const remotePlugin = await import('@zyflow/remote-plugin')
  remoteRouter = remotePlugin.remoteRouter
  getRemoteServerById = remotePlugin.getRemoteServerById
  listDirectory = remotePlugin.listDirectory
  readRemoteFile = remotePlugin.readRemoteFile
  executeCommand = remotePlugin.executeCommand
  console.log('[Remote Plugin] Loaded successfully')
} catch {
  console.log('[Remote Plugin] Not installed - remote features disabled')
}
import { OpenSpecPromptBuilder } from './claude-flow/prompt-builder.js'
import * as pty from 'node-pty'
const execAsync = promisify(exec)

// Lazy load gitdiagram-core functions to avoid ESM/CJS issues
let gitdiagramCore: {
  generateFileTree: typeof import('../packages/gitdiagram-core/src/file-tree').generateFileTree
  readReadme: typeof import('../packages/gitdiagram-core/src/file-tree').readReadme
  generateDiagram: typeof import('../packages/gitdiagram-core/src/generator').generateDiagram
  createLLMAdapter: typeof import('../packages/gitdiagram-core/src/llm-adapter').createLLMAdapter
  validateMermaidSyntax: typeof import('../packages/gitdiagram-core/src/mermaid-utils').validateMermaidSyntax
  extractClickEvents: typeof import('../packages/gitdiagram-core/src/mermaid-utils').extractClickEvents
} | null = null

async function getGitdiagramCore() {
  if (!gitdiagramCore) {
    const [fileTree, generator, llmAdapter, mermaidUtils] = await Promise.all([
      import('../packages/gitdiagram-core/src/file-tree.js'),
      import('../packages/gitdiagram-core/src/generator.js'),
      import('../packages/gitdiagram-core/src/llm-adapter.js'),
      import('../packages/gitdiagram-core/src/mermaid-utils.js'),
    ])
    gitdiagramCore = {
      generateFileTree: fileTree.generateFileTree,
      readReadme: fileTree.readReadme,
      generateDiagram: generator.generateDiagram,
      createLLMAdapter: llmAdapter.createLLMAdapter,
      validateMermaidSyntax: mermaidUtils.validateMermaidSyntax,
      extractClickEvents: mermaidUtils.extractClickEvents,
    }
  }
  return gitdiagramCore
}

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

// Integration Hub API 라우터 등록
initIntegrationsDb()
app.use('/api/integrations', integrationsRouter)

// CLI Adapter API 라우터 등록
app.use('/api/cli', cliRoutes)

// Post-Task API 라우터 등록
app.use('/api/post-task', postTaskRouter)

// AI Execution API 라우터 등록 (단일 Provider 실행)
app.use('/api/ai', aiRouter)

// Docs API 라우터 등록
app.use('/api/docs', docsRouter)

// Projects API 라우터 등록
app.use('/api/projects', projectsRouter)

// Changes API 라우터 등록
app.use('/api/changes', changesRouter)

// Flow API 라우터 등록
app.use('/api/flow', flowRouter)

// Alerts API 라우터 등록
app.use('/api/alerts', alertsRouter)

// Remote Server API 라우터 등록 (플러그인이 설치된 경우만)
if (remoteRouter) {
  app.use('/api/remote', remoteRouter)
}

// Alert WebSocket broadcast 설정
setBroadcastAlert((data) => {
  emit('alert', data)
})

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

// ==================== PROJECT MANAGEMENT ====================

// POST /api/projects/browse - Open native folder picker dialog
app.post('/api/projects/browse', async (_req, res) => {
  try {
    // macOS: Use AppleScript to open folder picker (simplified version)
    const script = `osascript -e 'POSIX path of (choose folder with prompt "OpenSpec 프로젝트 폴더를 선택하세요")'`

    const { stdout } = await execAsync(script, { timeout: 120000 }) // 2분 타임아웃
    const selectedPath = stdout.trim().replace(/\/$/, '') // Remove trailing slash

    if (!selectedPath) {
      return res.json({ success: true, data: { path: null, cancelled: true } })
    }

    res.json({ success: true, data: { path: selectedPath, cancelled: false } })
  } catch (error) {
    const errorMessage = (error as Error).message || ''
    // User cancelled the dialog (error code -128)
    if (
      errorMessage.includes('-128') ||
      errorMessage.includes('User canceled') ||
      errorMessage.includes('취소')
    ) {
      return res.json({ success: true, data: { path: null, cancelled: true } })
    }
    console.error('Error opening folder picker:', error)
    res.status(500).json({ success: false, error: 'Failed to open folder picker' })
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

// PUT /api/projects/reorder - Reorder projects
// NOTE: This must be defined BEFORE /api/projects/:id routes to avoid :id matching "reorder"
app.put('/api/projects/reorder', async (req, res) => {
  try {
    const { projectIds } = req.body

    if (!projectIds || !Array.isArray(projectIds)) {
      return res.status(400).json({ success: false, error: 'projectIds array is required' })
    }

    const projects = await reorderProjects(projectIds)
    res.json({ success: true, data: { projects } })
  } catch (error) {
    console.error('Error reordering projects:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reorder projects',
    })
  }
})

// DELETE /api/projects/:id - Remove a project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id
    await removeProject(projectId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error removing project:', error)
    res.status(500).json({ success: false, error: 'Failed to remove project' })
  }
})

// NOTE: /api/projects/:id/activate 핸들러는 routes/projects.ts에서 최적화된 버전으로 제공됩니다.

// PUT /api/projects/:id/path - Update project path
app.put('/api/projects/:id/path', async (req, res) => {
  try {
    const projectId = req.params.id
    const { path: newPath } = req.body

    if (!newPath) {
      return res.status(400).json({ success: false, error: 'Path is required' })
    }

    // Check if openspec directory exists in new path
    const openspecPath = join(newPath, 'openspec')
    try {
      await access(openspecPath)
    } catch {
      return res.status(400).json({
        success: false,
        error: 'No openspec directory found in the specified path',
      })
    }

    const project = await updateProjectPath(projectId, newPath)

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error updating project path:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update project path',
    })
  }
})

// GET /api/projects/:id/changes - Get changes for a project
app.get('/api/projects/:id/changes', async (req, res) => {
  try {
    const projectId = req.params.id
    const { getSqlite } = await import('./tasks/db/client.js')
    const sqlite = getSqlite()

    const changes = sqlite
      .prepare(
        `
      SELECT id, title, status, current_stage, progress, spec_path, created_at, updated_at
      FROM changes
      WHERE project_id = ?
      ORDER BY updated_at DESC
    `
      )
      .all(projectId)

    res.json({ success: true, changes })
  } catch (error) {
    console.error('Error fetching project changes:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch changes',
    })
  }
})

// PUT /api/projects/:id/name - Update project name
app.put('/api/projects/:id/name', async (req, res) => {
  try {
    const projectId = req.params.id
    const { name: newName } = req.body

    if (!newName || typeof newName !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' })
    }

    const trimmedName = newName.trim()
    if (trimmedName.length === 0) {
      return res.status(400).json({ success: false, error: 'Name cannot be empty' })
    }

    const project = await updateProjectName(projectId, trimmedName)
    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error updating project name:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update project name',
    })
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

// Helper to get changes for a specific project (supports both local and remote)
async function getChangesForProject(project: {
  id: string
  path: string
  remote?: { serverId: string }
}) {
  const projectPath = project.path

  // Get archived change IDs from DB to filter them out
  const archivedChangeIds = new Set<string>()
  try {
    const sqlite = getSqlite()
    const archivedRows = sqlite
      .prepare(
        `
      SELECT id FROM changes WHERE project_id = ? AND status = 'archived'
    `
      )
      .all(project.id) as { id: string }[]
    for (const row of archivedRows) {
      archivedChangeIds.add(row.id)
    }
  } catch {
    // DB not initialized yet, proceed without filtering
  }

  // 원격 프로젝트인 경우 (플러그인이 설치된 경우만)
  if (project.remote) {
    if (!getRemoteServerById || !listDirectory || !readRemoteFile || !executeCommand) {
      console.log('[Remote] Plugin not installed - cannot access remote project')
      return []
    }

    const server = await getRemoteServerById(project.remote.serverId)
    if (!server) {
      return []
    }

    const openspecDir = `${projectPath}/openspec/changes`

    // 원격 디렉토리 목록 조회
    let listing
    try {
      listing = await listDirectory(server, openspecDir)
    } catch {
      return []
    }

    // 디렉토리만 필터링 (archive 제외)
    const validEntries = listing.entries.filter(
      (entry) => entry.type === 'directory' && entry.name !== 'archive'
    )

    // 병렬로 각 change 처리
    const changes = await Promise.all(
      validEntries.map(async (entry) => {
        const changeId = entry.name

        // Skip archived changes (based on DB status)
        if (archivedChangeIds.has(changeId)) return null

        const changeDir = `${openspecDir}/${changeId}`

        // 원격에서 proposal.md, tasks.md 읽기 및 git log 실행
        const [proposalResult, tasksResult, gitResult] = await Promise.allSettled([
          readRemoteFile(server, `${changeDir}/proposal.md`),
          readRemoteFile(server, `${changeDir}/tasks.md`),
          executeCommand(server, `git log -1 --format="%aI" -- "openspec/changes/${changeId}"`, {
            cwd: projectPath,
          }),
        ])

        // Parse proposal
        let title = changeId
        let relatedSpecs: string[] = []
        if (proposalResult.status === 'fulfilled') {
          const titleMatch = proposalResult.value.match(/^#\s+(?:Change:\s+)?(.+)$/m)
          if (titleMatch) title = titleMatch[1].trim()
          relatedSpecs = parseAffectedSpecs(proposalResult.value)
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
        if (gitResult.status === 'fulfilled') {
          const stdout = gitResult.value.stdout.trim()
          if (stdout) {
            updatedAt = stdout
          } else {
            // git log 결과가 비어있으면 modifiedAt 사용
            updatedAt = entry.modifiedAt || new Date().toISOString()
          }
        } else {
          // git log 실패 시 modifiedAt 사용
          updatedAt = entry.modifiedAt || new Date().toISOString()
        }

        return {
          id: changeId,
          title,
          progress,
          totalTasks,
          completedTasks,
          relatedSpecs,
          updatedAt,
        }
      })
    )

    return changes.filter((c): c is NonNullable<typeof c> => c !== null)
  }

  // 로컬 프로젝트인 경우
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

    // Skip archived changes (based on DB status)
    if (archivedChangeIds.has(changeId)) continue
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

    // Get last modified date from git
    let updatedAt: string | null = null
    try {
      const relativeChangeDir = `openspec/changes/${changeId}`
      const gitCmd = `git log -1 --format="%aI" -- "${relativeChangeDir}"`
      const { stdout } = await execAsync(gitCmd, { cwd: projectPath })
      if (stdout.trim()) {
        updatedAt = stdout.trim()
      } else {
        // Fallback to file stat
        const tasksPath = join(changeDir, 'tasks.md')
        const stat = await import('fs/promises').then((fs) => fs.stat(tasksPath))
        updatedAt = stat.mtime.toISOString()
      }
    } catch {
      updatedAt = new Date().toISOString()
    }

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    changes.push({
      id: changeId,
      title,
      progress,
      totalTasks,
      completedTasks,
      relatedSpecs,
      updatedAt,
    })
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
      const changes = await getChangesForProject(project)
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
            const stat = await import('fs/promises').then((fs) => fs.stat(tasksPath))
            updatedAt = stat.mtime.toISOString()
          } catch {
            const stat = await import('fs/promises').then((fs) => fs.stat(proposalPath))
            updatedAt = stat.mtime.toISOString()
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

// GET /api/changes/archived - List all archived changes
app.get('/api/changes/archived', async (_req, res) => {
  try {
    const paths = await getProjectPaths()
    if (!paths) {
      return res.json({ success: true, data: { changes: [] } })
    }

    const archivedChanges: Array<{
      id: string
      title: string
      progress: number
      totalTasks: number
      completedTasks: number
      archivedAt: string | null
      source: 'archive' | 'archived'
    }> = []

    // Helper function to read archived change from a directory
    async function readArchivedChange(
      changeDir: string,
      changeId: string,
      source: 'archive' | 'archived'
    ) {
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

      // Get archived date from git or file stat
      let archivedAt: string | null = null
      try {
        const { stat } = await import('fs/promises')
        const proposalPath = join(changeDir, 'proposal.md')
        const tasksPath = join(changeDir, 'tasks.md')
        try {
          const s = await stat(proposalPath)
          archivedAt = s.mtime.toISOString()
        } catch {
          const s = await stat(tasksPath)
          archivedAt = s.mtime.toISOString()
        }
      } catch {
        archivedAt = null
      }

      return {
        id: changeId,
        title,
        progress,
        totalTasks,
        completedTasks,
        archivedAt,
        source,
      }
    }

    // Helper to read all changes from an archive directory
    async function readFromArchiveDir(dir: string) {
      try {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const changeDir = join(dir, entry.name)
          const change = await readArchivedChange(changeDir, entry.name, 'archive')
          archivedChanges.push(change)
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Read from all three archive locations
    await readFromArchiveDir(paths.archiveDir) // openspec/changes/archive/
    await readFromArchiveDir(paths.legacyArchiveDir) // openspec/archive/
    await readFromArchiveDir(paths.archivedDir) // openspec/archived/

    // Sort by archivedAt descending (newest first)
    archivedChanges.sort((a, b) => {
      if (!a.archivedAt && !b.archivedAt) return 0
      if (!a.archivedAt) return 1
      if (!b.archivedAt) return -1
      return new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    })

    res.json({ success: true, data: { changes: archivedChanges } })
  } catch (error) {
    console.error('Error listing archived changes:', error)
    res.status(500).json({ success: false, error: 'Failed to list archived changes' })
  }
})

// GET /api/changes/archived/:id - Get archived change detail
app.get('/api/changes/archived/:id', async (req, res) => {
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

    const { changeId, taskId, taskTitle, context, model } = req.body
    // model: 'haiku' | 'sonnet' | 'opus' (default: sonnet)
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    // Build the prompt for Claude using OpenSpecPromptBuilder
    // This provides full context: CLAUDE.md, proposal.md, design.md, tasks.md, specs/
    let prompt: string
    try {
      const promptBuilder = new OpenSpecPromptBuilder(
        project.path,
        changeId,
        'single', // 단일 태스크 모드
        taskId,
        taskTitle // 태스크 제목으로도 검색 가능
      )
      prompt = await promptBuilder.build()

      // 추가 컨텍스트가 있으면 append
      if (context) {
        prompt += `\n\n---\n\n## 추가 컨텍스트\n\n${context}`
      }

      // 태스크 제목 명시
      prompt += `\n\n---\n\n**실행할 태스크**: ${taskTitle}`

      console.log(
        '[Claude Execute] Built prompt with OpenSpecPromptBuilder, length:',
        prompt.length
      )
    } catch (buildError) {
      console.error('[Claude Execute] Failed to build prompt:', buildError)
      // 폴백: 기본 프롬프트 사용
      prompt = `당신은 OpenSpec 프로젝트의 태스크를 실행하는 AI입니다.

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
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Generate unique run ID
    const runId = `${changeId}-${taskId}-${Date.now()}`

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'start', runId, taskId, changeId })}\n\n`)

    // Spawn Claude CLI process using node-pty for real TTY support
    // This enables stream-json output format which requires TTY
    // Based on official docs: https://code.claude.com/docs/en/headless
    console.log('[Claude Execute] Running with prompt length:', prompt.length)
    console.log('[Claude Execute] CWD:', project.path)

    // Save prompt to temp file
    const tmpPromptPath = join('/tmp', `claude-prompt-${runId}.txt`)
    await writeFile(tmpPromptPath, prompt, 'utf-8')

    // Build model argument
    const modelArg = model && ['haiku', 'sonnet', 'opus'].includes(model) ? `--model ${model}` : ''

    console.log('[Claude Execute] Using model:', model || 'default (sonnet)')

    // Use node-pty to spawn with real TTY - enables stream-json output
    const ptyProcess = pty.spawn(
      'bash',
      [
        '-c',
        `cat '${tmpPromptPath}' | /opt/homebrew/bin/claude -p --verbose --output-format stream-json --dangerously-skip-permissions ${modelArg}`,
      ],
      {
        name: 'xterm-color',
        cols: 200,
        rows: 50,
        cwd: project.path,
        env: { ...process.env } as Record<string, string>,
      }
    )

    console.log('[Claude Execute] PTY Process PID:', ptyProcess.pid)

    const taskState = {
      process: ptyProcess,
      output: [] as string[],
      status: 'running' as 'running' | 'completed' | 'error',
      startedAt: new Date(),
    }
    runningTasks.set(runId, taskState)

    let buffer = ''

    ptyProcess.onData((data: string) => {
      console.log('[Claude Execute] pty data:', data.slice(0, 200))
      buffer += data
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        // Remove ANSI escape codes that PTY might add
        const cleanLine = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
        if (!cleanLine) continue

        try {
          const parsed = JSON.parse(cleanLine)
          taskState.output.push(cleanLine)

          // Forward to client
          res.write(`data: ${JSON.stringify({ type: 'output', data: parsed })}\n\n`)

          // Check if this is the final result - terminate process
          if (parsed.type === 'result') {
            console.log('[Claude Execute] Result received, terminating process')
            // Small delay to ensure the result is sent to client
            setTimeout(() => {
              try {
                ptyProcess.kill()
              } catch {
                // Process might already be dead
              }
            }, 100)
          }
        } catch {
          // Non-JSON output, send as text
          res.write(`data: ${JSON.stringify({ type: 'text', content: cleanLine })}\n\n`)
        }
      }
    })

    // node-pty uses onExit instead of 'close' event
    ptyProcess.onExit(async ({ exitCode: code }) => {
      const status = code === 0 ? 'completed' : 'error'
      taskState.status = status

      // Clean up temp prompt file
      try {
        const { unlink } = await import('fs/promises')
        await unlink(tmpPromptPath)
      } catch {
        // Ignore cleanup errors
      }

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

      // Auto-complete task on successful execution is disabled for now
      // The task completion should be done by Claude itself via tasks.md update
      const taskAutoCompleted = false

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

    // Handle client disconnect
    req.on('close', () => {
      if (taskState.status === 'running') {
        ptyProcess.kill()
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

// Initialize task DB - 항상 zyflow 중앙 DB 사용
// 모든 프로젝트의 데이터는 zyflow/.zyflow/tasks.db에 저장됨
async function initTaskDb() {
  // process.cwd()의 DB를 사용 (zyflow 디렉토리)
  initDb()
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

    const project = await getActiveProject()
    const task = createTask({
      title,
      description,
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      tags,
      assignee,
      projectId: project?.id || 'default',
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
          task.id.toString().includes(query)
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

const STAGES: Stage[] = ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']

// Helper: Change의 stages 집계 정보 계산
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

  const tasks = sqlite
    .prepare(
      `
    SELECT * FROM tasks
    WHERE change_id = ? AND status != 'archived'
    ORDER BY stage, group_order, sub_order, task_order, "order"
  `
    )
    .all(changeId) as Array<{
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

// GET /api/flow/changes/counts - 프로젝트별 Change 수 (상태별 집계)
app.get('/api/flow/changes/counts', async (req, res) => {
  try {
    await initTaskDb()
    const config = await loadConfig()
    const sqlite = getSqlite()

    // 쿼리 파라미터에서 상태 필터링 옵션 가져오기
    const { status } = req.query // 'active', 'completed', 'all' (기본값: 'active')

    const counts: Record<string, number> = {}
    const detailedCounts: Record<string, { active: number; completed: number; total: number }> = {}

    // 단일 쿼리로 모든 프로젝트의 집계 데이터 가져오기 (성능 최적화)
    const projectIds = config.projects.map((p) => p.id)
    const placeholders = projectIds.map(() => '?').join(',')

    // 상세 집계 쿼리 (인덱스 활용)
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

    // 결과 매핑
    for (const project of config.projects) {
      const projectResult = detailedResults.find((r) => r.project_id === project.id)

      // 기존 단일 집계 (하위 호환성)
      let count = 0
      if (status === 'active') {
        count = projectResult?.active ?? 0
      } else if (status === 'completed') {
        count = projectResult?.completed ?? 0
      } else {
        count = projectResult?.total ?? 0
      }
      counts[project.id] = count

      // 상세 집계
      detailedCounts[project.id] = {
        active: projectResult?.active ?? 0,
        completed: projectResult?.completed ?? 0,
        total: projectResult?.total ?? 0,
      }
    }

    // 항상 상세 정보를 포함하여 반환 (하위 호환성 유지)
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

// GET /api/flow/changes - Flow Changes 목록 (DB 기반)
app.get('/api/flow/changes', async (_req, res) => {
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
    const config = await loadConfig()

    const sqlite = getSqlite()
    // 모든 프로젝트에서 Change 조회 (active project 제한 없이)
    const change = sqlite
      .prepare(
        `
      SELECT * FROM changes WHERE id = ?
    `
      )
      .get(req.params.id) as
      | {
          id: string
          project_id: string
          title: string
          spec_path: string | null
          status: ChangeStatus
          current_stage: Stage
          progress: number
          created_at: number
          updated_at: number
        }
      | undefined

    if (!change) {
      return res.status(404).json({ success: false, error: 'Change not found' })
    }

    // Change가 속한 프로젝트 경로 찾기
    const project = config.projects.find((p) => p.id === change.project_id)
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found for this change' })
    }

    const stages = getChangeStages(change.id, project.path)
    const progress = calculateProgress(stages)
    const currentStage = determineCurrentStage(stages)

    // Git에서 실제 날짜 가져오기
    let gitCreatedAt: string | null = null
    let gitUpdatedAt: string | null = null
    try {
      const relativeChangeDir = `openspec/changes/${change.id}`
      // 최신 커밋 날짜 (수정일)
      const { stdout: updatedStdout } = await execAsync(
        `git log -1 --format="%aI" -- "${relativeChangeDir}"`,
        { cwd: project.path }
      )
      if (updatedStdout.trim()) {
        gitUpdatedAt = updatedStdout.trim()
      }
      // 최초 커밋 날짜 (생성일)
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

// POST /api/flow/sync - OpenSpec에서 Changes 동기화 (모든 프로젝트)
app.post('/api/flow/sync', async (_req, res) => {
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

        // Sync tasks from tasks.md (3단계 계층 지원)
        // 전략: displayId 기반 매칭 (가장 안정적, 위치 기반)
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
            const groupTitle = group.groupTitle ?? group.title // ### 1.1 Subsection Title

            for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
              const task = group.tasks[taskIdx]
              const taskOrder = taskIdx + 1
              const displayId = task.displayId || null

              if (displayId) {
                parsedDisplayIds.add(displayId)
              }

              // 매칭 전략 (우선순위 순):
              // 1. displayId로 매칭 (가장 안정적 - 파서가 순서 기반으로 생성)
              // 2. change_id + title로 매칭 (displayId가 없는 레거시 데이터용)
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

              // displayId로 못 찾으면 title로 시도 (레거시 호환)
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
                // 기존 태스크 업데이트
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
                // 새 태스크 생성
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

          // 파일에서 삭제된 태스크 정리 (displayId가 있는 태스크 중 파일에 없는 것)
          // 삭제 대신 archived 상태로 변경 (데이터 보존)
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
                // 파일에서 삭제된 태스크 - archived로 표시
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

// GET /api/flow/tasks - Flow Tasks 목록 (필터링)
app.get('/api/flow/tasks', async (req, res) => {
  try {
    await initTaskDb()
    const { changeId, stage, status, standalone, includeArchived } = req.query

    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    // 원격 프로젝트: SSH로 tasks.md 실시간 조회 (On-Demand)
    if (project.remote && changeId) {
      try {
        const remotePlugin = await import('@zyflow/remote-plugin')
        const server = await remotePlugin.getRemoteServerById(project.remote.serverId)
        if (server) {
          const tasksPath = `${project.path}/openspec/changes/${changeId}/tasks.md`
          const tasksContent = await remotePlugin.readRemoteFile(server, tasksPath)
          const parsed = parseTasksFile(changeId as string, tasksContent)
          
          // 파싱된 Tasks를 프론트엔드 형식으로 변환
          const formatted: Array<{
            id: number
            changeId: string | null
            stage: string
            title: string
            description: string | null
            status: string
            priority: string
            tags: string[]
            assignee: string | null
            order: number
            displayId: string | null
            createdAt: string
            updatedAt: string
            archivedAt: string | null
            groupTitle?: string
            majorTitle?: string
          }> = []
          
          let taskId = 1
          for (const group of parsed.groups) {
            for (const task of group.tasks) {
              formatted.push({
                id: taskId++,
                changeId: changeId as string,
                stage: 'task',
                title: task.title,
                description: null,
                status: task.completed ? 'done' : 'todo',
                priority: 'medium',
                tags: [],
                assignee: null,
                order: task.lineNumber,
                displayId: task.displayId || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                archivedAt: null,
                groupTitle: group.title,
                majorTitle: (group as any).majorTitle || group.title,
              })
            }
          }
          
          return res.json({ success: true, data: { tasks: formatted } })
        }
      } catch (e) {
        console.warn('[Remote Tasks] Failed to fetch via SSH, falling back to DB:', e)
        // SSH 실패 시 DB에서 조회 (fallback)
      }
    }

    // 로컬 프로젝트 또는 원격 프로젝트 fallback: DB에서 조회
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

    // WebSocket으로 태스크 생성 알림
    emit('task:created', { task })

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

    // WebSocket으로 태스크 업데이트 알림
    emit('task:updated', { task })

    res.json({ success: true, data: { task } })
  } catch (error) {
    console.error('Error updating flow task:', error)
    res.status(500).json({ success: false, error: 'Failed to update flow task' })
  }
})

// ==================== OPENSPEC ARCHIVE ====================

// ==================== PYTHON AGENTS API PROXY ====================

// Health check for Python agents server
app.get('/api/agents/health', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3002/health')
    if (!response.ok) {
      return res.status(503).json({
        success: false,
        error: 'Python agents server unavailable',
        pythonStatus: 'offline',
      })
    }
    const data = await response.json()
    res.json({ success: true, data: { ...data, pythonStatus: 'online' } })
  } catch {
    res.json({
      success: true,
      data: {
        status: 'unavailable',
        pythonStatus: 'offline',
        message: 'Python agents server is not running. Start with: npm run py:server',
      },
    })
  }
})

// Proxy all /api/agents/* requests to Python server
app.use('/api/agents', async (req, res) => {
  try {
    // 0. Handle session list request (GET /sessions)
    const isSessionListRequest = req.path === '/sessions' && req.method === 'GET'
    if (isSessionListRequest) {
      const { getProcessManager } = await import('./cli-adapter/process-manager.js')
      try {
        const pm = getProcessManager()
        const sessions = pm.getAllSessions()
        return res.json(
          sessions.map((session) => ({
            session_id: session.id,
            change_id: session.changeId,
            status: session.status,
            created_at: session.startedAt,
            updated_at: session.endedAt || session.startedAt,
            project_path: session.projectPath,
            current_task: null,
            completed_tasks: 0,
            total_tasks: 0,
            error: session.error || null,
            conversation_history: session.conversationHistory || [],
          }))
        )
      } catch {
        // ProcessManager not initialized, return empty array
        return res.json([])
      }
    }

    // 0.5. Handle session delete request (DELETE /sessions/:id)
    const isSessionDeleteRequest = req.path.match(/^\/sessions\/[^/]+$/) && req.method === 'DELETE'
    if (isSessionDeleteRequest) {
      const sessionId = req.path.split('/')[2]
      const { getProcessManager } = await import('./cli-adapter/process-manager.js')
      try {
        const pm = getProcessManager()
        const deleted = pm.deleteSession(sessionId)
        if (deleted) {
          return res.json({ success: true })
        }
        return res.status(404).json({ success: false, error: 'Session not found' })
      } catch {
        return res.status(404).json({ success: false, error: 'Session not found' })
      }
    }

    // 1. Check for CLI mode request or Stream request for CLI session
    const isExecuteRequest = req.path === '/execute' && req.method === 'POST'
    const isStreamRequest = req.path.match(/\/sessions\/[^/]+\/stream/) && req.method === 'GET'

    // Check if it's a CLI session stream or input request
    // session input path example: /sessions/UUID/input
    const isInputRequest = req.path.match(/\/sessions\/[^/]+\/input/) && req.method === 'POST'
    // session logs path example: /sessions/UUID/logs
    const isLogsRequest = req.path.match(/\/sessions\/[^/]+\/logs/) && req.method === 'GET'
    // session status path example: /sessions/UUID (exact match, no trailing path)
    const isSessionStatusRequest = req.path.match(/^\/sessions\/[^/]+$/) && req.method === 'GET'

    let isCliSession = false
    let targetSessionId: string | undefined

    // Check if any session-related request is for a CLI session
    if (isStreamRequest || isInputRequest || isLogsRequest || isSessionStatusRequest) {
      targetSessionId = req.path.split('/')[2]

      const { getProcessManager } = await import('./cli-adapter/process-manager.js')
      try {
        const pm = getProcessManager()
        const session = pm.getSession(targetSessionId)

        if (session) {
          isCliSession = true
        }
      } catch {
        // ProcessManager not initialized, fall through to Python server
      }
    }

    // Handle CLI Session Status request
    if (isSessionStatusRequest && isCliSession && targetSessionId) {
      const { getProcessManager } = await import('./cli-adapter/process-manager.js')
      const pm = getProcessManager()
      const session = pm.getSession(targetSessionId)

      if (session) {
        return res.json({
          session_id: session.id,
          change_id: session.changeId,
          status: session.status,
          created_at: session.startedAt,
          updated_at: session.endedAt || session.startedAt,
          project_path: session.projectPath,
          current_task: null,
          completed_tasks: 0,
          total_tasks: 0,
          error: session.error || null,
          // Include conversation history for message persistence
          conversation_history: session.conversationHistory || [],
        })
      }
    }

    // 2. Handle CLI Execution
    // 2. Handle CLI Execution
    if (isExecuteRequest && req.body.use_cli === true) {
      console.log('[Proxy] Routing to CLI Adapter (Execute)')
      const { initProcessManager, getProcessManager } =
        await import('./cli-adapter/process-manager.js')
      const projectPath = req.body.project_path || process.cwd()

      let processManager
      try {
        processManager = getProcessManager(projectPath)
      } catch {
        processManager = initProcessManager(projectPath)
      }

      const result = await processManager.start({
        profileId: 'claude', // Default to claude
        changeId: req.body.change_id,
        projectPath,
        initialPrompt: req.body.initial_prompt,
      })

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error })
      }

      return res.json({
        session_id: result.sessionId,
        status: 'running',
        message: 'CLI Session started via Adapter',
        change_id: req.body.change_id || 'unknown',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_path: projectPath,
      })
    }

    // 3. Handle CLI Input
    if (isInputRequest && isCliSession && targetSessionId) {
      const { getProcessManager } = await import('./cli-adapter/process-manager.js')
      const processManager = getProcessManager()

      const result = await processManager.sendInput(targetSessionId, req.body.input || '')
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error })
      }
      return res.json({ success: true })
    }

    // 4. Handle CLI Stream
    if (isCliSession) {
      const sessionId = targetSessionId || req.path.split('/')[2]
      const { getProcessManager } = await import('./cli-adapter/process-manager.js')
      const processManager = getProcessManager()

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const sendEvent = (type: string, data: Record<string, unknown>) => {
        if (res.writableEnded || !res.writable) return
        try {
          res.write(`event: message\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
        } catch (e) {
          console.error('[SSE] Error sending event:', e)
        }
      }

      // Convert CLI output to Agent events
      const onOutput = (output: { sessionId: string; content: string; timestamp: string }) => {
        if (output.sessionId === sessionId) {
          // Map stdout to agent_response or task_complete based on content?
          // For now just stream raw output as agent_response
          sendEvent('agent_response', {
            content: output.content,
            timestamp: output.timestamp,
          })
        }
      }

      const onEnd = (session: { id: string }) => {
        if (session.id === sessionId) {
          sendEvent('session_end', { timestamp: new Date().toISOString() })
          if (!res.writableEnded) {
            res.end()
          }
          processManager.off('output', onOutput)
          processManager.off('session:end', onEnd)
        }
      }

      // 만약 이미 종료된 세션이라면?
      const session = processManager.getSession(sessionId)
      if (session && (session.status === 'completed' || session.status === 'failed')) {
        // 이미 종료된 세션의 로그를 한꺼번에 보내주거나 종료 처리
        onEnd(session)
        return
      }

      processManager.on('output', onOutput)
      processManager.on('session:end', onEnd)

      req.on('close', () => {
        processManager.off('output', onOutput)
        processManager.off('session:end', onEnd)
      })

      return
    }

    // 4. Fallback to Python Server (Normal Flow)
    const targetUrl = `http://localhost:3002${req.originalUrl}`

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body)
    }

    const response = await fetch(targetUrl, fetchOptions)

    // Handle SSE streams
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(decoder.decode(value))
        }
        res.end()
      }
      return
    }

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('Error proxying to Python agents server:', error)

    // Auto-fallback to CLI if Python server is down for execute requests?
    // For now, just return error with hint
    res.status(503).json({
      success: false,
      error: 'Failed to connect to Python agents server',
      hint: 'Start with: npm run py:server',
    })
  }
})

// ==================== OPENSPEC ARCHIVE ====================

// POST /api/flow/changes/:id/archive - Change를 아카이브로 이동
app.post('/api/flow/changes/:id/archive', async (req, res) => {
  try {
    const changeId = req.params.id
    const { skipSpecs, force } = req.body
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    // openspec archive 명령어 실행
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
      // execAsync throws on non-zero exit code
      const error = execError as { stdout?: string; stderr?: string; message?: string }
      stdout = error.stdout || ''
      stderr = error.stderr || ''

      // Check if it's a validation error
      if (stdout.includes('Validation failed') || stdout.includes('Validation errors')) {
        validationFailed = true
        // Parse validation errors from output
        const lines = stdout.split('\n')
        for (const line of lines) {
          if (line.includes('✗') || line.includes('⚠')) {
            validationErrors.push(line.trim())
          }
        }
      } else {
        // Other error, rethrow
        throw execError
      }
    }

    // If validation failed and not forced, return error to let user decide
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

    // Check if archive directory was actually created (file was moved)
    const archivePath = join(project.path, 'openspec', 'changes', 'archive', changeId)
    const originalPath = join(project.path, 'openspec', 'changes', changeId)

    let filesMoved = false
    try {
      await import('fs/promises').then((fs) => fs.access(archivePath))
      filesMoved = true
    } catch {
      // Archive directory doesn't exist, check if original still exists
      try {
        await import('fs/promises').then((fs) => fs.access(originalPath))
        filesMoved = false
      } catch {
        // Neither exists - something went wrong
        filesMoved = false
      }
    }

    // DB에서 Change 상태 업데이트 (파일 이동 여부와 관계없이)
    await initTaskDb()
    const sqlite = getSqlite()
    const now = Date.now()

    sqlite
      .prepare(
        `
      UPDATE changes SET status = 'archived', updated_at = ? WHERE id = ? AND project_id = ?
    `
      )
      .run(now, changeId, project.id)

    // WebSocket으로 아카이브 완료 알림
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

// POST /api/flow/changes/:id/fix-validation - 자동으로 validation 에러 수정
app.post('/api/flow/changes/:id/fix-validation', async (req, res) => {
  try {
    const changeId = req.params.id
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeDir = join(project.path, 'openspec', 'changes', changeId)
    const fs = await import('fs/promises')

    // Fix proposal.md - add "SHALL" to requirements that don't have it
    const proposalPath = join(changeDir, 'proposal.md')
    let proposalFixed = false
    try {
      let content = await fs.readFile(proposalPath, 'utf-8')
      // Find requirement lines without SHALL/MUST and add "SHALL"
      // Pattern: Lines starting with "- " in requirements section that don't have SHALL/MUST
      const lines = content.split('\n')
      const fixedLines = lines.map((line) => {
        // Check if it's a requirement-like line (starts with "- " and doesn't have SHALL/MUST)
        if (line.match(/^[-*]\s+/) && !line.match(/\b(SHALL|MUST)\b/i)) {
          // Check if it's in a requirements context (has keywords like "requirement", "feature", etc.)
          if (line.match(/^[-*]\s+\w/)) {
            // Insert "SHALL" after the bullet point
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

    // Fix spec files in specs/ subdirectory
    const specsDir = join(changeDir, 'specs')
    let specsFixed = 0
    try {
      const specEntries = await fs.readdir(specsDir, { withFileTypes: true })
      for (const entry of specEntries) {
        if (!entry.isDirectory()) continue
        const specPath = join(specsDir, entry.name, 'spec.md')
        try {
          let content = await fs.readFile(specPath, 'utf-8')
          // Find requirement headings and their content
          // Pattern: ### Requirement: ... followed by content
          const lines = content.split('\n')
          const fixedLines = lines.map((line, i) => {
            // If this is a requirement heading
            if (line.match(/^###\s+Requirement:/)) {
              // Check if the requirement text contains SHALL/MUST
              if (!line.match(/\b(SHALL|MUST)\b/i)) {
                // Insert "SHALL" into the requirement
                return line.replace(/(###\s+Requirement:\s*)(.+)/, (_, prefix, reqText) => {
                  // If the text is like "Feature Name", convert to "The system SHALL provide Feature Name"
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

// ==================== DIAGRAM API ====================

// GET /api/diagram/context - Get file tree and README for diagram generation
app.get('/api/diagram/context', async (req, res) => {
  try {
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const projectPath = (req.query.path as string) || project.path
    const maxDepth = parseInt(req.query.maxDepth as string) || 10

    const core = await getGitdiagramCore()
    const [fileTree, readme] = await Promise.all([
      core.generateFileTree(projectPath, { maxDepth }),
      core.readReadme(projectPath),
    ])

    res.json({
      success: true,
      data: {
        projectPath,
        fileTree,
        readme,
        fileTreeLines: fileTree.split('\n').length,
      },
    })
  } catch (error) {
    console.error('Error getting diagram context:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get diagram context',
    })
  }
})

// POST /api/diagram/generate - Generate diagram using LLM
app.post('/api/diagram/generate', async (req, res) => {
  try {
    const project = await getActiveProject()
    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { instructions } = req.body
    const projectPath = req.body.projectPath || project.path

    // Get gitdiagram-core functions
    const core = await getGitdiagramCore()

    // Check for API key - priority: Gemini > Claude > OpenAI (Gemini first as it's commonly available)
    let apiKey: string | undefined
    let provider: 'claude' | 'openai' | 'gemini'

    // Debug log for environment variables
    console.log('[Diagram] Available API keys:', {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      google: !!process.env.GOOGLE_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    })

    if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
      apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      provider = 'gemini'
    } else if (process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY
      provider = 'claude'
    } else if (process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY
      provider = 'openai'
    } else {
      // Return a generated diagram based on file structure analysis (no LLM)
      const [fileTree] = await Promise.all([core.generateFileTree(projectPath, { maxDepth: 8 })])
      const simpleDiagram = generateSimpleDiagram(fileTree, project.name)
      return res.json({
        success: true,
        data: {
          mermaidCode: simpleDiagram,
          projectPath,
          generated: 'simple', // Indicates no LLM was used
          message: 'Generated simple diagram (no LLM API key configured)',
        },
      })
    }

    // Use LLM to generate diagram
    console.log(`[Diagram] Using provider: ${provider}`)
    const adapter = core.createLLMAdapter(provider, { apiKey })

    const result = await core.generateDiagram(projectPath, {
      llm: adapter,
      instructions,
    })

    res.json({
      success: true,
      data: {
        mermaidCode: result.mermaidCode,
        projectPath,
        generated: 'llm',
        explanation: result.explanation,
      },
    })
  } catch (error) {
    console.error('Error generating diagram:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate diagram',
    })
  }
})

// Helper function to generate simple diagram from file tree (no LLM)
function generateSimpleDiagram(fileTree: string, projectName: string): string {
  const lines = fileTree.split('\n').filter((l) => l.trim())
  const dirs = new Set<string>()
  const files: string[] = []

  // Parse top-level directories and key files
  for (const line of lines) {
    const depth = (line.match(/^[│├└─\s]*/)?.[0] || '').length / 4
    const name = line.replace(/^[│├└─\s]+/, '').trim()

    if (depth === 0 && name && !name.startsWith('.')) {
      if (!name.includes('.')) {
        dirs.add(name)
      } else if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.json')) {
        files.push(name)
      }
    }
  }

  // Build diagram
  let diagram = `flowchart TD
    subgraph Project["${projectName}"]
`

  const nodeIds: string[] = []

  // Add directories
  for (const dir of dirs) {
    const nodeId = dir.replace(/[^a-zA-Z0-9]/g, '')
    nodeIds.push(nodeId)
    diagram += `        ${nodeId}[📁 ${dir}]\n`
  }

  // Add key files
  for (const file of files.slice(0, 5)) {
    const nodeId = file.replace(/[^a-zA-Z0-9]/g, '')
    nodeIds.push(nodeId)
    diagram += `        ${nodeId}[📄 ${file}]\n`
  }

  diagram += `    end\n`

  // Add some connections based on common patterns
  if (nodeIds.includes('src') && nodeIds.includes('server')) {
    diagram += `    src --> server\n`
  }
  if (nodeIds.includes('src') && nodeIds.includes('components')) {
    diagram += `    src --> components\n`
  }
  if (nodeIds.includes('server') && nodeIds.includes('api')) {
    diagram += `    server --> api\n`
  }

  // Add styles
  diagram += `
    style Project fill:#f5f5f5,stroke:#333
`

  return diagram
}

// POST /api/diagram/validate - Validate Mermaid syntax
app.post('/api/diagram/validate', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) {
      return res.status(400).json({ success: false, error: 'No code provided' })
    }

    const core = await getGitdiagramCore()
    const validation = core.validateMermaidSyntax(code)
    const clickEvents = core.extractClickEvents(code)

    res.json({
      success: true,
      data: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        clickEvents,
      },
    })
  } catch (error) {
    console.error('Error validating diagram:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate diagram',
    })
  }
})

// GET /api/diagram/change/:changeId - Get diagram context for an OpenSpec change
app.get('/api/diagram/change/:changeId', async (req, res) => {
  try {
    const { changeId } = req.params
    const project = await getActiveProject()

    if (!project) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const changeDir = join(project.path, 'openspec', 'changes', changeId)

    // Read change documents
    let proposal = ''
    let spec = ''
    let tasks = ''

    try {
      proposal = await readFile(join(changeDir, 'proposal.md'), 'utf-8')
    } catch {
      /* no proposal */
    }

    try {
      spec = await readFile(join(changeDir, 'spec.md'), 'utf-8')
    } catch {
      /* no spec */
    }

    try {
      tasks = await readFile(join(changeDir, 'tasks.md'), 'utf-8')
    } catch {
      /* no tasks */
    }

    // Extract affected files
    const affectedFiles: string[] = []
    const filePattern = /`([^`]+\.(ts|tsx|js|jsx|py|go|rs|java|md))`/g

    for (const content of [proposal, spec, tasks]) {
      let match
      while ((match = filePattern.exec(content)) !== null) {
        if (!affectedFiles.includes(match[1])) {
          affectedFiles.push(match[1])
        }
      }
    }

    res.json({
      success: true,
      data: {
        changeId,
        affectedFiles,
        hasProposal: !!proposal,
        hasSpec: !!spec,
        hasTasks: !!tasks,
      },
    })
  } catch (error) {
    console.error('Error getting change diagram context:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get change context',
    })
  }
})
