/**
 * Error Filters Component
 * Provides filtering and search interface for error logs
 * @module components/monitoring/ErrorFilters
 */

'use client'

import React, { useState } from 'react'
import { ErrorSeverity, ErrorType } from '@/types/errors'

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

interface ErrorFiltersProps {
  filters: FilterOptions
  onFiltersChange: (filters: FilterOptions) => void
}

// =============================================
// Component
// =============================================

export default function ErrorFilters({
  filters,
  onFiltersChange,
}: ErrorFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSearchChange = (value: string) => {
    onFiltersChange({
      ...filters,
      searchText: value,
    })
  }

  const handleTypeChange = (type: ErrorType | undefined) => {
    onFiltersChange({
      ...filters,
      errorType: type,
    })
  }

  const handleSeverityChange = (severity: ErrorSeverity | undefined) => {
    onFiltersChange({
      ...filters,
      severity,
    })
  }

  const handleComponentChange = (value: string) => {
    onFiltersChange({
      ...filters,
      component: value || undefined,
    })
  }

  const handleStartDateChange = (value: string) => {
    const newDate = new Date(value)
    onFiltersChange({
      ...filters,
      dateRange: [newDate, filters.dateRange[1]],
    })
  }

  const handleEndDateChange = (value: string) => {
    const newDate = new Date(value)
    onFiltersChange({
      ...filters,
      dateRange: [filters.dateRange[0], newDate],
    })
  }

  const handleReset = () => {
    onFiltersChange({
      searchText: '',
      dateRange: [
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      ],
    })
  }

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search errors by code, message, or component..."
            value={filters.searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {showAdvanced ? '↑' : '↓'} Advanced
        </button>
        {(filters.errorType ||
          filters.severity ||
          filters.component ||
          filters.searchText) && (
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200">
          {/* Error Type Filter */}
          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">
              Error Type
            </label>
            <select
              value={filters.errorType || ''}
              onChange={(e) =>
                handleTypeChange(
                  e.target.value ? (e.target.value as ErrorType) : undefined
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Types</option>
              {Object.values(ErrorType).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">
              Severity
            </label>
            <select
              value={filters.severity || ''}
              onChange={(e) =>
                handleSeverityChange(
                  e.target.value ? (e.target.value as ErrorSeverity) : undefined
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Severities</option>
              {Object.values(ErrorSeverity).map((severity) => (
                <option key={severity} value={severity}>
                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Component Filter */}
          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">
              Component
            </label>
            <input
              type="text"
              placeholder="e.g., TaskExecutionDialog"
              value={filters.component || ''}
              onChange={(e) => handleComponentChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">
              Date Range
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={formatDateForInput(filters.dateRange[0])}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="date"
                value={formatDateForInput(filters.dateRange[1])}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
