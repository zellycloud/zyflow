/**
 * Offline Mode Store (Zustand)
 *
 * Manages offline state, queued operations, and synchronization
 * @module stores/offlineStore
 */

import { create } from 'zustand'
import { nanoid } from 'nanoid'

// =============================================
// Types
// =============================================

export type QueuedOperationType = 'create' | 'update' | 'delete' | 'patch'

export interface QueuedOperation {
  id: string
  type: QueuedOperationType
  endpoint: string
  method: string
  body?: unknown
  timestamp: number
  retryCount: number
  lastError?: string
}

export interface OfflineStoreState {
  // Online/offline state
  isOnline: boolean
  lastOnlineTime: number
  lastOfflineTime: number

  // Queued operations
  queue: QueuedOperation[]

  // Sync state
  isSyncing: boolean
  syncProgress: {
    completed: number
    total: number
  }
  lastSyncTime?: number
  lastSyncError?: string

  // Settings
  maxQueueSize: number
  maxRetries: number
}

export interface OfflineStoreActions {
  // Online/offline management
  setOnline: (isOnline: boolean) => void

  // Queue operations
  addToQueue: (
    operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>
  ) => string
  removeFromQueue: (id: string) => void
  getQueuedOperation: (id: string) => QueuedOperation | undefined
  getAllQueued: () => QueuedOperation[]
  getQueuedByEndpoint: (endpoint: string) => QueuedOperation[]

  // Sync operations
  setSyncing: (isSyncing: boolean) => void
  updateSyncProgress: (completed: number, total: number) => void
  setSyncError: (error: string | undefined) => void
  markSyncComplete: () => void

  // Retry management
  incrementRetryCount: (id: string) => void
  setOperationError: (id: string, error: string) => void

  // Clear operations
  clearQueue: () => void
  clearExpiredOperations: (maxAgeMs: number) => number

  // Export
  exportQueue: () => QueuedOperation[]
}

export type OfflineStore = OfflineStoreState & OfflineStoreActions

// =============================================
// Zustand Store
// =============================================

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  // Initial state
  isOnline: true,
  lastOnlineTime: Date.now(),
  lastOfflineTime: 0,
  queue: [],
  isSyncing: false,
  syncProgress: { completed: 0, total: 0 },
  maxQueueSize: 100,
  maxRetries: 5,

  // Set online/offline
  setOnline: (isOnline: boolean) => {
    const now = Date.now()
    set((state) => ({
      isOnline,
      lastOnlineTime: isOnline ? now : state.lastOnlineTime,
      lastOfflineTime: !isOnline ? now : state.lastOfflineTime,
    }))
  },

  // Add to queue
  addToQueue: (operation) => {
    const id = nanoid()
    const newOperation: QueuedOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0,
    }

    set((state) => {
      // Check queue size limit
      if (state.queue.length >= state.maxQueueSize) {
        console.warn('Queue is full, removing oldest operation')
        return {
          queue: [...state.queue.slice(1), newOperation],
        }
      }

      return {
        queue: [...state.queue, newOperation],
      }
    })

    return id
  },

  // Remove from queue
  removeFromQueue: (id: string) => {
    set((state) => ({
      queue: state.queue.filter((op) => op.id !== id),
    }))
  },

  // Get queued operation
  getQueuedOperation: (id: string) => {
    const state = get()
    return state.queue.find((op) => op.id === id)
  },

  // Get all queued
  getAllQueued: () => {
    return get().queue
  },

  // Get queued by endpoint
  getQueuedByEndpoint: (endpoint: string) => {
    return get().queue.filter((op) => op.endpoint === endpoint)
  },

  // Set syncing state
  setSyncing: (isSyncing: boolean) => {
    set({ isSyncing })
  },

  // Update sync progress
  updateSyncProgress: (completed: number, total: number) => {
    set({
      syncProgress: { completed, total },
    })
  },

  // Set sync error
  setSyncError: (error: string | undefined) => {
    set({
      lastSyncError: error,
    })
  },

  // Mark sync complete
  markSyncComplete: () => {
    set({
      isSyncing: false,
      lastSyncTime: Date.now(),
      lastSyncError: undefined,
      syncProgress: { completed: 0, total: 0 },
    })
  },

  // Increment retry count
  incrementRetryCount: (id: string) => {
    set((state) => ({
      queue: state.queue.map((op) =>
        op.id === id ? { ...op, retryCount: op.retryCount + 1 } : op
      ),
    }))
  },

  // Set operation error
  setOperationError: (id: string, error: string) => {
    set((state) => ({
      queue: state.queue.map((op) =>
        op.id === id ? { ...op, lastError: error } : op
      ),
    }))
  },

  // Clear queue
  clearQueue: () => {
    set({ queue: [] })
  },

  // Clear expired operations
  clearExpiredOperations: (maxAgeMs: number) => {
    const cutoffTime = Date.now() - maxAgeMs
    const state = get()
    const beforeCount = state.queue.length

    set({
      queue: state.queue.filter((op) => op.timestamp > cutoffTime),
    })

    return beforeCount - get().queue.length
  },

  // Export queue
  exportQueue: () => {
    return [...get().queue]
  },
}))

// =============================================
// Selectors
// =============================================

export const selectIsOnline = (state: OfflineStore) => state.isOnline
export const selectIsOffline = (state: OfflineStore) => !state.isOnline
export const selectQueue = (state: OfflineStore) => state.queue
export const selectQueueLength = (state: OfflineStore) => state.queue.length
export const selectQueueSize = (state: OfflineStore) => state.maxQueueSize
export const selectIsSyncing = (state: OfflineStore) => state.isSyncing
export const selectSyncProgress = (state: OfflineStore) => state.syncProgress
export const selectLastSyncTime = (state: OfflineStore) => state.lastSyncTime
export const selectLastSyncError = (state: OfflineStore) => state.lastSyncError
export const selectHasQueuedOperations = (state: OfflineStore) =>
  state.queue.length > 0

// =============================================
// Helper Hooks
// =============================================

export function useOfflineStore_addToQueue(
  operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>
): string {
  return useOfflineStore.getState().addToQueue(operation)
}

export function useOfflineStore_setOnline(isOnline: boolean): void {
  useOfflineStore.getState().setOnline(isOnline)
}

export function useOfflineStore_getQueue(): QueuedOperation[] {
  return useOfflineStore.getState().getAllQueued()
}

export function useOfflineStore_syncComplete(): void {
  useOfflineStore.getState().markSyncComplete()
}
