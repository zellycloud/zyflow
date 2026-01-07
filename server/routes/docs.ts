import { Router } from 'express'
import { readdir, readFile, access, stat, writeFile } from 'fs/promises'
import { join, relative, basename, extname } from 'path'
import { constants } from 'fs'

const router = Router()

// Remote Plugin Type Definition (Simulated)
interface RemotePlugin {
  getRemoteServerById: (id: string) => Promise<any>
  listDirectory: (server: any, path: string) => Promise<{ entries: Array<{ type: string; name: string; modifiedAt?: string }> }>
  readRemoteFile: (server: any, path: string) => Promise<string>
  writeRemoteFile: (server: any, path: string, content: string) => Promise<void>
  // executeCommand is not needed for docs yet, maybe for search
}

let remotePlugin: RemotePlugin | null = null

async function getRemotePlugin() {
  if (remotePlugin) return remotePlugin
  try {
    const mod = await import('@zyflow/remote-plugin')
    remotePlugin = mod as unknown as RemotePlugin
    return remotePlugin
  } catch {
    return null
  }
}

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
 * 로컬: 재귀적으로 마크다운 파일 목록을 가져오기 (병렬 처리 최적화)
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
              type: 'folder' as const,
              children,
            }
          }
        } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
          return {
            id: relativePath.replace(/\//g, '-').replace('.md', ''),
            name: entry.name.replace('.md', ''),
            path: relativePath,
            type: 'file' as const,
          }
        }
        return null
      })
    )

    const items = results.filter((item): item is DocItem => item !== null)

    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return items
  } catch {
    return []
  }
}

/**
 * 원격: 재귀적으로 마크다운 파일 목록 가져오기 (SSH)
 */
async function scanRemoteDocsDirectory(
  plugin: RemotePlugin,
  server: any,
  basePath: string,
  currentPath: string,
  projectPath: string
): Promise<DocItem[]> {
  try {
    const listing = await plugin.listDirectory(server, currentPath)
    
    // Remote listing은 flat하지 않고 해당 디렉토리의 엔트리만 줌 (보통)
    // 병렬 처리
    const results = await Promise.all(
      listing.entries.map(async (entry) => {
        // 원격 경로 조합 (단순 문자열 연결 사용, OS 구분 없이 / 사용 가정)
        const fullPath = `${currentPath}/${entry.name}`
        // relative path 계산이 까다로울 수 있음 (projectPath가 원격 경로). 단순 문자열 제거로 처리
        const relativePath = fullPath.replace(`${projectPath}/`, '')

        if (entry.type === 'directory' || entry.type === 'd' || entry.type === 'Directory') {
           const excludes = ['node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.git']
           if (entry.name.startsWith('.') || excludes.includes(entry.name)) {
             return null
           }

           const children = await scanRemoteDocsDirectory(plugin, server, basePath, fullPath, projectPath)
           if (children.length > 0) {
             return {
               id: relativePath.replace(/\//g, '-'),
               name: entry.name,
               path: relativePath,
               type: 'folder' as const,
               children,
             }
           }
        } else if (entry.name.toLowerCase().endsWith('.md')) {
           return {
             id: relativePath.replace(/\//g, '-').replace('.md', ''),
             name: entry.name.replace('.md', ''),
             path: relativePath,
             type: 'file' as const,
           }
        }
        return null
      })
    )

    const items = results.filter((item): item is DocItem => item !== null)
    
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return items
  } catch (error) {
    console.warn(`Remote scan failed for ${currentPath}`, error)
    return []
  }
}

/**
 * 프로젝트의 문서 목록 조회
 * GET /api/docs?projectPath=...&serverId=...
 */
router.get('/', async (req, res) => {
  try {
    const { projectPath, serverId } = req.query as { projectPath?: string; serverId?: string }

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({ error: 'projectPath is required' })
    }

    const rootFiles = [
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'LICENSE.md',
      'AGENTS.md',
      'CLAUDE.md',
    ]

    let rootDocs: DocItem[] = []
    let docsFolderItems: DocItem[] = []
    let openspecFolderItems: DocItem[] = []

    if (serverId) {
      // --- Remote Mode ---
      const plugin = await getRemotePlugin()
      if (!plugin) {
        return res.status(500).json({ error: 'Remote plugin not installed' })
      }
      
      const server = await plugin.getRemoteServerById(serverId)
      if (!server) {
        return res.status(404).json({ error: 'Remote server not found' })
      }

      // Root files
      // 리스트를 한번에 가져와서 필터링하는 방식이 효율적일 수 있으나 구현 단순화를 위해 개별 확인 대신
      // 루트 디렉토리 리스팅을 한번 함
      try {
        const rootListing = await plugin.listDirectory(server, projectPath)
        for (const entry of rootListing.entries) {
          if (entry.type !== 'directory' && rootFiles.includes(entry.name)) {
             rootDocs.push({
               id: entry.name.replace('.md', '').toLowerCase(),
               name: entry.name.replace('.md', ''),
               path: entry.name,
               type: 'file',
             })
          }
        }
      } catch {
        // 루트 조회 실패 무시
      }

      // Docs & OpenSpec Folders
      const docsPath = `${projectPath}/docs` // 원격은 보통 Linux일테니 / 사용
      const openspecPath = `${projectPath}/openspec`

      docsFolderItems = await scanRemoteDocsDirectory(plugin, server, docsPath, docsPath, projectPath)
      openspecFolderItems = await scanRemoteDocsDirectory(plugin, server, openspecPath, openspecPath, projectPath)

    } else {
      // --- Local Mode ---
      // 1. 루트 파일
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
        } catch {}
      }

      // 2. Docs & OpenSpec
      const docsPath = join(projectPath, 'docs')
      const openspecPath = join(projectPath, 'openspec')
      
      try {
        await access(docsPath, constants.R_OK)
        docsFolderItems = await scanDocsDirectory(docsPath, docsPath, projectPath)
      } catch {}

      try {
        await access(openspecPath, constants.R_OK)
        openspecFolderItems = await scanDocsDirectory(openspecPath, openspecPath, projectPath)
      } catch {}
    }

    const result: DocItem[] = []
    if (rootDocs.length > 0) result.push(...rootDocs)
    if (docsFolderItems.length > 0) {
      result.push({
        id: 'docs',
        name: 'docs',
        path: 'docs',
        type: 'folder',
        children: docsFolderItems,
      })
    }
    if (openspecFolderItems.length > 0) {
      result.push({
        id: 'openspec',
        name: 'openspec',
        path: 'openspec',
        type: 'folder',
        children: openspecFolderItems,
      })
    }

    res.json({ success: true, data: result })

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
 */
router.get('/content', async (req, res) => {
  try {
    const { projectPath, docPath, serverId } = req.query as { projectPath?: string; docPath?: string; serverId?: string }

    if (!projectPath || !docPath) {
      return res.status(400).json({ error: 'projectPath and docPath are required' })
    }

    if (docPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    let content = ''
    let lastModified = new Date().toISOString()

    if (serverId) {
       // --- Remote Mode ---
       const plugin = await getRemotePlugin()
       if (!plugin) return res.status(500).json({ error: 'Remote plugin not installed' })
       const server = await plugin.getRemoteServerById(serverId)
       if (!server) return res.status(404).json({ error: 'Remote server not found' })

       const fullPath = `${projectPath}/${docPath}`
       content = await plugin.readRemoteFile(server, fullPath)
       // remote file stat은 readRemoteFile API가 string만 반환하면 알기 어려울 수 있음.
       // listDirectory를 다시 호출해서 메타데이터를 얻거나, 그냥 현재 시간/임의값 사용.
       // 여기서는 일단 생략하거나 listDirectory로 확인 가능하지만 성능상 생략 시도
    } else {
       // --- Local Mode ---
       const fullPath = join(projectPath, docPath)
       try {
         await access(fullPath, constants.R_OK)
       } catch {
         return res.status(404).json({ error: 'Document not found' })
       }

       content = await readFile(fullPath, 'utf-8')
       const stats = await stat(fullPath)
       lastModified = stats.mtime.toISOString()
    }

    res.json({
      success: true,
      data: {
        id: docPath.replace(/\//g, '-').replace('.md', ''),
        name: basename(docPath, '.md'),
        path: docPath,
        content,
        lastModified,
      },
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
 */
router.put('/content', async (req, res) => {
  try {
    const { projectPath, docPath, content, serverId } = req.body

    if (!projectPath || !docPath || content === undefined) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    if (docPath.includes('..')) return res.status(400).json({ error: 'Invalid path' })

    if (serverId) {
       // --- Remote Mode ---
       const plugin = await getRemotePlugin()
       if (!plugin) return res.status(500).json({ error: 'Remote plugin not installed' })
       const server = await plugin.getRemoteServerById(serverId)
       if (!server) return res.status(404).json({ error: 'Remote server not found' })

       const fullPath = `${projectPath}/${docPath}`
       
       // writeRemoteFile이 있는지 확인 필요. 보통 있음.
       if (plugin.writeRemoteFile) {
         await plugin.writeRemoteFile(server, fullPath, content)
       } else {
         return res.status(501).json({ error: 'Remote write not supported' })
       }
    } else {
       // --- Local Mode ---
       const fullPath = join(projectPath, docPath)
       await writeFile(fullPath, content, 'utf-8')
    }

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
 * 문서 검색 (원격 검색은 미구현 상태로 유지하거나 차후 구현)
 * GET /api/docs/search
 */
router.get('/search', async (req, res) => {
  try {
    const { projectPath, query, serverId } = req.query as { projectPath?: string; query?: string; serverId?: string }

    if (serverId) {
       // 원격 검색은 일단 빈 배열 반환 (구현 복잡도)
       return res.json({ success: true, data: [] })
    }

    // ... 기존 로컬 검색 로직 ...
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

    async function searchInDirectory(dirPath: string) {
       // ... (기존과 동일하게 유지) ...
       try {
        const entries = await readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
           const fullPath = join(dirPath, entry.name)
           if (processedPaths.has(fullPath)) continue
           processedPaths.add(fullPath)

           if (entry.isDirectory()) {
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
             } catch {}
           }
        }
      } catch {}
    }

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
