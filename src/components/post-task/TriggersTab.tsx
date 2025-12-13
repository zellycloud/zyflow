/**
 * Triggers Tab
 *
 * Post-Task 트리거 시스템 관리 탭
 */

import { Zap, GitBranch, Clock, Radio, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  useTriggerStatus,
  useSetupHooks,
  useScheduler,
  useEventListener,
} from '@/hooks/usePostTask'

interface TriggersTabProps {
  projectPath: string
}

export function TriggersTab({ projectPath }: TriggersTabProps) {
  const { data: status, isLoading, refetch } = useTriggerStatus()

  const setupHooks = useSetupHooks()
  const scheduler = useScheduler()
  const eventListener = useEventListener()

  const handleInstallHooks = async () => {
    try {
      const result = await setupHooks.mutateAsync({ projectPath, action: 'install' })
      toast.success(result.message || 'Git hooks가 설치되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '설치 실패')
    }
  }

  const handleUninstallHooks = async () => {
    try {
      const result = await setupHooks.mutateAsync({ projectPath, action: 'uninstall' })
      toast.success(result.message || 'Git hooks가 제거되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '제거 실패')
    }
  }

  const handleToggleScheduler = async (start: boolean) => {
    try {
      const result = await scheduler.mutateAsync({
        projectPath,
        action: start ? 'start' : 'stop',
      })
      toast.success(result.message || (start ? '스케줄러가 시작되었습니다' : '스케줄러가 중지되었습니다'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업 실패')
    }
  }

  const handleToggleEventListener = async (start: boolean) => {
    try {
      const result = await eventListener.mutateAsync({
        projectPath,
        action: start ? 'start' : 'stop',
      })
      toast.success(result.message || (start ? '이벤트 리스너가 시작되었습니다' : '이벤트 리스너가 중지되었습니다'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업 실패')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">트리거 시스템</h2>
          <p className="text-sm text-muted-foreground">
            자동으로 Post-Task를 실행하는 트리거 설정
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 트리거 카드들 */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Git Hooks */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Git Hooks</CardTitle>
            </div>
            <CardDescription>커밋/푸시 시 자동 실행</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">pre-commit</span>
                <Badge variant="outline">lint-fix, type-check</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">pre-push</span>
                <Badge variant="outline">test-fix</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleInstallHooks}
                disabled={setupHooks.isPending}
              >
                {setupHooks.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '설치'
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleUninstallHooks}
                disabled={setupHooks.isPending}
              >
                제거
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scheduler */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">스케줄러</CardTitle>
              {status?.scheduler?.running && (
                <Badge className="bg-green-500">실행 중</Badge>
              )}
            </div>
            <CardDescription>정해진 시간에 자동 실행</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="scheduler-toggle">스케줄러 활성화</Label>
              <Switch
                id="scheduler-toggle"
                checked={status?.scheduler?.running ?? false}
                onCheckedChange={handleToggleScheduler}
                disabled={scheduler.isPending}
              />
            </div>
            {status?.scheduler?.running && (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  등록된 작업: {status.scheduler.jobCount}개
                </p>
                {status.scheduler.nextRuns?.slice(0, 3).map((run, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs">{run.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.nextRun).toLocaleString('ko-KR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event Listener */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">이벤트 리스너</CardTitle>
              {status?.eventListener?.running && (
                <Badge className="bg-green-500">실행 중</Badge>
              )}
            </div>
            <CardDescription>CI 실패, Sentry 이슈 등 감지</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="listener-toggle">리스너 활성화</Label>
              <Switch
                id="listener-toggle"
                checked={status?.eventListener?.running ?? false}
                onCheckedChange={handleToggleEventListener}
                disabled={eventListener.isPending}
              />
            </div>
            {status?.eventListener?.running && (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">활성 리스너:</p>
                <div className="flex flex-wrap gap-1">
                  {status.eventListener.listeners?.map((listener, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {listener}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 실행 큐 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">실행 큐</CardTitle>
            {status?.queue?.isProcessing && (
              <Badge className="bg-yellow-500 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                처리 중
              </Badge>
            )}
          </div>
          <CardDescription>트리거된 작업 큐 상태</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{status?.queue?.queueLength ?? 0}</p>
              <p className="text-xs text-muted-foreground">전체</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-yellow-500/10">
              <p className="text-2xl font-bold text-yellow-600">
                {status?.queue?.pending ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">대기</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-500/10">
              <p className="text-2xl font-bold text-blue-600">{status?.queue?.running ?? 0}</p>
              <p className="text-xs text-muted-foreground">실행 중</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/10">
              <p className="text-2xl font-bold text-green-600">
                {status?.queue?.completed ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">완료</p>
            </div>
          </div>

          {/* 최근 트리거 */}
          {status?.recentTriggers && status.recentTriggers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">최근 트리거</h4>
              <div className="space-y-1">
                {status.recentTriggers.map((trigger, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                  >
                    <span className="font-mono text-xs">{trigger.key}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(trigger.lastRun).toLocaleString('ko-KR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
