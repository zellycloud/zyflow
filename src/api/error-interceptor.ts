/**
 * API Error Interceptor
 *
 * Handles request/response interception, error classification,
 * retry logic, and logging with sensitive data filtering
 *
 * @module api/error-interceptor
 */

import { withRetry, RetryOptions } from './retry-logic'
import { getErrorLogger } from '@/utils/error-logger'
import { useErrorStore_addError } from '@/stores/errorStore'
import { ApiError, TimeoutError, NetworkError } from './errors'
import { ErrorContext, ErrorSeverity, ErrorType } from '@/types/errors'

// =============================================
// Types
// =============================================

export interface RequestContext {
  url: string
  method: string
  headers?: Record<string, string>
  body?: unknown
  timestamp: number
}

export interface ResponseContext {
  status: number
  statusText: string
  headers?: Record<string, string>
  body?: unknown
  timestamp: number
  duration: number
}

export interface InterceptorOptions {
  /** Enable request logging (default: true) */
  logRequests?: boolean
  /** Enable response logging (default: true) */
  logResponses?: boolean
  /** Enable error logging to store (default: true) */
  logToStore?: boolean
  /** Retry options */
  retry?: RetryOptions
  /** Sensitive headers to redact (default: ['authorization', 'x-api-key']) */
  sensitiveHeaders?: string[]
  /** Sensitive body fields to redact (default: ['password', 'token', 'apiKey', 'secret']) */
  sensitiveBodyFields?: string[]
}

// =============================================
// Default Configuration
// =============================================

const DEFAULT_SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie']
const DEFAULT_SENSITIVE_BODY_FIELDS = ['password', 'token', 'apiKey', 'secret', 'accessToken']

// =============================================
// Sensitive Data Filtering
// =============================================

/**
 * Redact sensitive headers
 */
function redactHeaders(
  headers?: Record<string, string>,
  sensitiveHeaders: string[] = DEFAULT_SENSITIVE_HEADERS
): Record<string, string> {
  if (!headers) return {}

  const redacted = { ...headers }
  const lowerSensitiveHeaders = sensitiveHeaders.map((h) => h.toLowerCase())

  Object.keys(redacted).forEach((key) => {
    if (lowerSensitiveHeaders.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]'
    }
  })

  return redacted
}

/**
 * Redact sensitive fields in object
 */
function redactObjectFields(
  obj: unknown,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_BODY_FIELDS
): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  const lowerSensitiveFields = sensitiveFields.map((f) => f.toLowerCase())

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObjectFields(item, sensitiveFields))
  }

  const redacted = { ...obj }
  Object.keys(redacted).forEach((key) => {
    const lowerKey = key.toLowerCase()
    if (lowerSensitiveFields.includes(lowerKey)) {
      redacted[key] = '[REDACTED]'
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactObjectFields(redacted[key], sensitiveFields)
    }
  })

  return redacted
}

/**
 * Create safe version of request context for logging
 */
function createSafeRequestContext(
  context: RequestContext,
  options: InterceptorOptions = {}
): RequestContext {
  const { sensitiveHeaders = DEFAULT_SENSITIVE_HEADERS, sensitiveBodyFields = DEFAULT_SENSITIVE_BODY_FIELDS } = options

  return {
    ...context,
    headers: redactHeaders(context.headers, sensitiveHeaders),
    body: redactObjectFields(context.body, sensitiveBodyFields),
  }
}

/**
 * Classify HTTP error based on status code
 */
function classifyHttpError(status: number): { type: ErrorType; severity: ErrorSeverity } {
  if (status >= 400 && status < 500) {
    // 4xx errors are validation errors
    if (status === 401 || status === 403) {
      return { type: 'NetworkError', severity: ErrorSeverity.ERROR }
    }
    return { type: 'ValidationError', severity: ErrorSeverity.WARNING }
  }

  if (status >= 500) {
    // 5xx errors are server errors
    return { type: 'NetworkError', severity: ErrorSeverity.ERROR }
  }

  return { type: 'NetworkError', severity: ErrorSeverity.WARNING }
}

/**
 * Create error context from API error
 */
function createErrorContextFromApiError(
  error: ApiError,
  requestContext: RequestContext,
  responseContext?: ResponseContext
): ErrorContext {
  const { type, severity } = classifyHttpError(error.status)

  return {
    code: error.code || `ERR_HTTP_${error.status}`,
    message: error.message,
    type,
    severity,
    timestamp: Date.now(),
    userAction: `API call to ${requestContext.method} ${requestContext.url}`,
    recoverable: error.status < 500 || error.status === 503 || error.status === 502,
    suggestedActions: [
      error.status < 500 ? 'Check input parameters and try again' : 'Try again after a moment',
    ],
    isDevelopment: false,
  }
}

/**
 * Create error context from timeout error
 */
function createErrorContextFromTimeoutError(
  error: TimeoutError,
  requestContext: RequestContext
): ErrorContext {
  return {
    code: 'ERR_REQUEST_TIMEOUT',
    message: `Request timeout: ${requestContext.method} ${requestContext.url}`,
    type: 'NetworkError',
    severity: ErrorSeverity.WARNING,
    timestamp: Date.now(),
    userAction: `API call to ${requestContext.method} ${requestContext.url}`,
    recoverable: true,
    suggestedActions: ['Retry the request', 'Check your network connection'],
    isDevelopment: false,
  }
}

/**
 * Create error context from network error
 */
function createErrorContextFromNetworkError(
  error: NetworkError,
  requestContext: RequestContext
): ErrorContext {
  return {
    code: 'ERR_NETWORK',
    message: `Network error: ${error.message}`,
    type: 'NetworkError',
    severity: ErrorSeverity.ERROR,
    timestamp: Date.now(),
    userAction: `API call to ${requestContext.method} ${requestContext.url}`,
    recoverable: true,
    suggestedActions: ['Check your internet connection', 'Retry the request'],
    isDevelopment: false,
  }
}

// =============================================
// Interceptor Implementation
// =============================================

export class RequestInterceptor {
  private options: InterceptorOptions

  constructor(options: InterceptorOptions = {}) {
    this.options = {
      logRequests: options.logRequests !== false,
      logResponses: options.logResponses !== false,
      logToStore: options.logToStore !== false,
      sensitiveHeaders: options.sensitiveHeaders ?? DEFAULT_SENSITIVE_HEADERS,
      sensitiveBodyFields: options.sensitiveBodyFields ?? DEFAULT_SENSITIVE_BODY_FIELDS,
      ...options,
    }
  }

  /**
   * Log request (with sensitive data filtering)
   */
  private logRequest(context: RequestContext): void {
    if (!this.options.logRequests) return

    const safeContext = createSafeRequestContext(context, this.options)
    getErrorLogger().log({
      code: 'API_REQUEST',
      message: `${context.method} ${context.url}`,
      type: 'NetworkError',
      severity: ErrorSeverity.INFO,
      timestamp: context.timestamp,
      userAction: `API call to ${context.method} ${context.url}`,
      recoverable: false,
      suggestedActions: [],
      isDevelopment: false,
      requestData: safeContext,
    })
  }

  /**
   * Log response (with sensitive data filtering)
   */
  private logResponse(
    requestContext: RequestContext,
    responseContext: ResponseContext
  ): void {
    if (!this.options.logResponses) return

    const safeRequestContext = createSafeRequestContext(requestContext, this.options)
    getErrorLogger().log({
      code: `API_RESPONSE_${responseContext.status}`,
      message: `${responseContext.status} ${responseContext.statusText} - ${requestContext.method} ${requestContext.url}`,
      type: 'NetworkError',
      severity: ErrorSeverity.INFO,
      timestamp: responseContext.timestamp,
      userAction: `API call to ${requestContext.method} ${requestContext.url}`,
      recoverable: false,
      suggestedActions: [],
      isDevelopment: false,
      requestData: safeRequestContext,
    })
  }

  /**
   * Log error to store
   */
  private logErrorToStore(errorContext: ErrorContext): void {
    if (!this.options.logToStore) return

    try {
      useErrorStore_addError(errorContext)
    } catch (error) {
      // Silently fail if store is not available
      console.warn('Failed to log error to store', error)
    }
  }

  /**
   * Intercept and handle API request with retry logic
   */
  async intercept<T>(
    requestFn: () => Promise<T>,
    requestContext: RequestContext
  ): Promise<T> {
    // Log request
    this.logRequest(requestContext)

    // Execute with retry logic
    const retryOptions = this.options.retry
    return withRetry(requestFn, retryOptions)
  }

  /**
   * Handle API error with logging and store
   */
  handleError(error: unknown, requestContext: RequestContext): void {
    let errorContext: ErrorContext | null = null

    if (error instanceof ApiError) {
      errorContext = createErrorContextFromApiError(error, requestContext)
    } else if (error instanceof TimeoutError) {
      errorContext = createErrorContextFromTimeoutError(error, requestContext)
    } else if (error instanceof NetworkError) {
      errorContext = createErrorContextFromNetworkError(error, requestContext)
    } else if (error instanceof Error) {
      errorContext = {
        code: 'ERR_UNKNOWN',
        message: error.message,
        type: 'NetworkError',
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        userAction: `API call to ${requestContext.method} ${requestContext.url}`,
        recoverable: true,
        suggestedActions: ['Refresh the page', 'Try again later'],
        isDevelopment: false,
      }
    }

    if (errorContext) {
      this.logErrorToStore(errorContext)
      getErrorLogger().log(errorContext)
    }
  }
}

// =============================================
// Singleton Instance
// =============================================

let interceptorInstance: RequestInterceptor | null = null

export function getRequestInterceptor(
  options?: InterceptorOptions
): RequestInterceptor {
  if (!interceptorInstance) {
    interceptorInstance = new RequestInterceptor(options)
  }
  return interceptorInstance
}

/**
 * Configure global request interceptor
 */
export function configureInterceptor(options: InterceptorOptions): void {
  interceptorInstance = new RequestInterceptor(options)
}

/**
 * Reset interceptor to default configuration
 */
export function resetInterceptor(): void {
  interceptorInstance = null
}
