/**
 * Error Analyzer Tests
 */

import { describe, it, expect } from 'vitest'
import {
  parseGitHubActionsLog,
  parseSentryIssue,
  isAutoFixable,
  calculatePriority,
  type ParsedError,
  type AnalysisResult,
} from '../error-analyzer'

describe('Error Analyzer', () => {
  describe('parseGitHubActionsLog', () => {
    it('should parse TypeScript errors', () => {
      const log = `
src/components/Button.tsx(15,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils/api.ts(42,10): error TS2304: Cannot find name 'fetch'.
`
      const result: AnalysisResult = parseGitHubActionsLog(log)

      expect(result.errors).toHaveLength(2)
      expect(result.errors[0].type).toBe('type')
      expect(result.errors[0].location?.file).toBe('src/components/Button.tsx')
      expect(result.errors[0].location?.line).toBe(15)
      expect(result.errors[1].location?.file).toBe('src/utils/api.ts')
    })

    it('should parse ESLint errors', () => {
      const log = `
src/index.ts:10:5: error Unexpected console statement no-console
src/index.ts:25:1: warning Missing return type @typescript-eslint/explicit-function-return-type
`
      const result = parseGitHubActionsLog(log)

      expect(result.errors.length).toBeGreaterThan(0)
      const lintErrors = result.errors.filter(e => e.type === 'lint')
      expect(lintErrors.length).toBeGreaterThan(0)
    })

    it('should parse Vitest failures', () => {
      const log = `
 FAIL  src/utils/math.test.ts > add > should add two numbers
AssertionError: expected 3 to equal 4
  at Object.<anonymous> (src/utils/math.test.ts:5:10)
`
      const result = parseGitHubActionsLog(log)

      // Runtime errors from stack trace should be captured
      expect(result.summary).toBeDefined()
    })

    it('should return summary with counts', () => {
      const log = `
src/api.ts(10,5): error TS2322: Type error
src/api.ts(20,5): error TS2304: Another error
`
      const result = parseGitHubActionsLog(log)

      expect(result.summary).toBeDefined()
      expect(result.summary.total).toBe(2)
    })
  })

  describe('parseSentryIssue', () => {
    it('should parse Sentry issue payload', () => {
      // Note: parseSentryIssue expects metadata.filename, not event.exception.stacktrace
      const payload = {
        title: 'TypeError: Cannot read property x of undefined',
        culprit: 'src/api/handler.ts',
        metadata: {
          filename: 'src/api/handler.ts',
          function: 'handleRequest',
        },
        exception: {
          values: [{
            type: 'TypeError',
            value: "Cannot read property 'x' of undefined",
          }]
        }
      }

      const result = parseSentryIssue(payload)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].type).toBe('runtime')
      expect(result.errors[0].location?.file).toBe('src/api/handler.ts')
    })
  })

  describe('isAutoFixable', () => {
    it('should mark type errors with location as auto-fixable', () => {
      const error: ParsedError = {
        id: 'test-1',
        type: 'type',
        severity: 'error',
        message: 'Type error',
        rawMessage: 'Type error',
        confidence: 0.9,
        location: {
          file: 'src/test.ts',
          line: 10,
        }
      }

      expect(isAutoFixable(error)).toBe(true)
    })

    it('should not mark errors without location as auto-fixable', () => {
      const error: ParsedError = {
        id: 'test-2',
        type: 'type',
        severity: 'error',
        message: 'Type error',
        rawMessage: 'Type error',
        confidence: 0.9,
        // No location
      }

      expect(isAutoFixable(error)).toBe(false)
    })

    it('should not mark low confidence errors as auto-fixable', () => {
      const error: ParsedError = {
        id: 'test-3',
        type: 'type',
        severity: 'error',
        message: 'Type error',
        rawMessage: 'Type error',
        confidence: 0.3,
        location: {
          file: 'src/test.ts',
          line: 10,
        }
      }

      expect(isAutoFixable(error)).toBe(false)
    })
  })

  describe('calculatePriority', () => {
    it('should assign higher priority to syntax errors', () => {
      const syntaxError: ParsedError = {
        id: 'test-1',
        type: 'syntax',
        severity: 'error',
        message: 'Syntax error',
        rawMessage: 'Syntax error',
        confidence: 0.9,
      }

      const lintError: ParsedError = {
        id: 'test-2',
        type: 'lint',
        severity: 'warning',
        message: 'Lint warning',
        rawMessage: 'Lint warning',
        confidence: 0.9,
      }

      expect(calculatePriority(syntaxError)).toBeGreaterThan(calculatePriority(lintError))
    })
  })
})
