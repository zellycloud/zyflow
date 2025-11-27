import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TasksFile, Task, ApiResponse, TasksResponse, ToggleTaskResponse } from '@/types'

async function fetchTasks(changeId: string): Promise<TasksFile> {
  const response = await fetch(`/api/changes/${changeId}/tasks`)
  const json: ApiResponse<TasksResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch tasks')
  }

  return {
    changeId: json.data.changeId,
    groups: json.data.groups,
  }
}

async function toggleTask(changeId: string, taskId: string): Promise<Task> {
  const response = await fetch(`/api/tasks/${changeId}/${taskId}`, {
    method: 'PATCH',
  })
  const json: ApiResponse<ToggleTaskResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to toggle task')
  }

  return json.data.task
}

export function useTasks(changeId: string | null) {
  return useQuery({
    queryKey: ['tasks', changeId],
    queryFn: () => fetchTasks(changeId!),
    enabled: !!changeId,
  })
}

async function reorderTasks(
  changeId: string,
  groupId: string,
  taskIds: string[]
): Promise<void> {
  const response = await fetch('/api/tasks/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeId, groupId, taskIds }),
  })
  const json: ApiResponse<void> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to reorder tasks')
  }
}

export function useToggleTask(changeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => toggleTask(changeId, taskId),
    onMutate: async (taskId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', changeId] })

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData<TasksFile>(['tasks', changeId])

      // Optimistically update
      if (previousTasks) {
        const updatedGroups = previousTasks.groups.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task
          ),
        }))

        queryClient.setQueryData<TasksFile>(['tasks', changeId], {
          ...previousTasks,
          groups: updatedGroups,
        })
      }

      return { previousTasks }
    },
    onError: (_err, _taskId, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', changeId], context.previousTasks)
      }
    },
    onSettled: () => {
      // Refetch changes to update progress
      queryClient.invalidateQueries({ queryKey: ['changes'] })
    },
  })
}

export function useReorderTasks(changeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ groupId, taskIds }: { groupId: string; taskIds: string[] }) =>
      reorderTasks(changeId, groupId, taskIds),
    onMutate: async ({ groupId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', changeId] })

      const previousTasks = queryClient.getQueryData<TasksFile>(['tasks', changeId])

      if (previousTasks) {
        const updatedGroups = previousTasks.groups.map((group) => {
          if (group.id !== groupId) return group

          const reorderedTasks = taskIds
            .map((id) => group.tasks.find((t) => t.id === id))
            .filter(Boolean) as typeof group.tasks

          return { ...group, tasks: reorderedTasks }
        })

        queryClient.setQueryData<TasksFile>(['tasks', changeId], {
          ...previousTasks,
          groups: updatedGroups,
        })
      }

      return { previousTasks }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', changeId], context.previousTasks)
      }
    },
  })
}
