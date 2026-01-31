/**
 * Network Status Detection Hook
 *
 * Detects online/offline state and provides callbacks for state changes
 * Uses navigator.onLine and online/offline event listeners
 *
 * @module hooks/useNetworkStatus
 */

import { useState, useEffect, useCallback } from 'react'

// =============================================
// Types
// =============================================

export type NetworkStatus = 'online' | 'offline' | 'unknown'

export interface UseNetworkStatusReturn {
  /** Current network status */
  status: NetworkStatus
  /** Whether device is online */
  isOnline: boolean
  /** Whether device is offline */
  isOffline: boolean
  /** Last status change timestamp */
  lastStatusChange: number
}

export interface UseNetworkStatusOptions {
  /** Callback when status changes to online */
  onOnline?: () => void
  /** Callback when status changes to offline */
  onOffline?: () => void
  /** Polling interval for additional checks (ms, 0 = disabled) */
  pollingInterval?: number
}

// =============================================
// Implementation
// =============================================

/**
 * Hook to detect network status
 */
export function useNetworkStatus(
  options: UseNetworkStatusOptions = {}
): UseNetworkStatusReturn {
  const { onOnline, onOffline, pollingInterval = 30000 } = options

  // Initialize with current navigator.onLine status
  const [status, setStatus] = useState<NetworkStatus>(() => {
    if (typeof navigator === 'undefined') {
      return 'unknown'
    }
    return navigator.onLine ? 'online' : 'offline'
  })

  const [lastStatusChange, setLastStatusChange] = useState<number>(Date.now())

  // Handle online event
  const handleOnline = useCallback(() => {
    setStatus('online')
    setLastStatusChange(Date.now())
    onOnline?.()
  }, [onOnline])

  // Handle offline event
  const handleOffline = useCallback(() => {
    setStatus('offline')
    setLastStatusChange(Date.now())
    onOffline?.()
  }, [onOffline])

  // Polling function for additional network checks
  const checkNetworkStatus = useCallback(async () => {
    if (typeof navigator === 'undefined') return

    // Get current navigator status
    const isNavigatorOnline = navigator.onLine

    // Try to fetch a small resource to verify connectivity
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      })

      clearTimeout(timeoutId)

      // If health check succeeds, we're online
      if (response.ok) {
        if (status !== 'online') {
          handleOnline()
        }
        return
      }
    } catch {
      // Health check failed
    }

    // If navigator says offline or health check failed, we're offline
    if (!isNavigatorOnline && status !== 'offline') {
      handleOffline()
    }
  }, [status, handleOnline, handleOffline])

  // Set up event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  // Set up polling for additional checks
  useEffect(() => {
    if (pollingInterval <= 0) return

    const interval = setInterval(checkNetworkStatus, pollingInterval)

    return () => clearInterval(interval)
  }, [pollingInterval, checkNetworkStatus])

  return {
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    lastStatusChange,
  }
}

// =============================================
// Utility: Get current network status synchronously
// =============================================

/**
 * Get current network status without hook (useful for non-React code)
 */
export function getNetworkStatus(): NetworkStatus {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }
  return navigator.onLine ? 'online' : 'offline'
}

/**
 * Check if currently online
 */
export function isOnlineNow(): boolean {
  return getNetworkStatus() === 'online'
}

/**
 * Check if currently offline
 */
export function isOfflineNow(): boolean {
  return getNetworkStatus() === 'offline'
}
