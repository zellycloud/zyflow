import { ArrowLeft, ExternalLink, XCircle, CheckCircle, Sparkles, Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAlert,
  useActivityLogs,
  useUpdateAlertStatus,
  useIgnoreAlert,
  useAnalyzeAlert,
  useProcessAlert,
  getSeverityColor,
  getSourceIcon,
  getStatusBadgeClass,
  parseAlertMetadata,
  parseAlertAnalysis,
  parseAlertResolution,
} from '@/hooks/useAlerts'

interface AlertDetailProps {
  alertId: string
  onBack: () => void
}

export function AlertDetail({ alertId, onBack }: AlertDetailProps) {
  const { data: alert, isLoading } = useAlert(alertId)
  const { data: activities } = useActivityLogs({ alertId, limit: 20 })
  const updateStatus = useUpdateAlertStatus()
  const ignoreAlert = useIgnoreAlert()
  const analyzeAlert = useAnalyzeAlert()
  const processAlert = useProcessAlert()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        Loading...
      </div>
    )
  }

  if (!alert) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span>Alert not found</span>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    )
  }

  const metadata = parseAlertMetadata(alert)
  const analysis = parseAlertAnalysis(alert)
  const resolution = parseAlertResolution(alert)
  const severityIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'

  const handleResolve = () => {
    updateStatus.mutate({ alertId: alert.id, status: 'resolved' })
  }

  const handleIgnore = () => {
    ignoreAlert.mutate(alert.id)
  }

  const handleAnalyze = () => {
    analyzeAlert.mutate(alert.id)
  }

  const handleProcess = () => {
    processAlert.mutate(alert.id)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">{alert.title}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Basic Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span>{severityIcon}</span>
            <span className={cn('font-medium', getSeverityColor(alert.severity))}>
              {alert.severity.toUpperCase()}
            </span>
            <span className={cn('rounded px-2 py-0.5 text-xs', getStatusBadgeClass(alert.status))}>
              {alert.status}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{getSourceIcon(alert.source)}</span>
            <span className="capitalize">{alert.source}</span>
            <span>•</span>
            <span>{alert.type}</span>
          </div>

          <div className="text-xs text-muted-foreground">
            {new Date(alert.created_at).toLocaleString()}
          </div>
        </div>

        {/* Metadata */}
        {metadata && (
          <div className="rounded-lg border p-3 space-y-1">
            <div className="text-xs font-medium text-muted-foreground mb-2">Details</div>
            {metadata.repo && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground">Repository:</span>
                <span>{metadata.repo}</span>
              </div>
            )}
            {metadata.branch && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground">Branch:</span>
                <span>{metadata.branch}</span>
              </div>
            )}
            {metadata.commit && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground">Commit:</span>
                <code className="text-xs bg-muted px-1 rounded">{metadata.commit.slice(0, 8)}</code>
              </div>
            )}
            {metadata.environment && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground">Environment:</span>
                <span>{metadata.environment}</span>
              </div>
            )}
          </div>
        )}

        {/* Analysis */}
        {analysis && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Agent Analysis</div>

            {analysis.rootCause && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Root Cause:</span>
                <p className="text-sm">{analysis.rootCause}</p>
              </div>
            )}

            {analysis.relatedFiles && analysis.relatedFiles.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Related Files:</span>
                <ul className="text-sm space-y-0.5">
                  {analysis.relatedFiles.map((file, i) => (
                    <li key={i} className="font-mono text-xs">{file}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.suggestedFix && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Suggested Fix:</span>
                <p className="text-sm">{analysis.suggestedFix}</p>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                Confidence: {Math.round(analysis.confidence * 100)}%
              </span>
              {analysis.autoFixable && (
                <span className="text-green-500">
                  Auto-fixable ({analysis.autoFixAction})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Resolution */}
        {resolution && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-1">
            <div className="text-xs font-medium text-green-600">Resolution</div>
            <div className="text-sm">
              {resolution.type === 'auto' ? 'Automatically resolved' : 'Manually resolved'}
              {resolution.action && ` via ${resolution.action}`}
            </div>
            {resolution.details && (
              <p className="text-xs text-muted-foreground">{resolution.details}</p>
            )}
            {resolution.prUrl && (
              <a
                href={resolution.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View PR
              </a>
            )}
          </div>
        )}

        {/* Activity Timeline */}
        {activities && activities.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Activity Timeline</div>
            <div className="space-y-2">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(activity.created_at).toLocaleTimeString()}
                  </span>
                  <span>{activity.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* External Link */}
        {alert.external_url && (
          <a
            href={alert.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            View on {alert.source}
          </a>
        )}
      </div>

      {/* Actions */}
      {alert.status !== 'resolved' && alert.status !== 'ignored' && (
        <div className="space-y-2 border-t p-4">
          {/* Analysis & Process buttons */}
          {alert.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleAnalyze}
                disabled={analyzeAlert.isPending || processAlert.isPending}
              >
                {analyzeAlert.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Analyze
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleProcess}
                disabled={analyzeAlert.isPending || processAlert.isPending}
              >
                {processAlert.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Auto Process
              </Button>
            </div>
          )}

          {/* Resolve & Ignore buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleIgnore}
              disabled={ignoreAlert.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Ignore
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleResolve}
              disabled={updateStatus.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Resolve
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
