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
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  order?: number;
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

export function useKanbanTasks() {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['kanban-tasks'],
    queryFn: fetchKanbanTasks,
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

  return {
    tasks,
    isLoading,
    refetch,
    createTask: createMutation.mutateAsync,
    updateTask: (id: number, data: UpdateTaskInput) =>
      updateMutation.mutateAsync({ id, ...data }),
    deleteTask: deleteMutation.mutateAsync,
    archiveTask: archiveMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isArchiving: archiveMutation.isPending,
  };
}
