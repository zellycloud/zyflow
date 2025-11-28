import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@/types'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Copy, ChevronRight, GripVertical, Play } from 'lucide-react'
import { toast } from 'sonner'

interface SortableTaskItemProps {
  task: Task
  onToggle: (taskId: string) => void
  onExecute: (taskId: string, taskTitle: string) => void
  changeId: string
  isExecuting?: boolean
}

export function SortableTaskItem({ task, onToggle, onExecute, changeId, isExecuting }: SortableTaskItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const copyPrompt = () => {
    const prompt = `다음 태스크에 대한 세부 구현 계획을 작성해주세요:

## 변경 제안
- ID: ${changeId}

## 태스크
- ID: ${task.id}
- 제목: ${task.title}

세부 계획에는 다음 내용을 포함해주세요:
1. 구현 단계 (step-by-step)
2. 관련 파일/컴포넌트
3. 주의사항
4. 테스트 방법`

    navigator.clipboard.writeText(prompt)
    toast.success('프롬프트가 클립보드에 복사되었습니다')
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-50')}
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
          'hover:bg-muted/50',
          isDragging && 'bg-muted'
        )}
      >
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Checkbox
          checked={task.completed}
          onCheckedChange={() => onToggle(task.id)}
        />
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex-1 text-left text-sm',
            task.completed && 'text-muted-foreground line-through'
          )}
        >
          {task.title}
        </button>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </div>

      {isExpanded && (
        <div className="ml-11 mt-2 rounded-md border bg-muted/30 p-3">
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onExecute(task.id, task.title)}
              disabled={isExecuting || task.completed}
              className="gap-2"
            >
              <Play className="h-3 w-3" />
              Claude로 실행
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyPrompt}
              className="gap-2"
            >
              <Copy className="h-3 w-3" />
              프롬프트 복사
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
