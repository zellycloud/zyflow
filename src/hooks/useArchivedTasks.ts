import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Task } from '../components/tasks/types';

const API_BASE = '/api';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ArchivedTasksResponse {
  success: boolean;
  data: {
    tasks: Task[];
    pagination: PaginationInfo;
  };
  error?: string;
}

interface TaskResponse {
  success: boolean;
  data: { task: Task };
  error?: string;
}

async function fetchArchivedTasks(
  page: number,
  limit: number,
  search?: string
): Promise<{ tasks: Task[]; pagination: PaginationInfo }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (search) {
    params.set('search', search);
  }

  const response = await fetch(`${API_BASE}/tasks/archived?${params}`);
  const data: ArchivedTasksResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch archived tasks');
  }

  return data.data;
}

async function unarchiveTaskApi(id: number): Promise<Task> {
  const response = await fetch(`${API_BASE}/tasks/${id}/unarchive`, {
    method: 'POST',
  });

  const data: TaskResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to unarchive task');
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

export function useArchivedTasks(initialLimit = 20) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(initialLimit);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['archived-tasks', page, limit, searchQuery],
    queryFn: () => fetchArchivedTasks(page, limit, searchQuery || undefined),
  });

  const unarchiveMutation = useMutation({
    mutationFn: unarchiveTaskApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archived-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTaskApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archived-tasks'] });
    },
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1); // Reset to first page when searching
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return {
    tasks: data?.tasks ?? [],
    pagination: data?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 },
    isLoading,
    searchQuery,
    refetch,
    setSearchQuery: handleSearch,
    setPage: handlePageChange,
    unarchiveTask: unarchiveMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
    isUnarchiving: unarchiveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
