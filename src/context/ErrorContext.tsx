/**
 * Global Error Context and Provider
 * Provides error display functionality to the application
 * @module context/ErrorContext
 */

import React, { createContext, useContext, useCallback, ReactNode, useState, useEffect } from 'react'
import { ErrorContext as ErrorContextType, ErrorSeverity, ErrorType } from '@/types/errors'
import { useErrorStore, selectActiveErrors, selectErrorQueue } from '@/stores/errorStore'
import { ErrorToastContainer } from '@/components/errors/ErrorToast'

// =============================================
// Context Type
// =============================================

export interface ErrorDisplayContextType {
  // Display error
  showError: (error: ErrorContextType) => void

  // Display success/info
  showInfo: (message: string) => void

  // Display warning
  showWarning: (message: string) => void

  // Clear errors
  clearErrors: () => void

  // Get current errors
  getErrors: () => ErrorContextType[]

  // Dismiss specific error
  dismissError: (id: string) => void

  // Retry error action
  retryError: (id: string) => Promise<void>
}

// =============================================
// Create Context
// =============================================

const ErrorDisplayContext = createContext<ErrorDisplayContextType | undefined>(undefined)

// =============================================
// Error Display Provider Component
// =============================================

export interface ErrorDisplayProviderProps {
  children: ReactNode
  maxVisibleErrors?: number
  toastPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export const ErrorDisplayProvider: React.FC<ErrorDisplayProviderProps> = ({
  children,
  maxVisibleErrors = 3,
  toastPosition = 'top-right',
}) => {
  const [displayedErrorIds, setDisplayedErrorIds] = useState<Set<string>>(new Set())
  const activeErrors = useErrorStore(selectActiveErrors)
  const errorQueue = useErrorStore(selectErrorQueue)

  // Create unique ID for error
  const createErrorId = (error: ErrorContextType): string => {
    return `${error.code}_${error.timestamp}_${Math.random()}`
  }

  const showError = useCallback(
    (error: ErrorContextType) => {
      useErrorStore.getState().addError(error)
    },
    []
  )

  const showInfo = useCallback(
    (message: string) => {
      const error: ErrorContextType = {
        code: 'INFO_MESSAGE' as any,
        message,
        severity: ErrorSeverity.INFO,
        type: ErrorType.COMPONENT,
        timestamp: Date.now(),
        recoverable: false,
        suggestedActions: [],
        isDevelopment: false,
      }
      showError(error)
    },
    [showError]
  )

  const showWarning = useCallback(
    (message: string) => {
      const error: ErrorContextType = {
        code: 'WARNING_MESSAGE' as any,
        message,
        severity: ErrorSeverity.WARNING,
        type: ErrorType.COMPONENT,
        timestamp: Date.now(),
        recoverable: false,
        suggestedActions: [],
        isDevelopment: false,
      }
      showError(error)
    },
    [showError]
  )

  const clearErrors = useCallback(() => {
    useErrorStore.getState().clearAll()
    setDisplayedErrorIds(new Set())
  }, [])

  const getErrors = useCallback(() => {
    return [...activeErrors, ...errorQueue]
  }, [activeErrors, errorQueue])

  const dismissError = useCallback((id: string) => {
    setDisplayedErrorIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const retryError = useCallback(async (id: string) => {
    // This would be called when user clicks retry
    // Implementation depends on the specific error type
    console.log('Retry error:', id)
  }, [])

  const contextValue: ErrorDisplayContextType = {
    showError,
    showInfo,
    showWarning,
    clearErrors,
    getErrors,
    dismissError,
    retryError,
  }

  const handleToastDismiss = (id: string): void => {
    dismissError(id)
  }

  const handleToastAction = (id: string): void => {
    retryError(id).catch(console.error)
  }

  return (
    <ErrorDisplayContext.Provider value={contextValue}>
      {children}

      {/* Error Toast Container */}
      <ErrorToastContainer
        errors={activeErrors}
        onDismiss={handleToastDismiss}
        onAction={handleToastAction}
        maxVisible={maxVisibleErrors}
        position={toastPosition}
      />
    </ErrorDisplayContext.Provider>
  )
}

// =============================================
// Hook: useErrorDisplay
// =============================================

export function useErrorDisplay(): ErrorDisplayContextType {
  const context = useContext(ErrorDisplayContext)
  if (!context) {
    throw new Error('useErrorDisplay must be used within ErrorDisplayProvider')
  }
  return context
}

// =============================================
// Hook: useError (alias for useErrorDisplay)
// =============================================

export function useError(): ErrorDisplayContextType {
  return useErrorDisplay()
}
