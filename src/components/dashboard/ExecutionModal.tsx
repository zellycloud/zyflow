import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Loader2,
  Square,
  CheckCircle2,
  XCircle,
  Terminal,
  FileText,
  Wrench,
} from 'lucide-react'
import type { ClaudeExecution, ClaudeMessage } from '@/hooks/useClaude'

interface ExecutionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  execution: ClaudeExecution
  taskTitle: string
  onStop: () => void
}

function MessageItem({ message }: { message: ClaudeMessage }) {
  if (message.type === 'start') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Terminal className="h-4 w-4" />
        <span>실행 시작...</span>
      </div>
    )
  }

  if (message.type === 'output' && message.data) {
    const { data } = message

    // Assistant message (text content)
    if (data.type === 'assistant' && data.message?.content) {
      return (
        <div className="rounded-md bg-muted/50 p-3">
          <pre className="whitespace-pre-wrap text-sm font-mono">
            {data.message.content}
          </pre>
        </div>
      )
    }

    // Tool use
    if (data.type === 'tool_use' && data.name) {
      return (
        <div className="flex items-start gap-2 text-sm">
          <Wrench className="h-4 w-4 mt-0.5 text-blue-500" />
          <div>
            <span className="font-medium text-blue-600">{data.name}</span>
            {data.input && (
              <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto">
                {JSON.stringify(data.input, null, 2).slice(0, 200)}
                {JSON.stringify(data.input).length > 200 && '...'}
              </pre>
            )}
          </div>
        </div>
      )
    }

    // Tool result
    if (data.type === 'tool_result' && data.content) {
      const content = data.content.slice(0, 300)
      return (
        <div className="flex items-start gap-2 text-sm">
          <FileText className="h-4 w-4 mt-0.5 text-green-500" />
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground overflow-x-auto">
            {content}
            {data.content.length > 300 && '...'}
          </pre>
        </div>
      )
    }

    return null
  }

  if (message.type === 'text' && message.content) {
    return (
      <div className="text-sm text-muted-foreground">
        {message.content}
      </div>
    )
  }

  if (message.type === 'stderr' && message.content) {
    return (
      <div className="text-sm text-red-500 font-mono">
        {message.content}
      </div>
    )
  }

  if (message.type === 'complete') {
    return (
      <div className="flex items-center gap-2 text-sm font-medium">
        {message.status === 'completed' ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-green-600">작업 완료</span>
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-red-600">작업 실패 (exit code: {message.exitCode})</span>
          </>
        )}
      </div>
    )
  }

  if (message.type === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500">
        <XCircle className="h-4 w-4" />
        <span>{message.message}</span>
      </div>
    )
  }

  return null
}

export function ExecutionModal({
  open,
  onOpenChange,
  execution,
  taskTitle,
  onStop,
}: ExecutionModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [execution.messages])

  const statusBadge = {
    idle: null,
    running: (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        실행 중
      </Badge>
    ),
    completed: (
      <Badge variant="default" className="gap-1 bg-green-600">
        <CheckCircle2 className="h-3 w-3" />
        완료
      </Badge>
    ),
    error: (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        오류
      </Badge>
    ),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Claude Code 실행
            </DialogTitle>
            {statusBadge[execution.status]}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {taskTitle}
          </p>
        </DialogHeader>

        <ScrollArea
          ref={scrollRef}
          className="flex-1 min-h-[300px] max-h-[50vh] rounded-md border bg-muted/20 p-4"
        >
          <div className="space-y-3">
            {execution.messages.length === 0 && execution.status === 'running' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Claude Code 시작 중...</span>
              </div>
            )}
            {execution.messages.map((msg, i) => (
              <MessageItem key={i} message={msg} />
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2">
          {execution.status === 'running' ? (
            <Button variant="destructive" onClick={onStop}>
              <Square className="h-4 w-4 mr-2" />
              중지
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
