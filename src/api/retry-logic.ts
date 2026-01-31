/**
 * Retry Logic with Exponential Backoff
 *
 * Implements exponential backoff retry strategy for API requests
 * - 1st retry: 1 second
 * - 2nd retry: 2 seconds
 * - 3rd retry: 4 seconds
 * - 4th retry: 8 seconds
 * - 5th retry: 16 seconds (max 30 seconds)
 *
 * @module api/retry-logic
 */

import { ApiError, TimeoutError, NetworkError } from './errors'

// =============================================
// Types
// =============================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number
  /** Jitter percentage for exponential backoff (default: 0.1 = 10%) */
  jitterFactor?: number
  /** HTTP status codes to retry on (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatusCodes?: number[]
  /** Custom retry predicate function */
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

export interface RetryState {
  attempt: number
  delay: number
  totalDelay: number
}

// =============================================
// Default Configuration
// =============================================

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_INITIAL_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30000
const DEFAULT_JITTER_FACTOR = 0.1
const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

// =============================================
// Retry Logic Implementation
// =============================================

/**
 * Calculate exponential backoff delay with jitter
 *
 * Formula: min(initialDelay * 2^(attempt-1) + jitter, maxDelay)
 */
export function calculateBackoffDelay(
  attempt: number,
  options: RetryOptions = {}
): RetryState {
  const initialDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const jitterFactor = options.jitterFactor ?? DEFAULT_JITTER_FACTOR

  // Calculate exponential backoff: initialDelay * 2^(attempt - 1)
  const exponentialDelay = initialDelay * Math.pow(2, attempt - 1)

  // Add jitter: ±10% of the calculated delay
  const jitter = exponentialDelay * jitterFactor * (Math.random() - 0.5) * 2
  const delayWithJitter = exponentialDelay + jitter

  // Cap at max delay
  const finalDelay = Math.min(Math.max(delayWithJitter, 0), maxDelay)

  return {
    attempt,
    delay: finalDelay,
    totalDelay: finalDelay * attempt, // Approximation
  }
}

/**
 * Determine if an error should trigger a retry
 */
export function shouldRetryError(
  error: unknown,
  attempt: number,
  options: RetryOptions = {}
): boolean {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  // Stop retrying if max attempts reached
  if (attempt > maxAttempts) {
    return false
  }

  // Use custom retry predicate if provided
  if (options.shouldRetry) {
    return options.shouldRetry(error, attempt)
  }

  // Network errors are always retryable
  if (error instanceof NetworkError) {
    return true
  }

  // Timeout errors are retryable
  if (error instanceof TimeoutError) {
    return true
  }

  // API errors with retryable status codes are retryable
  if (error instanceof ApiError) {
    const retryableStatuses =
      options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES
    return retryableStatuses.includes(error.status)
  }

  // Other errors are not retried
  return false
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if we should retry
      if (!shouldRetryError(error, attempt, options)) {
        throw error
      }

      // Calculate backoff delay
      if (attempt < maxAttempts) {
        const backoffState = calculateBackoffDelay(attempt, options)
        await sleep(backoffState.delay)
      }
    }
  }

  // All retries exhausted
  throw lastError
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================
// Public Retry Hook
// =============================================

/**
 * Create a retry-enabled request function
 */
export function createRetryableRequest<T>(
  requestFn: () => Promise<T>,
  options: RetryOptions = {}
) {
  return () => withRetry(() => requestFn(), options)
}

// =============================================
// Retry State Tracker (for observability)
// =============================================

export interface RetryTracker {
  totalAttempts: number
  successAttempt?: number
  errors: Array<{ attempt: number; error: unknown; delay: number }>
}

/**
 * Execute function with retry tracking
 */
export async function withRetryTracking<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; tracker: RetryTracker }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const tracker: RetryTracker = {
    totalAttempts: 0,
    errors: [],
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    tracker.totalAttempts = attempt

    try {
      const result = await fn()
      tracker.successAttempt = attempt
      return { result, tracker }
    } catch (error) {
      const backoffState = calculateBackoffDelay(attempt, options)
      tracker.errors.push({
        attempt,
        error,
        delay: backoffState.delay,
      })

      // Check if we should retry
      if (!shouldRetryError(error, attempt, options)) {
        throw error
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        await sleep(backoffState.delay)
      }
    }
  }

  // All retries exhausted - throw last error
  const lastError = tracker.errors[tracker.errors.length - 1]?.error
  throw lastError ?? new Error('Unknown error after retries')
}
