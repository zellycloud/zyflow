/**
 * Network Status Hook Tests
 *
 * Tests for useNetworkStatus hook and network detection
 * @module hooks/__tests__/useNetworkStatus.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useNetworkStatus,
  getNetworkStatus,
  isOnlineNow,
  isOfflineNow,
} from '../useNetworkStatus'

// =============================================
// Test Setup
// =============================================

describe('Network Status Detection', () => {
  let originalNavigator: any

  beforeEach(() => {
    // Save original navigator
    originalNavigator = global.navigator

    // Mock navigator.onLine
    Object.defineProperty(global.navigator, 'onLine', {
      writable: true,
      value: true,
    })
  })

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
    })
    vi.clearAllMocks()
  })

  // =============================================
  // Synchronous Utility Tests
  // =============================================

  describe('getNetworkStatus', () => {
    it('should return online when navigator.onLine is true', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true,
      })

      expect(getNetworkStatus()).toBe('online')
    })

    it('should return offline when navigator.onLine is false', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      })

      expect(getNetworkStatus()).toBe('offline')
    })
  })

  describe('isOnlineNow', () => {
    it('should return true when online', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true,
      })

      expect(isOnlineNow()).toBe(true)
    })

    it('should return false when offline', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      })

      expect(isOnlineNow()).toBe(false)
    })
  })

  describe('isOfflineNow', () => {
    it('should return true when offline', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      })

      expect(isOfflineNow()).toBe(true)
    })

    it('should return false when online', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true,
      })

      expect(isOfflineNow()).toBe(false)
    })
  })

  // =============================================
  // Hook Tests
  // =============================================

  describe('useNetworkStatus', () => {
    it('should initialize with online status', () => {
      const { result } = renderHook(() => useNetworkStatus())

      expect(result.current.isOnline).toBe(true)
      expect(result.current.isOffline).toBe(false)
      expect(result.current.status).toBe('online')
    })

    it('should initialize with offline status', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      })

      const { result } = renderHook(() => useNetworkStatus())

      expect(result.current.isOnline).toBe(false)
      expect(result.current.isOffline).toBe(true)
      expect(result.current.status).toBe('offline')
    })

    it('should detect transition to offline', async () => {
      const { result } = renderHook(() => useNetworkStatus())

      expect(result.current.isOnline).toBe(true)

      // Simulate going offline
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: false,
        })
        window.dispatchEvent(new Event('offline'))
      })

      await waitFor(() => {
        expect(result.current.isOffline).toBe(true)
        expect(result.current.status).toBe('offline')
      })
    })

    it('should detect transition to online', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      })

      const { result } = renderHook(() => useNetworkStatus())

      expect(result.current.isOffline).toBe(true)

      // Simulate coming online
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: true,
        })
        window.dispatchEvent(new Event('online'))
      })

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true)
        expect(result.current.status).toBe('online')
      })
    })

    it('should call onOnline callback when coming online', async () => {
      const onOnline = vi.fn()
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      })

      renderHook(() => useNetworkStatus({ onOnline }))

      // Simulate coming online
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: true,
        })
        window.dispatchEvent(new Event('online'))
      })

      await waitFor(() => {
        expect(onOnline).toHaveBeenCalled()
      })
    })

    it('should call onOffline callback when going offline', async () => {
      const onOffline = vi.fn()
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true,
      })

      renderHook(() => useNetworkStatus({ onOffline }))

      // Simulate going offline
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: false,
        })
        window.dispatchEvent(new Event('offline'))
      })

      await waitFor(() => {
        expect(onOffline).toHaveBeenCalled()
      })
    })

    it('should track lastStatusChange timestamp', async () => {
      const { result } = renderHook(() => useNetworkStatus())

      const initialTime = result.current.lastStatusChange

      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: false,
        })
        window.dispatchEvent(new Event('offline'))
      })

      await waitFor(
        () => {
          expect(result.current.lastStatusChange).toBeGreaterThan(initialTime)
        },
        { timeout: 1000 }
      )
    })

    it('should disable polling when pollingInterval is 0', () => {
      const { unmount } = renderHook(() =>
        useNetworkStatus({ pollingInterval: 0 })
      )

      // Should not throw or cause issues
      expect(() => unmount()).not.toThrow()
    })

    it('should cleanup event listeners on unmount', () => {
      const { unmount } = renderHook(() => useNetworkStatus())

      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'online',
        expect.any(Function)
      )
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'offline',
        expect.any(Function)
      )

      removeEventListenerSpy.mockRestore()
    })

    it('should handle multiple status transitions', async () => {
      const { result } = renderHook(() => useNetworkStatus())

      // Online -> Offline
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: false,
        })
        window.dispatchEvent(new Event('offline'))
      })

      await waitFor(() => {
        expect(result.current.isOffline).toBe(true)
      })

      // Offline -> Online
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: true,
        })
        window.dispatchEvent(new Event('online'))
      })

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true)
      })

      // Online -> Offline
      act(() => {
        Object.defineProperty(global.navigator, 'onLine', {
          writable: true,
          value: false,
        })
        window.dispatchEvent(new Event('offline'))
      })

      await waitFor(() => {
        expect(result.current.isOffline).toBe(true)
      })
    })
  })
})
