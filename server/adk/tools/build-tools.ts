/**
 * ADK Build/Test Tools
 *
 * 에이전트가 빌드, 테스트, 린트 등을 실행하기 위한 도구들
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import { execFileSync, execFile } from 'child_process'
import * as path from 'path'

interface ExecResult {
  success: boolean
  output?: string
  error?: string
  exitCode?: number
}

function runCommand(cmd: string, args: string[], cwd?: string, timeout?: number): ExecResult {
  try {
    const output = execFileSync(cmd, args, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: timeout || 120000,
    })
    return { success: true, output: output.trim(), exitCode: 0 }
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number }
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || String(err),
      exitCode: error.status,
    }
  }
}

export const runTypecheckTool = new FunctionTool({
  name: 'runTypecheck',
  description: 'TypeScript 타입 체크를 실행합니다 (tsc --noEmit).',
  parameters: z.object({
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    files: z.array(z.string()).optional().describe('특정 파일만 체크'),
  }),
  execute: async ({ directory, files }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()
    const args = ['--noEmit', '--pretty']

    if (files && files.length > 0) {
      args.push(...files)
    }

    const result = runCommand('npx', ['tsc', ...args], cwd, 180000)

    // 에러 파싱
    if (!result.success && result.output) {
      const errors: Array<{ file: string; line: number; message: string }> = []
      const lines = result.output.split('\n')

      for (const line of lines) {
        const match = line.match(/^(.+)\((\d+),(\d+)\): error TS\d+: (.+)$/)
        if (match) {
          errors.push({
            file: match[1],
            line: parseInt(match[2], 10),
            message: match[4],
          })
        }
      }

      return { ...result, errors, errorCount: errors.length }
    }

    return { ...result, errors: [], errorCount: 0 }
  },
})

export const runLintTool = new FunctionTool({
  name: 'runLint',
  description: 'ESLint를 실행합니다.',
  parameters: z.object({
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    files: z.array(z.string()).optional().describe('특정 파일만 린트'),
    fix: z.boolean().optional().describe('자동 수정 적용'),
  }),
  execute: async ({ directory, files, fix = false }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()
    const args = ['eslint', '--format', 'json']

    if (fix) args.push('--fix')

    if (files && files.length > 0) {
      args.push(...files)
    } else {
      args.push('.')
    }

    const result = runCommand('npx', args, cwd, 120000)

    // JSON 출력 파싱
    try {
      const jsonOutput = JSON.parse(result.output || '[]')
      const errors: Array<{ file: string; line: number; message: string; ruleId: string }> = []

      for (const file of jsonOutput) {
        for (const msg of file.messages || []) {
          if (msg.severity === 2) {
            errors.push({
              file: file.filePath,
              line: msg.line,
              message: msg.message,
              ruleId: msg.ruleId || '',
            })
          }
        }
      }

      return {
        success: errors.length === 0,
        errors,
        errorCount: errors.length,
        output: result.output,
      }
    } catch {
      return result
    }
  },
})

export const runTestsTool = new FunctionTool({
  name: 'runTests',
  description: 'Vitest 테스트를 실행합니다.',
  parameters: z.object({
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    files: z.array(z.string()).optional().describe('특정 테스트 파일'),
    testName: z.string().optional().describe('특정 테스트 이름 패턴'),
    coverage: z.boolean().optional().describe('커버리지 포함'),
  }),
  execute: async ({ directory, files, testName, coverage = false }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()
    const args = ['vitest', 'run', '--reporter=json']

    if (testName) args.push('-t', testName)
    if (coverage) args.push('--coverage')
    if (files && files.length > 0) args.push(...files)

    const result = runCommand('npx', args, cwd, 300000)

    // 결과 파싱
    try {
      const jsonOutput = JSON.parse(result.output || '{}')
      const testResults = jsonOutput.testResults || []

      const passed = testResults.filter((t: { status: string }) => t.status === 'passed').length
      const failed = testResults.filter((t: { status: string }) => t.status === 'failed').length

      return {
        success: failed === 0,
        passed,
        failed,
        total: passed + failed,
        duration: jsonOutput.duration,
      }
    } catch {
      // JSON 파싱 실패 시 기본 결과 반환
      return {
        ...result,
        success: result.exitCode === 0,
      }
    }
  },
})

export const runBuildTool = new FunctionTool({
  name: 'runBuild',
  description: '프로젝트를 빌드합니다.',
  parameters: z.object({
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    script: z.string().optional().describe('빌드 스크립트 이름 (기본: build)'),
  }),
  execute: async ({ directory, script = 'build' }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()
    return runCommand('npm', ['run', script], cwd, 300000)
  },
})

export const installDependenciesTool = new FunctionTool({
  name: 'installDependencies',
  description: 'npm 의존성을 설치합니다.',
  parameters: z.object({
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    packages: z.array(z.string()).optional().describe('설치할 패키지 (없으면 npm install)'),
    dev: z.boolean().optional().describe('devDependencies로 설치'),
  }),
  execute: async ({ directory, packages, dev = false }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()

    if (packages && packages.length > 0) {
      const args = ['install']
      if (dev) args.push('--save-dev')
      args.push(...packages)
      return runCommand('npm', args, cwd, 180000)
    }

    return runCommand('npm', ['install'], cwd, 180000)
  },
})

export const runScriptTool = new FunctionTool({
  name: 'runScript',
  description: 'package.json의 스크립트를 실행합니다.',
  parameters: z.object({
    script: z.string().describe('스크립트 이름'),
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    args: z.array(z.string()).optional().describe('추가 인자'),
  }),
  execute: async ({ script, directory, args = [] }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()
    const cmdArgs = ['run', script]
    if (args.length > 0) {
      cmdArgs.push('--')
      cmdArgs.push(...args)
    }
    return runCommand('npm', cmdArgs, cwd, 300000)
  },
})

export const validateCodeTool = new FunctionTool({
  name: 'validateCode',
  description: '코드 검증을 통합 실행합니다 (typecheck + lint + test).',
  parameters: z.object({
    directory: z.string().optional().describe('프로젝트 디렉토리'),
    skipTests: z.boolean().optional().describe('테스트 건너뛰기'),
  }),
  execute: async ({ directory, skipTests = false }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()

    const results: {
      typecheck: ExecResult | null
      lint: ExecResult | null
      tests: ExecResult | null
      allPassed: boolean
    } = {
      typecheck: null,
      lint: null,
      tests: null,
      allPassed: false,
    }

    // TypeScript 체크
    results.typecheck = runCommand('npx', ['tsc', '--noEmit'], cwd, 180000)

    // ESLint
    results.lint = runCommand('npx', ['eslint', '.', '--max-warnings=0'], cwd, 120000)

    // 테스트
    if (!skipTests) {
      results.tests = runCommand('npx', ['vitest', 'run'], cwd, 300000)
    }

    results.allPassed =
      results.typecheck.success &&
      results.lint.success &&
      (skipTests || (results.tests?.success ?? false))

    return results
  },
})

// 개별 도구 내보내기 (validator에서 사용)
export {
  runTypecheckTool,
  runLintTool,
  runTestsTool,
  runBuildTool,
  installDependenciesTool,
  runScriptTool,
  validateCodeTool,
}

export const buildTools = [
  runTypecheckTool,
  runLintTool,
  runTestsTool,
  runBuildTool,
  installDependenciesTool,
  runScriptTool,
  validateCodeTool,
]
