import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Square, X, CheckCircle2, XCircle, Loader2, Terminal, History, Zap, Sparkles, Crown, Users, Settings2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { useAI, fetchAIProviders, type AIProviderConfig, type AIMessage } from '@/hooks/useAI'
import { useSwarm, type SwarmStrategy } from '@/hooks/useSwarm'
import type { ClaudeModel } from '@/hooks/useClaude'
import { ExecutionHistoryDialog } from './ExecutionHistoryDialog'
import { cn } from '@/lib/utils'

// =============================================
// 타입 및 상수
// =============================================

type ExecutionMode = 'single' | 'swarm'

const MODEL_OPTIONS: { value: ClaudeModel; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'haiku', label: 'Haiku', description: '빠르고 저렴 (단순 태스크)', icon: Zap },
  { value: 'sonnet', label: 'Sonnet', description: '균형 잡힌 성능 (권장)', icon: Sparkles },
  { value: 'opus', label: 'Opus', description: '최고 품질 (복잡한 태스크)', icon: Crown },
]

const STRATEGY_OPTIONS: { value: SwarmStrategy; label: string; description: string }[] = [
  { value: 'development', label: 'Development', description: '코드 구현 중심 (권장)' },
  { value: 'research', label: 'Research', description: '분석 및 조사 중심' },
  { value: 'testing', label: 'Testing', description: '테스트 및 검증 중심' },
]

interface TaskExecutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changeId: string
  taskId: string
  taskTitle: string
  projectPath?: string
  onComplete?: () => void
}

// =============================================
// 컴포넌트
// =============================================

export function TaskExecutionDialog({
  open,
  onOpenChange,
  changeId,
  taskId,
  taskTitle,
  projectPath,
  onComplete,
}: TaskExecutionDialogProps) {
  // 실행 모드 상태
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('single')

  // 단일 실행 상태 (useAI 기반)
  const ai = useAI()
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('claude')
  const [selectedModel, setSelectedModel] = useState<string>('sonnet')
  const [loadingProviders, setLoadingProviders] = useState(false)

  // Swarm 실행 상태
  const swarm = useSwarm()
  const [strategy, setStrategy] = useState<SwarmStrategy>('development')
  const [maxAgents, setMaxAgents] = useState(5)

  // 공통 상태
  const [showHistory, setShowHistory] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 현재 실행 상태 (모드에 따라 다름)
  const currentStatus = executionMode === 'single' ? ai.execution.status : swarm.execution.status
  const isRunning = currentStatus === 'running'

  // Provider 목록 로드
  useEffect(() => {
    if (open && providers.length === 0) {
      setLoadingProviders(true)
      fetchAIProviders()
        .then((data) => {
          setProviders(data)
          // 첫 번째 사용 가능한 Provider 선택
          const firstAvailable = data.find(p => p.enabled && p.available)
          if (firstAvailable) {
            setSelectedProvider(firstAvailable.id)
            setSelectedModel(firstAvailable.selectedModel || firstAvailable.availableModels[0] || '')
          }
        })
        .finally(() => setLoadingProviders(false))
    }
  }, [open, providers.length])

  // 다이얼로그 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setHasStarted(false)
      if (ai.execution.status === 'running') {
        ai.stop()
      }
      if (swarm.isRunning) {
        swarm.stop()
      }
      ai.reset()
      swarm.reset()
    }
  }, [open])

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [ai.execution.messages, swarm.logs])

  // 완료 시 콜백
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if ((ai.execution.status === 'completed' || swarm.execution.status === 'completed') && onCompleteRef.current) {
      onCompleteRef.current()
    }
  }, [ai.execution.status, swarm.execution.status])

  // Provider 선택 시 모델 자동 설정
  const handleProviderSelect = useCallback((providerId: string) => {
    setSelectedProvider(providerId)
    const provider = providers.find(p => p.id === providerId)
    if (provider) {
      setSelectedModel(provider.selectedModel || provider.availableModels[0] || '')
    }
  }, [providers])

  // 실행 핸들러
  const handleStart = async () => {
    setHasStarted(true)

    if (executionMode === 'single') {
      await ai.execute({
        provider: selectedProvider as any,
        model: selectedModel,
        changeId,
        taskId,
        taskTitle,
      })
    } else {
      await swarm.execute({
        projectPath: projectPath || process.cwd?.() || '',
        changeId,
        taskId,
        mode: 'single',
        strategy,
        maxAgents,
      })
    }
  }

  // 중지 핸들러
  const handleStop = async () => {
    if (executionMode === 'single') {
      await ai.stop()
    } else {
      await swarm.stop()
    }
  }

  const handleStopAndClose = async () => {
    await handleStop()
    onOpenChange(false)
  }

  // 재실행 핸들러
  const handleRetry = () => {
    if (executionMode === 'single') {
      ai.reset()
    } else {
      swarm.reset()
    }
    setHasStarted(true)
    handleStart()
  }

  // 다이얼로그 닫기 제어
  const handleOpenChange = (newOpen: boolean) => {
    if (isRunning && !newOpen) {
      return // 실행 중에는 닫기 방지
    }
    onOpenChange(newOpen)
  }

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

  // 상태 배지
  const getStatusBadge = () => {
    const status = executionMode === 'single' ? ai.execution.status : swarm.execution.status

    switch (status) {
      case 'running':
        return (
          <Badge variant="default" className="bg-blue-500">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            실행 중
          </Badge>
        )
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            완료
          </Badge>
        )
      case 'error':
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            오류
          </Badge>
        )
      default:
        return null
    }
  }

  // Provider 카드 렌더링
  const renderProviderCard = (provider: AIProviderConfig) => {
    const isSelected = selectedProvider === provider.id
    const isDisabled = !provider.available || !provider.enabled

    return (
      <button
        key={provider.id}
        onClick={() => !isDisabled && handleProviderSelect(provider.id)}
        disabled={isDisabled}
        className={cn(
          'w-full p-3 rounded-lg border-2 text-left transition-all',
          isDisabled && 'opacity-50 cursor-not-allowed',
          isSelected && !isDisabled
            ? 'border-primary bg-primary/5'
            : 'border-muted hover:border-muted-foreground/50'
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{provider.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium flex items-center gap-2">
              {provider.name}
              {!provider.available && (
                <Badge variant="outline" className="text-[10px] py-0">미설치</Badge>
              )}
            </div>
            {provider.availableModels.length > 0 && (
              <div className="text-xs text-muted-foreground truncate">
                {provider.availableModels.slice(0, 3).join(', ')}
              </div>
            )}
          </div>
          {isSelected && provider.available && (
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
          )}
        </div>
      </button>
    )
  }

  // 모델 선택 렌더링
  const renderModelSelection = () => {
    const provider = providers.find(p => p.id === selectedProvider)
    if (!provider || provider.availableModels.length === 0) return null

    // Claude의 경우 기존 UI 사용
    if (selectedProvider === 'claude') {
      return (
        <div className="space-y-2 mt-4">
          <label className="text-sm font-medium">모델 선택</label>
          <div className="space-y-2">
            {MODEL_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = selectedModel === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => setSelectedModel(option.value)}
                  className={cn(
                    'w-full p-3 rounded-lg border-2 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    // 다른 Provider의 경우 드롭다운 형식
    return (
      <div className="space-y-2 mt-4">
        <label className="text-sm font-medium">모델 선택</label>
        <div className="space-y-2">
          {provider.availableModels.map((model) => {
            const isSelected = selectedModel === model
            return (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={cn(
                  'w-full p-2 rounded-lg border text-left transition-all text-sm',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono">{model}</span>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        showCloseButton={!isRunning}
        onEscapeKeyDown={(e) => {
          if (isRunning) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (isRunning) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (isRunning) e.preventDefault()
        }}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              태스크 실행
            </DialogTitle>
            {getStatusBadge()}
          </div>
          <DialogDescription className="text-left">
            <span className="font-mono text-xs">[{taskId}]</span> {taskTitle}
          </DialogDescription>
        </DialogHeader>

        {/* 실행 모드 선택 (실행 전) */}
        {!hasStarted && currentStatus === 'idle' && (
          <Tabs value={executionMode} onValueChange={(v) => setExecutionMode(v as ExecutionMode)} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                단일 실행
              </TabsTrigger>
              <TabsTrigger value="swarm" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Swarm 실행
              </TabsTrigger>
            </TabsList>

            {/* 단일 실행 설정 */}
            <TabsContent value="single" className="flex-1 overflow-auto mt-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Provider 선택</label>
                  {loadingProviders ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Provider 목록 로드 중...</span>
                    </div>
                  ) : providers.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                      <AlertCircle className="h-4 w-4" />
                      <span>사용 가능한 Provider가 없습니다</span>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {providers.filter(p => p.enabled).map(renderProviderCard)}
                    </div>
                  )}
                </div>

                {selectedProvider && renderModelSelection()}
              </div>
            </TabsContent>

            {/* Swarm 실행 설정 */}
            <TabsContent value="swarm" className="flex-1 overflow-auto mt-4">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">Strategy 선택</label>
                  <div className="grid gap-2">
                    {STRATEGY_OPTIONS.map((option) => {
                      const isSelected = strategy === option.value
                      return (
                        <button
                          key={option.value}
                          onClick={() => setStrategy(option.value)}
                          className={cn(
                            'w-full p-3 rounded-lg border-2 text-left transition-all',
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-muted hover:border-muted-foreground/50'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.description}</div>
                            </div>
                            {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block flex items-center justify-between">
                    <span>최대 에이전트 수</span>
                    <span className="text-muted-foreground">{maxAgents}</span>
                  </label>
                  <Slider
                    value={[maxAgents]}
                    onValueChange={([value]: number[]) => setMaxAgents(value)}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1 (빠름)</span>
                    <span>10 (병렬)</span>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Settings2 className="h-4 w-4" />
                    <span className="font-medium">Swarm 설정 요약</span>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>Strategy: <span className="text-foreground">{strategy}</span></li>
                    <li>Max Agents: <span className="text-foreground">{maxAgents}</span></li>
                    <li>Mode: <span className="text-foreground">single task</span></li>
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* 실행 로그 화면 (실행 중/후) */}
        {(hasStarted || currentStatus !== 'idle') && (
          <ScrollArea className="flex-1 min-h-0 h-[50vh] rounded-lg border bg-background/50 p-3">
            <div ref={scrollRef} className="space-y-2 pr-4">
              {/* 실행 정보 표시 */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 pb-2 border-b">
                {executionMode === 'single' ? (
                  <>
                    <span className="text-lg">{providers.find(p => p.id === selectedProvider)?.icon || '🤖'}</span>
                    <span>
                      {providers.find(p => p.id === selectedProvider)?.name || selectedProvider}
                      {selectedModel && ` / ${selectedModel}`}
                    </span>
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4" />
                    <span>Swarm ({strategy}) / {maxAgents} agents</span>
                  </>
                )}
              </div>

              {/* 단일 실행 로그 */}
              {executionMode === 'single' && (
                <>
                  {ai.execution.messages.map((msg, i) => renderAIMessage(msg, i))}

                  {ai.execution.status === 'running' && ai.execution.messages.length === 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI 실행 준비 중...</span>
                    </div>
                  )}

                  {ai.execution.error && ai.execution.status === 'error' && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
                      {ai.execution.error}
                    </div>
                  )}
                </>
              )}

              {/* Swarm 실행 로그 */}
              {executionMode === 'swarm' && (
                <>
                  {swarm.logs.map((log, i) => (
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

                  {swarm.isRunning && swarm.logs.length === 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Swarm 실행 준비 중...</span>
                    </div>
                  )}

                  {swarm.execution.progress > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>진행률</span>
                        <span>{swarm.execution.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${swarm.execution.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {swarm.error && swarm.execution.status === 'failed' && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
                      {swarm.error}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        )}

        {/* 하단 버튼 영역 */}
        <div className="flex justify-between gap-2 pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4 mr-2" />
            실행 기록
          </Button>

          <div className="flex gap-2">
            {/* 실행 전 */}
            {!hasStarted && currentStatus === 'idle' && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  취소
                </Button>
                <Button onClick={handleStart} disabled={executionMode === 'single' && !selectedProvider}>
                  <Play className="h-4 w-4 mr-2" />
                  실행 시작
                </Button>
              </>
            )}

            {/* 실행 중 */}
            {isRunning && (
              <>
                <Button variant="outline" onClick={handleStop}>
                  <Square className="h-4 w-4 mr-2" />
                  중지
                </Button>
                <Button variant="destructive" onClick={handleStopAndClose}>
                  <X className="h-4 w-4 mr-2" />
                  중지 후 닫기
                </Button>
              </>
            )}

            {/* 완료/실패 후 */}
            {(currentStatus === 'completed' || currentStatus === 'error' || currentStatus === 'failed' || currentStatus === 'stopped') && (
              <>
                <Button variant="outline" onClick={handleRetry}>
                  <Play className="h-4 w-4 mr-2" />
                  다시 실행
                </Button>
                <Button onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4 mr-2" />
                  닫기
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>

      {/* History Dialog */}
      <ExecutionHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        changeId={changeId}
        taskId={taskId}
        taskTitle={taskTitle}
      />
    </Dialog>
  )
}
