import { Clock, CheckCircle, Zap, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useDashboardStats,
  useAlertPatterns,
  formatResolutionTime,
  formatChange,
  getSourceIcon,
} from '@/hooks/useAlerts'

interface AlertDashboardProps {
  onBack: () => void
}

export function AlertDashboard({ onBack }: AlertDashboardProps) {
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: patterns } = useAlertPatterns(undefined, 5)

  if (statsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        Loading...
      </div>
    )
  }

  const weekChange = stats ? formatChange(stats.weekOverWeekChange) : { text: '-', isPositive: false }

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">Dashboard</span>
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to Alerts
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4 space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-3">
          {/* Today's Alerts */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3 w-3" />
              Today
            </div>
            <div className="text-2xl font-semibold">
              {stats?.todayAlerts ?? 0}
            </div>
            {stats?.criticalToday ? (
              <div className="text-xs text-red-500 mt-1">
                {stats.criticalToday} critical
              </div>
            ) : null}
          </div>

          {/* Pending */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3 w-3" />
              Pending
            </div>
            <div className="text-2xl font-semibold text-yellow-500">
              {stats?.pendingAlerts ?? 0}
            </div>
          </div>

          {/* Resolution Rate */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle className="h-3 w-3" />
              Resolution Rate
            </div>
            <div className="text-2xl font-semibold text-green-500">
              {stats?.resolutionRate ?? 0}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Last 7 days
            </div>
          </div>

          {/* Auto-fix Rate */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Zap className="h-3 w-3" />
              Auto-fix Rate
            </div>
            <div className="text-2xl font-semibold text-blue-500">
              {stats?.autoFixRate ?? 0}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats?.autoFixedCount ?? 0} auto / {stats?.manualFixedCount ?? 0} manual
            </div>
          </div>
        </div>

        {/* Trend & Avg Time */}
        <div className="grid grid-cols-2 gap-3">
          {/* Week over Week */}
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1">
              Week over Week
            </div>
            <div className={cn(
              'flex items-center gap-1 text-lg font-semibold',
              weekChange.isPositive ? 'text-green-500' : 'text-red-500'
            )}>
              {weekChange.isPositive ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              {weekChange.text}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {weekChange.isPositive ? 'Fewer alerts' : 'More alerts'}
            </div>
          </div>

          {/* Avg Resolution Time */}
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1">
              Avg. Resolution
            </div>
            <div className="text-lg font-semibold">
              {stats?.avgResolutionTimeHours != null
                ? `${stats.avgResolutionTimeHours}h`
                : '-'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Last 30 days
            </div>
          </div>
        </div>

        {/* Top Patterns */}
        {patterns && patterns.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Top Alert Patterns
            </div>
            <div className="rounded-lg border divide-y">
              {patterns.map((pattern) => (
                <div key={pattern.id} className="p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getSourceIcon(pattern.source)}</span>
                    <span className="text-xs font-medium flex-1 truncate">
                      {pattern.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pattern.resolution_count}x
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="text-green-500">
                      {Math.round((pattern.success_rate || 0) * 100)}% auto-fix
                    </span>
                    <span>
                      Avg: {formatResolutionTime(pattern.avg_resolution_time)}
                    </span>
                  </div>
                  {pattern.recommended_fix && (
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      💡 {pattern.recommended_fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onBack}
              className="rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="text-sm font-medium">View Alerts</div>
              <div className="text-xs text-muted-foreground">
                {stats?.pendingAlerts ?? 0} pending
              </div>
            </button>
            <button
              className="rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
              disabled
            >
              <div className="text-sm font-medium text-muted-foreground">
                Configure Webhooks
              </div>
              <div className="text-xs text-muted-foreground">
                Settings
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
