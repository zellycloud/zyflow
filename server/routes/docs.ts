import { Router } from 'express'
import { readdir, readFile, access, stat, writeFile } from 'fs/promises'
import { join, relative, basename, extname } from 'path'
import { constants } from 'fs'

const router = Router()

interface DocItem {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: DocItem[]
}

interface DocContent {
  id: string
  name: string
  path: string
  content: string
  lastModified: string
}

/**
 * 재귀적으로 마크다운 파일 목록을 가져오기 (병렬 처리 최적화)
 */
async function scanDocsDirectory(
  basePath: string,
  currentPath: string,
  projectPath: string
): Promise<DocItem[]> {
  try {
    const entries = await readdir(currentPath, { withFileTypes: true })
    
    // 병렬 처리를 위해 Promise.all 사용
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(currentPath, entry.name)
        const relativePath = relative(projectPath, fullPath)

        if (entry.isDirectory()) {
          // 숨김 폴더나 node_modules, 빌드 결과물 등 제외
          const excludes = ['node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.git']
          if (entry.name.startsWith('.') || excludes.includes(entry.name)) {
            return null
          }

          const children = await scanDocsDirectory(basePath, fullPath, projectPath)
          if (children.length > 0) {
            return {
              id: relativePath.replace(/\//g, '-'),
              name: entry.name,
              path: relativePath,
              type: 'folder' as 'folder', // 타입 명시
              children,
            }
          }
        } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
          return {
            id: relativePath.replace(/\//g, '-').replace('.md', ''),
            name: entry.name.replace('.md', ''),
            path: relativePath,
            type: 'file' as 'file', // 타입 명시
          }
        }
        return null
      })
    )

    // null 제외하고 정렬 (타입 단언 사용)
    const items = results.filter((item) => item !== null) as DocItem[]

    // 폴더 먼저, 그 다음 파일 (알파벳 순)
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return items
  } catch {
    // 디렉토리 접근 실패 시 빈 배열 반환
    return []
  }
}

/**
 * 프로젝트의 문서 목록 조회
 * GET /api/docs?projectPath=/path/to/project
 */
router.get('/', async (req, res) => {
  try {
    const { projectPath } = req.query as { projectPath?: string }

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({ error: 'projectPath is required' })
    }

    // 1. 루트의 README.md, CHANGELOG.md 등
    const rootDocs: DocItem[] = []
    const rootFiles = [
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'LICENSE.md',
      'AGENTS.md',
      'CLAUDE.md',
    ]

    for (const fileName of rootFiles) {
      const filePath = join(projectPath, fileName)
      try {
        await access(filePath, constants.R_OK)
        rootDocs.push({
          id: fileName.replace('.md', '').toLowerCase(),
          name: fileName.replace('.md', ''),
          path: fileName,
          type: 'file',
        })
      } catch {
        // 파일이 없으면 건너뜀
      }
    }

    // 2. /docs 폴더 및 /openspec 폴더 스캔
    const docsPath = join(projectPath, 'docs')
    const openspecPath = join(projectPath, 'openspec')
    
    let docsFolderItems: DocItem[] = []
    let openspecFolderItems: DocItem[] = []

    try {
      await access(docsPath, constants.R_OK)
      docsFolderItems = await scanDocsDirectory(docsPath, docsPath, projectPath)
    } catch {
      // docs 폴더가 없으면 빈 배열
    }

    try {
      await access(openspecPath, constants.R_OK)
      openspecFolderItems = await scanDocsDirectory(openspecPath, openspecPath, projectPath)
    } catch {
      // openspec 폴더가 없으면 빈 배열
    }

    const result: DocItem[] = []

    // 루트 문서들 추가
    if (rootDocs.length > 0) {
      result.push(...rootDocs)
    }

    // docs 폴더 내용 추가
    if (docsFolderItems.length > 0) {
      result.push({
        id: 'docs',
        name: 'docs',
        path: 'docs',
        type: 'folder',
        children: docsFolderItems,
      })
    }

    // openspec 폴더 내용 추가
    if (openspecFolderItems.length > 0) {
      result.push({
        id: 'openspec',
        name: 'openspec',
        path: 'openspec',
        type: 'folder',
        children: openspecFolderItems,
      })
    }

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[Docs] List error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list docs',
    })
  }
})

/**
 * 특정 문서 내용 조회
 * GET /api/docs/content?projectPath=/path/to/project&docPath=docs/api.md
 */
router.get('/content', async (req, res) => {
  try {
    // 타입 단언 추가
    const { projectPath, docPath } = req.query as { projectPath?: string; docPath?: string }

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({ error: 'projectPath is required' })
    }

    if (!docPath || typeof docPath !== 'string') {
      return res.status(400).json({ error: 'docPath is required' })
    }

    if (docPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    const fullPath = join(projectPath, docPath)

    try {
      await access(fullPath, constants.R_OK)
    } catch {
      return res.status(404).json({ error: 'Document not found' })
    }

    const content = await readFile(fullPath, 'utf-8')
    const stats = await stat(fullPath)

    const result: DocContent = {
      id: docPath.replace(/\//g, '-').replace('.md', ''),
      name: basename(docPath, '.md'),
      path: docPath,
      content,
      lastModified: stats.mtime.toISOString(),
    }

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[Docs] Content error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read document',
    })
  }
})

/**
 * 문서 내용 저장
 * PUT /api/docs/content
 */
router.put('/content', async (req, res) => {
  try {
    const { projectPath, docPath, content } = req.body

    if (!projectPath || !docPath || content === undefined) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (docPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    const fullPath = join(projectPath, docPath)
    
    await writeFile(fullPath, content, 'utf-8')

    res.json({ success: true })
  } catch (error) {
    console.error('[Docs] Save error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save document',
    })
  }
})

/**
 * 문서 검색
 * GET /api/docs/search?projectPath=/path/to/project&query=검색어
 */
router.get('/search', async (req, res) => {
  try {
    const { projectPath, query } = req.query as { projectPath?: string; query?: string }

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({ error: 'projectPath is required' })
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' })
    }

    const searchLower = query.toLowerCase()
    const results: Array<{ path: string; name: string; matches: string[] }> = []

    const searchPaths = [projectPath, join(projectPath, 'docs'), join(projectPath, 'openspec')]
    const processedPaths = new Set<string>()

    // searchInDirectory는 성능상 직렬로 두거나 병렬로 바꿀 수 있음. 여기서는 일단 유지.
    async function searchInDirectory(dirPath: string) {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
           const fullPath = join(dirPath, entry.name)

           if (processedPaths.has(fullPath)) continue
           processedPaths.add(fullPath)

           if (entry.isDirectory()) {
             // 검색 시에도 제외 목록 적용
             const excludes = ['node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.git']
             if (!entry.name.startsWith('.') && !excludes.includes(entry.name)) {
               await searchInDirectory(fullPath)
             }
           } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
             try {
               const content = await readFile(fullPath, 'utf-8')
               const lines = content.split('\n')
               const matches: string[] = []

               for (let i = 0; i < lines.length; i++) {
                 if (lines[i].toLowerCase().includes(searchLower)) {
                   const snippet = lines[i].trim().slice(0, 200)
                   matches.push(snippet)
                   if (matches.length >= 3) break
                 }
               }

               if (matches.length > 0) {
                 results.push({
                   path: relative(projectPath, fullPath),
                   name: entry.name.replace('.md', ''),
                   matches,
                 })
               }
             } catch {
               // 파일 읽기 실패 시 건너뜀
             }
           }
        }
      } catch {
        // 디렉토리 접근 실패 시 건너뜀
      }
    }

    // 검색은 순차적으로 (너무 많은 파일 오픈 방지)
    for (const searchPath of searchPaths) {
      await searchInDirectory(searchPath)
    }

    res.json({
      success: true,
      data: results.slice(0, 20),
    })
  } catch (error) {
    console.error('[Docs] Search error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search docs',
    })
  }
})

export { router as docsRouter }
