/**
 * Projects Router
 *
 * 프로젝트 관리 API 라우터
 */

import { Router } from 'express'
import { readdir, readFile, access } from 'fs/promises'
import type { Dirent } from 'fs'
import { join, basename } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import {
  loadConfig,
  addProject,
  removeProject,
  setActiveProject,
  getActiveProject,
  updateProjectPath,
  updateProjectName,
  reorderProjects,
} from '../config.js'
import { initDb } from '../tasks/index.js'
import { getSqlite } from '../tasks/db/client.js'
import { getGlobalMultiWatcher } from '../watcher.js'
import { syncChangeTasksForProject, syncRemoteChangeTasksForProject } from '../sync.js'
import { parseTasksFile } from '../parser.js'
import {
  getRemoteServerById,
  listDirectory,
} from '../remote/index.js'

const execAsync = promisify(exec)

export const projectsRouter = Router()

// POST /browse - Open native folder picker dialog
projectsRouter.post('/browse', async (_req, res) => {
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
    if (errorMessage.includes('-128') || errorMessage.includes('User canceled') || errorMessage.includes('취소')) {
      return res.json({ success: true, data: { path: null, cancelled: true } })
    }
    console.error('Error opening folder picker:', error)
    res.status(500).json({ success: false, error: 'Failed to open folder picker' })
  }
})

// GET / - List all registered projects
projectsRouter.get('/', async (_req, res) => {
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

// POST / - Add a new project
projectsRouter.post('/', async (req, res) => {
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

    // Multi-Watcher에 새 프로젝트 추가
    const multiWatcher = getGlobalMultiWatcher()
    if (multiWatcher) {
      multiWatcher.addProject(project.id, project.path)
    }

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error adding project:', error)
    res.status(500).json({ success: false, error: 'Failed to add project' })
  }
})

// PUT /reorder - Reorder projects
// NOTE: This must be defined BEFORE /:id routes to avoid :id matching "reorder"
projectsRouter.put('/reorder', async (req, res) => {
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

// DELETE /:id - Remove a project
projectsRouter.delete('/:id', async (req, res) => {
  try {
    const projectId = req.params.id

    // Multi-Watcher에서 프로젝트 제거
    const multiWatcher = getGlobalMultiWatcher()
    if (multiWatcher) {
      await multiWatcher.removeProject(projectId)
    }

    await removeProject(projectId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error removing project:', error)
    res.status(500).json({ success: false, error: 'Failed to remove project' })
  }
})

// PUT /:id/activate - Set active project
projectsRouter.put('/:id/activate', async (req, res) => {
  try {
    await setActiveProject(req.params.id)
    const project = await getActiveProject()

    // 프로젝트 활성화 시 OpenSpec 동기화 수행 (Git pull은 수동으로)
    if (project) {
      try {
        // 원격 프로젝트 여부 확인
        if (project.remote) {
          // 원격 프로젝트 동기화
          await syncRemoteProject(project)
        } else {
          // 로컬 프로젝트 동기화
          await syncLocalProject(project)
        }
      } catch (syncError) {
        console.error('Error auto-syncing project:', syncError)
        // sync 실패해도 활성화는 성공으로 처리
      }

      // Multi-Watcher에 프로젝트 추가 (로컬 프로젝트만, 이미 감시 중이면 스킵)
      if (!project.remote) {
        try {
          const multiWatcher = getGlobalMultiWatcher()
          if (multiWatcher && !multiWatcher.isWatching(project.id)) {
            multiWatcher.addProject(project.id, project.path)
          }
        } catch (watcherError) {
          console.warn(`[Watcher] Failed to add watcher for "${project.name}":`, watcherError)
          // watcher 실패해도 활성화는 성공으로 처리
        }
      }
    }

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error activating project:', error)
    res.status(500).json({ success: false, error: 'Failed to activate project' })
  }
})

// 로컬 프로젝트 동기화 헬퍼
async function syncLocalProject(project: { id: string; name: string; path: string }) {
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

  // 디렉토리만 필터링
  const changeEntries = entries.filter(
    (entry) => entry.isDirectory() && entry.name !== 'archive'
  )
  const activeChangeIds = changeEntries.map((e) => e.name)

  // 1단계: 모든 proposal.md 병렬 읽기
  const changeDataPromises = changeEntries.map(async (entry) => {
    const changeId = entry.name
    const changeDir = join(openspecDir, changeId)
    const specPath = `openspec/changes/${changeId}/proposal.md`
    let title = changeId

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

    return { changeId, title, specPath }
  })

  const changeDataList = await Promise.all(changeDataPromises)

  // 2단계: DB 업데이트 (SQLite는 순차 처리 필요)
  const upsertStmt = sqlite.prepare(`
    INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
    ON CONFLICT(id, project_id) DO UPDATE SET
      title = excluded.title,
      spec_path = excluded.spec_path,
      status = 'active',
      updated_at = excluded.updated_at
  `)

  for (const { changeId, title, specPath } of changeDataList) {
    upsertStmt.run(changeId, project.id, title, specPath, now, now)
  }

  // 파일시스템에 없는 Change는 archived로 변경 (archived_at도 설정)
  if (activeChangeIds.length > 0) {
    const placeholders = activeChangeIds.map(() => '?').join(',')
    sqlite.prepare(`
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active' AND id NOT IN (${placeholders})
    `).run(now, now, project.id, ...activeChangeIds)
  } else {
    sqlite.prepare(`
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active'
    `).run(now, now, project.id)
  }

  // 3단계: tasks.md 동기화 병렬 수행
  const syncResults = await Promise.allSettled(
    activeChangeIds.map((changeId) => syncChangeTasksForProject(changeId, project.path))
  )

  const tasksSynced = syncResults.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value.tasksCreated + result.value.tasksUpdated
    }
    return sum
  }, 0)

  console.log(`[Auto-sync] Local project "${project.name}" synced (${activeChangeIds.length} changes, ${tasksSynced} tasks)`)
}

// 원격 프로젝트 동기화 헬퍼
async function syncRemoteProject(project: { id: string; name: string; path: string; remote?: { type: string; serverId: string; host: string; user: string } }) {
  if (!project.remote) return

  const server = await getRemoteServerById(project.remote.serverId)
  if (!server) {
    console.error(`[Sync Remote] Server not found: ${project.remote.serverId}`)
    return
  }

  initDb(project.path)

  // 원격 서버에서 openspec/changes 디렉토리 조회
  const openspecDir = `${project.path}/openspec/changes`
  let listing
  try {
    listing = await listDirectory(server, openspecDir)
  } catch (err) {
    console.warn(`[Sync Remote] Cannot list ${openspecDir}:`, err)
    return
  }

  const sqlite = getSqlite()
  const now = Date.now()
  const activeChangeIds: string[] = []

  // 원격 파일 읽기 함수
  const { readRemoteFile } = await import('../remote/ssh-manager.js')

  for (const entry of listing.entries) {
    if (entry.type !== 'directory' || entry.name === 'archive') continue

    const changeId = entry.name
    activeChangeIds.push(changeId)

    // Read proposal.md for title via SSH
    let title = changeId
    const specPath = `openspec/changes/${changeId}/proposal.md`
    try {
      const proposalPath = `${openspecDir}/${changeId}/proposal.md`
      const proposalContent = await readRemoteFile(server, proposalPath)
      const titleMatch = proposalContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }
    } catch {
      // proposal.md not found
    }

    // Check if change exists for THIS project (project_id 조건 필수)
    const existing = sqlite.prepare('SELECT id FROM changes WHERE id = ? AND project_id = ?').get(changeId, project.id)

    if (existing) {
      sqlite.prepare(`
        UPDATE changes SET title = ?, spec_path = ?, status = 'active', updated_at = ? WHERE id = ? AND project_id = ?
      `).run(title, specPath, now, changeId, project.id)
    } else {
      sqlite.prepare(`
        INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
      `).run(changeId, project.id, title, specPath, now, now)
    }
  }

  // 원격에 없는 Change는 archived로 변경 (archived_at도 설정)
  if (activeChangeIds.length > 0) {
    const placeholders = activeChangeIds.map(() => '?').join(',')
    sqlite.prepare(`
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active' AND id NOT IN (${placeholders})
    `).run(now, now, project.id, ...activeChangeIds)
  } else {
    sqlite.prepare(`
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active'
    `).run(now, now, project.id)
  }

  // tasks.md 동기화 - SSH를 통해 원격 파일 읽기
  let tasksSynced = 0
  for (const changeId of activeChangeIds) {
    try {
      const result = await syncRemoteChangeTasksForProject(changeId, project.path, server, project.id)
      tasksSynced += result.tasksCreated + result.tasksUpdated
    } catch {
      // tasks.md가 없거나 파싱 실패 시 무시
    }
  }

  console.log(`[Auto-sync] Remote project "${project.name}" synced via SSH (${activeChangeIds.length} changes, ${tasksSynced} tasks)`)
}

// PUT /:id/path - Update project path
projectsRouter.put('/:id/path', async (req, res) => {
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

    // Multi-Watcher 업데이트 (기존 watcher 제거 후 새 경로로 추가)
    const multiWatcher = getGlobalMultiWatcher()
    if (multiWatcher) {
      await multiWatcher.removeProject(projectId)
      multiWatcher.addProject(projectId, newPath)
    }

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error updating project path:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update project path',
    })
  }
})

// GET /:id/changes - Get changes for a project
projectsRouter.get('/:id/changes', async (req, res) => {
  try {
    const projectId = req.params.id
    const sqlite = getSqlite()

    const changes = sqlite.prepare(`
      SELECT id, title, status, current_stage, progress, spec_path, created_at, updated_at
      FROM changes
      WHERE project_id = ?
      ORDER BY updated_at DESC
    `).all(projectId)

    res.json({ success: true, changes })
  } catch (error) {
    console.error('Error fetching project changes:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch changes',
    })
  }
})

// PUT /:id/name - Update project name
projectsRouter.put('/:id/name', async (req, res) => {
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

// Helper to get changes for a specific project path
async function getChangesForProject(projectPath: string) {
  const openspecDir = join(projectPath, 'openspec', 'changes')
  const changes = []

  // Get archived change IDs from DB to filter them out
  const archivedChangeIds = new Set<string>()
  try {
    const projectId = projectPath.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const sqlite = getSqlite()
    const archivedRows = sqlite.prepare(`
      SELECT id FROM changes WHERE project_id = ? AND status = 'archived'
    `).all(projectId) as { id: string }[]
    for (const row of archivedRows) {
      archivedChangeIds.add(row.id)
    }
  } catch {
    // DB not initialized yet, proceed without filtering
  }

  let entries
  try {
    entries = await readdir(openspecDir, { withFileTypes: true })
  } catch {
    return []
  }

  // Filter valid entries first
  const validEntries = entries.filter(
    (entry) => entry.isDirectory() && entry.name !== 'archive' && !archivedChangeIds.has(entry.name)
  )

  // Process all changes in parallel for better performance
  const changePromises = validEntries.map(async (entry) => {
    const changeId = entry.name
    const changeDir = join(openspecDir, changeId)

    // Read proposal and tasks files in parallel
    const [proposalResult, tasksResult, gitResult] = await Promise.allSettled([
      // Read proposal.md
      readFile(join(changeDir, 'proposal.md'), 'utf-8'),
      // Read tasks.md
      readFile(join(changeDir, 'tasks.md'), 'utf-8'),
      // Get git log
      execAsync(`git log -1 --format="%aI" -- "openspec/changes/${changeId}"`, { cwd: projectPath }),
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

    // Get updatedAt
    let updatedAt: string | null = null
    if (gitResult.status === 'fulfilled' && gitResult.value.stdout.trim()) {
      updatedAt = gitResult.value.stdout.trim()
    } else {
      try {
        const stat = await import('fs/promises').then((fs) => fs.stat(join(changeDir, 'tasks.md')))
        updatedAt = stat.mtime.toISOString()
      } catch {
        updatedAt = new Date().toISOString()
      }
    }

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    return { id: changeId, title, progress, totalTasks, completedTasks, relatedSpecs, updatedAt }
  })

  const results = await Promise.all(changePromises)
  changes.push(...results)

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

// Helper to get changes for a remote project via SSH
async function getChangesForRemoteProject(projectPath: string, serverId: string, projectId?: string) {
  const server = await getRemoteServerById(serverId)
  if (!server) return []

  const { readRemoteFile } = await import('../remote/ssh-manager.js')
  const openspecDir = `${projectPath}/openspec/changes`
  const changes = []

  // Get archived change IDs from DB to filter them out
  const archivedChangeIds = new Set<string>()
  try {
    // projectId가 전달되면 사용, 아니면 경로에서 생성
    const dbProjectId = projectId || projectPath.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const sqlite = getSqlite()
    const archivedRows = sqlite.prepare(`
      SELECT id FROM changes WHERE project_id = ? AND status = 'archived'
    `).all(dbProjectId) as { id: string }[]
    for (const row of archivedRows) {
      archivedChangeIds.add(row.id)
    }
  } catch {
    // DB not initialized yet
  }

  let listing
  try {
    listing = await listDirectory(server, openspecDir)
  } catch {
    return []
  }

  for (const entry of listing.entries) {
    if (entry.type !== 'directory' || entry.name === 'archive') continue

    const changeId = entry.name
    if (archivedChangeIds.has(changeId)) continue

    let title = changeId
    let relatedSpecs: string[] = []
    try {
      const proposalPath = `${openspecDir}/${changeId}/proposal.md`
      const proposalContent = await readRemoteFile(server, proposalPath)
      const titleMatch = proposalContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }
      relatedSpecs = parseAffectedSpecs(proposalContent)
    } catch {
      // proposal.md not found
    }

    let totalTasks = 0
    let completedTasks = 0
    try {
      const tasksPath = `${openspecDir}/${changeId}/tasks.md`
      const tasksContent = await readRemoteFile(server, tasksPath)
      const parsed = parseTasksFile(changeId, tasksContent)
      for (const group of parsed.groups) {
        totalTasks += group.tasks.length
        completedTasks += group.tasks.filter((t) => t.completed).length
      }
    } catch {
      // tasks.md not found
    }

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    const updatedAt = new Date().toISOString() // Remote doesn't have git log easily

    changes.push({ id: changeId, title, progress, totalTasks, completedTasks, relatedSpecs, updatedAt })
  }

  return changes
}

// Helper to get specs for a remote project via SSH
async function getSpecsForRemoteProject(projectPath: string, serverId: string) {
  const server = await getRemoteServerById(serverId)
  if (!server) return []

  const { readRemoteFile } = await import('../remote/ssh-manager.js')
  const specsDir = `${projectPath}/openspec/specs`
  const specs = []

  let listing
  try {
    listing = await listDirectory(server, specsDir)
  } catch {
    return []
  }

  for (const entry of listing.entries) {
    if (entry.type !== 'directory') continue

    const specId = entry.name
    let title = specId
    let requirementsCount = 0

    try {
      const specPath = `${specsDir}/${specId}/spec.md`
      const specContent = await readRemoteFile(server, specPath)
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

// GET /all-data - Get all projects with their changes and specs
projectsRouter.get('/all-data', async (_req, res) => {
  try {
    const config = await loadConfig()
    const projectsData = []

    for (const project of config.projects) {
      let changes, specs

      if (project.remote) {
        // 원격 프로젝트: SSH를 통해 조회 (project.id 전달하여 정확한 archived 필터링)
        changes = await getChangesForRemoteProject(project.path, project.remote.serverId, project.id)
        specs = await getSpecsForRemoteProject(project.path, project.remote.serverId)
      } else {
        // 로컬 프로젝트: 파일시스템에서 조회
        changes = await getChangesForProject(project.path)
        specs = await getSpecsForProject(project.path)
      }

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
