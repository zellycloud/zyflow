import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Project, ApiResponse, ProjectsResponse, ProjectsAllDataResponse } from '@/types'

async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch('/api/projects')
  const json: ApiResponse<ProjectsResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch projects')
  }

  return json.data
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })
}

async function fetchProjectsAllData(): Promise<ProjectsAllDataResponse> {
  const response = await fetch('/api/projects/all-data')
  const json: ApiResponse<ProjectsAllDataResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch projects data')
  }

  return json.data
}

export function useProjectsAllData() {
  return useQuery({
    queryKey: ['projects-all-data'],
    queryFn: fetchProjectsAllData,
  })
}

async function addProject(path: string): Promise<Project> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const json: ApiResponse<{ project: Project }> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to add project')
  }

  return json.data.project
}

export function useAddProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
      queryClient.invalidateQueries({ queryKey: ['changes'] })
      queryClient.invalidateQueries({ queryKey: ['specs'] })
    },
  })
}

async function activateProject(projectId: string): Promise<Project> {
  const response = await fetch(`/api/projects/${projectId}/activate`, {
    method: 'PUT',
  })
  const json: ApiResponse<{ project: Project }> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to activate project')
  }

  return json.data.project
}

export function useActivateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: activateProject,
    onSuccess: () => {
      // 이전 프로젝트의 flow 관련 캐시 완전 삭제 (404 요청 방지)
      queryClient.removeQueries({ queryKey: ['flow'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
      queryClient.invalidateQueries({ queryKey: ['changes'] })
      queryClient.invalidateQueries({ queryKey: ['specs'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

async function removeProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'DELETE',
  })
  const json: ApiResponse<void> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to remove project')
  }
}

export function useRemoveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
      queryClient.invalidateQueries({ queryKey: ['changes'] })
      queryClient.invalidateQueries({ queryKey: ['specs'] })
    },
  })
}

interface BrowseFolderResult {
  path: string | null
  cancelled: boolean
}

async function browseFolder(): Promise<BrowseFolderResult> {
  const response = await fetch('/api/projects/browse', {
    method: 'POST',
  })
  const json: ApiResponse<BrowseFolderResult> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to open folder picker')
  }

  return json.data
}

export function useBrowseFolder() {
  return useMutation({
    mutationFn: browseFolder,
  })
}
