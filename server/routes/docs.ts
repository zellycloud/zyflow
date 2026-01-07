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

// ============================================
// RAG (Retrieval-Augmented Generation) API
// ============================================

import { 
  initRagDb, 
  indexDocument, 
  indexProjectDocuments, 
  searchDocuments, 
  getIndexStats 
} from '../rag/index.js'

/**
 * POST /api/docs/ask - RAG 기반 질문-답변
 */
router.post('/ask', async (req, res) => {
  try {
    const { projectPath, projectId, query, limit = 5 } = req.body

    if (!projectId || !query) {
      return res.status(400).json({ error: 'projectId and query are required' })
    }

    // 유사 문서 검색
    const results = await searchDocuments(projectId, query, limit)

    if (results.length === 0) {
      return res.json({
        success: true,
        data: {
          answer: '관련 문서를 찾을 수 없습니다. 먼저 문서를 인덱싱해 주세요.',
          sources: [],
          context: '',
        },
      })
    }

    // 컨텍스트 구성
    const context = results
      .map((r, i) => `[Source ${i + 1}: ${r.filePath}]\n${r.content}`)
      .join('\n\n---\n\n')

    // 현재는 LLM 호출 없이 컨텍스트만 반환
    // 실제 답변 생성은 프론트엔드에서 Claude API를 호출하거나
    // 별도의 AI 서비스 연동이 필요
    res.json({
      success: true,
      data: {
        answer: null, // LLM 연동 시 여기에 답변
        sources: results.map(r => ({
          filePath: r.filePath,
          content: r.content.slice(0, 500),
          score: r.score,
        })),
        context,
        query,
      },
    })
  } catch (error) {
    console.error('[RAG] Ask error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process question',
    })
  }
})

/**
 * POST /api/docs/index - 문서 인덱싱
 */
router.post('/index', async (req, res) => {
  try {
    const { projectId, projectPath, files } = req.body

    if (!projectId || !projectPath) {
      return res.status(400).json({ error: 'projectId and projectPath are required' })
    }

    await initRagDb()

    if (files && Array.isArray(files)) {
      // 특정 파일들만 인덱싱
      const result = await indexProjectDocuments(projectId, projectPath, files)
      res.json({
        success: true,
        data: result,
      })
    } else {
      // 전체 프로젝트 인덱싱 (docs + openspec 폴더)
      const docsItems = await scanDocsDirectory(
        join(projectPath, 'docs'),
        join(projectPath, 'docs'),
        projectPath
      )
      const openspecItems = await scanDocsDirectory(
        join(projectPath, 'openspec'),
        join(projectPath, 'openspec'),
        projectPath
      )

      // DocItem에서 파일 경로만 추출
      function extractFilePaths(items: DocItem[]): string[] {
        const paths: string[] = []
        for (const item of items) {
          if (item.type === 'file') {
            paths.push(item.path)
          } else if (item.children) {
            paths.push(...extractFilePaths(item.children))
          }
        }
        return paths
      }

      const allFiles = [
        ...extractFilePaths(docsItems),
        ...extractFilePaths(openspecItems),
      ]

      const result = await indexProjectDocuments(projectId, projectPath, allFiles)
      res.json({
        success: true,
        data: result,
      })
    }
  } catch (error) {
    console.error('[RAG] Index error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to index documents',
    })
  }
})

/**
 * POST /api/docs/index/file - 단일 파일 인덱싱
 */
router.post('/index/file', async (req, res) => {
  try {
    const { projectId, projectPath, filePath } = req.body

    if (!projectId || !projectPath || !filePath) {
      return res.status(400).json({ error: 'projectId, projectPath, and filePath are required' })
    }

    const chunks = await indexDocument(projectId, projectPath, filePath)
    res.json({
      success: true,
      data: { filePath, chunks },
    })
  } catch (error) {
    console.error('[RAG] Index file error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to index file',
    })
  }
})

/**
 * GET /api/docs/index/stats - 인덱스 통계
 */
router.get('/index/stats', async (req, res) => {
  try {
    const { projectId } = req.query as { projectId?: string }

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }

    const stats = await getIndexStats(projectId)
    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('[RAG] Stats error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get index stats',
    })
  }
})

/**
 * POST /api/docs/chat - RAG 스트리밍 채팅 (Vercel AI SDK)
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages, projectId } = req.body

    if (!projectId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'projectId and messages are required' })
    }

    // 마지막 사용자 메시지에서 질문 추출
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
    if (!lastUserMessage) {
      return res.status(400).json({ error: 'No user message found' })
    }

    const query = lastUserMessage.content

    // RAG: 유사 문서 검색
    const searchResults = await searchDocuments(projectId, query, 5)

    // 컨텍스트 구성
    let context = ''
    if (searchResults.length > 0) {
      context = searchResults
        .map((r, i) => `[문서 ${i + 1}: ${r.filePath}]\n${r.content}`)
        .join('\n\n---\n\n')
    }

    // 시스템 프롬프트 구성
    const systemPrompt = `당신은 프로젝트 문서에 대해 답변하는 AI 어시스턴트입니다.
아래 문서 컨텍스트를 기반으로 사용자의 질문에 정확하고 도움이 되는 답변을 제공해주세요.
컨텍스트에 없는 내용에 대해서는 "문서에서 해당 정보를 찾을 수 없습니다"라고 답변해주세요.

## 참조 문서:
${context || '(인덱싱된 문서가 없습니다. 먼저 문서를 인덱싱해 주세요.)'}

## 지침:
- 답변은 한국어로 작성
- 문서 내용을 기반으로 정확하게 답변
- 출처 문서를 언급할 때는 파일 경로를 포함
- 마크다운 형식으로 답변`

    // Anthropic Claude API 직접 호출 (스트리밍)
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicApiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    }

    // 스트리밍 응답 설정
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Anthropic API 호출
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[RAG Chat] Anthropic API error:', errorText)
      return res.status(response.status).json({ error: 'Failed to get AI response' })
    }

    // SSE 스트리밍 처리
    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: 'Failed to read stream' })
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              res.write(parsed.delta.text)
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }
    }

    // 출처 정보 추가 (스트리밍 끝난 후)
    if (searchResults.length > 0) {
      res.write('\n\n---\n**📚 참조 문서:**\n')
      for (const result of searchResults) {
        res.write(`- \`${result.filePath}\`\n`)
      }
    }

    res.end()
  } catch (error) {
    console.error('[RAG Chat] Error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat',
      })
    } else {
      res.end()
    }
  }
})

export { router as docsRouter }
