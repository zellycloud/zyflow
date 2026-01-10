/**
 * Fix Validation Pipeline
 *
 * AI가 생성한 수정의 유효성 검증
 * - 구문 검증 (파싱 체크)
 * - 타입 체크 (tsc --noEmit)
 * - 린트 체크 (eslint)
 * - 테스트 실행 (vitest)
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import type { FileChange } from './fix-generator'

const execFileAsync = promisify(execFile)

export type ValidationLevel = 'syntax' | 'typecheck' | 'lint' | 'test' | 'full'

export interface ValidationResult {
  passed: boolean
  level: ValidationLevel
  checks: {
    syntax: CheckResult
    typecheck: CheckResult
    lint: CheckResult
    test: CheckResult
  }
  overallScore: number // 0-1
  errors: string[]
  warnings: string[]
}

export interface CheckResult {
  passed: boolean
  skipped: boolean
  errors: string[]
  warnings: string[]
  duration: number // ms
}

const SKIP_RESULT: CheckResult = {
  passed: true,
  skipped: true,
  errors: [],
  warnings: [],
  duration: 0,
}

/**
 * 수정 검증
 */
export async function validateFix(
  changes: FileChange[],
  projectRoot: string,
  level: ValidationLevel = 'full'
): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: false,
    level,
    checks: {
      syntax: SKIP_RESULT,
      typecheck: SKIP_RESULT,
      lint: SKIP_RESULT,
      test: SKIP_RESULT,
    },
    overallScore: 0,
    errors: [],
    warnings: [],
  }

  const levels: ValidationLevel[] = ['syntax', 'typecheck', 'lint', 'test']
  const stopAt = levels.indexOf(level) + 1
  const checkLevels = level === 'full' ? levels : levels.slice(0, stopAt)

  let passedChecks = 0

  for (const checkLevel of checkLevels) {
    try {
      switch (checkLevel) {
        case 'syntax':
          result.checks.syntax = await checkSyntax(changes)
          break
        case 'typecheck':
          result.checks.typecheck = await checkTypes(changes, projectRoot)
          break
        case 'lint':
          result.checks.lint = await checkLint(changes, projectRoot)
          break
        case 'test':
          result.checks.test = await runTests(changes, projectRoot)
          break
      }

      if (result.checks[checkLevel].passed) {
        passedChecks++
      } else {
        result.errors.push(...result.checks[checkLevel].errors)
        result.warnings.push(...result.checks[checkLevel].warnings)

        // 실패하면 다음 체크 중단 (빠른 실패)
        if (checkLevel !== 'lint') {
          break
        }
      }
    } catch (err) {
      result.errors.push(`${checkLevel} check failed: ${err}`)
      break
    }
  }

  result.overallScore = passedChecks / checkLevels.length
  result.passed = passedChecks === checkLevels.length

  return result
}

/**
 * 구문 검증 (TypeScript/JavaScript 파싱)
 */
async function checkSyntax(changes: FileChange[]): Promise<CheckResult> {
  const start = Date.now()
  const errors: string[] = []
  const warnings: string[] = []

  for (const change of changes) {
    if (!change.file.match(/\.(ts|tsx|js|jsx)$/)) {
      continue
    }

    try {
      // 임시 파일에 쓰기
      const tmpFile = join(tmpdir(), `validate-${Date.now()}-${change.file.replace(/\//g, '-')}`)
      await mkdir(dirname(tmpFile), { recursive: true })
      await writeFile(tmpFile, change.modifiedContent, 'utf-8')

      // esbuild로 파싱 시도 (빠름)
      try {
        await execFileAsync('npx', ['esbuild', tmpFile, '--bundle', '--format=esm', '--outfile=/dev/null'], {
          timeout: 10000,
        })
      } catch (err: unknown) {
        const error = err as { stderr?: string; message?: string }
        errors.push(`Syntax error in ${change.file}: ${error.stderr || error.message}`)
      }

      // 임시 파일 삭제
      await unlink(tmpFile).catch(() => {})
    } catch (err) {
      errors.push(`Failed to validate ${change.file}: ${err}`)
    }
  }

  return {
    passed: errors.length === 0,
    skipped: false,
    errors,
    warnings,
    duration: Date.now() - start,
  }
}

/**
 * 타입 체크 (tsc --noEmit)
 */
async function checkTypes(
  changes: FileChange[],
  projectRoot: string
): Promise<CheckResult> {
  const start = Date.now()
  const errors: string[] = []
  const warnings: string[] = []

  // 변경된 TS/TSX 파일만
  const tsFiles = changes
    .filter((c) => c.file.match(/\.tsx?$/))
    .map((c) => c.file)

  if (tsFiles.length === 0) {
    return SKIP_RESULT
  }

  try {
    // tsc --noEmit로 타입 체크
    await execFileAsync(
      'npx',
      ['tsc', '--noEmit', '--skipLibCheck', ...tsFiles],
      {
        cwd: projectRoot,
        timeout: 60000,
      }
    )
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string }
    const output = error.stdout || error.stderr || error.message || ''

    // TypeScript 에러 파싱
    const errorLines = output.split('\n').filter((line) => line.includes('error TS'))
    errors.push(...errorLines)
  }

  return {
    passed: errors.length === 0,
    skipped: false,
    errors,
    warnings,
    duration: Date.now() - start,
  }
}

/**
 * 린트 체크 (eslint)
 */
async function checkLint(
  changes: FileChange[],
  projectRoot: string
): Promise<CheckResult> {
  const start = Date.now()
  const errors: string[] = []
  const warnings: string[] = []

  // 변경된 JS/TS 파일만
  const files = changes
    .filter((c) => c.file.match(/\.(js|jsx|ts|tsx)$/))
    .map((c) => c.file)

  if (files.length === 0) {
    return SKIP_RESULT
  }

  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['eslint', '--format', 'json', ...files],
      {
        cwd: projectRoot,
        timeout: 60000,
      }
    )

    // ESLint JSON 출력 파싱
    const results = JSON.parse(stdout) as Array<{
      filePath: string
      messages: Array<{
        severity: number
        message: string
        line: number
        column: number
        ruleId: string
      }>
    }>

    for (const result of results) {
      for (const msg of result.messages) {
        const location = `${result.filePath}:${msg.line}:${msg.column}`
        const text = `${location} - ${msg.message} (${msg.ruleId})`

        if (msg.severity === 2) {
          errors.push(text)
        } else {
          warnings.push(text)
        }
      }
    }
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string; code?: number }
    // ESLint는 에러가 있으면 exit code 1 반환
    if (error.stdout) {
      try {
        const results = JSON.parse(error.stdout) as Array<{
          filePath: string
          messages: Array<{
            severity: number
            message: string
            line: number
            column: number
            ruleId: string
          }>
        }>

        for (const result of results) {
          for (const msg of result.messages) {
            const location = `${result.filePath}:${msg.line}:${msg.column}`
            const text = `${location} - ${msg.message} (${msg.ruleId})`

            if (msg.severity === 2) {
              errors.push(text)
            } else {
              warnings.push(text)
            }
          }
        }
      } catch {
        errors.push(`ESLint failed: ${error.stderr || error.message}`)
      }
    } else {
      // ESLint가 설치되지 않았거나 설정이 없음
      warnings.push('ESLint check skipped: eslint not available or no config found')
      return { ...SKIP_RESULT, warnings }
    }
  }

  return {
    passed: errors.length === 0,
    skipped: false,
    errors,
    warnings,
    duration: Date.now() - start,
  }
}

/**
 * 테스트 실행 (vitest)
 */
async function runTests(
  changes: FileChange[],
  projectRoot: string
): Promise<CheckResult> {
  const start = Date.now()
  const errors: string[] = []
  const warnings: string[] = []

  // 관련 테스트 파일 찾기
  const testFiles = changes
    .filter((c) => c.file.match(/\.test\.(js|jsx|ts|tsx)$/))
    .map((c) => c.file)

  // 변경된 소스 파일에 대응하는 테스트 파일 추가
  for (const change of changes) {
    if (!change.file.match(/\.test\./)) {
      const testFile = change.file.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1')
      testFiles.push(testFile)
    }
  }

  if (testFiles.length === 0) {
    return { ...SKIP_RESULT, warnings: ['No test files to run'] }
  }

  try {
    await execFileAsync(
      'npx',
      ['vitest', 'run', '--reporter=json', ...testFiles],
      {
        cwd: projectRoot,
        timeout: 120000, // 2분
      }
    )
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string }
    const output = error.stdout || error.stderr || error.message || ''

    // 테스트 실패 정보 추출
    if (output.includes('FAIL')) {
      const failLines = output.split('\n').filter((line) => line.includes('FAIL') || line.includes('×'))
      errors.push(...failLines.slice(0, 10)) // 최대 10개
    } else {
      // Vitest가 없거나 설정이 없음
      warnings.push('Test check skipped: vitest not available or no tests found')
      return { ...SKIP_RESULT, warnings }
    }
  }

  return {
    passed: errors.length === 0,
    skipped: false,
    errors,
    warnings,
    duration: Date.now() - start,
  }
}

/**
 * 빠른 검증 (구문 + 타입만)
 */
export async function quickValidate(
  changes: FileChange[],
  projectRoot: string
): Promise<boolean> {
  const result = await validateFix(changes, projectRoot, 'typecheck')
  return result.passed
}

/**
 * 전체 검증
 */
export async function fullValidate(
  changes: FileChange[],
  projectRoot: string
): Promise<ValidationResult> {
  return validateFix(changes, projectRoot, 'full')
}

/**
 * 검증 결과 요약 문자열 생성
 */
export function summarizeValidation(result: ValidationResult): string {
  const checks = [
    { name: 'Syntax', result: result.checks.syntax },
    { name: 'TypeCheck', result: result.checks.typecheck },
    { name: 'Lint', result: result.checks.lint },
    { name: 'Test', result: result.checks.test },
  ]

  const lines = checks
    .filter((c) => !c.result.skipped)
    .map((c) => {
      const status = c.result.passed ? '✓' : '✗'
      const duration = `(${c.result.duration}ms)`
      return `${status} ${c.name} ${duration}`
    })

  lines.push('')
  lines.push(`Overall: ${result.passed ? 'PASSED' : 'FAILED'} (score: ${(result.overallScore * 100).toFixed(0)}%)`)

  if (result.errors.length > 0) {
    lines.push('')
    lines.push('Errors:')
    lines.push(...result.errors.slice(0, 5).map((e) => `  - ${e}`))
    if (result.errors.length > 5) {
      lines.push(`  ... and ${result.errors.length - 5} more`)
    }
  }

  return lines.join('\n')
}
