/**
 * Error Analyzer Agent
 *
 * CI/CD 에러 로그를 분석하고 근본 원인을 파악하는 에이전트
 */

import { LlmAgent, InMemoryRunner, createPartFromText } from '@google/adk'
import { fileTools } from '../tools/file-tools'
import { gitTools } from '../tools/git-tools'
import { loadConfig } from '../config'

const config = loadConfig()

export interface ErrorAnalysisResult {
  errorType: 'syntax' | 'type' | 'runtime' | 'lint' | 'test' | 'build' | 'unknown'
  severity: 'critical' | 'high' | 'medium' | 'low'
  summary: string
  rootCause: string
  affectedFiles: Array<{
    path: string
    line?: number
    column?: number
    issue: string
  }>
  suggestedFix: string
  confidence: number
  context: string
}

export const errorAnalyzerAgent = new LlmAgent({
  name: 'error-analyzer',
  description: 'CI/CD 에러 로그를 분석하고 근본 원인을 파악합니다.',
  model: config.model,
  instruction: `당신은 소프트웨어 에러 분석 전문가입니다.

주어진 에러 로그와 코드베이스를 분석하여:
1. 에러의 타입을 분류합니다 (syntax, type, runtime, lint, test, build)
2. 근본 원인을 파악합니다
3. 영향받는 파일과 라인을 정확히 식별합니다
4. 수정 방향을 제안합니다

분석 결과는 반드시 다음 JSON 형식으로 반환하세요:
{
  "errorType": "type|syntax|runtime|lint|test|build|unknown",
  "severity": "critical|high|medium|low",
  "summary": "에러 요약",
  "rootCause": "근본 원인 설명",
  "affectedFiles": [{"path": "파일경로", "line": 번호, "issue": "문제 설명"}],
  "suggestedFix": "수정 방향 제안",
  "confidence": 0.0-1.0,
  "context": "추가 컨텍스트"
}`,
  tools: [...fileTools, ...gitTools.slice(0, 3)],
})

export async function analyzeError(
  errorLog: string,
  projectPath?: string
): Promise<ErrorAnalysisResult> {
  const runner = new InMemoryRunner({
    agent: errorAnalyzerAgent,
    appName: 'ZyFlowAutoFix',
  })

  const session = await runner.sessionService.getOrCreateSession({
    appName: 'ZyFlowAutoFix',
    userId: 'system',
    sessionId: 'error-analysis-' + Date.now(),
  })

  const pathInfo = projectPath ? '\n\nProject: ' + projectPath : ''
  const prompt = 'Analyze this error:\n```\n' + errorLog + '\n```' + pathInfo

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
      return JSON.parse(jsonMatch[0]) as ErrorAnalysisResult
    }
  } catch {
    // parsing failed
  }

  return {
    errorType: 'unknown',
    severity: 'medium',
    summary: 'Analysis failed',
    rootCause: responseText || 'No response from agent',
    affectedFiles: [],
    suggestedFix: 'Manual check required',
    confidence: 0.1,
    context: errorLog.slice(0, 500),
  }
}

export function extractErrorsFromCILog(log: string): string[] {
  const errors: string[] = []
  const lines = log.split('\n')
  let inErrorBlock = false
  let currentError: string[] = []

  for (const line of lines) {
    if (line.includes('error') || line.includes('Error') || line.includes('FAILED')) {
      if (currentError.length > 0) {
        errors.push(currentError.join('\n'))
        currentError = []
      }
      inErrorBlock = true
    }

    if (inErrorBlock) {
      currentError.push(line)
      if (line.trim() === '' && currentError.length > 3) {
        errors.push(currentError.join('\n'))
        currentError = []
        inErrorBlock = false
      }
    }
  }

  if (currentError.length > 0) {
    errors.push(currentError.join('\n'))
  }

  return errors
}

export function parseTypeScriptErrors(log: string): Array<{
  file: string
  line: number
  column: number
  code: string
  message: string
}> {
  const errors: Array<{
    file: string
    line: number
    column: number
    code: string
    message: string
  }> = []

  const regex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g
  let match
  while ((match = regex.exec(log)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[4],
      message: match[5],
    })
  }
  return errors
}

export function parseESLintErrors(log: string): Array<{
  file: string
  line: number
  column: number
  rule: string
  message: string
}> {
  const errors: Array<{
    file: string
    line: number
    column: number
    rule: string
    message: string
  }> = []

  try {
    const jsonMatch = log.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      for (const file of parsed) {
        for (const msg of file.messages || []) {
          if (msg.severity === 2) {
            errors.push({
              file: file.filePath,
              line: msg.line,
              column: msg.column,
              rule: msg.ruleId || '',
              message: msg.message,
            })
          }
        }
      }
      return errors
    }
  } catch {
    // JSON parsing failed
  }

  const regex = /(.+):(\d+):(\d+):\s+error\s+(.+)/g
  let match
  while ((match = regex.exec(log)) !== null) {
    const parts = match[4].split(/\s{2,}/)
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      rule: parts[1] || '',
      message: parts[0] || match[4],
    })
  }
  return errors
}
