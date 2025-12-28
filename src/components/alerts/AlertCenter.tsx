import { useState } from 'react'
import { Bell, Settings, RefreshCw, BarChart3, Github, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAlerts, useAlertStats, useSyncGitHubActions, useGitHubAuthStatus } from '@/hooks/useAlerts'
import type { AlertSource, AlertSeverity, AlertStatus } from '@/hooks/useAlerts'
import { AlertList } from './AlertList'
import { AlertDetail } from './AlertDetail'
import { AlertSettings } from './AlertSettings'
import { AlertDashboard } from './AlertDashboard'

interface AlertCenterProps {
  projectId?: string
}

export function AlertCenter({ projectId }: AlertCenterProps) {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [filter, setFilter] = useState<{
    source?: AlertSource
    severity?: AlertSeverity
    status?: AlertStatus
  }>({})

  // projectId를 포함한 필터로 쿼리
  const alertsFilter = { ...filter, projectId }
  const { data: alertsData, isLoading, refetch } = useAlerts(alertsFilter)
  const { data: stats } = useAlertStats(projectId)
  const { data: authStatus } = useGitHubAuthStatus()
  const syncGitHub = useSyncGitHubActions()

  const handleSelectAlert = (alertId: string) => {
    setSelectedAlertId(alertId)
    setShowSettings(false)
  }

  const handleBack = () => {
    setSelectedAlertId(null)
    setShowSettings(false)
    setShowDashboard(false)
  }

  const handleSyncGitHub = async () => {
    try {
      // 프로젝트 ID를 포함하여 GitHub 동기화
      const result = await syncGitHub.mutateAsync({ projectId })
      if (result.newAlerts > 0) {
        refetch()
      }
    } catch (error) {
      console.error('Failed to sync GitHub Actions:', error)
    }
  }

  if (showSettings) {
    return <AlertSettings onBack={handleBack} />
  }

  if (showDashboard) {
    return <AlertDashboard onBack={handleBack} />
  }

  if (selectedAlertId) {
    return <AlertDetail alertId={selectedAlertId} onBack={handleBack} />
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <span className="font-medium">Alerts</span>
          {stats && stats.total > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              {stats.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSyncGitHub}
                  disabled={syncGitHub.isPending || !authStatus?.authenticated}
                  title="Sync GitHub Actions"
                >
                  {syncGitHub.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {authStatus?.authenticated ? (
                  <div className="text-xs">
                    <p>Sync GitHub Actions ({authStatus.method === 'pat' ? 'PAT' : 'CLI'})</p>
                    <p className="text-muted-foreground">@{authStatus.user}</p>
                    {syncGitHub.data && (
                      <p className="text-muted-foreground">
                        Last: {syncGitHub.data.newAlerts} new, {syncGitHub.data.skipped} skipped
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-yellow-500">
                    <p>GitHub 인증 필요</p>
                    <p className="text-muted-foreground">
                      .env에 GITHUB_PERSONAL_ACCESS_TOKEN 설정
                    </p>
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDashboard(true)}
            title="Dashboard"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="flex gap-4 border-b px-4 py-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>Critical: {stats.bySeverity?.critical || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span>Warning: {stats.bySeverity?.warning || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span>Info: {stats.bySeverity?.info || 0}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 border-b px-4 py-2">
        <Select
          value={filter.source || 'all'}
          onValueChange={(v) => setFilter({ ...filter, source: v === 'all' ? undefined : v as AlertSource })}
        >
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="github">GitHub</SelectItem>
            <SelectItem value="vercel">Vercel</SelectItem>
            <SelectItem value="sentry">Sentry</SelectItem>
            <SelectItem value="supabase">Supabase</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.severity || 'all'}
          onValueChange={(v) => setFilter({ ...filter, severity: v === 'all' ? undefined : v as AlertSeverity })}
        >
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.status || 'all'}
          onValueChange={(v) => setFilter({ ...filter, status: v === 'all' ? undefined : v as AlertStatus })}
        >
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-auto">
        <AlertList
          alerts={alertsData?.alerts || []}
          isLoading={isLoading}
          onSelectAlert={handleSelectAlert}
        />
      </div>
    </div>
  )
}
