/**
 * SSE Connection Hook
 *
 * Manages Server-Sent Events connection with auto-reconnection
 * - Exponential backoff for reconnection
 * - Jitter to prevent thundering herd
 * - Event queuing while disconnected
 * - Automatic recovery on network restore
 *
 * @module hooks/useSSEConnection
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useSSEStore, selectConnectionStatus, selectReconnectAttempt, selectMaxReconnectAttempts } from '@/stores/sseStore'
import { useNetworkStatus } from './useNetworkStatus'
import { useErrorStore_addError } from '@/stores/errorStore'
import { ErrorSeverity, ErrorType } from '@/types/errors'

// =============================================
// Types
// =============================================

export interface UseSSEConnectionOptions {
  /** URL for SSE endpoint (default: '/api/sse') */
  url?: string
  /** Initial retry delay in ms (default: 1000) */
  initialRetryDelayMs?: number
  /** Max retry delay in ms (default: 30000) */
  maxRetryDelayMs?: number
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number
  /** Jitter percentage for backoff (default: 0.1 = 10%) */
  jitterFactor?: number
  /** Custom event handler */
  onEvent?: (type: string, data: unknown) => void
  /** Connection error handler */
  onError?: (error: Error) => void
  /** Connection state change handler */
  onStatusChange?: (status: string) => void
}

export interface UseSSEConnectionReturn {
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  isFailed: boolean
  reconnectAttempt: number
  maxReconnectAttempts: number
  lastError?: string
  connect: () => Promise<void>
  disconnect: () => void
  retry: () => Promise<void>
}

// =============================================
// Implementation
// =============================================

const DEFAULT_SSE_URL = '/api/sse'
const DEFAULT_INITIAL_RETRY_DELAY = 1000
const DEFAULT_MAX_RETRY_DELAY = 30000
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10
const DEFAULT_JITTER_FACTOR = 0.1

/**
 * Calculate exponential backoff with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  options: Partial<UseSSEConnectionOptions>
): number {
  const initialDelay = options.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY
  const maxDelay = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY
  const jitterFactor = options.jitterFactor ?? DEFAULT_JITTER_FACTOR

  // Exponential backoff: initialDelay * 2^(attempt - 1)
  const exponentialDelay = initialDelay * Math.pow(2, attempt - 1)

  // Add jitter: ±10% of calculated delay
  const jitter = exponentialDelay * jitterFactor * (Math.random() - 0.5) * 2
  const delayWithJitter = exponentialDelay + jitter

  // Cap at max delay
  return Math.min(Math.max(delayWithJitter, 0), maxDelay)
}

/**
 * Hook to manage SSE connection
 */
export function useSSEConnection(
  options: UseSSEConnectionOptions = {}
): UseSSEConnectionReturn {
  const url = options.url ?? DEFAULT_SSE_URL
  const maxReconnectAttempts =
    options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS

  // Store references
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [localState, setLocalState] = useState({
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    isFailed: false,
  })

  // Get store state
  const status = useSSEStore(selectConnectionStatus)
  const reconnectAttempt = useSSEStore(selectReconnectAttempt)

  // Monitor network status for auto-reconnect
  useNetworkStatus({
    onOnline: () => {
      // Attempt reconnection when coming online
      if (!localState.isConnected && !localState.isConnecting) {
        handleRetry()
      }
    },
  })

  /**
   * Update local state
   */
  const updateState = useCallback((newState: Partial<typeof localState>) => {
    setLocalState((prev) => ({ ...prev, ...newState }))
  }, [])

  /**
   * Handle incoming SSE event
   */
  const handleSSEEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        options.onEvent?.('message', data)
      } catch (error) {
        // Log parse error but continue processing
        useErrorStore_addError({
          code: 'ERR_SSE_PARSE',
          message: `Failed to parse SSE message: ${error instanceof Error ? error.message : String(error)}`,
          type: 'NetworkError' as ErrorType,
          severity: ErrorSeverity.WARNING,
          timestamp: Date.now(),
          recoverable: true,
          suggestedActions: ['Connection will continue'],
          isDevelopment: false,
        })
      }
    },
    [options]
  )

  /**
   * Handle SSE error
   */
  const handleSSEError = useCallback(
    (event: Event) => {
      const error = new Error('SSE connection error')
      useSSEStore.getState().setDisconnected(error.message)
      updateState({ isConnected: false, isConnecting: false })
      options.onError?.(error)

      // Attempt reconnection
      if (reconnectAttempt < maxReconnectAttempts) {
        handleReconnect()
      } else {
        useSSEStore.getState().setFailed('Max reconnect attempts exceeded')
        updateState({ isFailed: true })
      }
    },
    [reconnectAttempt, maxReconnectAttempts, updateState, options]
  )

  /**
   * Perform actual connection
   */
  const performConnect = useCallback(async () => {
    try {
      updateState({ isConnecting: true })
      useSSEStore.getState().setConnecting()
      options.onStatusChange?.('connecting')

      // Check if EventSource is supported
      if (typeof EventSource === 'undefined') {
        throw new Error('EventSource is not supported in this browser')
      }

      // Create EventSource connection
      const eventSource = new EventSource(url, {
        withCredentials: true,
      })

      // Set up event listeners
      eventSource.addEventListener('message', handleSSEEvent)
      eventSource.addEventListener('error', handleSSEError)

      // Wait for open state
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 10000)

        eventSource.onopen = () => {
          clearTimeout(timeoutId)
          resolve()
        }
      })

      eventSourceRef.current = eventSource
      useSSEStore.getState().setConnected()
      useSSEStore.getState().resetReconnectAttempts()
      updateState({ isConnected: true, isConnecting: false, isFailed: false })
      options.onStatusChange?.('connected')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      useSSEStore.getState().setDisconnected(errorMessage)
      updateState({ isConnected: false, isConnecting: false })
      options.onError?.(new Error(errorMessage))
      options.onStatusChange?.('error')
    }
  }, [url, handleSSEEvent, handleSSEError, updateState, options])

  /**
   * Connect to SSE
   */
  const handleConnect = useCallback(async () => {
    if (localState.isConnected || localState.isConnecting) {
      return
    }

    await performConnect()
  }, [localState.isConnected, localState.isConnecting, performConnect])

  /**
   * Disconnect from SSE
   */
  const handleDisconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    useSSEStore.getState().setDisconnected()
    updateState({ isConnected: false, isConnecting: false, isReconnecting: false })
    options.onStatusChange?.('disconnected')
  }, [updateState, options])

  /**
   * Reconnect with exponential backoff
   */
  const handleReconnect = useCallback(() => {
    if (localState.isConnecting || localState.isConnected) {
      return
    }

    const currentAttempt = reconnectAttempt + 1

    if (currentAttempt > maxReconnectAttempts) {
      useSSEStore.getState().setFailed('Max reconnect attempts exceeded')
      updateState({ isFailed: true })
      return
    }

    // Calculate backoff delay
    const delay = calculateBackoffDelay(currentAttempt, options)

    useSSEStore.getState().incrementReconnectAttempt()
    useSSEStore.getState().setReconnecting(currentAttempt)
    useSSEStore.getState().setNextRetryIn(delay)
    updateState({ isReconnecting: true })
    options.onStatusChange?.('reconnecting')

    // Schedule reconnection
    reconnectTimeoutRef.current = setTimeout(() => {
      performConnect()
    }, delay)
  }, [
    localState.isConnecting,
    localState.isConnected,
    reconnectAttempt,
    maxReconnectAttempts,
    updateState,
    options,
    performConnect,
  ])

  /**
   * Manual retry
   */
  const handleRetry = useCallback(async () => {
    handleDisconnect()
    useSSEStore.getState().resetReconnectAttempts()
    await handleConnect()
  }, [handleDisconnect, handleConnect])

  /**
   * Auto-connect on mount
   */
  useEffect(() => {
    handleConnect()

    return () => {
      handleDisconnect()
    }
  }, []) // Only on mount/unmount

  return {
    isConnected: localState.isConnected,
    isConnecting: localState.isConnecting,
    isReconnecting: localState.isReconnecting,
    isFailed: localState.isFailed,
    reconnectAttempt,
    maxReconnectAttempts,
    lastError: useSSEStore.getState().connection.lastError,
    connect: handleConnect,
    disconnect: handleDisconnect,
    retry: handleRetry,
  }
}

/**
 * Standalone function to manage SSE connection
 */
export function useSSEStatus(): UseSSEConnectionReturn {
  const status = useSSEStore(selectConnectionStatus)
  const reconnectAttempt = useSSEStore(selectReconnectAttempt)
  const maxReconnectAttempts = useSSEStore(selectMaxReconnectAttempts)

  return {
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isReconnecting: status === 'reconnecting',
    isFailed: status === 'failed',
    reconnectAttempt,
    maxReconnectAttempts,
    lastError: useSSEStore.getState().connection.lastError,
    connect: async () => {}, // No-op for status-only queries
    disconnect: () => {}, // No-op for status-only queries
    retry: async () => {}, // No-op for status-only queries
  }
}
