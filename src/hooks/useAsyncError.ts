/**
 * useAsyncError Hook
 * Throws async errors to Error Boundary
 * @module hooks/useAsyncError
 */

import { useCallback } from 'react'
import { useErrorStore_addError } from '@/stores/errorStore'
import { ErrorContext, ErrorType, ErrorSeverity, ComponentErrorCode } from '@/types/errors'

/**
 * Hook for throwing async errors to Error Boundary
 * Usage:
 * ```
 * const throwAsyncError = useAsyncError()
 * try {
 *   await someAsync()
 * } catch (error) {
 *   throwAsyncError(error)
 * }
 * ```
 */
export function useAsyncError(): (error: Error | unknown) => never {
  return useCallback((error: Error | unknown): never => {
    // Add to error store
    const errorContext: ErrorContext = {
      code: ComponentErrorCode.HOOK_ERROR,
      message: error instanceof Error ? error.message : String(error),
      severity: ErrorSeverity.ERROR,
      type: ErrorType.COMPONENT,
      timestamp: Date.now(),
      originalError: error instanceof Error ? error : new Error(String(error)),
      stack: error instanceof Error ? error.stack : undefined,
      recoverable: true,
      suggestedActions: ['retry', 'reset'],
      isDevelopment: process.env.NODE_ENV === 'development',
      userAction: 'async operation',
    }

    useErrorStore_addError(errorContext)

    // Throw to Error Boundary
    throw error
  }, [])
}
