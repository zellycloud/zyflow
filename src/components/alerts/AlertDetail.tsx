import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, XCircle, CheckCircle, Sparkles, Play, Loader2, Bot, Terminal, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAlert,
  useActivityLogs,
  useUpdateAlertStatus,
  useIgnoreAlert,
  useAnalyzeAlert,
  useProcessAlert,
  useAgentFix,
  useAgentFixProgress,
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
  // 모든 hooks는 조건문 전에 선언되어야 함 (React Rules of Hooks)
  const { data: alert, isLoading } = useAlert(alertId)
  const { data: activities } = useActivityLogs({ alertId, limit: 20 })
  const updateStatus = useUpdateAlertStatus()
  const ignoreAlert = useIgnoreAlert()
  const analyzeAlert = useAnalyzeAlert()
  const processAlert = useProcessAlert()
  const agentFix = useAgentFix()

  // 전체 자동 처리 상태 - hooks는 최상단에 위치해야 함
  const [fullProcessStep, setFullProcessStep] = useState<'idle' | 'analyze' | 'process' | 'agent-fix' | 'done'>('idle')
  const isFullProcessing = fullProcessStep !== 'idle' && fullProcessStep !== 'done'

  // Agent Fix 진행 상황 폴링
  const { data: agentFixProgress } = useAgentFixProgress(alertId, agentFix.isPending || agentFix.isSuccess || isFullProcessing)

  // 출력 로그 자동 스크롤
  const outputRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (outputRef.current && agentFixProgress?.output?.length) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [agentFixProgress?.output?.length])

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

  const handleAgentFix = () => {
    agentFix.mutate(alert.id)
  }

  // 전체 자동 처리: Analyze → Auto Process → Agent Fix 순차 실행
  const handleFullProcess = async () => {
    if (!alert) return

    setFullProcessStep('analyze')

    try {
      // 1. Analyze
      await analyzeAlert.mutateAsync(alert.id)

      // 2. Auto Process
      setFullProcessStep('process')
      await processAlert.mutateAsync(alert.id)

      // Auto Process 결과 확인 후 Agent Fix 필요 시 실행
      // processAlert가 성공해도 auto-fix가 불가능할 수 있음
      setFullProcessStep('agent-fix')
      await agentFix.mutateAsync(alert.id)

      setFullProcessStep('done')
    } catch (error) {
      // 실패해도 다음 단계 진행 (Agent Fix 시도)
      if (fullProcessStep === 'analyze' || fullProcessStep === 'process') {
        setFullProcessStep('agent-fix')
        try {
          await agentFix.mutateAsync(alert.id)
        } catch {
          // Agent Fix도 실패하면 종료
        }
      }
      setFullProcessStep('done')
    }
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

        {/* Agent Fix Progress */}
        {agentFixProgress && (
          <div className={cn(
            'rounded-lg border p-3 space-y-2',
            agentFixProgress.status === 'running' && 'border-purple-500/50 bg-purple-500/5',
            agentFixProgress.status === 'completed' && 'border-green-500/50 bg-green-500/5',
            agentFixProgress.status === 'failed' && 'border-red-500/50 bg-red-500/5'
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                <span className="text-xs font-medium">Agent 수정 진행 상황</span>
              </div>
              <div className="flex items-center gap-2">
                {agentFixProgress.status === 'running' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
                    <span className="text-xs text-purple-500">실행 중...</span>
                  </>
                )}
                {agentFixProgress.status === 'completed' && (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">완료</span>
                  </>
                )}
                {agentFixProgress.status === 'failed' && (
                  <>
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-500">실패</span>
                  </>
                )}
              </div>
            </div>

            {/* 시작/종료 시간 */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>시작: {new Date(agentFixProgress.startedAt).toLocaleTimeString()}</span>
              {agentFixProgress.endedAt && (
                <span>종료: {new Date(agentFixProgress.endedAt).toLocaleTimeString()}</span>
              )}
            </div>

            {/* 에러 메시지 */}
            {agentFixProgress.error && (
              <div className="rounded bg-red-500/10 p-2 text-xs text-red-600">
                <span className="font-medium">오류: </span>{agentFixProgress.error}
              </div>
            )}

            {/* 출력 로그 */}
            {agentFixProgress.output && agentFixProgress.output.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">실행 로그:</div>
                <div
                  ref={outputRef}
                  className="max-h-48 overflow-auto rounded bg-black/80 p-2 font-mono text-xs text-green-400"
                >
                  {agentFixProgress.output.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
          {/* 전체 자동 처리 버튼 */}
          {alert.status === 'pending' && (
            <Button
              variant="default"
              size="sm"
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              onClick={handleFullProcess}
              disabled={isFullProcessing || analyzeAlert.isPending || processAlert.isPending || agentFix.isPending}
            >
              {isFullProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {fullProcessStep === 'analyze' && '분석 중...'}
                  {fullProcessStep === 'process' && '자동 처리 중...'}
                  {fullProcessStep === 'agent-fix' && 'Agent 수정 중...'}
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  전체 자동 처리
                  <span className="ml-2 text-xs opacity-80">(분석 → 처리 → 수정)</span>
                </>
              )}
            </Button>
          )}

          {/* Analysis & Process buttons */}
          {alert.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleAnalyze}
                disabled={isFullProcessing || analyzeAlert.isPending || processAlert.isPending || agentFix.isPending}
              >
                {analyzeAlert.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                분석
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleProcess}
                disabled={isFullProcessing || analyzeAlert.isPending || processAlert.isPending || agentFix.isPending}
              >
                {processAlert.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                자동 처리
              </Button>
            </div>
          )}

          {/* Agent Fix button - shows when analysis exists but autofix is not available */}
          {analysis && !analysis.autoFixable && alert.status === 'pending' && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 border-purple-500/30"
              onClick={handleAgentFix}
              disabled={isFullProcessing || analyzeAlert.isPending || processAlert.isPending || agentFix.isPending}
            >
              {agentFix.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Agent 수정
              <span className="ml-2 text-xs text-muted-foreground">(AI가 코드 수정)</span>
            </Button>
          )}

          {/* Resolve & Ignore buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleIgnore}
              disabled={isFullProcessing || ignoreAlert.isPending || agentFix.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              무시
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleResolve}
              disabled={isFullProcessing || updateStatus.isPending || agentFix.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              해결
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
