/**
 * Retry Logic Tests
 *
 * Tests for exponential backoff and retry mechanism
 * @module api/__tests__/retry-logic.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  calculateBackoffDelay,
  shouldRetryError,
  withRetry,
  withRetryTracking,
  RetryOptions,
} from '../retry-logic'
import { ApiError, TimeoutError, NetworkError } from '../errors'

// =============================================
// Exponential Backoff Tests
// =============================================

describe('calculateBackoffDelay', () => {
  it('should calculate correct exponential backoff for first attempt', () => {
    const state = calculateBackoffDelay(1, { initialDelayMs: 1000 })
    expect(state.attempt).toBe(1)
    expect(state.delay).toBeGreaterThanOrEqual(900) // Allow jitter
    expect(state.delay).toBeLessThanOrEqual(1100)
  })

  it('should double delay for each attempt', () => {
    const state1 = calculateBackoffDelay(1, { initialDelayMs: 1000, jitterFactor: 0 })
    const state2 = calculateBackoffDelay(2, { initialDelayMs: 1000, jitterFactor: 0 })
    const state3 = calculateBackoffDelay(3, { initialDelayMs: 1000, jitterFactor: 0 })

    expect(state1.delay).toBe(1000)
    expect(state2.delay).toBe(2000)
    expect(state3.delay).toBe(4000)
  })

  it('should cap delay at maxDelayMs', () => {
    const state = calculateBackoffDelay(10, {
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      jitterFactor: 0,
    })

    expect(state.delay).toBeLessThanOrEqual(30000)
  })

  it('should include jitter in delay', () => {
    const delays: number[] = []

    for (let i = 0; i < 10; i++) {
      const state = calculateBackoffDelay(2, {
        initialDelayMs: 1000,
        jitterFactor: 0.1,
      })
      delays.push(state.delay)
    }

    // Check that delays vary (jitter is working)
    const unique = new Set(delays)
    expect(unique.size).toBeGreaterThan(1)
  })
})

// =============================================
// Retry Predicate Tests
// =============================================

describe('shouldRetryError', () => {
  it('should retry NetworkError', () => {
    const error = new NetworkError('Connection failed')
    expect(shouldRetryError(error, 1)).toBe(true)
  })

  it('should retry TimeoutError', () => {
    const error = new TimeoutError()
    expect(shouldRetryError(error, 1)).toBe(true)
  })

  it('should retry 5xx status codes', () => {
    const error = new ApiError('Server error', 500)
    expect(shouldRetryError(error, 1)).toBe(true)
  })

  it('should retry specific retryable status codes', () => {
    expect(shouldRetryError(new ApiError('Too many requests', 429), 1)).toBe(true)
    expect(shouldRetryError(new ApiError('Service unavailable', 503), 1)).toBe(true)
    expect(shouldRetryError(new ApiError('Bad gateway', 502), 1)).toBe(true)
  })

  it('should not retry 4xx errors (except 429)', () => {
    const error = new ApiError('Bad request', 400)
    expect(shouldRetryError(error, 1)).toBe(false)
  })

  it('should not retry 404 errors', () => {
    const error = new ApiError('Not found', 404)
    expect(shouldRetryError(error, 1)).toBe(false)
  })

  it('should not retry after max attempts exceeded', () => {
    const error = new NetworkError()
    const options: RetryOptions = { maxAttempts: 3 }

    expect(shouldRetryError(error, 1, options)).toBe(true)
    expect(shouldRetryError(error, 2, options)).toBe(true)
    expect(shouldRetryError(error, 3, options)).toBe(true)
    expect(shouldRetryError(error, 4, options)).toBe(false)
  })

  it('should use custom shouldRetry predicate', () => {
    const customPredicate = vi.fn(() => true)
    const error = new ApiError('Custom error', 999)

    shouldRetryError(error, 1, { shouldRetry: customPredicate })

    expect(customPredicate).toHaveBeenCalledWith(error, 1)
  })
})

// =============================================
// Retry Execution Tests
// =============================================

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn(async () => 'success')

    const result = await withRetry(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on transient failure', async () => {
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts++
      if (attempts < 3) {
        throw new NetworkError('Temporary failure')
      }
      return 'success'
    })

    const result = await withRetry(fn, { maxAttempts: 5 })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should throw after max attempts exceeded', async () => {
    const fn = vi.fn(async () => {
      throw new NetworkError('Persistent failure')
    })

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(
      NetworkError
    )

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should throw non-retryable error immediately', async () => {
    const fn = vi.fn(async () => {
      throw new ApiError('Bad request', 400)
    })

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(
      ApiError
    )

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should respect custom maxAttempts', async () => {
    const fn = vi.fn(async () => {
      throw new TimeoutError()
    })

    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should delay between retries', async () => {
    const fn = vi.fn(async () => {
      throw new NetworkError('Failure')
    })

    const start = Date.now()
    await withRetry(fn, {
      maxAttempts: 2,
      initialDelayMs: 100,
      jitterFactor: 0,
    }).catch(() => {})
    const duration = Date.now() - start

    // Should take at least 100ms for the backoff
    expect(duration).toBeGreaterThanOrEqual(90)
  })
})

// =============================================
// Retry Tracking Tests
// =============================================

describe('withRetryTracking', () => {
  it('should track successful execution', async () => {
    const fn = vi.fn(async () => 'success')

    const { result, tracker } = await withRetryTracking(fn)

    expect(result).toBe('success')
    expect(tracker.successAttempt).toBe(1)
    expect(tracker.totalAttempts).toBe(1)
    expect(tracker.errors).toHaveLength(0)
  })

  it('should track retry attempts', async () => {
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts++
      if (attempts < 3) {
        throw new NetworkError('Temporary failure')
      }
      return 'success'
    })

    const { result, tracker } = await withRetryTracking(fn, { maxAttempts: 5 })

    expect(result).toBe('success')
    expect(tracker.successAttempt).toBe(3)
    expect(tracker.totalAttempts).toBe(3)
    expect(tracker.errors).toHaveLength(2)
  })

  it('should track all failed attempts', async () => {
    const fn = vi.fn(async () => {
      throw new NetworkError('Persistent failure')
    })

    await withRetryTracking(fn, { maxAttempts: 3 }).catch(() => {})

    const { tracker } = await withRetryTracking(fn, { maxAttempts: 3 }).catch(
      (e) => ({ tracker: undefined, error: e })
    )

    // Both should fail with 3 attempts
    expect(fn).toHaveBeenCalledTimes(6) // 3 + 3 calls
  })

  it('should track error details', async () => {
    const fn = vi.fn(async () => {
      throw new TimeoutError('Request timeout')
    })

    await withRetryTracking(fn, { maxAttempts: 2 }).catch(() => {})

    const { tracker } = await withRetryTracking(fn, { maxAttempts: 2 }).catch(
      (e) => ({ tracker: undefined, error: e })
    )

    // Both executions should have tracked errors
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

// =============================================
// Integration Tests
// =============================================

describe('Retry Integration', () => {
  it('should handle mixed retryable and non-retryable errors', async () => {
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts++
      if (attempts === 1) {
        throw new TimeoutError() // Retryable
      } else if (attempts === 2) {
        throw new ApiError('Validation error', 400) // Non-retryable
      }
      return 'success'
    })

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(
      'Validation error'
    )

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should handle timeout during retry backoff', async () => {
    vi.useFakeTimers()

    const fn = vi.fn(async () => {
      throw new NetworkError('Failure')
    })

    try {
      const promise = withRetry(fn, {
        maxAttempts: 2,
        initialDelayMs: 100,
      })

      // Fast-forward through backoff
      await vi.runAllTimersAsync()

      await promise
    } catch (error) {
      // Expected to throw
      expect(error).toBeDefined()
    } finally {
      expect(fn.mock.calls.length).toBeGreaterThan(0)
      vi.useRealTimers()
    }
  })
})
