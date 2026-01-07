/**
 * RAG (Retrieval-Augmented Generation) Backend
 * 
 * LanceDB 기반 문서 임베딩 및 검색 시스템
 */

import { connect, type Connection, type Table } from '@lancedb/lancedb'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { homedir } from 'os'

// 임베딩 모델 (lazy loading)
let embeddingPipeline: ((texts: string[]) => Promise<number[][]>) | null = null

// LanceDB 연결
let db: Connection | null = null
let documentsTable: Table | null = null

const DB_PATH = join(homedir(), '.zyflow', 'rag.lance')

/**
 * 임베딩 모델 초기화 (Transformers.js 사용)
 */
async function getEmbeddingPipeline(): Promise<(texts: string[]) => Promise<number[][]>> {
  if (embeddingPipeline) return embeddingPipeline

  console.log('[RAG] Loading embedding model...')
  
  // Dynamic import for Transformers.js
  const { pipeline, env } = await import('@xenova/transformers')
  
  // 모델 캐시 위치 설정
  env.cacheDir = join(homedir(), '.zyflow', 'models')
  
  // Feature extraction pipeline (임베딩 생성용)
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true, // 더 빠른 추론을 위해 양자화된 모델 사용
  })
  
  console.log('[RAG] Embedding model loaded')

  embeddingPipeline = async (texts: string[]): Promise<number[][]> => {
    const embeddings: number[][] = []
    for (const text of texts) {
      const result = await extractor(text, { pooling: 'mean', normalize: true })
      embeddings.push(Array.from(result.data))
    }
    return embeddings
  }

  return embeddingPipeline
}

/**
 * LanceDB 초기화
 */
export async function initRagDb(): Promise<void> {
  if (db) return

  console.log('[RAG] Initializing vector database...')
  db = await connect(DB_PATH)
  
  // 문서 테이블 존재 여부 확인
  const tableNames = await db.tableNames()
  if (tableNames.includes('documents')) {
    documentsTable = await db.openTable('documents')
    console.log('[RAG] Documents table opened')
  } else {
    console.log('[RAG] Documents table not found, will be created on first indexing')
  }
}

/**
 * 문서 청크 분할
 */
function splitIntoChunks(content: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = []
  const lines = content.split('\n')
  let currentChunk = ''

  for (const line of lines) {
    if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      // 오버랩을 위해 마지막 부분 유지
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 5))
      currentChunk = overlapWords.join(' ') + '\n' + line
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// LanceDB compatible record type
type DocumentRecord = Record<string, unknown> & {
  id: string
  projectId: string
  filePath: string
  chunkIndex: number
  content: string
  vector: number[]
  updatedAt: number
}

/**
 * 단일 문서 인덱싱
 */
export async function indexDocument(
  projectId: string,
  projectPath: string,
  relativePath: string
): Promise<number> {
  await initRagDb()
  const embedder = await getEmbeddingPipeline()

  const fullPath = join(projectPath, relativePath)
  let content: string
  
  try {
    content = await readFile(fullPath, 'utf-8')
  } catch (err) {
    console.error(`[RAG] Failed to read file: ${relativePath}`, err)
    return 0
  }

  // 마크다운 파일이 아니면 스킵
  if (!relativePath.endsWith('.md')) {
    return 0
  }

  // 청크로 분할
  const chunks = splitIntoChunks(content)
  if (chunks.length === 0) return 0

  // 임베딩 생성
  const embeddings = await embedder(chunks)

  // 문서 레코드 생성
  const now = Date.now()
  const records: DocumentRecord[] = chunks.map((chunk, i) => ({
    id: `${projectId}:${relativePath}:${i}`,
    projectId,
    filePath: relativePath,
    chunkIndex: i,
    content: chunk,
    vector: embeddings[i],
    updatedAt: now,
  }))

  // 기존 청크 삭제 후 새 청크 삽입
  if (documentsTable) {
    try {
      await documentsTable.delete(`filePath = '${relativePath}' AND projectId = '${projectId}'`)
    } catch {
      // 삭제 실패 무시 (테이블이 없거나 레코드가 없는 경우)
    }
  }

  // 테이블이 없으면 생성
  if (!documentsTable && db) {
    documentsTable = await db.createTable('documents', records, { mode: 'overwrite' })
    console.log('[RAG] Documents table created')
  } else if (documentsTable) {
    await documentsTable.add(records)
  }

  console.log(`[RAG] Indexed ${chunks.length} chunks from ${relativePath}`)
  return chunks.length
}

/**
 * 프로젝트 전체 문서 인덱싱
 */
export async function indexProjectDocuments(
  projectId: string,
  projectPath: string,
  files: string[]
): Promise<{ indexed: number; chunks: number }> {
  let totalChunks = 0
  let indexed = 0

  for (const file of files) {
    if (file.endsWith('.md')) {
      const chunks = await indexDocument(projectId, projectPath, file)
      if (chunks > 0) {
        indexed++
        totalChunks += chunks
      }
    }
  }

  return { indexed, chunks: totalChunks }
}

/**
 * 유사 문서 검색
 */
export async function searchDocuments(
  projectId: string,
  query: string,
  limit: number = 5
): Promise<Array<{ filePath: string; content: string; score: number }>> {
  await initRagDb()
  
  if (!documentsTable) {
    console.log('[RAG] No documents indexed yet')
    return []
  }

  const embedder = await getEmbeddingPipeline()
  const [queryEmbedding] = await embedder([query])

  const results = await documentsTable
    .search(queryEmbedding)
    .where(`projectId = '${projectId}'`)
    .limit(limit)
    .toArray()

  return results.map((r) => ({
    filePath: r.filePath as string,
    content: r.content as string,
    score: r._distance as number,
  }))
}

/**
 * 문서 삭제 (파일 삭제 시 호출)
 */
export async function deleteDocumentIndex(
  projectId: string,
  relativePath: string
): Promise<void> {
  await initRagDb()
  
  if (documentsTable) {
    try {
      await documentsTable.delete(`filePath = '${relativePath}' AND projectId = '${projectId}'`)
      console.log(`[RAG] Deleted index for ${relativePath}`)
    } catch (err) {
      console.error(`[RAG] Failed to delete index: ${relativePath}`, err)
    }
  }
}

/**
 * 인덱스 통계
 */
export async function getIndexStats(projectId: string): Promise<{
  totalChunks: number
  uniqueFiles: number
}> {
  await initRagDb()
  
  if (!documentsTable) {
    return { totalChunks: 0, uniqueFiles: 0 }
  }

  // Use search with empty filter to get all docs for this project
  const allDocs = await documentsTable
    .search(new Array(384).fill(0)) // MiniLM-L6-v2 has 384 dimensions
    .where(`projectId = '${projectId}'`)
    .limit(10000)
    .toArray()

  const uniqueFiles = new Set(allDocs.map((d: Record<string, unknown>) => d.filePath as string)).size

  return {
    totalChunks: allDocs.length,
    uniqueFiles,
  }
}
