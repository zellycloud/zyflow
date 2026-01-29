/**
 * API Error Handling
 *
 * Custom error classes for API-specific errors
 */

/**
 * Base API Error class
 * Extends Error to provide structured API error information
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
    }
  }
}

/**
 * Timeout error for API requests that exceed the timeout limit
 */
export class TimeoutError extends ApiError {
  constructor(message = 'Request timeout') {
    super(message, 408, 'TIMEOUT')
    this.name = 'TimeoutError'
    Object.setPrototypeOf(this, TimeoutError.prototype)
  }
}

/**
 * Network error for connectivity issues
 */
export class NetworkError extends ApiError {
  constructor(message = 'Network error', public originalError?: Error) {
    super(message, 0, 'NETWORK_ERROR')
    this.name = 'NetworkError'
    Object.setPrototypeOf(this, NetworkError.prototype)
  }
}

/**
 * Validation error for request validation failures
 */
export class ValidationError extends ApiError {
  constructor(message: string, public validationErrors?: Record<string, string[]>) {
    super(message, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Type guard to check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError
}

/**
 * Type guard to check if an error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * Get error code for logging/tracking
 */
export function getErrorCode(error: unknown): string {
  if (isApiError(error)) {
    return error.code || 'API_ERROR'
  }

  if (error instanceof Error) {
    return error.name
  }

  return 'UNKNOWN_ERROR'
}
