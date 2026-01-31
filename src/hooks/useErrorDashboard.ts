/**
 * Error Dashboard Hook
 * Provides error dashboard functionality
 * @module hooks/useErrorDashboard
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ErrorContext, ErrorSeverity, ErrorType } from '@/types/errors'
import { getErrorLogger } from '@/utils/error-logger'
import {
  calculateErrorStats,
  calculateErrorTrend,
  calculateErrorFrequency,
  getErrorPatterns,
} from '@/utils/error-statistics'

// =============================================
// Types
// =============================================

export interface FilterOptions {
  searchText: string
  errorType?: ErrorType
  severity?: ErrorSeverity
  dateRange: [Date, Date]
  component?: string
}

export interface ErrorDashboardState {
  errors: ErrorContext[]
  filteredErrors: ErrorContext[]
  selectedError: ErrorContext | null
  filters: FilterOptions
  isLoading: boolean
  stats: ReturnType<typeof calculateErrorStats>
  trend: ReturnType<typeof calculateErrorTrend>
  frequency: Map<string, number>
  patterns: ReturnType<typeof getErrorPatterns>
}

export interface ErrorDashboardActions {
  setSelectedError: (error: ErrorContext | null) => void
  setFilters: (filters: FilterOptions) => void
  clearAllErrors: () => void
  exportJSON: () => void
  exportCSV: () => void
  refreshErrors: () => void
}

// =============================================
// Hook
// =============================================

export function useErrorDashboard(): ErrorDashboardState & ErrorDashboardActions {
  const [errors, setErrors] = useState<ErrorContext[]>([])
  const [selectedError, setSelectedError] = useState<ErrorContext | null>(null)
  const [filters, setFilters] = useState<FilterOptions>({
    searchText: '',
    dateRange: [
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date(),
    ],
  })
  const [isLoading, setIsLoading] = useState(true)

  // Load errors on mount
  useEffect(() => {
    const loadErrors = () => {
      const logger = getErrorLogger()
      const allErrors = logger.getAllErrors()
      setErrors(allErrors)
      setIsLoading(false)
    }

    loadErrors()

    // Refresh every 5 seconds
    const interval = setInterval(loadErrors, 5000)
    return () => clearInterval(interval)
  }, [])

  // Filter errors
  const filteredErrors = useMemo(() => {
    return errors.filter((error) => {
      // Search text filter
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase()
        const matchesSearch =
          error.code.toLowerCase().includes(searchLower) ||
          error.message.toLowerCase().includes(searchLower) ||
          error.component?.toLowerCase().includes(searchLower) ||
          error.function?.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Type filter
      if (filters.errorType && error.type !== filters.errorType) {
        return false
      }

      // Severity filter
      if (filters.severity && error.severity !== filters.severity) {
        return false
      }

      // Component filter
      if (filters.component && error.component !== filters.component) {
        return false
      }

      // Date range filter
      const errorTime = error.timestamp
      const [startDate, endDate] = filters.dateRange
      if (
        errorTime < startDate.getTime() ||
        errorTime > endDate.getTime()
      ) {
        return false
      }

      return true
    })
  }, [errors, filters])

  // Calculate statistics
  const stats = useMemo(() => {
    return calculateErrorStats(filteredErrors)
  }, [filteredErrors])

  // Calculate trend
  const trend = useMemo(() => {
    return calculateErrorTrend(filteredErrors, '24h')
  }, [filteredErrors])

  // Calculate frequency
  const frequency = useMemo(() => {
    return calculateErrorFrequency(filteredErrors)
  }, [filteredErrors])

  // Get patterns
  const patterns = useMemo(() => {
    return getErrorPatterns(filteredErrors)
  }, [filteredErrors])

  // Export as JSON
  const exportJSON = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      filters,
      errorCount: filteredErrors.length,
      errors: filteredErrors,
      statistics: stats,
    }

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-log-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredErrors, filters, stats])

  // Export as CSV
  const exportCSV = useCallback(() => {
    const headers = [
      'Timestamp',
      'Code',
      'Message',
      'Type',
      'Severity',
      'Component',
      'Function',
      'Recoverable',
    ]

    const rows = filteredErrors.map((error) => [
      new Date(error.timestamp).toISOString(),
      error.code,
      error.message,
      error.type,
      error.severity,
      error.component || '',
      error.function || '',
      error.recoverable ? 'Yes' : 'No',
    ])

    const csv =
      headers.join(',') +
      '\n' +
      rows
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-log-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredErrors])

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    if (confirm('Are you sure you want to clear all error logs?')) {
      const logger = getErrorLogger()
      logger.clear()
      setErrors([])
      setSelectedError(null)
    }
  }, [])

  // Refresh errors
  const refreshErrors = useCallback(() => {
    const logger = getErrorLogger()
    const allErrors = logger.getAllErrors()
    setErrors(allErrors)
  }, [])

  return {
    errors,
    filteredErrors,
    selectedError,
    filters,
    isLoading,
    stats,
    trend,
    frequency,
    patterns,
    setSelectedError,
    setFilters,
    clearAllErrors,
    exportJSON,
    exportCSV,
    refreshErrors,
  }
}
