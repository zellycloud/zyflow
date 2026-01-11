/**
 * Validator Agent
 *
 * 코드 수정 결과를 검증하는 에이전트
 */

import { LlmAgent, InMemoryRunner, createPartFromText } from '@google/adk'
import { buildTools, runTypecheckTool, runLintTool, runTestsTool } from '../tools/build-tools'
import { loadConfig } from '../config'
import type { CodeFix } from './fix-generator'

const config = loadConfig()

export interface ValidationResult {
  passed: boolean
  typecheck: {
    passed: boolean
    errors: Array<{ file: string; line: number; message: string }>
  }
  lint: {
    passed: boolean
    errors: Array<{ file: string; line: number; rule: string; message: string }>
  }
  tests: {
    passed: boolean
    failed: number
    total: number
    failedTests?: string[]
  }
  score: number
  feedback?: string
}

export const validatorAgent = new LlmAgent({
  name: 'validator',
  description: '코드 수정 결과를 검증합니다.',
  model: config.model,
  instruction: `당신은 코드 품질 검증 전문가입니다.

수정된 코드에 대해:
1. TypeScript 타입 체크를 실행합니다
2. ESLint 검사를 실행합니다
3. 테스트를 실행합니다
4. 결과를 종합하여 점수를 매깁니다

검증 결과 피드백을 제공하세요.`,
  tools: buildTools,
})

export async function validateFixes(
  fixes: CodeFix[],
  options?: {
    skipTests?: boolean
    directory?: string
  }
): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: false,
    typecheck: { passed: false, errors: [] },
    lint: { passed: false, errors: [] },
    tests: { passed: false, failed: 0, total: 0 },
    score: 0,
  }

  // TypeScript 체크
  const typecheckResult = await runTypecheckTool.execute({
    directory: options?.directory,
    files: fixes.map(f => f.filePath),
  })

  result.typecheck.passed = typecheckResult.success
  result.typecheck.errors = typecheckResult.errors || []

  // ESLint 체크
  const lintResult = await runLintTool.execute({
    directory: options?.directory,
    files: fixes.map(f => f.filePath),
    fix: false,
  })

  result.lint.passed = lintResult.success
  result.lint.errors = lintResult.errors || []

  // 테스트 실행
  if (!options?.skipTests) {
    const testResult = await runTestsTool.execute({
      directory: options?.directory,
    })

    result.tests.passed = testResult.success
    result.tests.failed = testResult.failed || 0
    result.tests.total = testResult.total || 0
  } else {
    result.tests.passed = true
  }

  // 점수 계산
  let score = 0
  if (result.typecheck.passed) score += 40
  if (result.lint.passed) score += 30
  if (result.tests.passed) score += 30

  result.score = score
  result.passed = score >= 70

  // 피드백 생성
  if (!result.passed) {
    const issues: string[] = []
    if (!result.typecheck.passed) {
      issues.push('TypeScript: ' + result.typecheck.errors.length + ' errors')
    }
    if (!result.lint.passed) {
      issues.push('ESLint: ' + result.lint.errors.length + ' errors')
    }
    if (!result.tests.passed) {
      issues.push('Tests: ' + result.tests.failed + '/' + result.tests.total + ' failed')
    }
    result.feedback = 'Validation failed: ' + issues.join(', ')
  }

  return result
}

export async function analyzeValidationFailure(
  validationResult: ValidationResult
): Promise<string> {
  const runner = new InMemoryRunner({
    agent: validatorAgent,
    appName: 'ZyFlowAutoFix',
  })

  const session = await runner.sessionService.getOrCreateSession({
    appName: 'ZyFlowAutoFix',
    userId: 'system',
    sessionId: 'validation-analysis-' + Date.now(),
  })

  const issues: string[] = []

  if (!validationResult.typecheck.passed) {
    for (const err of validationResult.typecheck.errors.slice(0, 5)) {
      issues.push('[TS] ' + err.file + ':' + err.line + ' - ' + err.message)
    }
  }

  if (!validationResult.lint.passed) {
    for (const err of validationResult.lint.errors.slice(0, 5)) {
      issues.push('[Lint] ' + err.file + ':' + err.line + ' - ' + err.message + ' (' + err.rule + ')')
    }
  }

  if (!validationResult.tests.passed && validationResult.tests.failedTests) {
    for (const test of validationResult.tests.failedTests.slice(0, 3)) {
      issues.push('[Test] ' + test)
    }
  }

  const prompt = 'Analyze these validation failures and suggest how to fix them:\n' +
    issues.join('\n') + '\nScore: ' + validationResult.score + '/100'

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

  return responseText || 'No analysis available'
}

export function shouldRetry(validationResult: ValidationResult, attemptCount: number): boolean {
  if (attemptCount >= 3) return false
  if (validationResult.score >= 50) return true
  if (!validationResult.typecheck.passed && validationResult.lint.passed && validationResult.tests.passed) {
    return true
  }
  return false
}
