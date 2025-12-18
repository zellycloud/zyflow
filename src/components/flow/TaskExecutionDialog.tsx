import { useState, useEffect, useRef } from 'react'
import { Play, Square, X, CheckCircle2, XCircle, Loader2, Terminal } from 'lucide-react'
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
import { useClaude, type ClaudeMessage } from '@/hooks/useClaude'
import { cn } from '@/lib/utils'

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
  const [autoStarted, setAutoStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-start execution when dialog opens
  useEffect(() => {
    if (open && !autoStarted && execution.status === 'idle') {
      setAutoStarted(true)
      execute({ changeId, taskId, taskTitle })
    }
  }, [open, autoStarted, execution.status, execute, changeId, taskId, taskTitle])

  // Reset state when dialog closes
  // 실행 중이면 먼저 중지한 후 상태 초기화
  useEffect(() => {
    if (!open) {
      setAutoStarted(false)
      // 실행 중이면 서버 프로세스도 중지
      if (execution.status === 'running') {
        stop()
      }
      reset()
    }
  }, [open, reset, stop, execution.status])

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
    execute({ changeId, taskId, taskTitle })
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

        <ScrollArea className="flex-1 min-h-0 h-[50vh] rounded-lg border bg-background/50 p-3">
          <div ref={scrollRef} className="space-y-2 pr-4">
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

        <div className="flex justify-end gap-2 pt-4 border-t">
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
          {execution.status === 'idle' && (
            <Button onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              닫기
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
