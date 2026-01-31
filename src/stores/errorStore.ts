/**
 * Global Error Store (Zustand)
 * Manages global error state with deduplication, prioritization, and persistence
 * @module stores/errorStore
 */

import { create } from 'zustand'
import { ErrorContext, ErrorSeverity, ErrorType } from '@/types/errors'
import { getErrorLogger } from '@/utils/error-logger'

// =============================================
// Store State Interface
// =============================================

export interface ErrorStoreState {
  // Active errors displayed to user
  activeErrors: ErrorContext[]

  // All error history
  history: ErrorContext[]

  // Queued errors waiting to be displayed
  queue: ErrorContext[]

  // Deduplication map for preventing toast spam
  deduplicationMap: Map<string, ErrorContext>

  // Store state
  isInitialized: boolean
  maxActiveErrors: number
  maxHistorySize: number
}

export interface ErrorStoreActions {
  // Add error
  addError: (error: ErrorContext) => void

  // Clear specific error
  clearError: (id: string) => void

  // Clear all errors
  clearAll: () => void

  // Get errors
  getErrors: (filter?: {
    type?: ErrorType
    severity?: ErrorSeverity
    component?: string
  }) => ErrorContext[]

  // Get error by code
  getErrorByCode: (code: string) => ErrorContext | undefined

  // Mark error as read/handled
  markAsHandled: (id: string) => void

  // Process queue (move queued errors to active)
  processQueue: () => void

  // Get deduplication key
  getDeduplicationKey: (error: ErrorContext) => string

  // Initialize store
  initialize: () => void

  // Export errors
  exportErrors: () => ErrorContext[]
}

export type ErrorStore = ErrorStoreState & ErrorStoreActions

// =============================================
// Helper Functions
// =============================================

/**
 * Create a unique ID for error context
 */
function createErrorId(): string {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get deduplication key for error
 */
function getDeduplicationKey(error: ErrorContext): string {
  const { code, component, function: fn } = error
  return `${code}::${component || 'unknown'}::${fn || 'unknown'}`
}

/**
 * Check if errors are identical (for deduplication)
 */
function areErrorsIdentical(error1: ErrorContext, error2: ErrorContext): boolean {
  return (
    error1.code === error2.code &&
    error1.component === error2.component &&
    error1.function === error2.function
  )
}

/**
 * Sort errors by severity for prioritization
 */
function sortBySeverity(errors: ErrorContext[]): ErrorContext[] {
  const severityOrder = {
    [ErrorSeverity.CRITICAL]: 0,
    [ErrorSeverity.ERROR]: 1,
    [ErrorSeverity.WARNING]: 2,
    [ErrorSeverity.INFO]: 3,
  }

  return [...errors].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  )
}

// =============================================
// Zustand Store
// =============================================

export const useErrorStore = create<ErrorStore>((set, get) => ({
  // Initial state
  activeErrors: [],
  history: [],
  queue: [],
  deduplicationMap: new Map(),
  isInitialized: false,
  maxActiveErrors: 3,
  maxHistorySize: 100,

  // Initialize store
  initialize: () => {
    set({ isInitialized: true })
  },

  // Add error
  addError: (error: ErrorContext) => {
    const state = get()
    const deduplicationKey = getDeduplicationKey(error)

    // Check for duplicates
    const existingError = state.deduplicationMap.get(deduplicationKey)
    if (existingError) {
      // Update deduplication count
      existingError.count = (existingError.count || 1) + 1
      existingError.lastOccurrence = Date.now()

      // Move to front if active
      set((prev) => ({
        activeErrors: [
          existingError,
          ...prev.activeErrors.filter((e) => getDeduplicationKey(e) !== deduplicationKey),
        ],
      }))

      return
    }

    // Log error to logger
    getErrorLogger().log(error)

    // Determine if we should add to active or queue
    const newActive = [error, ...state.activeErrors]
    const sorted = sortBySeverity(newActive)

    // Split into active and queued
    const maxActive = state.maxActiveErrors
    const activeErrors = sorted.slice(0, maxActive)
    const queue = sorted.slice(maxActive)

    // Update deduplication map
    const newDeduplicationMap = new Map(state.deduplicationMap)
    newDeduplicationMap.set(deduplicationKey, error)

    // Maintain deduplication map size
    if (newDeduplicationMap.size > state.maxHistorySize) {
      const entries = Array.from(newDeduplicationMap.entries())
      const oldestEntry = entries[0]
      newDeduplicationMap.delete(oldestEntry[0])
    }

    set((prev) => ({
      activeErrors,
      queue,
      deduplicationMap: newDeduplicationMap,
      history: [error, ...prev.history].slice(0, state.maxHistorySize),
    }))
  },

  // Clear specific error
  clearError: (id: string) => {
    set((prev) => ({
      activeErrors: prev.activeErrors.filter((e) => createErrorId() !== id),
    }))
  },

  // Clear all errors
  clearAll: () => {
    set({
      activeErrors: [],
      queue: [],
      deduplicationMap: new Map(),
    })
  },

  // Get errors with filter
  getErrors: (filter) => {
    const state = get()
    let errors = [...state.activeErrors, ...state.queue]

    if (filter?.type) {
      errors = errors.filter((e) => e.type === filter.type)
    }
    if (filter?.severity) {
      errors = errors.filter((e) => e.severity === filter.severity)
    }
    if (filter?.component) {
      errors = errors.filter((e) => e.component === filter.component)
    }

    return errors
  },

  // Get error by code
  getErrorByCode: (code: string) => {
    const state = get()
    return state.activeErrors.find((e) => e.code === code)
  },

  // Mark error as handled
  markAsHandled: (id: string) => {
    // Implementation for tracking handled errors
    // Can be used for analytics
  },

  // Process queue
  processQueue: () => {
    const state = get()
    if (state.queue.length === 0) return

    const maxActive = state.maxActiveErrors
    const newActive = [
      ...state.activeErrors,
      ...state.queue.slice(0, Math.max(0, maxActive - state.activeErrors.length)),
    ]
    const remainingQueue = state.queue.slice(Math.max(0, maxActive - state.activeErrors.length))

    set({
      activeErrors: sortBySeverity(newActive),
      queue: remainingQueue,
    })
  },

  // Get deduplication key
  getDeduplicationKey: (error: ErrorContext) => {
    return getDeduplicationKey(error)
  },

  // Export errors
  exportErrors: () => {
    const state = get()
    return [
      ...state.activeErrors,
      ...state.queue,
      ...state.history,
    ]
  },
}))

// =============================================
// Selectors
// =============================================

export const selectActiveErrors = (state: ErrorStore) => state.activeErrors
export const selectErrorHistory = (state: ErrorStore) => state.history
export const selectErrorQueue = (state: ErrorStore) => state.queue
export const selectErrorCount = (state: ErrorStore) => state.activeErrors.length
export const selectHasCriticalErrors = (state: ErrorStore) =>
  state.activeErrors.some((e) => e.severity === ErrorSeverity.CRITICAL)
export const selectHasErrors = (state: ErrorStore) => state.activeErrors.length > 0

// =============================================
// Hooks for common operations
// =============================================

export function useErrorStore_addError(error: ErrorContext): void {
  useErrorStore.getState().addError(error)
}

export function useErrorStore_clearAll(): void {
  useErrorStore.getState().clearAll()
}

export function useErrorStore_getErrors(filter?: {
  type?: ErrorType
  severity?: ErrorSeverity
  component?: string
}): ErrorContext[] {
  return useErrorStore.getState().getErrors(filter)
}
