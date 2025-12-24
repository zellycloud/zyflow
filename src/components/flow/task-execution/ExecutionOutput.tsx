/**
 * Execution Output Component
 *
 * AI/Swarm 실행 로그 및 결과 표시
 */

import { useRef, useEffect } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Play,
  Handshake,
  Trophy,
  Percent,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { AIMessage, AIProviderConfig } from '@/hooks/useAI'
import type { ClaudeFlowLogEntry } from '@/types'
import { PROVIDER_ICONS, type ProviderResult, type ConsensusResult } from '@/types/ai'

export interface ExecutionOutputProps {
  mode: 'single' | 'swarm'
  // Single mode props
  aiMessages?: AIMessage[]
  aiStatus?: string
  aiError?: string | null
  selectedProvider?: string
  selectedModel?: string
  // Swarm mode props
  swarmLogs?: ClaudeFlowLogEntry[]
  swarmStatus?: string
  swarmProgress?: number
  swarmError?: string | null
  swarmProvider?: string
  strategy?: string
  maxAgents?: number
  consensusResult?: ConsensusResult | null
  // Common
  providers: AIProviderConfig[]
}

export function ExecutionOutput({
  mode,
  aiMessages = [],
  aiStatus,
  aiError,
  selectedProvider,
  selectedModel,
  swarmLogs = [],
  swarmStatus,
  swarmProgress = 0,
  swarmError,
  swarmProvider,
  strategy,
  maxAgents,
  consensusResult,
  providers,
}: ExecutionOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [aiMessages, swarmLogs])

  // 메시지 렌더링 (단일 실행)
  const renderAIMessage = (msg: AIMessage, index: number) => {
    if (msg.type === 'start') {
      return (
        <div key={index} className="flex items-center gap-2 text-blue-500 text-sm">
          <Play className="h-3 w-3" />
          <span>실행 시작 ({msg.provider} / {msg.model})</span>
        </div>
      )
    }

    if (msg.type === 'output' && msg.data) {
      const { data } = msg

      // Assistant message
      if (data.type === 'assistant' && data.message?.content) {
        const content = data.message.content
        const textContent = Array.isArray(content)
          ? content
              .filter((c: { type: string }) => c.type === 'text')
              .map((c: { text: string }) => c.text)
              .join('\n')
          : typeof content === 'string'
            ? content
            : JSON.stringify(content)

        if (!textContent) return null

        return (
          <div key={index} className="bg-muted/50 rounded p-2 text-xs leading-relaxed whitespace-pre-wrap">
            {textContent}
          </div>
        )
      }

      // Tool use
      if (data.type === 'tool_use') {
        return (
          <div key={index} className="border rounded p-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Terminal className="h-3 w-3 flex-shrink-0" />
              <span className="font-mono truncate">{data.name}</span>
            </div>
            {data.input && (
              <pre className="text-[10px] bg-muted p-1.5 rounded overflow-x-auto max-h-32">
                {JSON.stringify(data.input, null, 2)}
              </pre>
            )}
          </div>
        )
      }

      // Tool result
      if (data.type === 'tool_result') {
        return (
          <div key={index} className="border-l-2 border-green-500/50 pl-3 text-xs text-muted-foreground">
            <span>Tool 결과 수신</span>
          </div>
        )
      }
    }

    if (msg.type === 'text') {
      return null
    }

    if (msg.type === 'stderr' && msg.content) {
      return (
        <div key={index} className="text-sm text-orange-500 font-mono">
          {msg.content}
        </div>
      )
    }

    if (msg.type === 'error') {
      return (
        <div key={index} className="flex items-center gap-2 text-red-500 text-sm">
          <XCircle className="h-3 w-3" />
          <span>{msg.message || '오류 발생'}</span>
        </div>
      )
    }

    if (msg.type === 'complete') {
      return (
        <div
          key={index}
          className={cn(
            'flex items-center gap-2 text-sm mt-2',
            msg.status === 'completed' ? 'text-green-500' : 'text-red-500'
          )}
        >
          {msg.status === 'completed' ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>실행 완료</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              <span>실행 실패 (코드: {msg.exitCode})</span>
            </>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <ScrollArea className="flex-1 min-h-0 h-[50vh] rounded-lg border bg-background/50 p-3">
      <div ref={scrollRef} className="space-y-2 pr-4">
        {/* 실행 정보 표시 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 pb-2 border-b">
          {mode === 'single' ? (
            <>
              <span className="text-lg">{providers.find(p => p.id === selectedProvider)?.icon || '🤖'}</span>
              <span>
                {providers.find(p => p.id === selectedProvider)?.name || selectedProvider}
                {selectedModel && ` / ${selectedModel}`}
              </span>
            </>
          ) : (
            <>
              <span className="text-lg">{providers.find(p => p.id === swarmProvider)?.icon || '🐝'}</span>
              <span>Swarm ({strategy}) / {providers.find(p => p.id === swarmProvider)?.name || swarmProvider} / {maxAgents} agents</span>
            </>
          )}
        </div>

        {/* 단일 실행 로그 */}
        {mode === 'single' && (
          <>
            {aiMessages.map((msg, i) => renderAIMessage(msg, i))}

            {aiStatus === 'running' && aiMessages.length === 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 실행 준비 중...</span>
              </div>
            )}

            {aiError && aiStatus === 'error' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
                {aiError}
              </div>
            )}
          </>
        )}

        {/* Swarm 실행 로그 */}
        {mode === 'swarm' && (
          <>
            {swarmLogs.map((log, i) => (
              <div key={i} className="text-xs">
                <span className="text-muted-foreground">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>{' '}
                <span className={cn(
                  log.type === 'error' && 'text-red-500',
                  log.type === 'assistant' && 'text-blue-500',
                  log.type === 'tool_use' && 'text-yellow-500',
                )}>
                  {log.content}
                </span>
              </div>
            ))}

            {swarmStatus === 'running' && swarmLogs.length === 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Swarm 실행 준비 중...</span>
              </div>
            )}

            {swarmProgress > 0 && (
              <div className="mt-2 pt-2 border-t">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>진행률</span>
                  <span>{swarmProgress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${swarmProgress}%` }}
                  />
                </div>
              </div>
            )}

            {swarmError && swarmStatus === 'failed' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
                {swarmError}
              </div>
            )}

            {/* Consensus 결과 표시 */}
            {consensusResult && (
              <ConsensusResultDisplay result={consensusResult} />
            )}
          </>
        )}
      </div>
    </ScrollArea>
  )
}

// Consensus 결과 표시 컴포넌트
function ConsensusResultDisplay({ result }: { result: ConsensusResult }) {
  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <div className="flex items-center gap-2">
        <Handshake className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">Consensus 결과</span>
        <Badge
          variant={result.success ? 'default' : 'destructive'}
          className={result.success ? 'bg-green-500' : ''}
        >
          {result.success ? '합의 성공' : '합의 실패'}
        </Badge>
      </div>

      {/* 합의 요약 */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Percent className="h-3 w-3" />
            <span>합의율</span>
          </div>
          <span className="font-medium text-foreground">
            {Math.round(result.agreement * 100)}%
          </span>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Trophy className="h-3 w-3" />
            <span>신뢰도</span>
          </div>
          <span className="font-medium text-foreground">
            {Math.round(result.confidence * 100)}%
          </span>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            <span>평균 시간</span>
          </div>
          <span className="font-medium text-foreground">
            {(result.metadata.averageDuration / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Provider별 결과 */}
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Provider별 결과</span>
        {result.providerResults.map((providerResult: ProviderResult, i: number) => {
          const isWinner = providerResult.output === result.finalOutput
          return (
            <div
              key={i}
              className={cn(
                'border rounded-lg p-2 text-xs',
                isWinner && 'border-purple-500 bg-purple-50 dark:bg-purple-950/30',
                !providerResult.success && 'border-red-300 bg-red-50 dark:bg-red-950/30'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{PROVIDER_ICONS[providerResult.provider] || '🤖'}</span>
                  <span className="font-medium">{providerResult.provider}</span>
                  {providerResult.model && (
                    <span className="text-muted-foreground">/ {providerResult.model}</span>
                  )}
                  {isWinner && (
                    <Badge className="bg-purple-500 text-[10px] px-1 py-0">
                      <Trophy className="h-2.5 w-2.5 mr-0.5" />
                      채택
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {providerResult.confidence !== undefined && (
                    <span className="text-muted-foreground">
                      {Math.round(providerResult.confidence * 100)}%
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {(providerResult.duration / 1000).toFixed(1)}s
                  </span>
                  {providerResult.success ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                </div>
              </div>
              {providerResult.error && (
                <div className="text-red-500 text-[10px] mt-1">
                  오류: {providerResult.error}
                </div>
              )}
              {providerResult.success && providerResult.output && (
                <div className="mt-1 pt-1 border-t text-[10px] text-muted-foreground max-h-20 overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-mono">
                    {providerResult.output.length > 200
                      ? `${providerResult.output.substring(0, 200)}...`
                      : providerResult.output}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 전략 정보 */}
      <div className="text-xs text-muted-foreground">
        전략: <span className="text-foreground font-medium">{result.strategy}</span>
        {' | '}
        성공: <span className="text-foreground">{result.metadata.successfulProviders}/{result.metadata.totalProviders}</span>
      </div>
    </div>
  )
}
