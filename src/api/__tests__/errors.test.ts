/**
 * API Error Tests
 *
 * Tests for custom error classes and error utilities
 */

import { describe, it, expect } from 'vitest'
import {
  ApiError,
  TimeoutError,
  NetworkError,
  ValidationError,
  isApiError,
  isTimeoutError,
  isNetworkError,
  isValidationError,
  getErrorMessage,
  getErrorCode,
} from '../errors'

describe('API Errors', () => {
  describe('ApiError', () => {
    it('should create ApiError with message and status', () => {
      const error = new ApiError('Test error', 400, 'TEST_ERROR', { field: 'invalid' })

      expect(error.message).toBe('Test error')
      expect(error.status).toBe(400)
      expect(error.code).toBe('TEST_ERROR')
      expect(error.details).toEqual({ field: 'invalid' })
      expect(error.name).toBe('ApiError')
    })

    it('should preserve error prototype chain', () => {
      const error = new ApiError('Test', 500)
      expect(error instanceof ApiError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })

    it('should convert to JSON', () => {
      const error = new ApiError('Test error', 400, 'TEST', { data: 'value' })
      const json = error.toJSON()

      expect(json).toEqual({
        name: 'ApiError',
        message: 'Test error',
        status: 400,
        code: 'TEST',
        details: { data: 'value' },
      })
    })
  })

  describe('TimeoutError', () => {
    it('should create TimeoutError with default message', () => {
      const error = new TimeoutError()

      expect(error.message).toBe('Request timeout')
      expect(error.status).toBe(408)
      expect(error.code).toBe('TIMEOUT')
      expect(error.name).toBe('TimeoutError')
    })

    it('should create TimeoutError with custom message', () => {
      const error = new TimeoutError('Custom timeout message')

      expect(error.message).toBe('Custom timeout message')
      expect(error.status).toBe(408)
    })

    it('should preserve error prototype chain', () => {
      const error = new TimeoutError()
      expect(error instanceof TimeoutError).toBe(true)
      expect(error instanceof ApiError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('NetworkError', () => {
    it('should create NetworkError with default message', () => {
      const error = new NetworkError()

      expect(error.message).toBe('Network error')
      expect(error.status).toBe(0)
      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.name).toBe('NetworkError')
    })

    it('should store original error', () => {
      const originalError = new Error('Connection refused')
      const error = new NetworkError('Connection failed', originalError)

      expect(error.originalError).toBe(originalError)
      expect(error.originalError?.message).toBe('Connection refused')
    })

    it('should preserve error prototype chain', () => {
      const error = new NetworkError()
      expect(error instanceof NetworkError).toBe(true)
      expect(error instanceof ApiError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('ValidationError', () => {
    it('should create ValidationError with validation errors', () => {
      const validationErrors = {
        email: ['Invalid email format'],
        password: ['Password must be at least 8 characters'],
      }
      const error = new ValidationError('Validation failed', validationErrors)

      expect(error.message).toBe('Validation failed')
      expect(error.status).toBe(400)
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.validationErrors).toEqual(validationErrors)
      expect(error.name).toBe('ValidationError')
    })

    it('should create ValidationError without validation errors', () => {
      const error = new ValidationError('Validation failed')

      expect(error.message).toBe('Validation failed')
      expect(error.validationErrors).toBeUndefined()
    })

    it('should preserve error prototype chain', () => {
      const error = new ValidationError('Test')
      expect(error instanceof ValidationError).toBe(true)
      expect(error instanceof ApiError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('Type Guards', () => {
    describe('isApiError', () => {
      it('should return true for ApiError', () => {
        const error = new ApiError('Test', 400)
        expect(isApiError(error)).toBe(true)
      })

      it('should return true for TimeoutError', () => {
        const error = new TimeoutError()
        expect(isApiError(error)).toBe(true)
      })

      it('should return true for NetworkError', () => {
        const error = new NetworkError()
        expect(isApiError(error)).toBe(true)
      })

      it('should return true for ValidationError', () => {
        const error = new ValidationError('Test')
        expect(isApiError(error)).toBe(true)
      })

      it('should return false for regular Error', () => {
        const error = new Error('Test')
        expect(isApiError(error)).toBe(false)
      })

      it('should return false for non-error objects', () => {
        expect(isApiError('string')).toBe(false)
        expect(isApiError(123)).toBe(false)
        expect(isApiError(null)).toBe(false)
        expect(isApiError(undefined)).toBe(false)
      })
    })

    describe('isTimeoutError', () => {
      it('should return true for TimeoutError', () => {
        const error = new TimeoutError()
        expect(isTimeoutError(error)).toBe(true)
      })

      it('should return false for other errors', () => {
        expect(isTimeoutError(new ApiError('Test', 400))).toBe(false)
        expect(isTimeoutError(new NetworkError())).toBe(false)
        expect(isTimeoutError(new Error('Test'))).toBe(false)
      })
    })

    describe('isNetworkError', () => {
      it('should return true for NetworkError', () => {
        const error = new NetworkError()
        expect(isNetworkError(error)).toBe(true)
      })

      it('should return false for other errors', () => {
        expect(isNetworkError(new ApiError('Test', 400))).toBe(false)
        expect(isNetworkError(new TimeoutError())).toBe(false)
        expect(isNetworkError(new Error('Test'))).toBe(false)
      })
    })

    describe('isValidationError', () => {
      it('should return true for ValidationError', () => {
        const error = new ValidationError('Test')
        expect(isValidationError(error)).toBe(true)
      })

      it('should return false for other errors', () => {
        expect(isValidationError(new ApiError('Test', 400))).toBe(false)
        expect(isValidationError(new TimeoutError())).toBe(false)
        expect(isValidationError(new Error('Test'))).toBe(false)
      })
    })
  })

  describe('Utility Functions', () => {
    describe('getErrorMessage', () => {
      it('should return message from ApiError', () => {
        const error = new ApiError('API failed', 500)
        expect(getErrorMessage(error)).toBe('API failed')
      })

      it('should return message from regular Error', () => {
        const error = new Error('Something went wrong')
        expect(getErrorMessage(error)).toBe('Something went wrong')
      })

      it('should return string representation of non-error objects', () => {
        expect(getErrorMessage('string error')).toBe('string error')
        expect(getErrorMessage(123)).toBe('123')
      })

      it('should handle null and undefined', () => {
        expect(getErrorMessage(null)).toBe('null')
        expect(getErrorMessage(undefined)).toBe('undefined')
      })
    })

    describe('getErrorCode', () => {
      it('should return code from ApiError', () => {
        const error = new ApiError('Test', 400, 'CUSTOM_CODE')
        expect(getErrorCode(error)).toBe('CUSTOM_CODE')
      })

      it('should return API_ERROR for ApiError without code', () => {
        const error = new ApiError('Test', 400)
        expect(getErrorCode(error)).toBe('API_ERROR')
      })

      it('should return TIMEOUT for TimeoutError', () => {
        const error = new TimeoutError()
        expect(getErrorCode(error)).toBe('TIMEOUT')
      })

      it('should return error name for regular Error', () => {
        const error = new Error('Test')
        expect(getErrorCode(error)).toBe('Error')
      })

      it('should return UNKNOWN_ERROR for non-error objects', () => {
        expect(getErrorCode('string')).toBe('UNKNOWN_ERROR')
        expect(getErrorCode(123)).toBe('UNKNOWN_ERROR')
        expect(getErrorCode(null)).toBe('UNKNOWN_ERROR')
      })
    })
  })
})
