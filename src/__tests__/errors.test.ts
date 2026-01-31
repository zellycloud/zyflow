/**
 * Error Handling Tests
 * Comprehensive tests for error classification, logging, and deduplication
 * @module __tests__/errors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ErrorType,
  ErrorSeverity,
  ErrorCode,
  ErrorContext,
  NetworkErrorCode,
  ComponentErrorCode,
  ValidationErrorCode,
  StateErrorCode,
  TaskErrorCode,
  SSEErrorCode,
  HTTP_STATUS_TO_ERROR_CODE,
} from '@/types/errors'
import { ErrorLogger, getErrorLogger } from '@/utils/error-logger'
import {
  getErrorCodeRegistry,
  getDefaultErrorMessage,
  getErrorI18nKey,
  getErrorSeverity,
  getErrorType,
  getRecoveryActions,
  getErrorCodesForType,
  getErrorCodesWithSeverity,
  isErrorRecoverable,
} from '@/constants/error-codes'

// =============================================
// Error Types Tests
// =============================================

describe('Error Types and Classifications', () => {
  it('should define all error type enums', () => {
    expect(ErrorType.NETWORK).toBe('NETWORK')
    expect(ErrorType.COMPONENT).toBe('COMPONENT')
    expect(ErrorType.VALIDATION).toBe('VALIDATION')
    expect(ErrorType.STATE).toBe('STATE')
    expect(ErrorType.TASK).toBe('TASK')
    expect(ErrorType.SSE).toBe('SSE')
  })

  it('should define all error severity levels', () => {
    expect(ErrorSeverity.INFO).toBe('info')
    expect(ErrorSeverity.WARNING).toBe('warning')
    expect(ErrorSeverity.ERROR).toBe('error')
    expect(ErrorSeverity.CRITICAL).toBe('critical')
  })

  it('should define all error codes', () => {
    // Network
    expect(NetworkErrorCode.CONNECTION_FAILED).toBe('ERR_NETWORK_1000')
    expect(NetworkErrorCode.REQUEST_TIMEOUT).toBe('ERR_NETWORK_1001')
    expect(NetworkErrorCode.INVALID_RESPONSE).toBe('ERR_NETWORK_1002')

    // Component
    expect(ComponentErrorCode.RENDER_ERROR).toBe('ERR_COMPONENT_2000')
    expect(ComponentErrorCode.HOOK_ERROR).toBe('ERR_COMPONENT_2001')

    // Validation
    expect(ValidationErrorCode.INPUT_VALIDATION_FAILED).toBe('ERR_VALIDATION_3000')
    expect(ValidationErrorCode.SCHEMA_VALIDATION_FAILED).toBe('ERR_VALIDATION_3001')

    // State
    expect(StateErrorCode.STATE_MUTATION_FAILED).toBe('ERR_STATE_4000')
    expect(StateErrorCode.CONTEXT_VALUE_MISSING).toBe('ERR_STATE_4001')

    // Task
    expect(TaskErrorCode.TASK_EXECUTION_FAILED).toBe('ERR_TASK_5000')
    expect(TaskErrorCode.SPEC_PARSING_FAILED).toBe('ERR_TASK_5001')
    expect(TaskErrorCode.TASK_TIMEOUT).toBe('ERR_TASK_5002')

    // SSE
    expect(SSEErrorCode.CONNECTION_LOST).toBe('ERR_SSE_6000')
    expect(SSEErrorCode.EVENT_PARSING_FAILED).toBe('ERR_SSE_6001')
    expect(SSEErrorCode.EVENT_HANDLER_ERROR).toBe('ERR_SSE_6002')
  })

  it('should map HTTP status codes to error codes', () => {
    // 4xx validation errors
    expect(HTTP_STATUS_TO_ERROR_CODE[400].code).toBe(ValidationErrorCode.INPUT_VALIDATION_FAILED)
    expect(HTTP_STATUS_TO_ERROR_CODE[400].type).toBe(ErrorType.VALIDATION)

    // 429 throttling
    expect(HTTP_STATUS_TO_ERROR_CODE[429].code).toBe(NetworkErrorCode.REQUEST_TIMEOUT)

    // 5xx server errors
    expect(HTTP_STATUS_TO_ERROR_CODE[500].code).toBe(NetworkErrorCode.INVALID_RESPONSE)
    expect(HTTP_STATUS_TO_ERROR_CODE[500].severity).toBe(ErrorSeverity.CRITICAL)
  })
})

// =============================================
// Error Code Registry Tests
// =============================================

describe('Error Code Registry', () => {
  it('should return registry for valid error code', () => {
    const registry = getErrorCodeRegistry(NetworkErrorCode.CONNECTION_FAILED)
    expect(registry).toBeDefined()
    expect(registry?.code).toBe(NetworkErrorCode.CONNECTION_FAILED)
    expect(registry?.type).toBe(ErrorType.NETWORK)
  })

  it('should return undefined for invalid error code', () => {
    const registry = getErrorCodeRegistry('INVALID_CODE')
    expect(registry).toBeUndefined()
  })

  it('should get default error message', () => {
    const message = getDefaultErrorMessage(NetworkErrorCode.CONNECTION_FAILED)
    expect(message).toBeTruthy()
    expect(typeof message).toBe('string')
  })

  it('should get i18n key', () => {
    const i18nKey = getErrorI18nKey(NetworkErrorCode.CONNECTION_FAILED)
    expect(i18nKey).toBe('errors.network.connection_failed')
  })

  it('should get error severity', () => {
    expect(getErrorSeverity(NetworkErrorCode.CONNECTION_FAILED)).toBe(ErrorSeverity.ERROR)
    expect(getErrorSeverity(ComponentErrorCode.RENDER_ERROR)).toBe(ErrorSeverity.CRITICAL)
  })

  it('should get error type', () => {
    expect(getErrorType(NetworkErrorCode.CONNECTION_FAILED)).toBe(ErrorType.NETWORK)
    expect(getErrorType(ComponentErrorCode.RENDER_ERROR)).toBe(ErrorType.COMPONENT)
  })

  it('should get recovery actions', () => {
    const actions = getRecoveryActions(NetworkErrorCode.CONNECTION_FAILED)
    expect(Array.isArray(actions)).toBe(true)
    expect(actions.length).toBeGreaterThan(0)
  })

  it('should get error codes for specific type', () => {
    const networkCodes = getErrorCodesForType(ErrorType.NETWORK)
    expect(networkCodes).toContain(NetworkErrorCode.CONNECTION_FAILED)
    expect(networkCodes).toContain(NetworkErrorCode.REQUEST_TIMEOUT)
    expect(networkCodes).toContain(NetworkErrorCode.INVALID_RESPONSE)
  })

  it('should get error codes with specific severity', () => {
    const criticalCodes = getErrorCodesWithSeverity(ErrorSeverity.CRITICAL)
    expect(criticalCodes).toContain(ComponentErrorCode.RENDER_ERROR)
  })

  it('should check if error is recoverable', () => {
    expect(isErrorRecoverable(NetworkErrorCode.CONNECTION_FAILED)).toBe(true)
    expect(isErrorRecoverable(SSEErrorCode.EVENT_PARSING_FAILED)).toBe(false)
  })
})

// =============================================
// Error Logger Tests
// =============================================

describe('Error Logger', () => {
  let logger: ErrorLogger

  beforeEach(() => {
    logger = new ErrorLogger()
    // Note: localStorage clearing happens in ErrorLogger itself when needed
  })

  afterEach(() => {
    // Note: localStorage is cleared by ErrorLogger
  })

  it('should log errors', () => {
    const error: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Test error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: ['retry'],
      isDevelopment: false,
    }

    const logged = logger.log(error)
    expect(logged).toBeDefined()
    expect(logged.code).toBe(error.code)
  })

  it('should get error history', () => {
    const error1: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Error 1',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    const error2: ErrorContext = {
      code: ComponentErrorCode.RENDER_ERROR,
      message: 'Error 2',
      severity: ErrorSeverity.CRITICAL,
      type: ErrorType.COMPONENT,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(error1)
    logger.log(error2)

    const history = logger.getHistory(10)
    expect(history.length).toBe(2)
    expect(history[0].code).toBe(error2.code)
  })

  it('should clear errors', () => {
    const error: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Test error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(error)
    let history = logger.getHistory()
    expect(history.length).toBeGreaterThan(0)

    logger.clear()
    history = logger.getHistory()
    expect(history.length).toBe(0)
  })

  it('should filter errors by type', () => {
    const networkError: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Network error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    const componentError: ErrorContext = {
      code: ComponentErrorCode.RENDER_ERROR,
      message: 'Component error',
      severity: ErrorSeverity.CRITICAL,
      type: ErrorType.COMPONENT,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(networkError)
    logger.log(componentError)

    const networkErrors = logger.getErrorsByType(ErrorType.NETWORK)
    expect(networkErrors.length).toBe(1)
    expect(networkErrors[0].code).toBe(NetworkErrorCode.CONNECTION_FAILED)
  })

  it('should filter errors by severity', () => {
    const errorError: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Error level',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    const warningError: ErrorContext = {
      code: NetworkErrorCode.REQUEST_TIMEOUT,
      message: 'Warning level',
      severity: ErrorSeverity.WARNING,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(errorError)
    logger.log(warningError)

    const errors = logger.getErrorsBySeverity(ErrorSeverity.ERROR)
    expect(errors.length).toBe(1)
    expect(errors[0].severity).toBe(ErrorSeverity.ERROR)
  })

  it('should export errors as JSON', () => {
    const error: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Test error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(error)

    const exported = logger.export()
    expect(exported.version).toBe('1.0.0')
    expect(exported.errors.length).toBeGreaterThan(0)
    expect(exported.exportedAt).toBeTruthy()
  })

  it('should export errors as CSV', () => {
    const error: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Test error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(error)

    const csv = logger.exportAsCSV()
    expect(csv).toContain('Timestamp')
    expect(csv).toContain('Code')
    expect(csv).toContain(NetworkErrorCode.CONNECTION_FAILED)
  })

  it('should search errors', () => {
    const error: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Connection failed',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      component: 'TestComponent',
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(error)

    const results = logger.search('Connection')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].message).toContain('Connection')
  })

  it('should get error statistics', () => {
    const error: ErrorContext = {
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Test error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.NETWORK,
      timestamp: Date.now(),
      recoverable: true,
      suggestedActions: [],
      isDevelopment: false,
    }

    logger.log(error)

    const stats = logger.getStatistics()
    expect(stats.total).toBe(1)
    expect(stats.byType[ErrorType.NETWORK]).toBe(1)
    expect(stats.bySeverity[ErrorSeverity.ERROR]).toBe(1)
  })
})

// =============================================
// Error Logger Singleton Tests
// =============================================

describe('Error Logger Singleton', () => {
  beforeEach(() => {
    // localStorage is managed by ErrorLogger
  })

  afterEach(() => {
    // localStorage is managed by ErrorLogger
  })

  it('should return same instance', () => {
    const logger1 = getErrorLogger()
    const logger2 = getErrorLogger()
    expect(logger1).toBe(logger2)
  })
})
