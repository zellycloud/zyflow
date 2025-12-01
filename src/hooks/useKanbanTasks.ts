import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskStatus, TaskPriority } from '../components/tasks/types';

const API_BASE = '/api';

interface TasksResponse {
  success: boolean;
  data: {
    tasks?: Task[];
    tasksByStatus?: Record<TaskStatus, Task[]>;
  };
  error?: string;
}

interface TaskResponse {
  success: boolean;
  data: { task: Task };
  error?: string;
}

interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  groupTitle?: string;
  groupOrder?: number;
  taskOrder?: number;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  order?: number;
  groupTitle?: string;
  groupOrder?: number;
  taskOrder?: number;
}

async function fetchKanbanTasks(): Promise<Task[]> {
  const response = await fetch(`${API_BASE}/tasks`);
  const data: TasksResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch tasks');
  }

  return data.data.tasks || [];
}

async function createTaskApi(input: CreateTaskInput): Promise<Task> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data: TaskResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to create task');
  }

  return data.data.task;
}

async function updateTaskApi(id: number, input: UpdateTaskInput): Promise<Task> {
  const response = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data: TaskResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to update task');
  }

  return data.data.task;
}

async function deleteTaskApi(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'DELETE',
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete task');
  }
}

async function archiveTaskApi(id: number): Promise<Task> {
  const response = await fetch(`${API_BASE}/tasks/${id}/archive`, {
    method: 'POST',
  });

  const data: TaskResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to archive task');
  }

  return data.data.task;
}

export function useKanbanTasks(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['kanban-tasks'],
    queryFn: fetchKanbanTasks,
    enabled,
    staleTime: 30000, // 30초간 데이터 신선하게 유지
    gcTime: 300000, // 5분 후 메모리에서 정리
  });

  const createMutation = useMutation({
    mutationFn: createTaskApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-tasks'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: UpdateTaskInput & { id: number }) =>
      updateTaskApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTaskApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-tasks'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveTaskApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-tasks'] });
    },
  });

  // 선택된 태스크 상태 관리
  const selectTask = (taskId: number) => {
    // 태스크 선택 시 관련 데이터 미리 가져오기
    queryClient.prefetchQuery({
      queryKey: ['kanban-tasks', taskId],
      queryFn: () => fetchKanbanTasks().then(tasks => tasks.find(t => t.id === taskId)),
      staleTime: 30000
    })
  }

  return {
    tasks,
    isLoading,
    refetch,
    createTask: createMutation.mutateAsync,
    updateTask: (id: number, data: UpdateTaskInput) =>
      updateMutation.mutateAsync({ id, ...data }),
    deleteTask: deleteMutation.mutateAsync,
    archiveTask: archiveMutation.mutateAsync,
    selectTask,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isArchiving: archiveMutation.isPending,
  };
}
