/**
 * Offline Queue Manager
 *
 * Manages queuing and synchronization of API requests during offline mode
 * Persists queue to localStorage for recovery across sessions
 *
 * @module api/offline-queue
 */

import { useOfflineStore, QueuedOperation } from '@/stores/offlineStore'
import { api } from './client'

// =============================================
// Constants
// =============================================

const OFFLINE_QUEUE_KEY = 'zyflow_offline_queue'
const OFFLINE_QUEUE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// =============================================
// Types
// =============================================

export interface SyncResult {
  successful: QueuedOperation[]
  failed: Array<{
    operation: QueuedOperation
    error: string
  }>
  skipped: QueuedOperation[]
}

export interface OfflineQueueOptions {
  /** Persist queue to localStorage (default: true) */
  persist?: boolean
  /** Auto-sync when coming online (default: true) */
  autoSync?: boolean
  /** Callback when sync completes */
  onSyncComplete?: (result: SyncResult) => void
  /** Callback when sync error occurs */
  onSyncError?: (error: Error) => void
}

// =============================================
// Offline Queue Manager Class
// =============================================

export class OfflineQueueManager {
  private options: OfflineQueueOptions
  private isSyncing = false

  constructor(options: OfflineQueueOptions = {}) {
    this.options = {
      persist: options.persist !== false,
      autoSync: options.autoSync !== false,
      onSyncComplete: options.onSyncComplete,
      onSyncError: options.onSyncError,
    }

    // Load persisted queue on init
    if (this.options.persist) {
      this.loadFromStorage()
    }
  }

  /**
   * Queue an operation for later execution
   */
  queueOperation(
    type: QueuedOperation['type'],
    endpoint: string,
    method: string,
    body?: unknown
  ): string {
    return useOfflineStore.getState().addToQueue({
      type,
      endpoint,
      method,
      body,
    })
  }

  /**
   * Synchronize queued operations
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.warn('Sync already in progress')
      return { successful: [], failed: [], skipped: [] }
    }

    this.isSyncing = true
    const store = useOfflineStore.getState()
    store.setSyncing(true)

    const queue = [...store.getAllQueued()]
    const result: SyncResult = {
      successful: [],
      failed: [],
      skipped: [],
    }

    try {
      for (let i = 0; i < queue.length; i++) {
        const operation = queue[i]
        const total = queue.length

        // Update progress
        store.updateSyncProgress(i, total)

        try {
          // Execute the operation
          await this.executeOperation(operation)

          // Remove from queue on success
          store.removeFromQueue(operation.id)
          result.successful.push(operation)
        } catch (error) {
          // Check max retries
          const maxRetries = store.maxRetries
          if (operation.retryCount >= maxRetries) {
            // Max retries exceeded, remove from queue
            store.removeFromQueue(operation.id)
            result.failed.push({
              operation,
              error: error instanceof Error ? error.message : String(error),
            })
          } else {
            // Increment retry count and keep in queue
            store.incrementRetryCount(operation.id)
            store.setOperationError(
              operation.id,
              error instanceof Error ? error.message : String(error)
            )
            result.skipped.push(operation)
          }
        }
      }

      // Persist updated queue
      if (this.options.persist) {
        this.saveToStorage()
      }

      // Mark sync complete
      store.markSyncComplete()
      this.options.onSyncComplete?.(result)
    } catch (error) {
      store.setSyncError(
        error instanceof Error ? error.message : 'Unknown error'
      )
      this.options.onSyncError?.(
        error instanceof Error ? error : new Error(String(error))
      )
    } finally {
      this.isSyncing = false
    }

    return result
  }

  /**
   * Execute a single queued operation
   */
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    const method = operation.method.toUpperCase()

    switch (method) {
      case 'GET':
        await api.get(operation.endpoint)
        break

      case 'POST':
        await api.post(operation.endpoint, operation.body)
        break

      case 'PUT':
        await api.put(operation.endpoint, operation.body)
        break

      case 'PATCH':
        await api.patch(operation.endpoint, operation.body)
        break

      case 'DELETE':
        await api.delete(operation.endpoint)
        break

      default:
        throw new Error(`Unsupported HTTP method: ${method}`)
    }
  }

  /**
   * Clear all queued operations
   */
  clear(): void {
    useOfflineStore.getState().clearQueue()
    if (this.options.persist) {
      this.clearStorage()
    }
  }

  /**
   * Get current queue
   */
  getQueue(): QueuedOperation[] {
    return useOfflineStore.getState().getAllQueued()
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return useOfflineStore.getState().queue.length
  }

  /**
   * Check if queue has operations
   */
  hasQueuedOperations(): boolean {
    return useOfflineStore.getState().queue.length > 0
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return

      const queue = useOfflineStore.getState().getAllQueued()
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
    } catch (error) {
      console.warn('Failed to save offline queue to storage', error)
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return

      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY)
      if (!stored) return

      const queue = JSON.parse(stored) as QueuedOperation[]
      const store = useOfflineStore.getState()

      // Add stored operations back to queue
      queue.forEach((op) => {
        store.addToQueue({
          type: op.type,
          endpoint: op.endpoint,
          method: op.method,
          body: op.body,
        })
      })
    } catch (error) {
      console.warn('Failed to load offline queue from storage', error)
    }
  }

  /**
   * Clear localStorage
   */
  private clearStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      localStorage.removeItem(OFFLINE_QUEUE_KEY)
    } catch (error) {
      console.warn('Failed to clear offline queue storage', error)
    }
  }

  /**
   * Clean up expired operations (older than 7 days)
   */
  cleanupExpired(): number {
    return useOfflineStore.getState().clearExpiredOperations(OFFLINE_QUEUE_EXPIRY_MS)
  }
}

// =============================================
// Singleton Instance
// =============================================

let queueManagerInstance: OfflineQueueManager | null = null

export function getOfflineQueueManager(
  options?: OfflineQueueOptions
): OfflineQueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new OfflineQueueManager(options)
  }
  return queueManagerInstance
}

/**
 * Initialize offline queue manager with options
 */
export function initializeOfflineQueue(options: OfflineQueueOptions): void {
  queueManagerInstance = new OfflineQueueManager(options)
}

/**
 * Reset offline queue manager
 */
export function resetOfflineQueue(): void {
  queueManagerInstance?.clear()
  queueManagerInstance = null
}

// =============================================
// Utility Functions
// =============================================

/**
 * Quick queue an operation
 */
export function queueOperation(
  type: QueuedOperation['type'],
  endpoint: string,
  method: string,
  body?: unknown
): string {
  return getOfflineQueueManager().queueOperation(type, endpoint, method, body)
}

/**
 * Quick sync
 */
export function syncOfflineQueue(): Promise<SyncResult> {
  return getOfflineQueueManager().sync()
}

/**
 * Check if there are queued operations
 */
export function hasQueuedOperations(): boolean {
  return getOfflineQueueManager().hasQueuedOperations()
}

/**
 * Get queued operations count
 */
export function getQueuedOperationsCount(): number {
  return getOfflineQueueManager().getQueueSize()
}
