/**
 * Fix Generator Agent
 *
 * 에러 분석 결과를 바탕으로 코드 수정을 생성하는 에이전트
 */

import { LlmAgent, InMemoryRunner, createPartFromText } from '@google/adk'
import { fileTools, writeFileTool } from '../tools/file-tools'
import { loadConfig } from '../config'
import type { ErrorAnalysisResult } from './error-analyzer'

const config = loadConfig()

export interface CodeFix {
  filePath: string
  originalContent?: string
  fixedContent: string
  description: string
  patches?: Array<{
    type: 'replace' | 'insert' | 'delete'
    startLine?: number
    endLine?: number
    searchPattern?: string
    content?: string
  }>
}

export interface FixGenerationResult {
  success: boolean
  fixes: CodeFix[]
  summary: string
  confidence: number
  warnings?: string[]
}

export const fixGeneratorAgent = new LlmAgent({
  name: 'fix-generator',
  description: '에러 분석 결과를 바탕으로 코드 수정을 생성합니다.',
  model: config.model,
  instruction: `당신은 코드 수정 전문가입니다.

에러 분석 결과를 바탕으로:
1. 영향받는 파일을 읽습니다
2. 문제를 해결하는 최소한의 수정을 생성합니다
3. 기존 코드 스타일을 유지합니다
4. 수정 내용을 명확하게 설명합니다

수정 결과는 JSON 형식으로 반환하세요:
{
  "success": true,
  "fixes": [
    {
      "filePath": "경로",
      "fixedContent": "수정된 전체 내용",
      "description": "수정 설명"
    }
  ],
  "summary": "전체 수정 요약",
  "confidence": 0.9
}

주의사항:
- 불필요한 변경을 하지 마세요
- 기존 로직을 유지하세요
- 타입 안전성을 확보하세요`,
  tools: fileTools,
})

export async function generateFix(
  analysis: ErrorAnalysisResult
): Promise<FixGenerationResult> {
  const runner = new InMemoryRunner({
    agent: fixGeneratorAgent,
    appName: 'ZyFlowAutoFix',
  })

  const session = await runner.sessionService.getOrCreateSession({
    appName: 'ZyFlowAutoFix',
    userId: 'system',
    sessionId: 'fix-generation-' + Date.now(),
  })

  const filesInfo = analysis.affectedFiles
    .map(f => 'File: ' + f.path + (f.line ? ' Line: ' + f.line : '') + ' Issue: ' + f.issue)
    .join('\n')

  const prompt = `다음 에러를 수정해주세요:

에러 타입: ${analysis.errorType}
심각도: ${analysis.severity}
요약: ${analysis.summary}
근본 원인: ${analysis.rootCause}
수정 제안: ${analysis.suggestedFix}

영향받는 파일:
${filesInfo}

각 파일을 읽고 수정된 코드를 생성해주세요.
수정 결과를 JSON 형식으로 반환해주세요.`

  let responseText = ''

  for await (const event of runner.runAsync({
    userId: 'system',
    sessionId: session.id,
    newMessage: { parts: [createPartFromText(prompt)] },
  })) {
    if (event.content?.parts) {
      for (const part of event.content.parts) {
        if ('text' in part && part.text) {
          responseText += part.text
        }
      }
    }
  }

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as FixGenerationResult
    }
  } catch {
    // parsing failed
  }

  return {
    success: false,
    fixes: [],
    summary: 'Fix generation failed',
    confidence: 0,
    warnings: [responseText || 'No response from agent'],
  }
}

export async function applyFixes(fixes: CodeFix[]): Promise<{
  applied: string[]
  failed: Array<{ file: string; error: string }>
}> {
  const applied: string[] = []
  const failed: Array<{ file: string; error: string }> = []

  for (const fix of fixes) {
    try {
      const writeResult = await writeFileTool.execute({
        filePath: fix.filePath,
        content: fix.fixedContent,
        createDirectories: true,
      })

      if (writeResult.success) {
        applied.push(fix.filePath)
      } else {
        failed.push({ file: fix.filePath, error: writeResult.error || 'Unknown error' })
      }
    } catch (err) {
      failed.push({ file: fix.filePath, error: String(err) })
    }
  }

  return { applied, failed }
}

export function generateDiff(original: string, fixed: string): string {
  const originalLines = original.split('\n')
  const fixedLines = fixed.split('\n')
  const diff: string[] = []

  const maxLen = Math.max(originalLines.length, fixedLines.length)

  for (let i = 0; i < maxLen; i++) {
    const origLine = originalLines[i]
    const fixLine = fixedLines[i]

    if (origLine !== fixLine) {
      if (origLine !== undefined) {
        diff.push('- ' + origLine)
      }
      if (fixLine !== undefined) {
        diff.push('+ ' + fixLine)
      }
    } else if (origLine !== undefined) {
      diff.push('  ' + origLine)
    }
  }

  return diff.join('\n')
}
