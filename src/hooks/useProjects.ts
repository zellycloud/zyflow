import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Project,
  ApiResponse,
  ProjectsResponse,
  ProjectsAllDataResponse,
  LocalSettingsStatus,
  InitLocalSettingsResponse,
  ExportToLocalResponse,
} from '@/types'

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

// ==================== 프로젝트 이름 변경 ====================

async function updateProjectName(projectId: string, newName: string): Promise<Project> {
  const response = await fetch(`/api/projects/${projectId}/name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  })
  const json: ApiResponse<{ project: Project }> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to update project name')
  }

  return json.data.project
}

export function useUpdateProjectName() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      updateProjectName(projectId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
    },
  })
}

// ==================== 프로젝트 경로 변경 ====================

async function updateProjectPath(projectId: string, newPath: string): Promise<Project> {
  const response = await fetch(`/api/projects/${projectId}/path`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: newPath }),
  })
  const json: ApiResponse<{ project: Project }> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to update project path')
  }

  return json.data.project
}

export function useUpdateProjectPath() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, path }: { projectId: string; path: string }) =>
      updateProjectPath(projectId, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
    },
  })
}

// ==================== 프로젝트 순서 변경 ====================

async function reorderProjects(projectIds: string[]): Promise<Project[]> {
  const response = await fetch('/api/projects/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds }),
  })
  const json: ApiResponse<{ projects: Project[] }> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to reorder projects')
  }

  return json.data.projects
}

export function useReorderProjects() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reorderProjects,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
    },
  })
}

// ==================== 로컬 설정 상태 조회 ====================

async function fetchLocalSettingsStatus(projectPath: string): Promise<LocalSettingsStatus> {
  const response = await fetch(
    `/api/integrations/local/status?projectPath=${encodeURIComponent(projectPath)}`
  )
  const json: ApiResponse<{ projectPath: string; status: LocalSettingsStatus }> =
    await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch local settings status')
  }

  return json.data.status
}

export function useLocalSettingsStatus(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['local-settings-status', projectPath],
    queryFn: () => fetchLocalSettingsStatus(projectPath!),
    enabled: !!projectPath,
    staleTime: 30000, // 30초 캐시
  })
}

// ==================== 로컬 설정 초기화 ====================

async function initLocalSettings(projectPath: string): Promise<InitLocalSettingsResponse> {
  const response = await fetch('/api/integrations/local/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  })
  const json: ApiResponse<InitLocalSettingsResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to initialize local settings')
  }

  return json.data
}

export function useInitLocalSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: initLocalSettings,
    onSuccess: (_data, projectPath) => {
      queryClient.invalidateQueries({ queryKey: ['local-settings-status', projectPath] })
    },
  })
}

// ==================== 전역 설정을 로컬로 내보내기 ====================

async function exportToLocal(
  projectId: string,
  projectPath: string
): Promise<ExportToLocalResponse> {
  const response = await fetch(`/api/integrations/projects/${projectId}/export-to-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  })
  const json: ApiResponse<ExportToLocalResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to export to local')
  }

  return json.data
}

export function useExportToLocal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, projectPath }: { projectId: string; projectPath: string }) =>
      exportToLocal(projectId, projectPath),
    onSuccess: (_data, { projectPath }) => {
      queryClient.invalidateQueries({ queryKey: ['local-settings-status', projectPath] })
    },
  })
}
