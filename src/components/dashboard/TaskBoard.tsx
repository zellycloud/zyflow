import { useState } from 'react'
import { useTasks, useToggleTask, useReorderTasks } from '@/hooks/useTasks'
import { useClaude } from '@/hooks/useClaude'
import { TaskGroup } from './TaskGroup'
import { ExecutionModal } from './ExecutionModal'
import { Loader2 } from 'lucide-react'

interface TaskBoardProps {
  changeId: string
}

export function TaskBoard({ changeId }: TaskBoardProps) {
  const { data, isLoading, error, refetch } = useTasks(changeId)
  const toggleTask = useToggleTask(changeId)
  const reorderTasks = useReorderTasks(changeId)
  const { execution, execute, stop, reset } = useClaude()

  const [modalOpen, setModalOpen] = useState(false)
  const [currentTaskTitle, setCurrentTaskTitle] = useState('')

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

  const handleExecute = async (taskId: string, taskTitle: string) => {
    setCurrentTaskTitle(taskTitle)
    setModalOpen(true)
    reset()

    await execute({
      changeId,
      taskId,
      taskTitle,
    })

    // Refetch tasks after execution to update checkbox if Claude marked it complete
    refetch()
  }

  const handleModalClose = (open: boolean) => {
    if (!open && execution.status !== 'running') {
      setModalOpen(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        {data.groups.map((group) => (
          <TaskGroup
            key={group.id}
            group={group}
            onToggle={handleToggle}
            onReorder={handleReorder}
            onExecute={handleExecute}
            changeId={changeId}
            isExecuting={execution.status === 'running'}
          />
        ))}
      </div>

      <ExecutionModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        execution={execution}
        taskTitle={currentTaskTitle}
        onStop={stop}
      />
    </>
  )
}
