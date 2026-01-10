/**
 * Fix Generator Service
 *
 * AI 분석 결과를 기반으로 코드 패치 생성
 * - Gemini AI를 사용한 수정 코드 생성
 * - Git diff 형식 출력
 * - 다중 파일 변경 지원
 * - 롤백 기능
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join, relative } from 'path'
import { getGeminiClient, GeminiClient } from '../ai/gemini-client'
import type { ParsedError, AnalysisResult } from './error-analyzer'
import {
  buildErrorAnalysisPrompt,
  testFailureAnalysisPrompt,
  typeErrorAnalysisPrompt,
  runtimeErrorAnalysisPrompt,
  lintErrorAnalysisPrompt,
  type FixSuggestion,
  type AnalysisResponse,
} from './prompts/error-analysis'

export interface FileChange {
  file: string
  originalContent: string
  modifiedContent: string
  diff: string
  fixes: FixSuggestion[]
}

export interface FixResult {
  success: boolean
  changes: FileChange[]
  errors: string[]
  analysis: AnalysisResponse | null
  metadata: {
    errorCount: number
    fixedCount: number
    confidence: number
    timestamp: string
  }
}

export interface RollbackInfo {
  id: string
  timestamp: string
  changes: Array<{
    file: string
    originalContent: string
  }>
}

// 롤백 정보 저장소
const rollbackStore = new Map<string, RollbackInfo>()

/**
 * 에러에 대한 수정 생성
 */
export async function generateFix(
  error: ParsedError,
  projectRoot: string,
  gemini?: GeminiClient
): Promise<FixResult> {
  const client = gemini || getGeminiClient()
  const errors: string[] = []
  const changes: FileChange[] = []
  let analysis: AnalysisResponse | null = null

  try {
    // 파일이 없으면 수정 불가
    if (!error.location?.file) {
      return createEmptyResult('No file location in error')
    }

    // 코드 컨텍스트 읽기
    const filePath = resolveFilePath(error.location.file, projectRoot)
    let codeContext: string

    try {
      codeContext = await readFile(filePath, 'utf-8')
    } catch {
      return createEmptyResult(`Cannot read file: ${filePath}`)
    }

    // 에러 타입에 따른 프롬프트 선택
    const prompt = selectPromptForError(error, codeContext)

    // Gemini API 호출
    const response = await client.generateJSON<AnalysisResponse>(prompt, {
      temperature: 0.2,
      maxTokens: 4096,
    })

    analysis = response

    // 수정 적용
    for (const fix of response.fixes) {
      try {
        const fixFilePath = resolveFilePath(fix.file, projectRoot)
        const originalContent = await readFile(fixFilePath, 'utf-8')
        const modifiedContent = applyFix(originalContent, fix)
        const diff = generateDiff(fix.file, originalContent, modifiedContent)

        changes.push({
          file: fix.file,
          originalContent,
          modifiedContent,
          diff,
          fixes: [fix],
        })
      } catch (err) {
        errors.push(`Failed to apply fix to ${fix.file}: ${err}`)
      }
    }

    return {
      success: changes.length > 0,
      changes,
      errors,
      analysis,
      metadata: {
        errorCount: 1,
        fixedCount: changes.length,
        confidence: response.confidence,
        timestamp: new Date().toISOString(),
      },
    }
  } catch (err) {
    return createEmptyResult(`Fix generation failed: ${err}`)
  }
}

/**
 * 여러 에러에 대한 수정 일괄 생성
 */
export async function generateBatchFix(
  analysisResult: AnalysisResult,
  projectRoot: string,
  gemini?: GeminiClient
): Promise<FixResult> {
  const client = gemini || getGeminiClient()
  const errors: string[] = []
  const allChanges: FileChange[] = []
  let totalConfidence = 0
  let fixCount = 0

  // 자동 수정 가능한 에러만 필터링
  const fixableErrors = analysisResult.errors.filter(
    (e) => e.location?.file && e.confidence >= 0.6
  )

  for (const error of fixableErrors) {
    try {
      const result = await generateFix(error, projectRoot, client)

      if (result.success) {
        allChanges.push(...result.changes)
        totalConfidence += result.metadata.confidence
        fixCount++
      } else {
        errors.push(...result.errors)
      }
    } catch (err) {
      errors.push(`Failed to fix ${error.id}: ${err}`)
    }
  }

  // 동일 파일에 대한 변경 병합
  const mergedChanges = mergeFileChanges(allChanges)

  return {
    success: mergedChanges.length > 0,
    changes: mergedChanges,
    errors,
    analysis: null,
    metadata: {
      errorCount: fixableErrors.length,
      fixedCount: fixCount,
      confidence: fixCount > 0 ? totalConfidence / fixCount : 0,
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * 수정 결과를 파일에 적용
 */
export async function applyChanges(
  changes: FileChange[],
  projectRoot: string
): Promise<RollbackInfo> {
  const rollbackId = `rollback-${Date.now()}`
  const rollbackChanges: RollbackInfo['changes'] = []

  for (const change of changes) {
    const filePath = resolveFilePath(change.file, projectRoot)

    // 롤백용 원본 저장
    rollbackChanges.push({
      file: change.file,
      originalContent: change.originalContent,
    })

    // 디렉토리 생성
    await mkdir(dirname(filePath), { recursive: true })

    // 수정된 내용 쓰기
    await writeFile(filePath, change.modifiedContent, 'utf-8')
  }

  const rollbackInfo: RollbackInfo = {
    id: rollbackId,
    timestamp: new Date().toISOString(),
    changes: rollbackChanges,
  }

  rollbackStore.set(rollbackId, rollbackInfo)

  return rollbackInfo
}

/**
 * 변경 사항 롤백
 */
export async function rollback(
  rollbackId: string,
  projectRoot: string
): Promise<boolean> {
  const info = rollbackStore.get(rollbackId)
  if (!info) {
    return false
  }

  for (const change of info.changes) {
    const filePath = resolveFilePath(change.file, projectRoot)
    await writeFile(filePath, change.originalContent, 'utf-8')
  }

  rollbackStore.delete(rollbackId)
  return true
}

/**
 * 에러 타입에 맞는 프롬프트 선택
 */
function selectPromptForError(error: ParsedError, codeContext: string): string {
  switch (error.type) {
    case 'type':
    case 'syntax':
      return typeErrorAnalysisPrompt(error, extractRelevantCode(codeContext, error))
    case 'test':
      return testFailureAnalysisPrompt(error, codeContext, codeContext) // 테스트 코드와 구현 코드 분리 필요
    case 'runtime':
      return runtimeErrorAnalysisPrompt(error, error.stack || '', extractRelevantCode(codeContext, error))
    case 'lint':
      return lintErrorAnalysisPrompt(error, extractRelevantCode(codeContext, error))
    case 'build':
    default:
      return buildErrorAnalysisPrompt(error, extractRelevantCode(codeContext, error))
  }
}

/**
 * 에러 위치 주변 코드 추출
 */
function extractRelevantCode(fullCode: string, error: ParsedError): string {
  if (!error.location?.line) {
    // 라인 정보가 없으면 전체 반환 (최대 200줄)
    const lines = fullCode.split('\n')
    return lines.slice(0, 200).join('\n')
  }

  const lines = fullCode.split('\n')
  const targetLine = error.location.line - 1 // 0-indexed
  const contextBefore = 10
  const contextAfter = 10

  const startLine = Math.max(0, targetLine - contextBefore)
  const endLine = Math.min(lines.length, targetLine + contextAfter + 1)

  // 라인 번호 포함
  return lines
    .slice(startLine, endLine)
    .map((line, i) => {
      const lineNum = startLine + i + 1
      const marker = lineNum === error.location?.line ? ' >>> ' : '     '
      return `${lineNum.toString().padStart(4)}${marker}${line}`
    })
    .join('\n')
}

/**
 * 수정 적용
 */
function applyFix(originalContent: string, fix: FixSuggestion): string {
  const lines = originalContent.split('\n')

  // 라인 범위 검증
  if (fix.startLine < 1 || fix.endLine > lines.length) {
    throw new Error(`Invalid line range: ${fix.startLine}-${fix.endLine}`)
  }

  // 수정 적용
  const before = lines.slice(0, fix.startLine - 1)
  const after = lines.slice(fix.endLine)
  const fixedLines = fix.fixedCode.split('\n')

  return [...before, ...fixedLines, ...after].join('\n')
}

/**
 * Git diff 형식 생성
 */
function generateDiff(
  file: string,
  original: string,
  modified: string
): string {
  const originalLines = original.split('\n')
  const modifiedLines = modified.split('\n')

  const diffs: string[] = [
    `--- a/${file}`,
    `+++ b/${file}`,
  ]

  // 간단한 diff 생성 (실제로는 diff 라이브러리 사용 권장)
  let lineNum = 0
  let diffChunk: string[] = []
  let chunkStart = 0

  for (let i = 0; i < Math.max(originalLines.length, modifiedLines.length); i++) {
    const origLine = originalLines[i]
    const modLine = modifiedLines[i]

    if (origLine !== modLine) {
      if (diffChunk.length === 0) {
        chunkStart = i + 1
      }
      if (origLine !== undefined) {
        diffChunk.push(`-${origLine}`)
      }
      if (modLine !== undefined) {
        diffChunk.push(`+${modLine}`)
      }
    } else if (diffChunk.length > 0) {
      // Chunk 끝
      diffs.push(`@@ -${chunkStart},${diffChunk.filter((l) => l.startsWith('-')).length} +${chunkStart},${diffChunk.filter((l) => l.startsWith('+')).length} @@`)
      diffs.push(...diffChunk)
      diffChunk = []
    }

    lineNum++
  }

  // 마지막 chunk
  if (diffChunk.length > 0) {
    diffs.push(`@@ -${chunkStart},${diffChunk.filter((l) => l.startsWith('-')).length} +${chunkStart},${diffChunk.filter((l) => l.startsWith('+')).length} @@`)
    diffs.push(...diffChunk)
  }

  return diffs.join('\n')
}

/**
 * 파일 경로 해석
 */
function resolveFilePath(file: string, projectRoot: string): string {
  if (file.startsWith('/')) {
    return file
  }
  return join(projectRoot, file)
}

/**
 * 동일 파일에 대한 변경 병합
 */
function mergeFileChanges(changes: FileChange[]): FileChange[] {
  const fileMap = new Map<string, FileChange>()

  for (const change of changes) {
    const existing = fileMap.get(change.file)
    if (existing) {
      // 변경 병합 (나중 변경이 이전 변경 위에 적용)
      existing.modifiedContent = change.modifiedContent
      existing.fixes.push(...change.fixes)
      existing.diff = generateDiff(change.file, existing.originalContent, existing.modifiedContent)
    } else {
      fileMap.set(change.file, { ...change })
    }
  }

  return Array.from(fileMap.values())
}

/**
 * 빈 결과 생성
 */
function createEmptyResult(error: string): FixResult {
  return {
    success: false,
    changes: [],
    errors: [error],
    analysis: null,
    metadata: {
      errorCount: 0,
      fixedCount: 0,
      confidence: 0,
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * 통합 diff 생성 (PR용)
 */
export function generateUnifiedDiff(changes: FileChange[]): string {
  return changes.map((c) => c.diff).join('\n\n')
}
