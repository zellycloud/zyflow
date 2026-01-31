/**
 * Global Error Boundary Component
 * Catches React rendering errors and displays fallback UI
 * @module components/errors/ErrorBoundary
 */

import React, { ReactNode, ReactElement } from 'react'
import { ErrorContext, ErrorSeverity, ErrorType, ComponentErrorCode } from '@/types/errors'
import { logError } from '@/utils/error-logger'
import { useErrorStore_addError } from '@/stores/errorStore'
import { ErrorFallback } from './ErrorFallback'

// =============================================
// Props
// =============================================

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactElement
  onError?: (error: Error, info: React.ErrorInfo) => void
  isolate?: boolean
  showDetails?: boolean
  boundaryName?: string
}

// =============================================
// Error Boundary Component
// =============================================

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  errorContext: ErrorContext | null
  retryCount: number
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorContext: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const isDevelopment = process.env.NODE_ENV === 'development'

    // Extract error location from component stack
    let component = 'Unknown'
    let line: number | undefined
    const stackMatch = errorInfo.componentStack?.match(/in (\w+)/)
    if (stackMatch) {
      component = stackMatch[1]
    }

    // Create error context
    const errorContext: ErrorContext = {
      code: ComponentErrorCode.RENDER_ERROR,
      message: error.message || 'Unknown render error',
      severity: ErrorSeverity.CRITICAL,
      type: ErrorType.COMPONENT,
      timestamp: Date.now(),
      component: this.props.boundaryName || component,
      originalError: error,
      stack: error.stack,
      recoverable: true,
      suggestedActions: ['retry', 'reset', 'navigate'],
      isDevelopment,
      userAction: 'viewing component',
      applicationState: {
        boundaryName: this.props.boundaryName,
        retryCount: this.state.retryCount,
      },
    }

    // Log to error logger
    logError(errorContext)

    // Add to error store
    useErrorStore_addError(errorContext)

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Update state with error context
    this.setState({
      errorInfo,
      errorContext,
    })

    // Log to console in development
    if (isDevelopment) {
      console.error('Error Boundary caught an error:', error, errorInfo)
    }
  }

  handleReset = (): void => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      errorContext: null,
      retryCount: prevState.retryCount + 1,
    }))
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development'

      // Use custom fallback if provided
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.handleReset)
      }

      // Use default fallback
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorContext={this.state.errorContext}
          onRetry={this.handleReset}
          showDetails={this.props.showDetails ?? isDevelopment}
          retryCount={this.state.retryCount}
        />
      )
    }

    return this.props.children
  }
}

// =============================================
// Higher-Order Component
// =============================================

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`

  return WrappedComponent
}

// =============================================
// Utility: Create isolated error boundary
// =============================================

export interface IsolatedErrorBoundaryProps extends ErrorBoundaryProps {
  level?: 'section' | 'component' | 'feature'
}

export class IsolatedErrorBoundary extends React.Component<IsolatedErrorBoundaryProps, State> {
  constructor(props: IsolatedErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorContext: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const level = this.props.level || 'component'

    // Extract error location
    let component = `${level}:Unknown`
    const stackMatch = errorInfo.componentStack?.match(/in (\w+)/)
    if (stackMatch) {
      component = `${level}:${stackMatch[1]}`
    }

    // Create error context with isolation level
    const errorContext: ErrorContext = {
      code: ComponentErrorCode.RENDER_ERROR,
      message: error.message || 'Unknown render error',
      severity: ErrorSeverity.ERROR,
      type: ErrorType.COMPONENT,
      timestamp: Date.now(),
      component: this.props.boundaryName || component,
      originalError: error,
      stack: error.stack,
      recoverable: true,
      suggestedActions: ['retry', 'reset'],
      isDevelopment,
      userAction: `viewing ${level}`,
      applicationState: {
        isolationLevel: level,
        boundaryName: this.props.boundaryName,
        retryCount: this.state.retryCount,
      },
    }

    // Log to error logger and store
    logError(errorContext)
    useErrorStore_addError(errorContext)

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    this.setState({
      errorInfo,
      errorContext,
    })

    if (isDevelopment) {
      console.error(`[${level.toUpperCase()}] Error Boundary caught:`, error, errorInfo)
    }
  }

  handleReset = (): void => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      errorContext: null,
      retryCount: prevState.retryCount + 1,
    }))
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development'

      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.handleReset)
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorContext={this.state.errorContext}
          onRetry={this.handleReset}
          showDetails={this.props.showDetails ?? isDevelopment}
          retryCount={this.state.retryCount}
          level={this.props.level}
        />
      )
    }

    return this.props.children
  }
}
