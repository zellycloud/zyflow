/**
 * Error History List Component
 * Displays a scrollable list of errors with icons and basic info
 * @module components/monitoring/ErrorHistoryList
 */

'use client'

import React from 'react'
import { ErrorContext, ErrorSeverity } from '@/types/errors'
import { formatRelativeTime } from '@/utils/error-statistics'

// =============================================
// Types
// =============================================

interface ErrorHistoryListProps {
  errors: ErrorContext[]
  selectedError: ErrorContext | null
  onSelectError: (error: ErrorContext) => void
}

// =============================================
// Helper Functions
// =============================================

function getSeverityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return '🔴'
    case ErrorSeverity.ERROR:
      return '🟠'
    case ErrorSeverity.WARNING:
      return '🟡'
    case ErrorSeverity.INFO:
      return '🔵'
  }
}

function getSeverityColor(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return 'bg-red-100 border-red-300'
    case ErrorSeverity.ERROR:
      return 'bg-orange-100 border-orange-300'
    case ErrorSeverity.WARNING:
      return 'bg-yellow-100 border-yellow-300'
    case ErrorSeverity.INFO:
      return 'bg-blue-100 border-blue-300'
  }
}

function getRecoveryStatusIcon(recoverable: boolean): string {
  return recoverable ? '✅' : '❌'
}

// =============================================
// Component
// =============================================

export default function ErrorHistoryList({
  errors,
  selectedError,
  onSelectError,
}: ErrorHistoryListProps) {
  if (errors.length === 0) {
    return (
      <div className="bg-white rounded-lg p-8 h-96 flex items-center justify-center border border-gray-200">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">No errors found</p>
          <p className="text-gray-400 text-sm">
            Errors will appear here when they occur
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">
          Error History ({errors.length})
        </h2>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 max-h-96">
        {errors.map((error) => (
          <button
            key={error.id || `${error.code}-${error.timestamp}`}
            onClick={() => onSelectError(error)}
            className={`w-full px-4 py-3 border-b border-gray-100 text-left transition-colors hover:bg-gray-50 ${
              selectedError?.code === error.code &&
              selectedError?.timestamp === error.timestamp
                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                : ''
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Severity Icon */}
              <span className="text-lg mt-1">
                {getSeverityIcon(error.severity)}
              </span>

              {/* Error Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono font-semibold text-gray-900">
                    {error.code}
                  </code>
                  <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                    {error.type}
                  </span>
                </div>
                <p className="text-sm text-gray-700 truncate">
                  {error.message}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  {error.component && (
                    <>
                      <span>{error.component}</span>
                      <span>•</span>
                    </>
                  )}
                  <span>{formatRelativeTime(error.timestamp)}</span>
                </div>
              </div>

              {/* Recovery Status */}
              <span className="text-lg mt-1" title={error.recoverable ? 'Recoverable' : 'Not recoverable'}>
                {getRecoveryStatusIcon(error.recoverable)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
