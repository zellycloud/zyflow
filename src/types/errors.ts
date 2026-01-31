/**
 * Global Error Handling - Type Definitions
 * Comprehensive error types and interfaces for the error handling system
 * @module types/errors
 */

// =============================================
// Error Type Enums
// =============================================

/** Error types that can occur in the system */
export enum ErrorType {
  NETWORK = 'NETWORK',
  COMPONENT = 'COMPONENT',
  VALIDATION = 'VALIDATION',
  STATE = 'STATE',
  TASK = 'TASK',
  SSE = 'SSE',
}

// =============================================
// Error Severity Levels
// =============================================

/** Error severity levels */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// =============================================
// Error Codes (23 total)
// =============================================

/** Network error codes (1000-1002) */
export enum NetworkErrorCode {
  CONNECTION_FAILED = 'ERR_NETWORK_1000',
  REQUEST_TIMEOUT = 'ERR_NETWORK_1001',
  INVALID_RESPONSE = 'ERR_NETWORK_1002',
}

/** Component error codes (2000-2001) */
export enum ComponentErrorCode {
  RENDER_ERROR = 'ERR_COMPONENT_2000',
  HOOK_ERROR = 'ERR_COMPONENT_2001',
}

/** Validation error codes (3000-3001) */
export enum ValidationErrorCode {
  INPUT_VALIDATION_FAILED = 'ERR_VALIDATION_3000',
  SCHEMA_VALIDATION_FAILED = 'ERR_VALIDATION_3001',
}

/** State error codes (4000-4001) */
export enum StateErrorCode {
  STATE_MUTATION_FAILED = 'ERR_STATE_4000',
  CONTEXT_VALUE_MISSING = 'ERR_STATE_4001',
}

/** Task error codes (5000-5002) */
export enum TaskErrorCode {
  TASK_EXECUTION_FAILED = 'ERR_TASK_5000',
  SPEC_PARSING_FAILED = 'ERR_TASK_5001',
  TASK_TIMEOUT = 'ERR_TASK_5002',
}

/** SSE error codes (6000-6002) */
export enum SSEErrorCode {
  CONNECTION_LOST = 'ERR_SSE_6000',
  EVENT_PARSING_FAILED = 'ERR_SSE_6001',
  EVENT_HANDLER_ERROR = 'ERR_SSE_6002',
}

/** Union of all error codes */
export type ErrorCode =
  | NetworkErrorCode
  | ComponentErrorCode
  | ValidationErrorCode
  | StateErrorCode
  | TaskErrorCode
  | SSEErrorCode

// =============================================
// Error Context Interface
// =============================================

/** Context information for an error */
export interface ErrorContext {
  // Error identification
  code: ErrorCode
  message: string
  severity: ErrorSeverity
  type: ErrorType

  // Timestamps
  timestamp: number

  // Location information
  component?: string
  function?: string
  line?: number
  column?: number

  // Error details
  originalError?: Error
  stack?: string

  // Context data
  userAction?: string
  applicationState?: Record<string, unknown>
  requestData?: Record<string, unknown>
  responseData?: Record<string, unknown>

  // Recovery information
  recoverable: boolean
  suggestedActions: string[]

  // Metadata
  isDevelopment: boolean
  userId?: string
  sessionId?: string

  // Deduplication
  count?: number
  lastOccurrence?: number
}

// =============================================
// Error Display Configurations
// =============================================

/** Configuration for error display */
export interface ErrorDisplayConfig {
  duration?: number
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  closable?: boolean
  showDetails?: boolean
}

/** Error toast notification config */
export interface ErrorToastConfig extends ErrorDisplayConfig {
  action?: {
    label: string
    onClick: () => void | Promise<void>
  }
  dismissible?: boolean
}

/** Error dialog config */
export interface ErrorDialogConfig extends ErrorDisplayConfig {
  actions?: Array<{
    label: string
    onClick: () => void | Promise<void>
    variant?: 'default' | 'destructive'
  }>
}

// =============================================
// Error Recovery Strategies
// =============================================

/** Recovery action types */
export enum RecoveryActionType {
  RETRY = 'retry',
  SKIP = 'skip',
  RESET = 'reset',
  NAVIGATE = 'navigate',
  IGNORE = 'ignore',
  REPORT = 'report',
}

/** Recovery action */
export interface RecoveryAction {
  type: RecoveryActionType
  label: string
  description?: string
  onClick?: () => void | Promise<void>
}

// =============================================
// HTTP Status to Error Mapping
// =============================================

/** Mapping of HTTP status codes to error types and codes */
export const HTTP_STATUS_TO_ERROR_CODE: Record<number, { type: ErrorType; code: ErrorCode; severity: ErrorSeverity }> = {
  // 4xx - Validation errors (except 429)
  400: { type: ErrorType.VALIDATION, code: ValidationErrorCode.INPUT_VALIDATION_FAILED, severity: ErrorSeverity.ERROR },
  401: { type: ErrorType.VALIDATION, code: ValidationErrorCode.INPUT_VALIDATION_FAILED, severity: ErrorSeverity.WARNING },
  403: { type: ErrorType.VALIDATION, code: ValidationErrorCode.INPUT_VALIDATION_FAILED, severity: ErrorSeverity.WARNING },
  404: { type: ErrorType.VALIDATION, code: ValidationErrorCode.INPUT_VALIDATION_FAILED, severity: ErrorSeverity.WARNING },
  422: { type: ErrorType.VALIDATION, code: ValidationErrorCode.SCHEMA_VALIDATION_FAILED, severity: ErrorSeverity.ERROR },
  429: { type: ErrorType.NETWORK, code: NetworkErrorCode.REQUEST_TIMEOUT, severity: ErrorSeverity.WARNING },

  // 5xx - Network errors
  500: { type: ErrorType.NETWORK, code: NetworkErrorCode.INVALID_RESPONSE, severity: ErrorSeverity.CRITICAL },
  502: { type: ErrorType.NETWORK, code: NetworkErrorCode.INVALID_RESPONSE, severity: ErrorSeverity.CRITICAL },
  503: { type: ErrorType.NETWORK, code: NetworkErrorCode.INVALID_RESPONSE, severity: ErrorSeverity.CRITICAL },
  504: { type: ErrorType.NETWORK, code: NetworkErrorCode.REQUEST_TIMEOUT, severity: ErrorSeverity.CRITICAL },
}

// =============================================
// Error Response Format
// =============================================

/** Standardized error response from API */
export interface ErrorResponse {
  success: false
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
    timestamp: number
  }
}

// =============================================
// Type Guards
// =============================================

export function isErrorCode(value: unknown): value is ErrorCode {
  if (typeof value !== 'string') return false
  const allCodes = [
    ...Object.values(NetworkErrorCode),
    ...Object.values(ComponentErrorCode),
    ...Object.values(ValidationErrorCode),
    ...Object.values(StateErrorCode),
    ...Object.values(TaskErrorCode),
    ...Object.values(SSEErrorCode),
  ]
  return allCodes.includes(value as ErrorCode)
}

export function isErrorType(value: unknown): value is ErrorType {
  return Object.values(ErrorType).includes(value as ErrorType)
}

export function isErrorSeverity(value: unknown): value is ErrorSeverity {
  return Object.values(ErrorSeverity).includes(value as ErrorSeverity)
}

export function isErrorContext(value: unknown): value is ErrorContext {
  if (typeof value !== 'object' || value === null) return false
  const context = value as Record<string, unknown>
  return (
    typeof context.code === 'string' &&
    typeof context.message === 'string' &&
    typeof context.severity === 'string' &&
    typeof context.timestamp === 'number' &&
    typeof context.recoverable === 'boolean'
  )
}
