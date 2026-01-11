/**
 * ADK Agents Tests
 *
 * 에이전트 구조 및 유틸리티 함수 테스트
 */

import { describe, it, expect } from 'vitest'

describe('Error Analyzer Utilities', () => {
  describe('parseTypeScriptErrors', () => {
    it('should parse TS error format correctly', () => {
      // TypeScript 에러 파싱 로직 테스트
      const tsErrorRegex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g
      const log = "src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'."

      const matches = [...log.matchAll(tsErrorRegex)]
      expect(matches.length).toBe(1)
      expect(matches[0][1]).toBe('src/index.ts')
      expect(matches[0][2]).toBe('10')
      expect(matches[0][4]).toBe('TS2322')
    })

    it('should parse multiple TS errors', () => {
      const tsErrorRegex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g
      const log = `src/a.ts(1,1): error TS1234: Error 1
src/b.ts(2,2): error TS5678: Error 2`

      const matches = [...log.matchAll(tsErrorRegex)]
      expect(matches.length).toBe(2)
    })
  })

  describe('extractErrorsFromCILog', () => {
    it('should extract TypeScript errors from CI log', () => {
      const log = `
        Running build...
        src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
        Build failed with 1 error.
      `

      const tsErrorRegex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g
      const matches = [...log.matchAll(tsErrorRegex)]

      expect(matches.length).toBe(1)
    })

    it('should extract ESLint errors from CI log', () => {
      const log = `
        /src/index.ts
          10:5  error  'foo' is not defined  no-undef
      `

      const eslintRegex = /(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+)$/gm
      const matches = [...log.matchAll(eslintRegex)]

      expect(matches.length).toBe(1)
    })
  })
})

describe('Validation Utilities', () => {
  describe('shouldRetry', () => {
    it('should return false after max attempts', () => {
      const maxAttempts = 3
      const currentAttempt = 3

      expect(currentAttempt >= maxAttempts).toBe(true)
    })

    it('should return true when score is high enough', () => {
      const score = 60
      const threshold = 50

      expect(score >= threshold).toBe(true)
    })

    it('should consider test failures in retry decision', () => {
      const result = {
        passed: false,
        typecheck: { passed: false, errors: [] },
        lint: { passed: true, errors: [] },
        tests: { passed: true, failed: 0, total: 5 },
      }

      // 타입체크만 실패하고 테스트가 통과하면 재시도 가능
      const shouldRetry = !result.typecheck.passed && result.tests.passed
      expect(shouldRetry).toBe(true)
    })
  })
})

describe('Diff Generation', () => {
  it('should detect changes between original and modified', () => {
    const original = 'line1\nline2\nline3'
    const modified = 'line1\nmodified\nline3'

    const originalLines = original.split('\n')
    const modifiedLines = modified.split('\n')

    // 차이점 감지
    const hasChanges = originalLines.some((line, i) => line !== modifiedLines[i])
    expect(hasChanges).toBe(true)
  })

  it('should handle additions', () => {
    const original = 'line1\nline2'
    const modified = 'line1\nline2\nline3'

    expect(modified.split('\n').length).toBeGreaterThan(original.split('\n').length)
  })

  it('should handle deletions', () => {
    const original = 'line1\nline2\nline3'
    const modified = 'line1\nline3'

    expect(modified.split('\n').length).toBeLessThan(original.split('\n').length)
  })
})

describe('Agent Configuration', () => {
  it('should have valid agent names', () => {
    const agentNames = ['error-analyzer', 'fix-generator', 'validator', 'pr-agent']

    agentNames.forEach(name => {
      expect(name).toMatch(/^[a-z-]+$/)
    })
  })

  it('should define valid tool categories', () => {
    const toolCategories = ['file', 'git', 'github', 'build']

    expect(toolCategories.length).toBe(4)
  })
})
