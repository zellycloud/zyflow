/**
 * Projects Router
 *
 * 프로젝트 관리 API 라우터
 */

import { Router } from 'express'
import { readdir, readFile, access } from 'fs/promises'
import type { Dirent } from 'fs'
import { join, basename } from 'path'
import { syncChangeTasksForProject, syncRemoteChangeTasksForProject } from '../sync-tasks.js'
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
import { parseTasksFile } from '../parser.js'
import { startTasksWatcher, stopTasksWatcher } from '../watcher.js'
import { startRemoteWatcher, stopRemoteWatcher } from '../remote-watcher.js'

// Remote plugin is optional - only load if installed
let remotePlugin: {
  getRemoteServerById: (id: string) => Promise<unknown>
  listDirectory: (server: unknown, path: string) => Promise<{ entries: Array<{ type: string; name: string; modifiedAt?: string }> }>
  executeCommand: (server: unknown, cmd: string, opts?: { cwd?: string }) => Promise<{ stdout: string }>
  readRemoteFile: (server: unknown, path: string) => Promise<string>
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

    const name = basename(projectPath)
    const project = await addProject(name, projectPath)

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
    await removeProject(projectId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error removing project:', error)
    res.status(500).json({ success: false, error: 'Failed to remove project' })
  }
})

// PUT /:id/activate - Set active project
projectsRouter.put('/:id/activate', async (req, res) => {
  console.log('[Activate-Optimized] Handler called for project:', req.params.id)
  try {
    await setActiveProject(req.params.id)
    const project = await getActiveProject()
    console.log('[Activate-Optimized] Responding immediately, sync will run in background')

    // 백그라운드에서 동기화 실행 (Fire-and-forget) - 사용자 응답 대기 시간 제거
    if (project) {
      (async () => {
        try {
          if (project.remote) {
            await syncRemoteProjectChanges(project)
          } else {
            await syncLocalProjectChanges(project)
          }
        } catch (syncError) {
          console.error('Error syncing project changes in background:', syncError)
        }
      })()
    }

    res.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Error activating project:', error)
    res.status(500).json({ success: false, error: 'Failed to activate project' })
  }
})

async function syncLocalProjectChanges(project: { id: string; name: string; path: string }) {
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

  const changeEntries = entries.filter((entry) => entry.isDirectory() && entry.name !== 'archive')
  const activeChangeIds = changeEntries.map((e) => e.name)

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

  // Tasks 동기화 (병렬)
  await Promise.all(changeDataList.map(({ changeId }) => 
    syncChangeTasksForProject(changeId, project.path, project.id).catch(err => console.error(`Failed to sync task ${changeId}:`, err))
  ))

  if (activeChangeIds.length > 0) {
    const placeholders = activeChangeIds.map(() => '?').join(',')
    sqlite
      .prepare(
        `
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active' AND id NOT IN (${placeholders})
    `
      )
      .run(now, now, project.id, ...activeChangeIds)
  } else {
    sqlite
      .prepare(
        `
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active'
    `
      )
      .run(now, now, project.id)
  }

  console.log(`[Project] Activated local "${project.name}" (${activeChangeIds.length} changes)`)

  // Stop any remote watcher and start local watcher
  stopRemoteWatcher(project.id)
  startTasksWatcher(project.path, project.id)
}

async function syncRemoteProjectChanges(project: {
  id: string
  name: string
  path: string
  remote?: { type: string; serverId: string; host: string; user: string }
}) {
  if (!project.remote) return

  const plugin = await getRemotePlugin()
  if (!plugin) {
    console.warn('[Sync Remote] Remote plugin not installed, skipping remote sync')
    return
  }

  const server = await plugin.getRemoteServerById(project.remote.serverId)
  if (!server) {
    console.error(`[Sync Remote] Server not found: ${project.remote.serverId}`)
    return
  }

  initDb(project.path)

  const openspecDir = `${project.path}/openspec/changes`
  let listing
  try {
    listing = await plugin.listDirectory(server, openspecDir)
  } catch (err) {
    console.warn(`[Sync Remote] Cannot list ${openspecDir}:`, err)
    return
  }

  const sqlite = getSqlite()
  const now = Date.now()
  const activeChangeIds: string[] = []

  const { readRemoteFile, executeCommand } = plugin

  // DB에서 현재 저장된 상태 조회 (Incremental Sync를 위해)
  const existingChanges = sqlite
    .prepare('SELECT id, updated_at FROM changes WHERE project_id = ?')
    .all(project.id) as { id: string; updated_at: number }[]
  
  const existingMap = new Map(existingChanges.map(c => [c.id, c.updated_at]))
  const fileMtimes = new Map<string, number>()

  // 원격 파일 변경 시간 일괄 조회 (최적화)
  // Linux start -c "%Y", macOS/BSD stat -f "%m" 호환성 이슈가 있으므로 
  // 가장 호환성 높은 perl이나 python, 혹은 ls --full-time 등을 고려해야 하나
  // 일단 Linux 가정 stat -c "%Y" 시도 후 실패 시 Full Scan
  try {
     // openspecDir is absolute path usually.
     // Find all proposal.md files and print "dirName/proposal.md mtimeSeconds"
     // Note: We need the changeId (parent dir name).
     // Output format: path mtime
     const cmd = `find "${openspecDir}" -maxdepth 2 -name "proposal.md" -exec stat -c "%n %Y" {} + 2>/dev/null`
     const { stdout } = await executeCommand(server, cmd)
     if (stdout) {
       for (const line of stdout.split('\n')) {
          const parts = line.trim().split(' ')
          if (parts.length >= 2) {
             const mtime = parseInt(parts.pop() || '0', 10) * 1000 // ms 단위로 변환
             const path = parts.join(' ') // path may contain spaces
             // Extract changeId from path: .../changes/<changeId>/proposal.md
             const match = path.match(/changes\/([^/]+)\/proposal\.md$/)
             if (match) {
               fileMtimes.set(match[1], mtime)
             }
          }
       }
     }
  } catch (e) {
     console.warn('[Sync Remote] Bulk stat failed, falling back to full sync', e)
  }

  // 병렬 처리로 변경
  const changePromises = listing.entries.map(async (entry) => {
    if (entry.type !== 'directory' && entry.type !== 'd' && entry.type !== 'Directory') return null
    if (entry.name === 'archive') return null

    const changeId = entry.name
    activeChangeIds.push(changeId)
    
    // Tasks 동기화는 원격 프로젝트에서 너무 느리므로 비활성화
    // 원격 프로젝트는 Watcher가 없으므로 Tasks는 수동 새로고침 또는 all-data API를 통해 조회
    // await syncRemoteChangeTasksForProject(changeId, project.path, server, project.id).catch(e => console.error(`Remote task sync failed for ${changeId}`, e))

    // Incremental Sync Check
    const lastModified = fileMtimes.get(changeId)
    const storedUpdated = existingMap.get(changeId)
    
    // DB에 있고, 원격 파일 시간이 확인되었으며, DB 시간보다 이전이거나 같으면 스킵
    // 단, storedUpdated가 null이 아니고 lastModified가 존재할 때만
    let skipRead = false
    if (storedUpdated && lastModified && lastModified <= storedUpdated) {
       skipRead = true
    }

    let title = changeId
    const specPath = `openspec/changes/${changeId}/proposal.md`
    
    if (skipRead) {
       // 내용 변경 없음 - DB의 기존 title 유지 (DB 쿼리 필요하지만 위에서 이미 가져옴 - title은 안가져왔네..)
       // title 업데이트를 건너뛰려면 upsert 쿼리를 수정하거나, 
       // 여기서 그냥 'SAME' 마커를 리턴하고 DB 업데이트 로직에서 처리
       return { changeId, title: null, specPath, status: 'skipped' }
    }

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

    return { changeId, title, specPath, status: 'updated' }
  })

  // 모든 변경사항 처리 대기 (병렬)
  const results = await Promise.all(changePromises)
  
  // DB 트랜잭션 (순차 처리)
  const upsertStmt = sqlite.prepare(`
    INSERT INTO changes (id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', 'spec', 0, ?, ?)
    ON CONFLICT(id, project_id) DO UPDATE SET
      title = excluded.title,
      spec_path = excluded.spec_path,
      status = 'active',
      updated_at = excluded.updated_at
  `)

  // 유효한 결과만 DB 반영
  for (const item of results) {
     if (!item) continue
     
     if (item.status === 'skipped') {
       // 변경 없음 -> UpdatedAt만 갱신하거나, 그냥 둠 (Active 상태 유지를 위해 status='active' 업데이트 필요할 수 있음)
       // 여기서는 activeChangeIds에 포함되어 있으므로 나중에 Archive 처리되지 않음.
       // 단, 명시적으로 updated_at을 갱신하지 않으면 '최신 동기화' 시점을 알 수 없으므로
       // 필요하다면 status='active'만 업데이트하는 쿼리 실행
       // 성능을 위해 생략 가능하나, 안전을 위해 status만 active로 재설정
       sqlite.prepare("UPDATE changes SET status = 'active' WHERE id = ? AND project_id = ?").run(item.changeId, project.id)
     } else {
       upsertStmt.run(item.changeId, project.id, item.title, item.specPath, now, now)
     }
  }
  
  // Re-collect active IDs from successful results ensuring no duplicates or nulls
  activeChangeIds.length = 0 // Clear
  results.forEach(r => { if(r) activeChangeIds.push(r.changeId) })

  if (activeChangeIds.length > 0) {
    const placeholders = activeChangeIds.map(() => '?').join(',')
    sqlite
      .prepare(
        `
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active' AND id NOT IN (${placeholders})
    `
      )
      .run(now, now, project.id, ...activeChangeIds)
  } else {
    sqlite
      .prepare(
        `
      UPDATE changes SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND status = 'active'
    `
      )
      .run(now, now, project.id)
  }

  console.log(
    `[Project] Activated remote "${project.name}" via SSH (${activeChangeIds.length} changes)`
  )

  // Stop local watcher and start remote watcher for task file changes
  stopTasksWatcher()
  startRemoteWatcher(project, project.remote.serverId)
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
    const archivedRows = sqlite
      .prepare(
        `
      SELECT id FROM changes WHERE project_id = ? AND status = 'archived'
    `
      )
      .all(projectId) as { id: string }[]
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
      execAsync(`git log -1 --format="%aI" -- "openspec/changes/${changeId}"`, {
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
async function getChangesForRemoteProject(
  projectPath: string,
  serverId: string,
  projectId?: string
) {
  const plugin = await getRemotePlugin()
  if (!plugin) return []

  const server = await plugin.getRemoteServerById(serverId)
  if (!server) return []

  const { readRemoteFile, listDirectory, executeCommand } = plugin
  const openspecDir = `${projectPath}/openspec/changes`

  // Get archived change IDs from DB to filter them out
  const archivedChangeIds = new Set<string>()
  try {
    // projectId가 전달되면 사용, 아니면 경로에서 생성
    const dbProjectId = projectId || projectPath.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const sqlite = getSqlite()
    const archivedRows = sqlite
      .prepare(
        `
      SELECT id FROM changes WHERE project_id = ? AND status = 'archived'
    `
      )
      .all(dbProjectId) as { id: string }[]
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

  // 디버깅 로그 추가
  console.log(`[Remote] Listing for ${openspecDir}:`, listing.entries.map(e => ({ name: e.name, type: e.type })))

  // 디렉토리만 필터링 (archive 제외) - 타입 체크 완화
  const validEntries = listing.entries.filter(
    (entry) =>
      (entry.type === 'directory' || entry.type === 'd' || entry.type === 'Directory') && 
      entry.name !== 'archive' && 
      !archivedChangeIds.has(entry.name)
  )

  // 병렬로 각 change 처리
  const changes = await Promise.all(
    validEntries.map(async (entry) => {
      const changeId = entry.name
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

      return { id: changeId, title, progress, totalTasks, completedTasks, relatedSpecs, updatedAt }
    })
  )

  return changes
}

// Helper to get specs for a remote project via SSH
async function getSpecsForRemoteProject(projectPath: string, serverId: string) {
  const plugin = await getRemotePlugin()
  if (!plugin) return []

  const server = await plugin.getRemoteServerById(serverId)
  if (!server) return []

  const { readRemoteFile, listDirectory } = plugin
  const specsDir = `${projectPath}/openspec/specs`
  const specs = []

  let listing
  try {
    listing = await listDirectory(server, specsDir)
  } catch {
    return []
  }

  for (const entry of listing.entries) {
    if (entry.type !== 'directory' && entry.type !== 'd' && entry.type !== 'Directory') continue

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

// 원격 프로젝트 데이터 캐시 (30초 TTL)
const remoteDataCache = new Map<string, { data: { changes: unknown[], specs: unknown[] }, timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds

// GET /all-data - Get all projects with their changes and specs
projectsRouter.get('/all-data', async (_req, res) => {
  try {
    const config = await loadConfig()

    const projectsData = await Promise.all(
      config.projects.map(async (project) => {
        let changes: unknown[] = []
        let specs: unknown[] = []

        try {
          if (project.remote) {
            // 원격 프로젝트: 캐시 확인 후 SSH 조회
            const cached = remoteDataCache.get(project.id)
            const now = Date.now()
            
            if (cached && (now - cached.timestamp) < CACHE_TTL) {
              // 캐시 유효 - 캐시된 데이터 사용
              changes = cached.data.changes
              specs = cached.data.specs
            } else {
              // 캐시 만료 또는 없음 - SSH로 조회
              const [remoteChanges, remoteSpecs] = await Promise.all([
                getChangesForRemoteProject(project.path, project.remote.serverId, project.id),
                getSpecsForRemoteProject(project.path, project.remote.serverId)
              ])
              changes = remoteChanges
              specs = remoteSpecs
              
              // 캐시 업데이트
              remoteDataCache.set(project.id, {
                data: { changes, specs },
                timestamp: now
              })
            }
          } else {
            // 로컬 프로젝트: 파일시스템에서 조회
            const [localChanges, localSpecs] = await Promise.all([
               getChangesForProject(project.path),
               getSpecsForProject(project.path)
            ])
            changes = localChanges
            specs = localSpecs
          }
        } catch (err) {
          console.error(`Error loading data for project ${project.name}:`, err)
        }

        return {
          ...project,
          changes,
          specs,
        }
      })
    )

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
