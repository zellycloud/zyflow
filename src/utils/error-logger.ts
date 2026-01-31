/**
 * Error Logger Implementation
 * Captures, persists, and manages error logs
 * @module utils/error-logger
 */

import { ErrorContext, ErrorCode, ErrorSeverity, ErrorType } from '@/types/errors'

// =============================================
// Constants
// =============================================

const MAX_IN_MEMORY_LOGS = 50
const MAX_LOCAL_STORAGE_LOGS = 500
const LOCAL_STORAGE_KEY = 'zyflow_error_logs'
const LOCAL_STORAGE_CHUNK_SIZE = 50
const LOCAL_STORAGE_PREFIX = 'zyflow_error_logs_'

// =============================================
// Error Logger Class
// =============================================

export class ErrorLogger {
  private logs: ErrorContext[] = []
  private initialized = false

  constructor() {
    this.initialize()
  }

  /**
   * Initialize error logger and load from localStorage
   */
  private initialize(): void {
    if (this.initialized) return

    try {
      this.loadFromLocalStorage()
      this.initialized = true
    } catch (error) {
      console.warn('Failed to initialize error logger', error)
      this.initialized = true
    }
  }

  /**
   * Log an error with context
   */
  log(error: ErrorContext): ErrorContext {
    const timestamp = Date.now()
    const contextWithTimestamp: ErrorContext = {
      ...error,
      timestamp: error.timestamp || timestamp,
    }

    // Add to in-memory log
    this.logs.unshift(contextWithTimestamp)

    // Maintain max in-memory size
    if (this.logs.length > MAX_IN_MEMORY_LOGS) {
      this.logs = this.logs.slice(0, MAX_IN_MEMORY_LOGS)
    }

    // Persist to localStorage
    try {
      this.persistToLocalStorage()
    } catch (error) {
      console.warn('Failed to persist error log to localStorage', error)
    }

    return contextWithTimestamp
  }

  /**
   * Get error history
   */
  getHistory(limit: number = 20): ErrorContext[] {
    return this.logs.slice(0, limit)
  }

  /**
   * Get all errors
   */
  getAllErrors(): ErrorContext[] {
    return [...this.logs]
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type: ErrorType, limit: number = 20): ErrorContext[] {
    return this.logs.filter((log) => log.type === type).slice(0, limit)
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity, limit: number = 20): ErrorContext[] {
    return this.logs.filter((log) => log.severity === severity).slice(0, limit)
  }

  /**
   * Get errors by code
   */
  getErrorsByCode(code: ErrorCode, limit: number = 20): ErrorContext[] {
    return this.logs.filter((log) => log.code === code).slice(0, limit)
  }

  /**
   * Get errors by component
   */
  getErrorsByComponent(component: string, limit: number = 20): ErrorContext[] {
    return this.logs.filter((log) => log.component === component).slice(0, limit)
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    total: number
    byType: Record<ErrorType, number>
    bySeverity: Record<ErrorSeverity, number>
    byCode: Record<string, number>
  } {
    const stats = {
      total: this.logs.length,
      byType: {} as Record<ErrorType, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      byCode: {} as Record<string, number>,
    }

    this.logs.forEach((log) => {
      // Count by type
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1

      // Count by severity
      stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1

      // Count by code
      stats.byCode[log.code] = (stats.byCode[log.code] || 0) + 1
    })

    return stats
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.logs = []
    try {
      this.clearLocalStorage()
    } catch (error) {
      console.warn('Failed to clear localStorage', error)
    }
  }

  /**
   * Clear errors older than specified milliseconds
   */
  clearOlderThan(milliseconds: number): number {
    const cutoffTime = Date.now() - milliseconds
    const beforeCount = this.logs.length

    this.logs = this.logs.filter((log) => log.timestamp > cutoffTime)

    const deletedCount = beforeCount - this.logs.length

    if (deletedCount > 0) {
      try {
        this.persistToLocalStorage()
      } catch (error) {
        console.warn('Failed to persist after clearing old logs', error)
      }
    }

    return deletedCount
  }

  /**
   * Export error logs as JSON
   */
  export(): {
    version: string
    exportedAt: number
    errors: ErrorContext[]
  } {
    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      errors: [...this.logs],
    }
  }

  /**
   * Export error logs as CSV
   */
  exportAsCSV(): string {
    if (this.logs.length === 0) {
      return 'No errors to export'
    }

    const headers = [
      'Timestamp',
      'Code',
      'Severity',
      'Type',
      'Message',
      'Component',
      'Function',
      'User Action',
    ]

    const rows = this.logs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.code,
      log.severity,
      log.type,
      `"${log.message.replace(/"/g, '""')}"`,
      log.component || '',
      log.function || '',
      log.userAction || '',
    ])

    return [headers, ...rows].map((row) => row.join(',')).join('\n')
  }

  /**
   * Search errors by message or component
   */
  search(
    query: string,
    options: {
      searchMessage?: boolean
      searchComponent?: boolean
      searchFunction?: boolean
      caseSensitive?: boolean
      limit?: number
    } = {}
  ): ErrorContext[] {
    const {
      searchMessage = true,
      searchComponent = true,
      searchFunction = true,
      caseSensitive = false,
      limit = 20,
    } = options

    const pattern = caseSensitive ? query : query.toLowerCase()

    return this.logs
      .filter((log) => {
        if (searchMessage && this.matchesPattern(log.message, pattern, caseSensitive)) return true
        if (searchComponent && this.matchesPattern(log.component || '', pattern, caseSensitive)) return true
        if (searchFunction && this.matchesPattern(log.function || '', pattern, caseSensitive)) return true
        return false
      })
      .slice(0, limit)
  }

  /**
   * Get error frequency for trend analysis
   */
  getFrequency(
    timewindowMs: number = 3600000 // 1 hour
  ): {
    window: string
    count: number
    errors: Array<{
      code: string
      count: number
    }>
  } {
    const cutoffTime = Date.now() - timewindowMs
    const recentErrors = this.logs.filter((log) => log.timestamp > cutoffTime)

    const byCode: Record<string, number> = {}
    recentErrors.forEach((log) => {
      byCode[log.code] = (byCode[log.code] || 0) + 1
    })

    return {
      window: `${Math.round(timewindowMs / 1000)}s`,
      count: recentErrors.length,
      errors: Object.entries(byCode)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    }
  }

  /**
   * Persist logs to localStorage
   */
  private persistToLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return

      // Clear old chunks first
      this.clearLocalStorage()

      // Split logs into chunks for localStorage limits
      const allLogs = this.logs
      const chunks = []

      for (let i = 0; i < allLogs.length; i += LOCAL_STORAGE_CHUNK_SIZE) {
        chunks.push(allLogs.slice(i, i + LOCAL_STORAGE_CHUNK_SIZE))
      }

      // Store chunks
      chunks.forEach((chunk, index) => {
        const key = `${LOCAL_STORAGE_PREFIX}${index}`
        localStorage.setItem(key, JSON.stringify(chunk))
      })

      // Store chunk count
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_chunks`, JSON.stringify(chunks.length))
    } catch (error) {
      // Silently fail if localStorage is full or unavailable
      console.warn('Failed to persist error logs', error)
    }
  }

  /**
   * Load logs from localStorage
   */
  private loadFromLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return

      const chunksStr = localStorage.getItem(`${LOCAL_STORAGE_KEY}_chunks`)
      if (!chunksStr) return

      const chunkCount = JSON.parse(chunksStr) as number
      const allLogs: ErrorContext[] = []

      for (let i = 0; i < chunkCount; i++) {
        const key = `${LOCAL_STORAGE_PREFIX}${i}`
        const chunkStr = localStorage.getItem(key)
        if (chunkStr) {
          const chunk = JSON.parse(chunkStr) as ErrorContext[]
          allLogs.push(...chunk)
        }
      }

      // Limit to max size
      this.logs = allLogs.slice(0, MAX_LOCAL_STORAGE_LOGS)
    } catch (error) {
      console.warn('Failed to load error logs from localStorage', error)
    }
  }

  /**
   * Clear localStorage
   */
  private clearLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return

      const chunksStr = localStorage.getItem(`${LOCAL_STORAGE_KEY}_chunks`)
      if (chunksStr) {
        const chunkCount = JSON.parse(chunksStr) as number
        for (let i = 0; i < chunkCount; i++) {
          localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${i}`)
        }
        localStorage.removeItem(`${LOCAL_STORAGE_KEY}_chunks`)
      }
    } catch (error) {
      console.warn('Failed to clear localStorage', error)
    }
  }

  /**
   * Check if pattern matches text
   */
  private matchesPattern(text: string, pattern: string, caseSensitive: boolean): boolean {
    const searchText = caseSensitive ? text : text.toLowerCase()
    return searchText.includes(pattern)
  }
}

// =============================================
// Singleton Instance
// =============================================

let loggerInstance: ErrorLogger | null = null

export function getErrorLogger(): ErrorLogger {
  if (!loggerInstance) {
    loggerInstance = new ErrorLogger()
  }
  return loggerInstance
}

/**
 * Quick logging function
 */
export function logError(context: ErrorContext): ErrorContext {
  return getErrorLogger().log(context)
}
