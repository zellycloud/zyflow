/**
 * LEANN Index Management API
 *
 * LEANN 인덱스 상태 조회 및 관리
 * - GET /api/leann/indexes - 모든 인덱스 상태 조회
 * - POST /api/leann/index - 프로젝트 인덱싱 시작
 */

import { Router } from 'express'
import { spawn } from 'child_process'
import { access } from 'fs/promises'
import { loadConfig } from '../config.js'

const router = Router()

interface LeannIndex {
  name: string
  size: string
  path: string
}

interface ProjectIndexStatus {
  projectId: string
  projectName: string
  projectPath: string
  indexed: boolean
  indexSize?: string
  pathExists?: boolean
}

/**
 * Parse leann list output
 * Example output:
 * 📚 LEANN Indexes
 * ==================================================
 *
 * 🏠 Current Project
 *    /Users/hansoo./ZELLYY/zyflow
 *    ─────────────────────────────────────────────
 *    1. 📁 zyflow ✅
 *       📦 Size: 1.9 MB
 */
function parseLeannListOutput(output: string): LeannIndex[] {
  const indexes: LeannIndex[] = []
  const lines = output.split('\n')

  let currentPath = ''
  let currentName = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect project path lines (indented paths starting with /)
    const pathMatch = line.match(/^\s+(\/.+)$/)
    if (pathMatch) {
      currentPath = pathMatch[1].trim()
      continue
    }

    // Detect index name lines:
    // - Current project: "1. 📁 zyflow ✅"
    // - Other projects: "• 📁 zellyy-money ✅"
    const nameMatch = line.match(/^\s+(?:\d+\.|•)\s+📁\s+(\S+)/)
    if (nameMatch) {
      currentName = nameMatch[1]
      continue
    }

    // Detect size lines:
    // - Current project: "📦 Size: 1.9 MB"
    // - Other projects: "📦 0.8 MB"
    const sizeMatch = line.match(/📦\s+(?:Size:\s+)?(.+)/)
    if (sizeMatch && currentName) {
      indexes.push({
        name: currentName,
        size: sizeMatch[1].trim(),
        path: currentPath,
      })
      currentName = ''
    }
  }

  return indexes
}

/**
 * Run leann list command
 */
async function runLeannList(): Promise<LeannIndex[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('leann', ['list'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        // Check if LEANN is not installed
        if (stderr.includes('not found') || stderr.includes('command not found')) {
          resolve([])
          return
        }
        reject(new Error(stderr || `leann list failed with code ${code}`))
        return
      }

      const indexes = parseLeannListOutput(stdout)
      resolve(indexes)
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // LEANN not installed
        resolve([])
      } else {
        reject(err)
      }
    })
  })
}

/**
 * Run leann build command for a project
 * Uses bash with shopt -s nullglob to handle missing glob patterns gracefully
 * Supports both regular projects and monorepo structures
 */
async function runLeannBuild(indexName: string, projectPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use bash with nullglob to avoid errors when patterns don't match
    // This allows glob patterns that don't match any files to expand to nothing
    // Supports both flat projects (src/) and monorepos (apps/*/src/, packages/*/src/)
    const bashScript = `
      shopt -s nullglob globstar
      docs_args=""

      # Documentation files
      for f in "${projectPath}"/docs/**/*.md; do
        docs_args="$docs_args --docs \\"$f\\""
      done

      # README files (root and subdirs)
      for f in "${projectPath}"/**/README.md; do
        docs_args="$docs_args --docs \\"$f\\""
      done

      # OpenSpec files
      for f in "${projectPath}"/openspec/**/*.md; do
        docs_args="$docs_args --docs \\"$f\\""
      done

      # TypeScript files - flat structure
      for f in "${projectPath}"/src/**/*.ts; do
        docs_args="$docs_args --docs \\"$f\\""
      done
      for f in "${projectPath}"/src/**/*.tsx; do
        docs_args="$docs_args --docs \\"$f\\""
      done

      # TypeScript files - monorepo structure (apps/*, packages/*)
      for f in "${projectPath}"/apps/*/src/**/*.ts; do
        docs_args="$docs_args --docs \\"$f\\""
      done
      for f in "${projectPath}"/apps/*/src/**/*.tsx; do
        docs_args="$docs_args --docs \\"$f\\""
      done
      for f in "${projectPath}"/packages/*/src/**/*.ts; do
        docs_args="$docs_args --docs \\"$f\\""
      done
      for f in "${projectPath}"/packages/*/src/**/*.tsx; do
        docs_args="$docs_args --docs \\"$f\\""
      done

      if [ -z "$docs_args" ]; then
        echo "No files found to index" >&2
        exit 1
      fi

      eval "leann build ${indexName} $docs_args"
    `

    const proc = spawn('bash', ['-c', bashScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectPath,
    })

    let stderr = ''
    let stdout = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr || stdout || `leann build failed with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * GET /api/leann/indexes
 * List all LEANN indexes with their status
 */
router.get('/indexes', async (_req, res) => {
  try {
    const [indexes, config] = await Promise.all([
      runLeannList(),
      loadConfig(),
    ])

    // Match indexes to projects (filter out remote projects)
    const localProjects = config.projects.filter((p) => !p.remote)

    const projectStatus: ProjectIndexStatus[] = await Promise.all(
      localProjects.map(async (project) => {
        // Try to find matching index by name (lowercase, hyphens for spaces)
        const indexName = project.name.toLowerCase().replace(/\s+/g, '-')
        const index = indexes.find((i) =>
          i.name.toLowerCase() === indexName ||
          i.path === project.path
        )

        // Check if path exists locally
        let pathExists = false
        try {
          await access(project.path)
          pathExists = true
        } catch {
          pathExists = false
        }

        return {
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          indexed: !!index,
          indexSize: index?.size,
          pathExists,
        }
      })
    )

    res.json({
      success: true,
      data: projectStatus,
      leannInstalled: true,
    })
  } catch (error) {
    console.error('[LEANN] Get indexes error:', error)

    // Check if LEANN is not installed
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return res.json({
        success: true,
        data: [],
        leannInstalled: false,
        warning: 'LEANN is not installed. Run: uv tool install leann-core --with leann',
      })
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get index status',
    })
  }
})

/**
 * POST /api/leann/index
 * Trigger indexing for a project
 */
router.post('/index', async (req, res) => {
  const { projectPath, projectName } = req.body as {
    projectPath?: string
    projectName?: string
  }

  if (!projectPath || !projectName) {
    return res.status(400).json({
      success: false,
      error: 'projectPath and projectName are required',
    })
  }

  try {
    // Generate index name from project name
    const indexName = projectName.toLowerCase().replace(/\s+/g, '-')

    // Start indexing (this may take a while)
    await runLeannBuild(indexName, projectPath)

    res.json({
      success: true,
      message: `Indexing completed for ${projectName}`,
      indexName,
    })
  } catch (error) {
    console.error('[LEANN] Index error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start indexing',
    })
  }
})

export { router as leannRouter }
