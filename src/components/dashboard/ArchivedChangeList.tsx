import { useArchivedChanges } from '@/hooks/useArchivedChanges'
import { cn, formatRelativeDate } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Archive, Loader2, Calendar, CheckCircle2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ArchivedChangeListProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ArchivedChangeList({ selectedId, onSelect }: ArchivedChangeListProps) {
  const { data: changes, isLoading, error } = useArchivedChanges()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        아카이브 목록을 불러올 수 없습니다
      </div>
    )
  }

  if (!changes || changes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <Archive className="h-8 w-8" />
        <p className="text-sm">아카이브된 변경 제안이 없습니다</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">
          아카이브 ({changes.length})
        </h2>
        <div className="space-y-2">
          {changes.map((change) => (
            <button
              key={change.id}
              onClick={() => onSelect(change.id)}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                'hover:bg-accent',
                selectedId === change.id && 'border-primary bg-accent'
              )}
            >
              {/* 제목 - 2줄까지 표시 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="mb-2 flex items-start gap-2">
                    {change.progress === 100 && (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    )}
                    <span className="font-medium text-sm line-clamp-2 break-all">
                      {change.title}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="break-all">{change.title}</p>
                </TooltipContent>
              </Tooltip>

              {/* 프로그래스 바 */}
              <div className="flex items-center gap-2 mb-2">
                <Progress
                  value={change.progress}
                  className={cn(
                    "h-1.5 flex-1",
                    change.progress === 100 && "[&>div]:bg-green-500"
                  )}
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {change.completedTasks}/{change.totalTasks}
                </span>
              </div>

              {/* 날짜 - 하단 */}
              {change.archivedAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatRelativeDate(change.archivedAt)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
