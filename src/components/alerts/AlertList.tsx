import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Alert } from '@/hooks/useAlerts'
import {
  formatAlertTime,
  getSeverityBgColor,
  getSourceIcon,
  getStatusBadgeClass,
  parseAlertMetadata,
} from '@/hooks/useAlerts'

interface AlertListProps {
  alerts: Alert[]
  isLoading: boolean
  onSelectAlert: (alertId: string) => void
}

export function AlertList({ alerts, isLoading, onSelectAlert }: AlertListProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading alerts...
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-4xl">🎉</span>
        <span>No alerts!</span>
        <span className="text-xs">Everything is running smoothly.</span>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {alerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onClick={() => onSelectAlert(alert.id)}
        />
      ))}
    </div>
  )
}

interface AlertItemProps {
  alert: Alert
  onClick: () => void
}

function AlertItem({ alert, onClick }: AlertItemProps) {
  const metadata = parseAlertMetadata(alert)
  const severityIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'

  return (
    <div
      className={cn(
        'cursor-pointer px-4 py-3 transition-colors hover:bg-accent',
        getSeverityBgColor(alert.severity)
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{severityIcon}</span>
          <span className="font-medium text-sm">{alert.title}</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatAlertTime(alert.created_at)}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{getSourceIcon(alert.source)}</span>
        <span className="capitalize">{alert.source}</span>
        {metadata?.repo && (
          <>
            <span>•</span>
            <span className="truncate max-w-[150px]">{metadata.repo}</span>
          </>
        )}
        {metadata?.branch && (
          <>
            <span>•</span>
            <span className="truncate max-w-[100px]">{metadata.branch}</span>
          </>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 text-xs', getStatusBadgeClass(alert.status))}>
          {alert.status}
        </span>
        {alert.external_url && (
          <a
            href={alert.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            View
          </a>
        )}
      </div>
    </div>
  )
}
