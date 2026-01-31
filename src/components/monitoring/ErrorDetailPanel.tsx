/**
 * Error Detail Panel Component
 * Displays detailed information about a selected error
 * @module components/monitoring/ErrorDetailPanel
 */

'use client'

import React, { useState } from 'react'
import { ErrorContext, ErrorSeverity } from '@/types/errors'
import { formatRelativeTime, formatDuration } from '@/utils/error-statistics'

// =============================================
// Types
// =============================================

interface ErrorDetailPanelProps {
  error: ErrorContext
}

// =============================================
// Component
// =============================================

export default function ErrorDetailPanel({ error }: ErrorDetailPanelProps) {
  const [showStack, setShowStack] = useState(false)
  const [showContext, setShowContext] = useState(false)

  const handleCopyCode = () => {
    navigator.clipboard.writeText(error.code)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Error Details</h3>
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Error Code */}
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">ERROR CODE</p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono bg-gray-100 px-3 py-2 rounded flex-1">
              {error.code}
            </code>
            <button
              onClick={handleCopyCode}
              className="px-2 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Copy error code"
            >
              📋
            </button>
          </div>
        </div>

        {/* Message */}
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">MESSAGE</p>
          <p className="text-sm text-gray-800 p-2 bg-gray-50 rounded">
            {error.message}
          </p>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">SEVERITY</p>
            <p className="text-sm font-medium capitalize">{error.severity}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">TYPE</p>
            <p className="text-sm font-medium capitalize">{error.type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">RECOVERABLE</p>
            <p className="text-sm font-medium">
              {error.recoverable ? '✅ Yes' : '❌ No'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">TIMESTAMP</p>
            <p className="text-sm font-medium">
              {formatRelativeTime(error.timestamp)}
            </p>
          </div>
        </div>

        {/* Component Info */}
        {(error.component || error.function || error.line) && (
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">LOCATION</p>
            <div className="text-sm space-y-1 p-2 bg-gray-50 rounded">
              {error.component && (
                <p>
                  <span className="text-gray-500">Component:</span>{' '}
                  <code className="font-mono">{error.component}</code>
                </p>
              )}
              {error.function && (
                <p>
                  <span className="text-gray-500">Function:</span>{' '}
                  <code className="font-mono">{error.function}</code>
                </p>
              )}
              {error.line && (
                <p>
                  <span className="text-gray-500">Line:</span>{' '}
                  <code className="font-mono">{error.line}</code>
                </p>
              )}
            </div>
          </div>
        )}

        {/* User Action */}
        {error.userAction && (
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">USER ACTION</p>
            <p className="text-sm text-gray-800 p-2 bg-gray-50 rounded">
              {error.userAction}
            </p>
          </div>
        )}

        {/* Recovery Time */}
        {error.recoveryTime && error.recoveryTime > 0 && (
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">
              RECOVERY TIME
            </p>
            <p className="text-sm font-medium">
              {formatDuration(error.recoveryTime)}
            </p>
          </div>
        )}

        {/* Suggested Actions */}
        {error.suggestedActions && error.suggestedActions.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">
              SUGGESTED ACTIONS
            </p>
            <ul className="text-sm space-y-1">
              {error.suggestedActions.map((action, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">→</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stack Trace */}
        {error.stack && (
          <div>
            <button
              onClick={() => setShowStack(!showStack)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mb-1"
            >
              {showStack ? '▼' : '▶'} STACK TRACE
            </button>
            {showStack && (
              <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        {/* Application Context */}
        {error.applicationState && (
          <div>
            <button
              onClick={() => setShowContext(!showContext)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mb-1"
            >
              {showContext ? '▼' : '▶'} APPLICATION STATE
            </button>
            {showContext && (
              <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto max-h-40">
                {JSON.stringify(error.applicationState, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-xs text-gray-500">
        <p>
          Logged at {new Date(error.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  )
}
