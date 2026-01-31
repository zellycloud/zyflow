/**
 * Error Monitoring Dashboard Component
 * Displays error history, statistics, filters, and export options
 * @module components/monitoring/ErrorDashboard
 */

'use client'

import React, { useState, useMemo, useCallback } from 'react'
import {
  ErrorContext,
  ErrorSeverity,
  ErrorType,
} from '@/types/errors'
import { getErrorLogger } from '@/utils/error-logger'
import {
  calculateErrorStats,
  calculateErrorTrend,
  formatRelativeTime,
} from '@/utils/error-statistics'
import ErrorHistoryList from './ErrorHistoryList'
import ErrorStats from './ErrorStats'
import ErrorDetailPanel from './ErrorDetailPanel'
import ErrorFilters from './ErrorFilters'

// =============================================
// Types
// =============================================

interface FilterOptions {
  searchText: string
  errorType?: ErrorType
  severity?: ErrorSeverity
  dateRange: [Date, Date]
  component?: string
}

// =============================================
// Component
// =============================================

export default function ErrorDashboard() {
  const [errors, setErrors] = useState<ErrorContext[]>([])
  const [selectedError, setSelectedError] = useState<ErrorContext | null>(null)
  const [filters, setFilters] = useState<FilterOptions>({
    searchText: '',
    dateRange: [
      new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      new Date(),
    ],
  })
  const [isLoading, setIsLoading] = useState(true)

  // Load errors on mount
  React.useEffect(() => {
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

  // Filter errors based on criteria
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

  // Export errors as JSON
  const handleExportJSON = useCallback(() => {
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

  // Export errors as CSV
  const handleExportCSV = useCallback(() => {
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
      rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-log-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredErrors])

  // Clear all errors
  const handleClearAll = useCallback(() => {
    if (confirm('Are you sure you want to clear all error logs?')) {
      const logger = getErrorLogger()
      logger.clear()
      setErrors([])
      setSelectedError(null)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Error Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Monitor and analyze system errors
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportJSON}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={handleClearAll}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <ErrorFilters filters={filters} onFiltersChange={setFilters} />

      {/* Statistics */}
      <ErrorStats stats={stats} trend={trend} />

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Error History List */}
        <div className="col-span-2">
          <ErrorHistoryList
            errors={filteredErrors}
            selectedError={selectedError}
            onSelectError={setSelectedError}
          />
        </div>

        {/* Detail Panel */}
        <div className="col-span-1">
          {selectedError ? (
            <ErrorDetailPanel error={selectedError} />
          ) : (
            <div className="bg-gray-50 rounded-lg p-6 h-96 flex items-center justify-center">
              <p className="text-gray-500 text-center">
                Select an error to view details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          Showing {filteredErrors.length} of {errors.length} total errors
          {errors.length > 0 &&
            ` (Latest: ${formatRelativeTime(errors[0].timestamp)})`}
        </p>
      </div>
    </div>
  )
}
