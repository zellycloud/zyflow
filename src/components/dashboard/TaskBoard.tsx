import { useTasks, useToggleTask, useReorderTasks } from '@/hooks/useTasks'
import { TaskGroup } from './TaskGroup'
import { Loader2 } from 'lucide-react'

interface TaskBoardProps {
  changeId: string
}

export function TaskBoard({ changeId }: TaskBoardProps) {
  const { data, isLoading, error } = useTasks(changeId)
  const toggleTask = useToggleTask(changeId)
  const reorderTasks = useReorderTasks(changeId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-destructive">
        태스크를 불러올 수 없습니다
      </div>
    )
  }

  if (!data || data.groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        태스크가 없습니다
      </div>
    )
  }

  const handleToggle = (taskId: string) => {
    toggleTask.mutate(taskId)
  }

  const handleReorder = (groupId: string, taskIds: string[]) => {
    reorderTasks.mutate({ groupId, taskIds })
  }

  return (
    <div className="space-y-6">
      {data.groups.map((group) => (
        <TaskGroup
          key={group.id}
          group={group}
          onToggle={handleToggle}
          onReorder={handleReorder}
          changeId={changeId}
        />
      ))}
    </div>
  )
}
