/**
 * Error Statistics and Analytics Utilities
 * Calculates error metrics, trends, and distributions
 * @module utils/error-statistics
 */

import { ErrorContext, ErrorSeverity, ErrorType } from '@/types/errors'

// =============================================
// Types
// =============================================

export interface ErrorStats {
  total: number
  byType: Record<ErrorType, number>
  bySeverity: Record<ErrorSeverity, number>
  byCode: Record<string, number>
  topErrors: Array<{ code: string; count: number; message: string }>
  recoveryRate: number
  avgRecoveryTime: number
}

export interface ErrorTrendPoint {
  timestamp: number
  count: number
  critical: number
  error: number
  warning: number
  info: number
}

export interface ErrorTrend {
  period: '1h' | '24h' | '7d'
  points: ErrorTrendPoint[]
  totalErrors: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

// =============================================
// Statistics Calculation
// =============================================

/**
 * Calculate error statistics from error list
 */
export function calculateErrorStats(errors: ErrorContext[]): ErrorStats {
  const stats: ErrorStats = {
    total: errors.length,
    byType: {
      [ErrorType.NETWORK]: 0,
      [ErrorType.COMPONENT]: 0,
      [ErrorType.VALIDATION]: 0,
      [ErrorType.STATE]: 0,
      [ErrorType.TASK]: 0,
      [ErrorType.SSE]: 0,
    },
    bySeverity: {
      [ErrorSeverity.INFO]: 0,
      [ErrorSeverity.WARNING]: 0,
      [ErrorSeverity.ERROR]: 0,
      [ErrorSeverity.CRITICAL]: 0,
    },
    byCode: {},
    topErrors: [],
    recoveryRate: 0,
    avgRecoveryTime: 0,
  }

  // Count by type, severity, and code
  errors.forEach((error) => {
    stats.byType[error.type]++
    stats.bySeverity[error.severity]++
    stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1
  })

  // Calculate top errors
  stats.topErrors = Object.entries(stats.byCode)
    .map(([code, count]) => ({
      code,
      count,
      message: errors.find((e) => e.code === code)?.message || 'Unknown error',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Calculate recovery rate
  const recoverableErrors = errors.filter((e) => e.recoverable)
  stats.recoveryRate =
    errors.length > 0 ? (recoverableErrors.length / errors.length) * 100 : 0

  // Calculate average recovery time
  const recoveryTimes = errors
    .filter((e) => e.recoveryTime && e.recoveryTime > 0)
    .map((e) => e.recoveryTime || 0)
  stats.avgRecoveryTime =
    recoveryTimes.length > 0
      ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
      : 0

  return stats
}

// =============================================
// Trend Analysis
// =============================================

/**
 * Calculate error trend over time period
 */
export function calculateErrorTrend(
  errors: ErrorContext[],
  period: '1h' | '24h' | '7d' = '24h'
): ErrorTrend {
  const now = Date.now()
  const periodMs = getPeriodMs(period)
  const cutoffTime = now - periodMs

  // Filter errors within period
  const periodErrors = errors.filter((e) => e.timestamp >= cutoffTime)

  // Create time buckets
  const bucketSize = getBucketSize(period)
  const buckets = new Map<number, ErrorTrendPoint>()

  // Initialize buckets
  for (let i = 0; i < Math.ceil(periodMs / bucketSize); i++) {
    const bucketTime = now - (Math.ceil(periodMs / bucketSize) - i) * bucketSize
    buckets.set(bucketTime, {
      timestamp: bucketTime,
      count: 0,
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
    })
  }

  // Aggregate errors into buckets
  periodErrors.forEach((error) => {
    const bucketIndex = Math.floor((now - error.timestamp) / bucketSize)
    const bucketTime = now - bucketIndex * bucketSize
    const bucket = buckets.get(bucketTime)

    if (bucket) {
      bucket.count++
      if (error.severity === ErrorSeverity.CRITICAL) bucket.critical++
      else if (error.severity === ErrorSeverity.ERROR) bucket.error++
      else if (error.severity === ErrorSeverity.WARNING) bucket.warning++
      else bucket.info++
    }
  })

  const points = Array.from(buckets.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  )

  // Calculate trend
  const firstHalf = points.slice(0, Math.floor(points.length / 2))
  const secondHalf = points.slice(Math.floor(points.length / 2))
  const firstAvg =
    firstHalf.reduce((sum, p) => sum + p.count, 0) / firstHalf.length
  const secondAvg =
    secondHalf.reduce((sum, p) => sum + p.count, 0) / secondHalf.length

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (secondAvg > firstAvg * 1.1) trend = 'increasing'
  else if (secondAvg < firstAvg * 0.9) trend = 'decreasing'

  return {
    period,
    points,
    totalErrors: periodErrors.length,
    trend,
  }
}

/**
 * Group errors by time period (hourly, daily, weekly)
 */
export function groupErrorsByTime(
  errors: ErrorContext[],
  period: 'hour' | 'day' | 'week' = 'hour'
): Map<string, ErrorContext[]> {
  const grouped = new Map<string, ErrorContext[]>()

  errors.forEach((error) => {
    const timeKey = formatTimeKey(error.timestamp, period)
    if (!grouped.has(timeKey)) {
      grouped.set(timeKey, [])
    }
    grouped.get(timeKey)?.push(error)
  })

  return grouped
}

/**
 * Calculate error frequency over time
 */
export function calculateErrorFrequency(
  errors: ErrorContext[]
): Map<string, number> {
  const frequency = new Map<string, number>()

  errors.forEach((error) => {
    const count = frequency.get(error.code) || 0
    frequency.set(error.code, count + 1)
  })

  return frequency
}

/**
 * Get most common error patterns
 */
export function getErrorPatterns(
  errors: ErrorContext[]
): Array<{ pattern: string; count: number; examples: ErrorContext[] }> {
  const patterns = new Map<string, ErrorContext[]>()

  errors.forEach((error) => {
    const pattern = `${error.type}:${error.component}`
    if (!patterns.has(pattern)) {
      patterns.set(pattern, [])
    }
    patterns.get(pattern)?.push(error)
  })

  return Array.from(patterns.entries())
    .map(([pattern, examples]) => ({
      pattern,
      count: examples.length,
      examples: examples.slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count)
}

// =============================================
// Helper Functions
// =============================================

function getPeriodMs(period: '1h' | '24h' | '7d'): number {
  switch (period) {
    case '1h':
      return 60 * 60 * 1000
    case '24h':
      return 24 * 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
  }
}

function getBucketSize(period: '1h' | '24h' | '7d'): number {
  switch (period) {
    case '1h':
      return 5 * 60 * 1000 // 5 min buckets
    case '24h':
      return 60 * 60 * 1000 // 1 hour buckets
    case '7d':
      return 6 * 60 * 60 * 1000 // 6 hour buckets
  }
}

function formatTimeKey(timestamp: number, period: 'hour' | 'day' | 'week'): string {
  const date = new Date(timestamp)

  switch (period) {
    case 'hour':
      return date.toISOString().slice(0, 13) + ':00'
    case 'day':
      return date.toISOString().slice(0, 10)
    case 'week': {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      return weekStart.toISOString().slice(0, 10)
    }
  }
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`

  return new Date(timestamp).toLocaleDateString()
}

/**
 * Format duration in milliseconds (e.g., "5.2s" or "250ms")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
