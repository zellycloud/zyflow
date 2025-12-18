import { useState, useEffect, useRef } from 'react'
import { Play, Square, X, CheckCircle2, XCircle, Loader2, Terminal, History, Zap, Sparkles, Crown } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useClaude, type ClaudeMessage, type ClaudeModel } from '@/hooks/useClaude'
import { ExecutionHistoryDialog } from './ExecutionHistoryDialog'
import { cn } from '@/lib/utils'

const MODEL_OPTIONS: { value: ClaudeModel; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'haiku', label: 'Haiku', description: '빠르고 저렴 (단순 태스크)', icon: Zap },
  { value: 'sonnet', label: 'Sonnet', description: '균형 잡힌 성능 (권장)', icon: Sparkles },
  { value: 'opus', label: 'Opus', description: '최고 품질 (복잡한 태스크)', icon: Crown },
]

interface TaskExecutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changeId: string
  taskId: string
  taskTitle: string
  onComplete?: () => void
}

export function TaskExecutionDialog({
  open,
  onOpenChange,
  changeId,
  taskId,
  taskTitle,
  onComplete,
}: TaskExecutionDialogProps) {
  const { execution, execute, stop, reset } = useClaude()
  const [showHistory, setShowHistory] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>('sonnet')
  const [hasStarted, setHasStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset state when dialog closes
  // 실행 중이면 먼저 중지한 후 상태 초기화
  useEffect(() => {
    if (!open) {
      setHasStarted(false)
      // 실행 중이면 서버 프로세스도 중지
      if (execution.status === 'running') {
        stop()
      }
      reset()
    }
  }, [open, reset, stop, execution.status])

  const handleStart = () => {
    setHasStarted(true)
    execute({ changeId, taskId, taskTitle, model: selectedModel })
  }

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [execution.messages])

  // Call onComplete when task completes successfully
  // Using ref to avoid re-triggering effect when onComplete changes
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (execution.status === 'completed' && onCompleteRef.current) {
      onCompleteRef.current()
    }
  }, [execution.status])

  const handleStop = async () => {
    await stop()
    // 중지 후 모달을 닫을 수 있도록 상태 변경
  }

  const handleStopAndClose = async () => {
    await stop()
    onOpenChange(false)
  }

  // 실행 중에는 외부 클릭/ESC로 닫을 수 없게 함
  const handleOpenChange = (newOpen: boolean) => {
    // 실행 중이면 닫기 방지
    if (execution.status === 'running' && !newOpen) {
      return
    }
    onOpenChange(newOpen)
  }

  const handleRetry = () => {
    reset()
    setHasStarted(true)
    execute({ changeId, taskId, taskTitle, model: selectedModel })
  }

  const renderMessage = (msg: ClaudeMessage, index: number) => {
    if (msg.type === 'start') {
      return (
        <div key={index} className="flex items-center gap-2 text-blue-500 text-sm">
          <Play className="h-3 w-3" />
          <span>실행 시작</span>
        </div>
      )
    }

    if (msg.type === 'output' && msg.data) {
      const { data } = msg

      // Assistant message
      if (data.type === 'assistant' && data.message?.content) {
        // content는 배열일 수 있음 (예: [{type: "text", text: "..."}])
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

      // Assistant message with tool_use in content array
      if (data.type === 'assistant' && data.message?.content && Array.isArray(data.message.content)) {
        const toolUses = data.message.content.filter((c: { type: string }) => c.type === 'tool_use')
        if (toolUses.length > 0) {
          return (
            <>
              {toolUses.map((tool: { id: string; name: string; input: Record<string, unknown> }, i: number) => (
                <div key={`${index}-tool-${i}`} className="border rounded p-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Terminal className="h-3 w-3 flex-shrink-0" />
                    <span className="font-mono truncate">{tool.name}</span>
                  </div>
                  {tool.input && (
                    <pre className="text-[10px] bg-muted p-1.5 rounded overflow-x-auto max-h-32">
                      {JSON.stringify(tool.input, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </>
          )
        }
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

    // Skip 'text' type messages (these are just the spawn command echo from expect)
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

  const getStatusBadge = () => {
    switch (execution.status) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        // 실행 중에는 X 버튼 숨김
        showCloseButton={execution.status !== 'running'}
        // 실행 중에는 ESC로 닫을 수 없게 함
        onEscapeKeyDown={(e) => {
          if (execution.status === 'running') {
            e.preventDefault()
          }
        }}
        // 실행 중에는 외부 클릭으로 닫을 수 없게 함
        onPointerDownOutside={(e) => {
          if (execution.status === 'running') {
            e.preventDefault()
          }
        }}
        onInteractOutside={(e) => {
          if (execution.status === 'running') {
            e.preventDefault()
          }
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

        {/* 모델 선택 화면 (실행 전) */}
        {!hasStarted && execution.status === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium">모델 선택</h3>
              <p className="text-sm text-muted-foreground">
                태스크 복잡도에 맞는 모델을 선택하세요
              </p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              {MODEL_OPTIONS.map((option) => {
                const Icon = option.icon
                const isSelected = selectedModel === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedModel(option.value)}
                    className={cn(
                      'w-full p-4 rounded-lg border-2 text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={cn(
                        'h-5 w-5',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )} />
                      <div className="flex-1">
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            <Button onClick={handleStart} size="lg" className="mt-4">
              <Play className="h-4 w-4 mr-2" />
              실행 시작
            </Button>
          </div>
        )}

        {/* 실행 로그 화면 (실행 중/후) */}
        {(hasStarted || execution.status !== 'idle') && (
          <ScrollArea className="flex-1 min-h-0 h-[50vh] rounded-lg border bg-background/50 p-3">
            <div ref={scrollRef} className="space-y-2 pr-4">
              {/* 선택된 모델 표시 */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 pb-2 border-b">
                {(() => {
                  const modelOption = MODEL_OPTIONS.find(m => m.value === selectedModel)
                  const Icon = modelOption?.icon || Sparkles
                  return (
                    <>
                      <Icon className="h-3 w-3" />
                      <span>모델: {modelOption?.label || selectedModel}</span>
                    </>
                  )
                })()}
              </div>

              {execution.messages.map((msg, i) => renderMessage(msg, i))}

              {execution.status === 'running' && execution.messages.length === 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Claude Code 실행 준비 중...</span>
                </div>
              )}

              {execution.error && execution.status === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
                  {execution.error}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-between gap-2 pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4 mr-2" />
            실행 기록
          </Button>

          <div className="flex gap-2">
            {execution.status === 'running' && (
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
            {(execution.status === 'completed' || execution.status === 'error') && (
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
            {execution.status === 'idle' && !hasStarted && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
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
