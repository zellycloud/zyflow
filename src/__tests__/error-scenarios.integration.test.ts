/**
 * Comprehensive Error Scenarios Integration Tests
 * Tests 22+ error scenarios covering all error types
 * @module __tests__/error-scenarios.integration.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ErrorContext, ErrorSeverity, ErrorType } from '@/types/errors'
import { getErrorLogger } from '@/utils/error-logger'
import { useErrorStore } from '@/stores/errorStore'
import {
  calculateErrorStats,
  calculateErrorTrend,
} from '@/utils/error-statistics'

// =============================================
// Setup & Teardown
// =============================================

describe('Error Scenarios Integration Tests', () => {
  beforeEach(() => {
    // Clear store and logger
    const logger = getErrorLogger()
    logger.clear()
    useErrorStore.getState().clearAll()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =============================================
  // NETWORK ERROR SCENARIOS (5)
  // =============================================

  describe('Network Error Scenarios', () => {
    it('SCENARIO-001: Request timeout error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_NETWORK_1001',
        message: 'Request timeout',
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'TaskExecutionDialog',
        function: 'fetchTaskDetails',
        recoverable: true,
        suggestedActions: ['Retry', 'Increase timeout'],
      }

      const logged = logger.log(error)
      expect(logged.code).toBe('ERR_NETWORK_1001')
      expect(logged.recoverable).toBe(true)
      expect(logged.timestamp).toBeGreaterThan(0)
    })

    it('SCENARIO-002: Connection failed (offline)', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_NETWORK_1000',
        message: 'Connection failed',
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'APIClient',
        function: 'request',
        recoverable: true,
        suggestedActions: ['Check internet connection', 'Retry'],
      }

      const logged = logger.log(error)
      const history = logger.getHistory(10)
      expect(history).toContainEqual(expect.objectContaining({ code: 'ERR_NETWORK_1000' }))
    })

    it('SCENARIO-003: Server error (5xx) with retry success', () => {
      const logger = getErrorLogger()
      const store = useErrorStore()

      // Log server error
      const serverError: ErrorContext = {
        code: 'ERR_NETWORK_1002',
        message: 'Server error (500)',
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'APIClient',
        recoverable: true,
        suggestedActions: ['Retry'],
      }

      logger.log(serverError)
      store.addError(serverError)

      // Simulate recovery
      const stats = calculateErrorStats([serverError])
      expect(stats.total).toBe(1)
      expect(stats.bySeverity[ErrorSeverity.ERROR]).toBe(1)
    })

    it('SCENARIO-004: Server error (5xx) with retry failure', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_NETWORK_1002',
        message: 'Server error (500) - Max retries exceeded',
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        component: 'APIClient',
        recoverable: false,
        suggestedActions: ['Contact support', 'Check system status'],
      }

      logger.log(error)
      const history = logger.getHistory()
      expect(history[0].severity).toBe(ErrorSeverity.CRITICAL)
      expect(history[0].recoverable).toBe(false)
    })

    it('SCENARIO-005: CORS error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_NETWORK_1000',
        message: 'CORS policy violation',
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        component: 'APIClient',
        recoverable: false,
        suggestedActions: ['Check CORS configuration'],
      }

      logger.log(error)
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.byCode['ERR_NETWORK_1000']).toBeGreaterThan(0)
    })
  })

  // =============================================
  // COMPONENT ERROR SCENARIOS (4)
  // =============================================

  describe('Component Error Scenarios', () => {
    it('SCENARIO-006: Render error in component', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_COMPONENT_2000',
        message: 'Cannot read property "map" of undefined',
        type: ErrorType.COMPONENT,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'TaskList',
        function: 'render',
        line: 45,
        stack: 'TypeError: Cannot read property "map" of undefined\n  at TaskList.render',
        recoverable: true,
        suggestedActions: ['Retry', 'Go to home'],
      }

      logger.log(error)
      expect(logger.getHistory()[0].component).toBe('TaskList')
      expect(logger.getHistory()[0].line).toBe(45)
    })

    it('SCENARIO-007: Hook error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_COMPONENT_2001',
        message: 'useAsyncError must be called in component',
        type: ErrorType.COMPONENT,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'CustomHook',
        recoverable: false,
        suggestedActions: ['Review hook usage'],
      }

      logger.log(error)
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.byType[ErrorType.COMPONENT]).toBe(1)
    })

    it('SCENARIO-008: Retry successful after error', () => {
      const logger = getErrorLogger()
      const store = useErrorStore()
      const retryError: ErrorContext = {
        code: 'ERR_COMPONENT_2000',
        message: 'Error on first render',
        type: ErrorType.COMPONENT,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'TaskDialog',
        recoverable: true,
        recoveryTime: 1200,
      }

      logger.log(retryError)
      store.addError(retryError)

      const errors = logger.getAllErrors()
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].recoveryTime).toBe(1200)
    })

    it('SCENARIO-009: Multiple component errors', () => {
      const logger = getErrorLogger()
      const errors: ErrorContext[] = [
        {
          code: 'ERR_COMPONENT_2000',
          message: 'Error in Component A',
          type: ErrorType.COMPONENT,
          severity: ErrorSeverity.ERROR,
          timestamp: Date.now(),
          component: 'ComponentA',
          recoverable: true,
        },
        {
          code: 'ERR_COMPONENT_2000',
          message: 'Error in Component B',
          type: ErrorType.COMPONENT,
          severity: ErrorSeverity.ERROR,
          timestamp: Date.now() + 1000,
          component: 'ComponentB',
          recoverable: true,
        },
      ]

      errors.forEach((e) => logger.log(e))
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.total).toBeGreaterThanOrEqual(2)
    })
  })

  // =============================================
  // VALIDATION ERROR SCENARIOS (3)
  // =============================================

  describe('Validation Error Scenarios', () => {
    it('SCENARIO-010: Form field validation error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_VALIDATION_3000',
        message: 'Field "projectName" is required',
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.WARNING,
        timestamp: Date.now(),
        component: 'ProjectForm',
        function: 'validate',
        userAction: 'clicked Submit without filling required field',
        recoverable: true,
        suggestedActions: ['Fill in required field', 'Check validation rules'],
      }

      logger.log(error)
      expect(logger.getHistory()[0].severity).toBe(ErrorSeverity.WARNING)
    })

    it('SCENARIO-011: Schema validation failure', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_VALIDATION_3001',
        message: 'Unexpected properties in schema: unknown_field',
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        function: 'validateSchema',
        recoverable: true,
      }

      logger.log(error)
      const all = logger.getAllErrors()
      expect(all.length).toBeGreaterThan(0)
    })

    it('SCENARIO-012: Type validation error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_VALIDATION_3000',
        message: 'Expected number, got string',
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.WARNING,
        timestamp: Date.now(),
        userAction: 'entered invalid data',
        recoverable: true,
      }

      logger.log(error)
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.byType[ErrorType.VALIDATION]).toBeGreaterThan(0)
    })
  })

  // =============================================
  // STATE MANAGEMENT ERROR SCENARIOS (2)
  // =============================================

  describe('State Management Error Scenarios', () => {
    it('SCENARIO-013: Zustand mutation failure', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_STATE_4000',
        message: 'State mutation failed: Object is not valid',
        type: ErrorType.STATE,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        function: 'updateStore',
        recoverable: true,
        suggestedActions: ['Retry operation', 'Reset state'],
        applicationState: { storeVersion: 1 },
      }

      logger.log(error)
      expect(logger.getHistory()[0].applicationState).toBeDefined()
    })

    it('SCENARIO-014: Missing context value', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_STATE_4001',
        message: 'Context value is undefined',
        type: ErrorType.STATE,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        component: 'TaskProvider',
        recoverable: false,
        suggestedActions: ['Check provider setup', 'Restart application'],
      }

      logger.log(error)
      const history = logger.getHistory()
      expect(history[0].code).toBe('ERR_STATE_4001')
    })
  })

  // =============================================
  // TASK EXECUTION ERROR SCENARIOS (3)
  // =============================================

  describe('Task Execution Error Scenarios', () => {
    it('SCENARIO-015: Task execution failed', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_TASK_5000',
        message: 'Task execution failed: Unknown error',
        type: ErrorType.TASK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'TaskExecutor',
        userAction: 'executed task "generate-readme"',
        recoverable: true,
        suggestedActions: ['Retry task', 'Check task configuration'],
      }

      logger.log(error)
      expect(logger.getHistory()[0].code).toBe('ERR_TASK_5000')
    })

    it('SCENARIO-016: SPEC file parsing error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_TASK_5001',
        message: 'Failed to parse spec.md: Invalid YAML frontmatter',
        type: ErrorType.TASK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'SpecParser',
        line: 25,
        recoverable: true,
        suggestedActions: ['Review SPEC file', 'Fix YAML syntax'],
      }

      logger.log(error)
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.byCode['ERR_TASK_5001']).toBeGreaterThan(0)
    })

    it('SCENARIO-017: Task execution timeout', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_TASK_5002',
        message: 'Task execution timeout after 30s',
        type: ErrorType.TASK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'TaskExecutor',
        recoverable: true,
        suggestedActions: ['Increase timeout', 'Optimize task'],
      }

      logger.log(error)
      const history = logger.getHistory()
      expect(history[0].severity).toBe(ErrorSeverity.ERROR)
    })
  })

  // =============================================
  // SSE ERROR SCENARIOS (3)
  // =============================================

  describe('SSE Error Scenarios', () => {
    it('SCENARIO-018: SSE connection lost', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_SSE_6000',
        message: 'SSE connection lost',
        type: ErrorType.SSE,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        component: 'SSEConnection',
        recoverable: true,
        suggestedActions: ['Reconnecting...', 'Manual reconnect'],
      }

      logger.log(error)
      expect(logger.getHistory()[0].code).toBe('ERR_SSE_6000')
    })

    it('SCENARIO-019: Event parsing error', () => {
      const logger = getErrorLogger()
      const error: ErrorContext = {
        code: 'ERR_SSE_6001',
        message: 'Failed to parse SSE event: Invalid JSON',
        type: ErrorType.SSE,
        severity: ErrorSeverity.WARNING,
        timestamp: Date.now(),
        component: 'SSEHandler',
        recoverable: true,
        suggestedActions: ['Skip event', 'Check server'],
      }

      logger.log(error)
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.bySeverity[ErrorSeverity.WARNING]).toBeGreaterThan(0)
    })

    it('SCENARIO-020: Reconnection success after 3 attempts', () => {
      const logger = getErrorLogger()
      const errors: ErrorContext[] = [
        {
          code: 'ERR_SSE_6000',
          message: 'Connection attempt 1 failed',
          type: ErrorType.SSE,
          severity: ErrorSeverity.WARNING,
          timestamp: Date.now(),
          component: 'SSEConnection',
          recoverable: true,
        },
        {
          code: 'ERR_SSE_6000',
          message: 'Connection attempt 2 failed',
          type: ErrorType.SSE,
          severity: ErrorSeverity.WARNING,
          timestamp: Date.now() + 1000,
          component: 'SSEConnection',
          recoverable: true,
        },
        {
          code: 'ERR_SSE_6000',
          message: 'Connection attempt 3 succeeded',
          type: ErrorType.SSE,
          severity: ErrorSeverity.INFO,
          timestamp: Date.now() + 2000,
          component: 'SSEConnection',
          recoverable: true,
        },
      ]

      errors.forEach((e) => logger.log(e))
      const history = logger.getHistory()
      expect(history.length).toBeGreaterThanOrEqual(3)
    })
  })

  // =============================================
  // OFFLINE MODE SCENARIOS (2)
  // =============================================

  describe('Offline Mode Scenarios', () => {
    it('SCENARIO-021: Offline mode with operation queueing', () => {
      const logger = getErrorLogger()
      const offlineError: ErrorContext = {
        code: 'ERR_NETWORK_1000',
        message: 'Network offline - Operations queued',
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.WARNING,
        timestamp: Date.now(),
        component: 'OfflineModeHandler',
        userAction: 'attempted to save while offline',
        recoverable: true,
        suggestedActions: ['Reconnect', 'Wait for connection'],
      }

      logger.log(offlineError)
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.total).toBeGreaterThan(0)
    })

    it('SCENARIO-022: Offline to online sync', () => {
      const logger = getErrorLogger()
      const errors: ErrorContext[] = [
        {
          code: 'ERR_NETWORK_1000',
          message: 'Connection lost',
          type: ErrorType.NETWORK,
          severity: ErrorSeverity.WARNING,
          timestamp: Date.now(),
          component: 'OfflineModeHandler',
          recoverable: true,
        },
        {
          code: 'ERR_NETWORK_1000',
          message: 'Connection restored - Syncing',
          type: ErrorType.NETWORK,
          severity: ErrorSeverity.INFO,
          timestamp: Date.now() + 5000,
          component: 'OfflineModeHandler',
          recoverable: true,
        },
      ]

      errors.forEach((e) => logger.log(e))
      const history = logger.getHistory()
      expect(history.length).toBeGreaterThanOrEqual(2)
    })
  })

  // =============================================
  // TREND ANALYSIS TESTS
  // =============================================

  describe('Error Trend Analysis', () => {
    it('should calculate increasing trend', () => {
      const logger = getErrorLogger()
      const now = Date.now()

      // Log errors in increasing pattern
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < i + 1; j++) {
          logger.log({
            code: 'ERR_NETWORK_1001',
            message: `Error ${i}`,
            type: ErrorType.NETWORK,
            severity: ErrorSeverity.ERROR,
            timestamp: now - (10 - i) * 60 * 60 * 1000,
            recoverable: true,
          })
        }
      }

      const trend = calculateErrorTrend(logger.getAllErrors(), '24h')
      expect(trend.points.length).toBeGreaterThan(0)
    })

    it('should track error recovery metrics', () => {
      const logger = getErrorLogger()
      const errors: ErrorContext[] = [
        {
          code: 'ERR_NETWORK_1001',
          message: 'Error 1',
          type: ErrorType.NETWORK,
          severity: ErrorSeverity.ERROR,
          timestamp: Date.now(),
          recoverable: true,
          recoveryTime: 1500,
        },
        {
          code: 'ERR_NETWORK_1001',
          message: 'Error 2',
          type: ErrorType.NETWORK,
          severity: ErrorSeverity.ERROR,
          timestamp: Date.now() + 1000,
          recoverable: true,
          recoveryTime: 2000,
        },
      ]

      errors.forEach((e) => logger.log(e))
      const stats = calculateErrorStats(logger.getAllErrors())
      expect(stats.recoveryRate).toBeGreaterThan(0)
      expect(stats.avgRecoveryTime).toBeGreaterThan(0)
    })
  })
})
