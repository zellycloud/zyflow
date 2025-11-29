import { Loader2, ListTodo, Plus, GripVertical, MoreVertical, Pencil, Trash2, Archive } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFlowTasks, useUpdateFlowTask } from '@/hooks/useFlowChanges'
import { cn } from '@/lib/utils'
import type { FlowTask, FlowTaskStatus } from '@/types'

interface StandaloneTasksProps {
  projectId: string
}

// 칸반 보드에 표시할 컬럼 (archived 제외)
const STATUS_ORDER: FlowTaskStatus[] = ['todo', 'in-progress', 'review', 'done']

const STATUS_LABELS: Record<FlowTaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
  archived: 'Archived',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
}

export function StandaloneTasks({ projectId }: StandaloneTasksProps) {
  const { data: tasks, isLoading } = useFlowTasks({ standalone: true })
  const updateTask = useUpdateFlowTask()

  const handleToggleTask = async (task: FlowTask) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    await updateTask.mutateAsync({ id: task.id, status: newStatus })
  }

  const handleArchiveTask = async (task: FlowTask) => {
    await updateTask.mutateAsync({ id: task.id, status: 'archived' })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  // 칸반 뷰용 상태별 분류 (4컬럼: To Do, In Progress, Review, Done)
  const tasksByStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = (tasks ?? [])
        .filter((t) => t.status === status)
        .sort((a, b) => a.order - b.order)
      return acc
    },
    {} as Record<FlowTaskStatus, FlowTask[]>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="h-6 w-6" />
            기타 작업
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Change에 속하지 않는 독립적인 작업들
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          작업 추가
        </Button>
      </div>

      {/* Kanban Board - 4 columns */}
      <div className="grid grid-cols-4 gap-4 min-h-[500px]">
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onToggle={handleToggleTask}
            onArchive={handleArchiveTask}
          />
        ))}
      </div>
    </div>
  )
}

/* Kanban Column Component */
interface KanbanColumnProps {
  status: FlowTaskStatus
  tasks: FlowTask[]
  onToggle: (task: FlowTask) => void
  onArchive: (task: FlowTask) => void
}

function KanbanColumn({ status, tasks, onArchive }: KanbanColumnProps) {
  return (
    <div className="flex flex-col h-full rounded-lg bg-muted/50">
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{STATUS_LABELS[status]}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {tasks.length}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-hidden min-h-[100px]">
        <ScrollArea className="h-full p-2">
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onArchive={() => onArchive(task)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No tasks
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}

/* Kanban Card Component - shadcn 스타일 */
interface KanbanCardProps {
  task: FlowTask
  onArchive: () => void
}

function KanbanCard({ task, onArchive }: KanbanCardProps) {
  const tags = task.tags ? (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags) as string[] : []

  return (
    <Card className="mb-1.5 py-0 gap-0">
      <CardContent className="!px-2.5 !py-3.5">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Header: Priority & ID & Menu */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn('w-2 h-2 rounded-full', PRIORITY_COLORS[task.priority])}
                  title={task.priority}
                />
                <span className="text-xs text-muted-foreground font-mono">
                  #{task.id}
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit
                  </DropdownMenuItem>
                  {task.status === 'done' && (
                    <DropdownMenuItem onClick={onArchive}>
                      <Archive className="mr-2 h-3 w-3" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Title */}
            <p className="text-sm font-medium mt-1 truncate">{task.title}</p>

            {/* Description */}
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Assignee */}
            {task.assignee && (
              <p className="text-xs text-muted-foreground mt-2">
                @{task.assignee}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
