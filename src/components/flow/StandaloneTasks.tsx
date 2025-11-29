import { Loader2, ListTodo, Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useFlowTasks, useUpdateFlowTask } from '@/hooks/useFlowChanges'
import { cn } from '@/lib/utils'

interface StandaloneTasksProps {
  projectId: string
}

export function StandaloneTasks({ projectId }: StandaloneTasksProps) {
  const { data: tasks, isLoading } = useFlowTasks({ standalone: true })
  const updateTask = useUpdateFlowTask()

  const handleToggleTask = async (taskId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done'
    await updateTask.mutateAsync({ id: taskId, status: newStatus })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  const todoTasks = tasks?.filter((t) => t.status === 'todo') ?? []
  const inProgressTasks = tasks?.filter((t) => t.status === 'in-progress') ?? []
  const doneTasks = tasks?.filter((t) => t.status === 'done') ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

      {/* Kanban Board */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Todo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge variant="secondary">{todoTasks.length}</Badge>
              할 일
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todoTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                할 일이 없습니다
              </p>
            ) : (
              todoTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  id={task.id}
                  title={task.title}
                  priority={task.priority}
                  status={task.status}
                  onToggle={() => handleToggleTask(task.id, task.status)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* In Progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge variant="default">{inProgressTasks.length}</Badge>
              진행중
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inProgressTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                진행중인 작업이 없습니다
              </p>
            ) : (
              inProgressTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  id={task.id}
                  title={task.title}
                  priority={task.priority}
                  status={task.status}
                  onToggle={() => handleToggleTask(task.id, task.status)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Done */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge variant="outline">{doneTasks.length}</Badge>
              완료
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doneTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                완료된 작업이 없습니다
              </p>
            ) : (
              doneTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  id={task.id}
                  title={task.title}
                  priority={task.priority}
                  status={task.status}
                  onToggle={() => handleToggleTask(task.id, task.status)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface TaskCardProps {
  id: number
  title: string
  priority: 'low' | 'medium' | 'high'
  status: string
  onToggle: () => void
}

function TaskCard({ title, priority, status, onToggle }: TaskCardProps) {
  const isDone = status === 'done'

  return (
    <div
      className={cn(
        'p-3 rounded-md border bg-card',
        isDone && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isDone}
          onCheckedChange={onToggle}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm',
              isDone && 'line-through text-muted-foreground'
            )}
          >
            {title}
          </p>
          <Badge
            variant={
              priority === 'high'
                ? 'destructive'
                : priority === 'low'
                  ? 'secondary'
                  : 'outline'
            }
            className="text-xs mt-1"
          >
            {priority}
          </Badge>
        </div>
      </div>
    </div>
  )
}
