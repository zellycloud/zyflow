/**
 * Error Statistics Component
 * Displays error frequency, trend, and distribution charts
 * @module components/monitoring/ErrorStats
 */

'use client'

import React, { useMemo } from 'react'
import { ErrorStats as ErrorStatsType, ErrorTrend } from '@/utils/error-statistics'
import { ErrorSeverity } from '@/types/errors'

// =============================================
// Types
// =============================================

interface ErrorStatsProps {
  stats: ErrorStatsType
  trend: ErrorTrend
}

// =============================================
// Component
// =============================================

export default function ErrorStats({ stats, trend }: ErrorStatsProps) {
  // Calculate trend visualization
  const trendSummary = useMemo(() => {
    if (trend.points.length < 2) return null

    const lastPoint = trend.points[trend.points.length - 1]
    const firstPoint = trend.points[0]

    return {
      lastCount: lastPoint.count,
      firstCount: firstPoint.count,
      change: lastPoint.count - firstPoint.count,
      changePercent:
        firstPoint.count > 0
          ? ((lastPoint.count - firstPoint.count) / firstPoint.count) * 100
          : 0,
    }
  }, [trend])

  // Max errors in a bucket for scaling
  const maxBucketCount = useMemo(() => {
    return Math.max(...trend.points.map((p) => p.count), 1)
  }, [trend])

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Total Errors */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-gray-600 text-sm font-medium">Total Errors</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
        {trendSummary && (
          <p
            className={`text-sm mt-2 ${
              trendSummary.change >= 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {trendSummary.change >= 0 ? '↑' : '↓'}
            {Math.abs(trendSummary.changePercent).toFixed(1)}%
          </p>
        )}
      </div>

      {/* Recovery Rate */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-gray-600 text-sm font-medium">Recovery Rate</p>
        <p className="text-3xl font-bold text-green-600 mt-1">
          {stats.recoveryRate.toFixed(1)}%
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {Math.round((stats.total * stats.recoveryRate) / 100)} recoverable
        </p>
      </div>

      {/* Avg Recovery Time */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-gray-600 text-sm font-medium">Avg Recovery</p>
        <p className="text-3xl font-bold text-blue-600 mt-1">
          {stats.avgRecoveryTime > 0
            ? stats.avgRecoveryTime > 1000
              ? `${(stats.avgRecoveryTime / 1000).toFixed(1)}s`
              : `${Math.round(stats.avgRecoveryTime)}ms`
            : 'N/A'}
        </p>
        <p className="text-xs text-gray-500 mt-2">per error</p>
      </div>

      {/* Trend */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-gray-600 text-sm font-medium">Trend (24h)</p>
        <p className="text-2xl font-bold mt-1">
          {trend.trend === 'increasing' && '📈'}
          {trend.trend === 'decreasing' && '📉'}
          {trend.trend === 'stable' && '➡️'}
          <span className="ml-2 text-lg capitalize">{trend.trend}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">{trend.totalErrors} in period</p>
      </div>

      {/* Error Distribution by Severity */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 col-span-2">
        <p className="text-gray-600 text-sm font-medium mb-3">By Severity</p>
        <div className="space-y-2">
          {Object.entries(stats.bySeverity).map(([severity, count]) => (
            <div key={severity} className="flex items-center gap-2">
              <span className="w-20 text-sm capitalize">{severity}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${getSeverityBarColor(
                    severity as ErrorSeverity
                  )}`}
                  style={{
                    width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900 w-12 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Error Codes */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 col-span-2">
        <p className="text-gray-600 text-sm font-medium mb-3">Top 5 Errors</p>
        <div className="space-y-2">
          {stats.topErrors.map((error, index) => (
            <div key={error.code} className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">
                    {error.code}
                  </span>
                  <p className="text-xs text-gray-600 truncate">
                    {error.message}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-gray-900 ml-2">
                {error.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly Trend Chart */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 col-span-4">
        <p className="text-gray-600 text-sm font-medium mb-3">Error Trend (24h)</p>
        <div className="flex items-end gap-1 h-32">
          {trend.points.map((point, index) => (
            <div
              key={index}
              className="flex-1 flex flex-col items-center"
              title={`${point.count} errors at ${new Date(point.timestamp).toLocaleTimeString()}`}
            >
              <div className="flex gap-0.5 items-end h-24 w-full justify-center">
                {/* Critical (Red) */}
                {point.critical > 0 && (
                  <div
                    className="bg-red-500 rounded-t"
                    style={{
                      height: `${(point.critical / maxBucketCount) * 96}px`,
                      width: '2px',
                    }}
                  />
                )}
                {/* Error (Orange) */}
                {point.error > 0 && (
                  <div
                    className="bg-orange-500 rounded-t"
                    style={{
                      height: `${(point.error / maxBucketCount) * 96}px`,
                      width: '2px',
                    }}
                  />
                )}
                {/* Warning (Yellow) */}
                {point.warning > 0 && (
                  <div
                    className="bg-yellow-500 rounded-t"
                    style={{
                      height: `${(point.warning / maxBucketCount) * 96}px`,
                      width: '2px',
                    }}
                  />
                )}
                {/* Info (Blue) */}
                {point.info > 0 && (
                  <div
                    className="bg-blue-500 rounded-t"
                    style={{
                      height: `${(point.info / maxBucketCount) * 96}px`,
                      width: '2px',
                    }}
                  />
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1">
                {new Date(point.timestamp).getHours()}h
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500 rounded" />
            <span>Critical</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-orange-500 rounded" />
            <span>Error</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-yellow-500 rounded" />
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-blue-500 rounded" />
            <span>Info</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// Helper Functions
// =============================================

function getSeverityBarColor(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return 'bg-red-500'
    case ErrorSeverity.ERROR:
      return 'bg-orange-500'
    case ErrorSeverity.WARNING:
      return 'bg-yellow-500'
    case ErrorSeverity.INFO:
      return 'bg-blue-500'
  }
}
