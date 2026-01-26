import { Router } from 'express'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { access, readFile } from 'fs/promises'
import { constants } from 'fs'
import Database from 'better-sqlite3'

const router = Router()

// claude-mem 데이터베이스 경로
const CLAUDE_MEM_DB_PATH = join(homedir(), '.claude-mem', 'memory.db')

/**
 * RAG 시맨틱 검색 API
 * LEANN MCP 서버를 호출하여 시맨틱 검색 수행
 *
 * GET /api/rag/search?query=...&limit=...&index=...
 */
router.get('/search', async (req, res) => {
  try {
    const { query, limit = '5', index = 'zyflow' } = req.query as {
      query?: string
      limit?: string
      index?: string
    }

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.status(400).json({ error: 'query is required (min 2 chars)' })
    }

    const maxResults = Math.min(parseInt(limit, 10) || 5, 20)

    // LEANN CLI를 통해 검색 수행
    // leann search <index> <query> --top-k <limit> --json
    const results = await runLeannSearch(index, query, maxResults)

    res.json({
      success: true,
      data: results,
      total: results.length,
    })

  } catch (error) {
    console.error('[RAG] Search error:', error)

    // LEANN이 설치되지 않은 경우 빈 결과 반환
    if (error instanceof Error && error.message.includes('LEANN not available')) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        warning: 'LEANN MCP 서버가 설치되지 않았습니다. leann-server를 설치해주세요.',
      })
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'RAG search failed',
    })
  }
})

/**
 * LEANN CLI를 통해 검색 수행
 */
async function runLeannSearch(
  indexName: string,
  query: string,
  topK: number
): Promise<Array<{ score: number; content: string; source?: string }>> {
  return new Promise((resolve, reject) => {
    // leann CLI 실행
    const leannProcess = spawn('leann', ['search', indexName, query, '--top-k', String(topK)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    leannProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    leannProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    leannProcess.on('close', (code) => {
      if (code !== 0) {
        // LEANN이 설치되지 않았거나 오류
        if (stderr.includes('command not found') || stderr.includes('not found')) {
          reject(new Error('LEANN not available'))
          return
        }
        reject(new Error(`LEANN search failed: ${stderr}`))
        return
      }

      try {
        // LEANN 출력 파싱
        // 출력 형식: "1. Score: 1.234\n내용...\nSource: path\n\n2. Score: ..."
        const results = parseLeannOutput(stdout)
        resolve(results)
      } catch (parseError) {
        // 파싱 실패 시 빈 결과
        console.warn('[RAG] Failed to parse LEANN output:', parseError)
        resolve([])
      }
    })

    leannProcess.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('LEANN not available'))
      } else {
        reject(err)
      }
    })
  })
}

/**
 * LEANN 출력 파싱
 */
function parseLeannOutput(output: string): Array<{ score: number; content: string; source?: string }> {
  const results: Array<{ score: number; content: string; source?: string }> = []

  // 결과 블록 분리 (숫자. Score: 로 시작)
  const blocks = output.split(/\n(?=\d+\.\s+Score:)/).filter(Boolean)

  for (const block of blocks) {
    // Score 추출
    const scoreMatch = block.match(/Score:\s*([\d.]+)/)
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0

    // Source 추출 (있는 경우)
    const sourceMatch = block.match(/Source:\s*(.+)/)
    const source = sourceMatch ? sourceMatch[1].trim() : undefined

    // 내용 추출 (Score 라인 이후, Source 라인 이전)
    const content = block
      .replace(/^\d+\.\s+Score:\s*[\d.]+\n?/, '') // Score 라인 제거
      .replace(/\nSource:\s*.+$/, '') // Source 라인 제거
      .trim()

    if (content) {
      results.push({ score, content, source })
    }
  }

  return results
}

export { router as ragRouter }

// ============================================
// Memory Search API (claude-mem)
// ============================================

const memoryRouter = Router()

/**
 * Memory 검색 API
 * claude-mem SQLite 데이터베이스에서 직접 검색
 *
 * GET /api/memory/search?query=...&limit=...&types=...
 */
memoryRouter.get('/search', async (req, res) => {
  try {
    const { query, limit = '10', types } = req.query as {
      query?: string
      limit?: string
      types?: string  // 콤마로 구분된 타입들: "decision,bugfix,feature"
    }

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.status(400).json({ error: 'query is required (min 2 chars)' })
    }

    const maxResults = Math.min(parseInt(limit, 10) || 10, 50)
    const typeFilter = types ? types.split(',').map(t => t.trim()) : null

    // claude-mem DB 존재 확인
    try {
      await access(CLAUDE_MEM_DB_PATH, constants.R_OK)
    } catch {
      return res.json({
        success: true,
        data: [],
        total: 0,
        warning: 'claude-mem 데이터베이스가 없습니다.',
      })
    }

    // SQLite 검색 수행
    const results = searchMemoryDb(query, maxResults, typeFilter)

    res.json({
      success: true,
      data: results,
      total: results.length,
    })

  } catch (error) {
    console.error('[Memory] Search error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Memory search failed',
    })
  }
})

/**
 * claude-mem SQLite 데이터베이스에서 검색
 */
function searchMemoryDb(
  query: string,
  limit: number,
  typeFilter: string[] | null
): Array<{ id: number; type: string; title: string; subtitle?: string }> {
  try {
    const db = new Database(CLAUDE_MEM_DB_PATH, { readonly: true })

    // FTS5 또는 LIKE 검색
    // claude-mem의 observations 테이블 구조: id, type, title, subtitle, facts, narrative, ...
    let sql = `
      SELECT id, type, title, subtitle
      FROM observations
      WHERE (title LIKE ? OR subtitle LIKE ? OR facts LIKE ? OR narrative LIKE ?)
    `
    const searchPattern = `%${query}%`
    const params: (string | number)[] = [searchPattern, searchPattern, searchPattern, searchPattern]

    if (typeFilter && typeFilter.length > 0) {
      const placeholders = typeFilter.map(() => '?').join(',')
      sql += ` AND type IN (${placeholders})`
      params.push(...typeFilter)
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`
    params.push(limit)

    const stmt = db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      id: number
      type: string
      title: string
      subtitle: string | null
    }>

    db.close()

    return rows.map(row => ({
      id: row.id,
      type: row.type || 'unknown',
      title: row.title || 'Untitled',
      subtitle: row.subtitle || undefined,
    }))
  } catch (error) {
    console.error('[Memory] DB search error:', error)
    return []
  }
}

export { memoryRouter }
