/**
 * RAG Index Watcher
 * 
 * 문서 파일 변경 감지 시 자동으로 임베딩을 업데이트하는 워처
 */

import chokidar, { type FSWatcher } from 'chokidar'
import { join } from 'path'
import { indexDocument, deleteDocumentIndex, initRagDb } from './index.js'

let docsWatcher: FSWatcher | null = null

/**
 * RAG 인덱스 워처 시작
 */
export async function startRagWatcher(
  projectId: string,
  projectPath: string
): Promise<void> {
  // 기존 워처 정리
  await stopRagWatcher()

  const docsPath = join(projectPath, 'docs')
  const openspecPath = join(projectPath, 'openspec')

  console.log(`[RAG Watcher] Starting for project: ${projectId}`)

  // RAG DB 초기화
  await initRagDb()

  docsWatcher = chokidar.watch([docsPath, openspecPath], {
    persistent: true,
    ignoreInitial: true, // 시작 시 기존 파일은 인덱싱하지 않음
    depth: 10,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
    ],
  })

  docsWatcher
    .on('add', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = filePath.replace(`${projectPath}/`, '')
        console.log(`[RAG Watcher] New file detected: ${relativePath}`)
        try {
          await indexDocument(projectId, projectPath, relativePath)
        } catch (err) {
          console.error(`[RAG Watcher] Failed to index: ${relativePath}`, err)
        }
      }
    })
    .on('change', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = filePath.replace(`${projectPath}/`, '')
        console.log(`[RAG Watcher] File changed: ${relativePath}`)
        try {
          await indexDocument(projectId, projectPath, relativePath)
        } catch (err) {
          console.error(`[RAG Watcher] Failed to update index: ${relativePath}`, err)
        }
      }
    })
    .on('unlink', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = filePath.replace(`${projectPath}/`, '')
        console.log(`[RAG Watcher] File deleted: ${relativePath}`)
        try {
          await deleteDocumentIndex(projectId, relativePath)
        } catch (err) {
          console.error(`[RAG Watcher] Failed to delete index: ${relativePath}`, err)
        }
      }
    })
    .on('ready', () => {
      console.log(`[RAG Watcher] Ready and watching for document changes`)
    })
    .on('error', (error) => {
      console.error('[RAG Watcher] Error:', error)
    })
}

/**
 * RAG 인덱스 워처 중지
 */
export async function stopRagWatcher(): Promise<void> {
  if (docsWatcher) {
    await docsWatcher.close()
    docsWatcher = null
    console.log('[RAG Watcher] Stopped')
  }
}

/**
 * 워처가 실행 중인지 확인
 */
export function isRagWatcherRunning(): boolean {
  return docsWatcher !== null
}
