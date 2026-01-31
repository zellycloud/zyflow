/**
 * Error Toast Notification Component
 * Displays error notifications in the top-right corner
 * @module components/errors/ErrorToast
 */

import React, { useEffect } from 'react'
import { X, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { ErrorContext, ErrorSeverity } from '@/types/errors'
import { cn } from '@/lib/utils'

// =============================================
// Props
// =============================================

export interface ErrorToastProps {
  error: ErrorContext
  onDismiss?: () => void
  onAction?: () => void | Promise<void>
  actionLabel?: string
  duration?: number
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  className?: string
}

// =============================================
// Error Toast Component
// =============================================

export const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  onDismiss,
  onAction,
  actionLabel = 'Retry',
  duration = 5000,
  position = 'top-right',
  className,
}) => {
  const [isVisible, setIsVisible] = React.useState(true)
  const [isLoading, setIsLoading] = React.useState(false)

  // Auto-dismiss after duration
  useEffect(() => {
    if (duration <= 0) return

    const timer = setTimeout(() => {
      handleDismiss()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration])

  const handleDismiss = (): void => {
    setIsVisible(false)
    setTimeout(() => {
      onDismiss?.()
    }, 200) // Allow time for exit animation
  }

  const handleAction = async (): Promise<void> => {
    if (isLoading || !onAction) return

    setIsLoading(true)
    try {
      await onAction()
    } catch (err) {
      console.error('Error action failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Determine icon and colors based on severity
  const getSeverityStyles = (): {
    bgColor: string
    borderColor: string
    icon: React.ReactNode
  } => {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return {
          bgColor: 'bg-red-50 dark:bg-red-950',
          borderColor: 'border-red-200 dark:border-red-800',
          icon: <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />,
        }
      case ErrorSeverity.ERROR:
        return {
          bgColor: 'bg-red-50 dark:bg-red-950',
          borderColor: 'border-red-200 dark:border-red-800',
          icon: <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
        }
      case ErrorSeverity.WARNING:
        return {
          bgColor: 'bg-yellow-50 dark:bg-yellow-950',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          icon: <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />,
        }
      case ErrorSeverity.INFO:
      default:
        return {
          bgColor: 'bg-blue-50 dark:bg-blue-950',
          borderColor: 'border-blue-200 dark:border-blue-800',
          icon: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
        }
    }
  }

  const { bgColor, borderColor, icon } = getSeverityStyles()

  if (!isVisible) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed z-50 transition-all duration-200 transform',
        position === 'top-right' && 'top-4 right-4',
        position === 'top-left' && 'top-4 left-4',
        position === 'bottom-right' && 'bottom-4 right-4',
        position === 'bottom-left' && 'bottom-4 left-4',
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
        className
      )}
    >
      <div
        className={cn(
          'rounded-lg border shadow-lg p-4 max-w-sm',
          bgColor,
          borderColor
        )}
      >
        <div className="flex gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">{icon}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{error.message}</p>
            {error.code && (
              <p className="text-xs text-muted-foreground mt-1">{error.code}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex gap-2 items-center">
            {onAction && (
              <button
                onClick={handleAction}
                disabled={isLoading}
                className="text-xs font-medium px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '...' : actionLabel}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// Error Toast Container (for stacking multiple toasts)
// =============================================

export interface ErrorToastContainerProps {
  errors: ErrorContext[]
  onDismiss?: (errorId: string) => void
  onAction?: (errorId: string) => void | Promise<void>
  maxVisible?: number
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export const ErrorToastContainer: React.FC<ErrorToastContainerProps> = ({
  errors,
  onDismiss,
  onAction,
  maxVisible = 3,
  position = 'top-right',
}) => {
  const visibleErrors = errors.slice(0, maxVisible)

  return (
    <div className="fixed inset-0 pointer-events-none">
      <div
        className="fixed space-y-2 pointer-events-auto"
        style={{
          top: position.startsWith('top') ? '1rem' : 'auto',
          bottom: position.startsWith('bottom') ? '1rem' : 'auto',
          left: position.endsWith('left') ? '1rem' : 'auto',
          right: position.endsWith('right') ? '1rem' : 'auto',
        }}
      >
        {visibleErrors.map((error, index) => (
          <ErrorToast
            key={`${error.code}-${error.timestamp}-${index}`}
            error={error}
            onDismiss={() => {
              const id = `${error.code}-${error.timestamp}`
              onDismiss?.(id)
            }}
            onAction={
              onAction
                ? () => onAction(`${error.code}-${error.timestamp}`)
                : undefined
            }
            position={position}
          />
        ))}
      </div>
    </div>
  )
}
