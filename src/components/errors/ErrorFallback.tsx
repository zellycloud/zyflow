/**
 * Error Fallback UI Component
 * Displays error information and recovery options
 * @module components/errors/ErrorFallback
 */

import React, { useState } from 'react'
import { AlertTriangle, Home, RotateCcw, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorContext } from '@/types/errors'
import { cn } from '@/lib/utils'

// =============================================
// Props
// =============================================

export interface ErrorFallbackProps {
  error: Error | null
  errorInfo: React.ErrorInfo | null
  errorContext: ErrorContext | null
  onRetry?: () => void
  onReset?: () => void
  onNavigateHome?: () => void
  showDetails?: boolean
  retryCount?: number
  level?: 'section' | 'component' | 'feature'
}

// =============================================
// Error Fallback Component
// =============================================

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  errorContext,
  onRetry,
  onReset,
  onNavigateHome,
  showDetails = false,
  retryCount = 0,
  level = 'component',
}) => {
  const [showStackTrace, setShowStackTrace] = useState(false)
  const isDevelopment = process.env.NODE_ENV === 'development'
  const maxRetries = 3

  const handleNavigateHome = (): void => {
    if (onNavigateHome) {
      onNavigateHome()
    } else {
      window.location.href = '/'
    }
  }

  const handleCopyError = (): void => {
    const errorText = `
Error: ${error?.message}
Code: ${errorContext?.code}
Component: ${errorContext?.component}
Time: ${new Date(errorContext?.timestamp || 0).toISOString()}
${error?.stack || 'No stack trace available'}
    `.trim()

    navigator.clipboard.writeText(errorText).catch(console.error)
  }

  const canRetry = retryCount < maxRetries && errorContext?.recoverable !== false

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-screen bg-background p-6',
        level === 'section' && 'min-h-96',
        level === 'component' && 'min-h-48',
      )}
    >
      <div className="max-w-md text-center space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-destructive" />
        </div>

        {/* Error Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {level === 'section' && "We're Having Trouble"}
            {level === 'component' && 'Component Error'}
            {level === 'feature' && 'Feature Error'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {errorContext?.message || error?.message || 'An unexpected error occurred'}
          </p>
        </div>

        {/* Error Code (if available) */}
        {errorContext?.code && (
          <div className="bg-muted rounded-md p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Error Code</p>
            <p className="font-mono text-sm">{errorContext.code}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center flex-wrap">
          {canRetry && (
            <Button onClick={onRetry} variant="default" size="sm">
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}

          <Button onClick={handleNavigateHome} variant="outline" size="sm">
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>

          {isDevelopment && (
            <Button onClick={handleCopyError} variant="ghost" size="sm">
              Copy Error
            </Button>
          )}
        </div>

        {/* Retry Count */}
        {retryCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Attempt {retryCount + 1} of {maxRetries + 1}
          </p>
        )}

        {/* Development Details */}
        {isDevelopment && showDetails && errorInfo && (
          <div className="mt-8 space-y-3 text-left">
            <button
              onClick={() => setShowStackTrace(!showStackTrace)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', showStackTrace && 'rotate-180')}
              />
              <span className="font-medium">Error Details</span>
            </button>

            {showStackTrace && (
              <div className="space-y-3 mt-3 border-l-2 border-muted pl-3">
                {/* Component Stack */}
                {errorInfo.componentStack && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Component Stack:</p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-words">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}

                {/* Error Stack */}
                {error?.stack && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Error Stack:</p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-words">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {/* Error Context */}
                {errorContext && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Context:</p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-words">
                      {JSON.stringify(
                        {
                          code: errorContext.code,
                          component: errorContext.component,
                          function: errorContext.function,
                          timestamp: new Date(errorContext.timestamp).toISOString(),
                          severity: errorContext.severity,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Support Info */}
        <p className="text-xs text-muted-foreground">
          If the problem persists, please contact support or try refreshing the page.
        </p>
      </div>
    </div>
  )
}
