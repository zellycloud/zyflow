/**
 * useErrorHandler Hook
 * Handles errors in event handlers and non-async contexts
 * @module hooks/useErrorHandler
 */

import { useCallback } from 'react'
import { useErrorStore_addError } from '@/stores/errorStore'
import { useError } from '@/context/ErrorContext'
import { ErrorContext, ErrorType, ErrorSeverity, ComponentErrorCode } from '@/types/errors'

/**
 * Hook for handling errors in event handlers
 * Usage:
 * ```
 * const handleError = useErrorHandler()
 * const onClick = async () => {
 *   try {
 *     await doSomething()
 *   } catch (error) {
 *     handleError(error, {
 *       userAction: 'clicked button',
 *       recoveryActions: ['retry'],
 *       onRetry: () => onClick()
 *     })
 *   }
 * }
 * ```
 */
export interface ErrorHandlerOptions {
  userAction?: string
  component?: string
  recoveryActions?: string[]
  onRetry?: () => void | Promise<void>
  showToast?: boolean
  displayDuration?: number
}

export function useErrorHandler() {
  const errorDisplay = useError()

  const handleError = useCallback(
    (error: Error | unknown, options: ErrorHandlerOptions = {}) => {
      const {
        userAction = 'performing action',
        component = 'Unknown',
        recoveryActions = ['retry'],
        onRetry,
        showToast = true,
      } = options

      // Extract error information
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined

      // Create error context
      const errorContext: ErrorContext = {
        code: ComponentErrorCode.HOOK_ERROR,
        message,
        severity: ErrorSeverity.ERROR,
        type: ErrorType.COMPONENT,
        timestamp: Date.now(),
        component,
        originalError: error instanceof Error ? error : new Error(message),
        stack,
        recoverable: true,
        suggestedActions: recoveryActions,
        isDevelopment: process.env.NODE_ENV === 'development',
        userAction,
      }

      // Add to error store
      useErrorStore_addError(errorContext)

      // Show toast if enabled
      if (showToast) {
        errorDisplay.showError(errorContext)
      }

      // Return retry function for convenience
      return {
        retry: onRetry,
        error: errorContext,
      }
    },
    [errorDisplay]
  )

  return handleError
}

/**
 * Hook for handling errors with automatic retry
 * Usage:
 * ```
 * const retryableError = useRetryableErrorHandler({ maxRetries: 3 })
 * const onClick = async () => {
 *   try {
 *     await doSomething()
 *   } catch (error) {
 *     retryableError(error, () => onClick())
 *   }
 * }
 * ```
 */
export interface RetryableErrorHandlerOptions {
  maxRetries?: number
  backoffMs?: number
  onMaxRetriesExceeded?: (error: Error) => void
}

export function useRetryableErrorHandler(options: RetryableErrorHandlerOptions = {}) {
  const {
    maxRetries = 3,
    backoffMs = 1000,
  } = options

  const handleError = useErrorHandler()

  const retryableHandler = useCallback(
    async (
      error: Error | unknown,
      operation: () => Promise<any>,
      attemptCount: number = 0
    ): Promise<void> => {
      if (attemptCount >= maxRetries) {
        handleError(error, {
          userAction: `operation failed after ${attemptCount} attempts`,
          recoveryActions: ['report'],
        })
        options.onMaxRetriesExceeded?.(
          error instanceof Error ? error : new Error(String(error))
        )
        return
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attemptCount)))

      try {
        await operation()
      } catch (retryError) {
        await retryableHandler(retryError, operation, attemptCount + 1)
      }
    },
    [handleError, maxRetries, backoffMs]
  )

  return retryableHandler
}
