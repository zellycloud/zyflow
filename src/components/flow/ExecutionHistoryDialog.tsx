import { useState } from 'react'
import { History, Clock, CheckCircle2, XCircle, ChevronDown, ChevronRight, Terminal, Loader2 } from 'lucide-react'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useExecutionHistory, type ExecutionLog } from '@/hooks/useExecutionHistory'
import { cn } from '@/lib/utils'

interface ExecutionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changeId: string
  taskId?: string
  taskTitle?: string
}

export function ExecutionHistoryDialog({
  open,
  onOpenChange,
  changeId,
  taskId,
  taskTitle,
}: ExecutionHistoryDialogProps) {
  const { data: logs, isLoading, error } = useExecutionHistory(changeId)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // taskId가 있으면 해당 태스크의 로그만 필터링
  const filteredLogs = taskId
    ? logs?.filter(log => log.taskId === taskId)
    : logs

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffMs = endDate.getTime() - startDate.getTime()
    const diffSec = Math.floor(diffMs / 1000)

    if (diffSec < 60) return `${diffSec}초`
    const diffMin = Math.floor(diffSec / 60)
    const remainSec = diffSec % 60
    return `${diffMin}분 ${remainSec}초`
  }

  const renderLogOutput = (log: ExecutionLog) => {
    if (!log.output || log.output.length === 0) {
      return <p className="text-muted-foreground text-sm">출력 없음</p>
    }

    // 최근 20개만 표시
    const recentOutputs = log.output.slice(-20)

    return (
      <div className="space-y-1">
        {recentOutputs.map((item, idx) => {
          try {
            const parsed = JSON.parse(item)

            if (parsed.type === 'assistant' && parsed.message?.content) {
              const content = Array.isArray(parsed.message.content)
                ? parsed.message.content
                    .filter((c: { type: string }) => c.type === 'text')
                    .map((c: { text: string }) => c.text)
                    .join('\n')
                : parsed.message.content

              if (!content) return null

              return (
                <div key={idx} className="bg-muted/50 rounded p-2 text-xs leading-relaxed">
                  {content.substring(0, 300)}
                  {content.length > 300 && '...'}
                </div>
              )
            }

            if (parsed.type === 'tool_use') {
              return (
                <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  <span className="font-mono">{parsed.name}</span>
                </div>
              )
            }

            return null
          } catch {
            return null
          }
        })}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            실행 기록
          </DialogTitle>
          <DialogDescription>
            {taskTitle ? (
              <span>태스크: {taskTitle}</span>
            ) : (
              <span>Change: {changeId}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 h-[50vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              기록을 불러오는데 실패했습니다
            </div>
          ) : !filteredLogs || filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              실행 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {filteredLogs.map((log) => (
                <Collapsible
                  key={log.runId}
                  open={expandedLog === log.runId}
                  onOpenChange={(open) => setExpandedLog(open ? log.runId : null)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <button className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedLog === log.runId ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}

                          {log.status === 'completed' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}

                          <div className="text-left">
                            <div className="text-sm font-medium">
                              {log.taskTitle || log.taskId}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              {formatDate(log.startedAt)}
                              {log.completedAt && (
                                <span className="text-muted-foreground">
                                  • {formatDuration(log.startedAt, log.completedAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Badge
                          variant={log.status === 'completed' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {log.status === 'completed' ? '완료' : '실패'}
                        </Badge>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0 border-t">
                        <div className="mt-3 space-y-2">
                          <div className="text-xs text-muted-foreground">
                            출력 ({log.output?.length || 0}개 메시지)
                          </div>
                          <div className={cn(
                            "max-h-60 overflow-y-auto bg-muted/30 rounded-lg p-2"
                          )}>
                            {renderLogOutput(log)}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
