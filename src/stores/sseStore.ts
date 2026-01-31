/**
 * SSE Connection Store (Zustand)
 *
 * Manages SSE connection state and reconnection attempts
 * @module stores/sseStore
 */

import { create } from 'zustand'

// =============================================
// Types
// =============================================

export type SSEConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'failed'

export interface SSEConnectionInfo {
  status: SSEConnectionStatus
  reconnectAttempt: number
  maxReconnectAttempts: number
  lastConnectionTime?: number
  lastDisconnectionTime?: number
  lastError?: string
  nextRetryIn?: number // milliseconds
}

export interface SSEStoreState {
  connection: SSEConnectionInfo

  // Event queue while disconnected
  queuedEvents: Array<{
    type: string
    data: unknown
    timestamp: number
  }>

  // Settings
  maxQueueSize: number
  initialRetryDelayMs: number
  maxRetryDelayMs: number
}

export interface SSEStoreActions {
  // Connection state
  setConnected: () => void
  setConnecting: () => void
  setDisconnected: (error?: string) => void
  setReconnecting: (attempt: number) => void
  setFailed: (error: string) => void
  setNextRetryIn: (ms: number) => void

  // Reconnection management
  incrementReconnectAttempt: () => void
  resetReconnectAttempts: () => void

  // Event queuing
  queueEvent: (type: string, data: unknown) => void
  getQueuedEvents: () => SSEStoreState['queuedEvents']
  clearQueue: () => void
  removeQueuedEvent: (index: number) => void
}

export type SSEStore = SSEStoreState & SSEStoreActions

// =============================================
// Zustand Store
// =============================================

export const useSSEStore = create<SSEStore>((set, get) => ({
  // Initial state
  connection: {
    status: 'disconnected',
    reconnectAttempt: 0,
    maxReconnectAttempts: 10,
  },
  queuedEvents: [],
  maxQueueSize: 100,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,

  // Set connected
  setConnected: () => {
    set((state) => ({
      connection: {
        ...state.connection,
        status: 'connected',
        lastConnectionTime: Date.now(),
        lastError: undefined,
        nextRetryIn: undefined,
      },
    }))
  },

  // Set connecting
  setConnecting: () => {
    set((state) => ({
      connection: {
        ...state.connection,
        status: 'connecting',
      },
    }))
  },

  // Set disconnected
  setDisconnected: (error?: string) => {
    set((state) => ({
      connection: {
        ...state.connection,
        status: 'disconnected',
        lastDisconnectionTime: Date.now(),
        lastError: error,
        nextRetryIn: undefined,
      },
    }))
  },

  // Set reconnecting
  setReconnecting: (attempt: number) => {
    set((state) => ({
      connection: {
        ...state.connection,
        status: 'reconnecting',
        reconnectAttempt: attempt,
      },
    }))
  },

  // Set failed
  setFailed: (error: string) => {
    set((state) => ({
      connection: {
        ...state.connection,
        status: 'failed',
        lastError: error,
        lastDisconnectionTime: Date.now(),
      },
    }))
  },

  // Set next retry
  setNextRetryIn: (ms: number) => {
    set((state) => ({
      connection: {
        ...state.connection,
        nextRetryIn: ms,
      },
    }))
  },

  // Increment reconnect attempt
  incrementReconnectAttempt: () => {
    set((state) => ({
      connection: {
        ...state.connection,
        reconnectAttempt: state.connection.reconnectAttempt + 1,
      },
    }))
  },

  // Reset reconnect attempts
  resetReconnectAttempts: () => {
    set((state) => ({
      connection: {
        ...state.connection,
        reconnectAttempt: 0,
      },
    }))
  },

  // Queue event
  queueEvent: (type: string, data: unknown) => {
    set((state) => {
      const newQueue = [
        ...state.queuedEvents,
        { type, data, timestamp: Date.now() },
      ]

      // Limit queue size
      if (newQueue.length > state.maxQueueSize) {
        newQueue.shift() // Remove oldest event
      }

      return { queuedEvents: newQueue }
    })
  },

  // Get queued events
  getQueuedEvents: () => {
    return get().queuedEvents
  },

  // Clear queue
  clearQueue: () => {
    set({ queuedEvents: [] })
  },

  // Remove single queued event
  removeQueuedEvent: (index: number) => {
    set((state) => ({
      queuedEvents: state.queuedEvents.filter((_, i) => i !== index),
    }))
  },
}))

// =============================================
// Selectors
// =============================================

export const selectConnectionStatus = (state: SSEStore) =>
  state.connection.status
export const selectIsConnected = (state: SSEStore) =>
  state.connection.status === 'connected'
export const selectIsDisconnected = (state: SSEStore) =>
  state.connection.status === 'disconnected' || state.connection.status === 'failed'
export const selectIsReconnecting = (state: SSEStore) =>
  state.connection.status === 'reconnecting'
export const selectReconnectAttempt = (state: SSEStore) =>
  state.connection.reconnectAttempt
export const selectMaxReconnectAttempts = (state: SSEStore) =>
  state.connection.maxReconnectAttempts
export const selectQueuedEventsCount = (state: SSEStore) =>
  state.queuedEvents.length
export const selectHasQueuedEvents = (state: SSEStore) =>
  state.queuedEvents.length > 0
export const selectLastError = (state: SSEStore) =>
  state.connection.lastError
export const selectConnectionInfo = (state: SSEStore) =>
  state.connection

// =============================================
// Helper Hooks
// =============================================

export function useSSEStore_setConnected(): void {
  useSSEStore.getState().setConnected()
}

export function useSSEStore_setDisconnected(error?: string): void {
  useSSEStore.getState().setDisconnected(error)
}

export function useSSEStore_queueEvent(type: string, data: unknown): void {
  useSSEStore.getState().queueEvent(type, data)
}

export function useSSEStore_resetReconnectAttempts(): void {
  useSSEStore.getState().resetReconnectAttempts()
}
