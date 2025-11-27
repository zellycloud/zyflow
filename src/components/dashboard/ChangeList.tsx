import { useChanges } from '@/hooks/useChanges'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, Loader2 } from 'lucide-react'

interface ChangeListProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ChangeList({ selectedId, onSelect }: ChangeListProps) {
  const { data: changes, isLoading, error } = useChanges()

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
        변경 목록을 불러올 수 없습니다
      </div>
    )
  }

  if (!changes || changes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <FileText className="h-8 w-8" />
        <p className="text-sm">활성 변경 제안이 없습니다</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">
          변경 제안 ({changes.length})
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
              <div className="mb-2 font-medium text-sm">{change.title}</div>
              <div className="flex items-center gap-2">
                <Progress value={change.progress} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">
                  {change.completedTasks}/{change.totalTasks}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
