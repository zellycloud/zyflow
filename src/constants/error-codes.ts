/**
 * Error Code Definitions with i18n Support
 * Maps error codes to messages and translations keys
 * @module constants/error-codes
 */

import {
  NetworkErrorCode,
  ComponentErrorCode,
  ValidationErrorCode,
  StateErrorCode,
  TaskErrorCode,
  SSEErrorCode,
  ErrorSeverity,
  ErrorType,
  RecoveryActionType,
} from '@/types/errors'

// =============================================
// Error Code Registry
// =============================================

export interface ErrorCodeRegistry {
  code: string
  type: ErrorType
  severity: ErrorSeverity
  i18nKey: string
  defaultMessage: string
  recoveryActions: string[]
}

/** Registry of all error codes with metadata */
export const ERROR_CODE_REGISTRY: Record<string, ErrorCodeRegistry> = {
  // Network Errors (1000-1002)
  [NetworkErrorCode.CONNECTION_FAILED]: {
    code: NetworkErrorCode.CONNECTION_FAILED,
    type: ErrorType.NETWORK,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.network.connection_failed',
    defaultMessage: 'Connection failed. Please check your internet connection.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.IGNORE],
  },
  [NetworkErrorCode.REQUEST_TIMEOUT]: {
    code: NetworkErrorCode.REQUEST_TIMEOUT,
    type: ErrorType.NETWORK,
    severity: ErrorSeverity.WARNING,
    i18nKey: 'errors.network.request_timeout',
    defaultMessage: 'Request took too long. Please try again.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.SKIP],
  },
  [NetworkErrorCode.INVALID_RESPONSE]: {
    code: NetworkErrorCode.INVALID_RESPONSE,
    type: ErrorType.NETWORK,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.network.invalid_response',
    defaultMessage: 'Invalid response from server. Please try again.',
    recoveryActions: [RecoveryActionType.RETRY],
  },

  // Component Errors (2000-2001)
  [ComponentErrorCode.RENDER_ERROR]: {
    code: ComponentErrorCode.RENDER_ERROR,
    type: ErrorType.COMPONENT,
    severity: ErrorSeverity.CRITICAL,
    i18nKey: 'errors.component.render_error',
    defaultMessage: 'Something went wrong. Please refresh the page.',
    recoveryActions: [RecoveryActionType.RESET, RecoveryActionType.NAVIGATE],
  },
  [ComponentErrorCode.HOOK_ERROR]: {
    code: ComponentErrorCode.HOOK_ERROR,
    type: ErrorType.COMPONENT,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.component.hook_error',
    defaultMessage: 'An error occurred in the application. Please try again.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.RESET],
  },

  // Validation Errors (3000-3001)
  [ValidationErrorCode.INPUT_VALIDATION_FAILED]: {
    code: ValidationErrorCode.INPUT_VALIDATION_FAILED,
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.WARNING,
    i18nKey: 'errors.validation.input_validation_failed',
    defaultMessage: 'Please check your input and try again.',
    recoveryActions: [RecoveryActionType.IGNORE],
  },
  [ValidationErrorCode.SCHEMA_VALIDATION_FAILED]: {
    code: ValidationErrorCode.SCHEMA_VALIDATION_FAILED,
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.WARNING,
    i18nKey: 'errors.validation.schema_validation_failed',
    defaultMessage: 'Invalid data format. Please try again.',
    recoveryActions: [RecoveryActionType.IGNORE],
  },

  // State Errors (4000-4001)
  [StateErrorCode.STATE_MUTATION_FAILED]: {
    code: StateErrorCode.STATE_MUTATION_FAILED,
    type: ErrorType.STATE,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.state.mutation_failed',
    defaultMessage: 'Failed to save changes. Please try again.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.RESET],
  },
  [StateErrorCode.CONTEXT_VALUE_MISSING]: {
    code: StateErrorCode.CONTEXT_VALUE_MISSING,
    type: ErrorType.STATE,
    severity: ErrorSeverity.CRITICAL,
    i18nKey: 'errors.state.context_missing',
    defaultMessage: 'Application state is missing. Please refresh.',
    recoveryActions: [RecoveryActionType.RESET, RecoveryActionType.NAVIGATE],
  },

  // Task Errors (5000-5002)
  [TaskErrorCode.TASK_EXECUTION_FAILED]: {
    code: TaskErrorCode.TASK_EXECUTION_FAILED,
    type: ErrorType.TASK,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.task.execution_failed',
    defaultMessage: 'Task execution failed. Please review the error and try again.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.SKIP],
  },
  [TaskErrorCode.SPEC_PARSING_FAILED]: {
    code: TaskErrorCode.SPEC_PARSING_FAILED,
    type: ErrorType.TASK,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.task.parsing_failed',
    defaultMessage: 'Failed to parse specification file. Please check the file format.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.REPORT],
  },
  [TaskErrorCode.TASK_TIMEOUT]: {
    code: TaskErrorCode.TASK_TIMEOUT,
    type: ErrorType.TASK,
    severity: ErrorSeverity.WARNING,
    i18nKey: 'errors.task.timeout',
    defaultMessage: 'Task execution timed out. Please try again.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.SKIP],
  },

  // SSE Errors (6000-6002)
  [SSEErrorCode.CONNECTION_LOST]: {
    code: SSEErrorCode.CONNECTION_LOST,
    type: ErrorType.SSE,
    severity: ErrorSeverity.WARNING,
    i18nKey: 'errors.sse.connection_lost',
    defaultMessage: 'Connection lost. Reconnecting...',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.IGNORE],
  },
  [SSEErrorCode.EVENT_PARSING_FAILED]: {
    code: SSEErrorCode.EVENT_PARSING_FAILED,
    type: ErrorType.SSE,
    severity: ErrorSeverity.INFO,
    i18nKey: 'errors.sse.parsing_failed',
    defaultMessage: 'Failed to parse server event. Continuing...',
    recoveryActions: [RecoveryActionType.IGNORE],
  },
  [SSEErrorCode.EVENT_HANDLER_ERROR]: {
    code: SSEErrorCode.EVENT_HANDLER_ERROR,
    type: ErrorType.SSE,
    severity: ErrorSeverity.ERROR,
    i18nKey: 'errors.sse.handler_error',
    defaultMessage: 'Error processing server event.',
    recoveryActions: [RecoveryActionType.RETRY, RecoveryActionType.IGNORE],
  },
}

// =============================================
// i18n Translation Keys
// =============================================

export const ERROR_I18N_KEYS = {
  errors: {
    network: {
      connection_failed: 'errors.network.connection_failed',
      request_timeout: 'errors.network.request_timeout',
      invalid_response: 'errors.network.invalid_response',
    },
    component: {
      render_error: 'errors.component.render_error',
      hook_error: 'errors.component.hook_error',
    },
    validation: {
      input_validation_failed: 'errors.validation.input_validation_failed',
      schema_validation_failed: 'errors.validation.schema_validation_failed',
    },
    state: {
      mutation_failed: 'errors.state.mutation_failed',
      context_missing: 'errors.state.context_missing',
    },
    task: {
      execution_failed: 'errors.task.execution_failed',
      parsing_failed: 'errors.task.parsing_failed',
      timeout: 'errors.task.timeout',
    },
    sse: {
      connection_lost: 'errors.sse.connection_lost',
      parsing_failed: 'errors.sse.parsing_failed',
      handler_error: 'errors.sse.handler_error',
    },
  },
}

// =============================================
// Utility Functions
// =============================================

export function getErrorCodeRegistry(code: string): ErrorCodeRegistry | undefined {
  return ERROR_CODE_REGISTRY[code]
}

export function getDefaultErrorMessage(code: string): string {
  const registry = getErrorCodeRegistry(code)
  return registry?.defaultMessage || 'An error occurred'
}

export function getErrorI18nKey(code: string): string {
  const registry = getErrorCodeRegistry(code)
  return registry?.i18nKey || 'errors.unknown'
}

export function getErrorSeverity(code: string): ErrorSeverity {
  const registry = getErrorCodeRegistry(code)
  return registry?.severity || ErrorSeverity.ERROR
}

export function getErrorType(code: string): ErrorType {
  const registry = getErrorCodeRegistry(code)
  return registry?.type || ErrorType.COMPONENT
}

export function getRecoveryActions(code: string): string[] {
  const registry = getErrorCodeRegistry(code)
  return registry?.recoveryActions || [RecoveryActionType.IGNORE]
}

/** Get all error codes for a specific type */
export function getErrorCodesForType(type: ErrorType): string[] {
  return Object.values(ERROR_CODE_REGISTRY)
    .filter((registry) => registry.type === type)
    .map((registry) => registry.code)
}

/** Get all error codes with a specific severity */
export function getErrorCodesWithSeverity(severity: ErrorSeverity): string[] {
  return Object.values(ERROR_CODE_REGISTRY)
    .filter((registry) => registry.severity === severity)
    .map((registry) => registry.code)
}

/** Check if code is recoverable (has recovery actions other than ignore) */
export function isErrorRecoverable(code: string): boolean {
  const actions = getRecoveryActions(code)
  const hasRecoverableActions = actions.some((action) => action !== RecoveryActionType.IGNORE)
  return hasRecoverableActions
}
