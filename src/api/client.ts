/**
 * API Client
 *
 * 중앙화된 API 요청 처리 및 에러 핸들링
 */

import { API_BASE_URL } from '@/config/api'
import type { ApiResponse } from '@/types'
import { ApiError, TimeoutError, NetworkError } from './errors'

// API 요청 옵션 타입
interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  timeout?: number
}

// 기본 요청 타임아웃 (30초)
const DEFAULT_TIMEOUT = 30000

/**
 * Parse JSON response with fallback
 */
async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * 공통 fetch 래퍼
 */
async function request<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options

  // AbortController를 사용한 타임아웃 처리
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    clearTimeout(timeoutId)

    // HTTP 에러 처리
    if (!response.ok) {
      const errorData = await parseJson<{ error?: string; code?: string; details?: unknown }>(response)
      const errorMessage = errorData?.error || `HTTP ${response.status}: ${response.statusText}`

      throw new ApiError(
        errorMessage,
        response.status,
        errorData?.code,
        errorData?.details
      )
    }

    const json = await parseJson<ApiResponse<T>>(response)

    if (!json) {
      throw new ApiError('Failed to parse response', 0)
    }

    // API 응답 에러 처리
    if (!json.success) {
      throw new ApiError(
        json.error || 'Unknown error',
        response.status,
        undefined
      )
    }

    if (!json.data) {
      throw new ApiError('No data in response', response.status)
    }

    return json.data
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof ApiError) {
      throw error
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new TimeoutError('Request timeout')
      }
      throw new NetworkError(error.message, error)
    }

    throw new ApiError('Unknown error', 0)
  }
}

/**
 * API 클라이언트 객체
 */
export const api = {
  /**
   * GET 요청
   */
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(`${API_BASE_URL}${endpoint}`, { ...options, method: 'GET' }),

  /**
   * POST 요청
   */
  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(`${API_BASE_URL}${endpoint}`, { ...options, method: 'POST', body }),

  /**
   * PUT 요청
   */
  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(`${API_BASE_URL}${endpoint}`, { ...options, method: 'PUT', body }),

  /**
   * PATCH 요청
   */
  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(`${API_BASE_URL}${endpoint}`, { ...options, method: 'PATCH', body }),

  /**
   * DELETE 요청
   */
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(`${API_BASE_URL}${endpoint}`, { ...options, method: 'DELETE' }),
}

/**
 * 도메인별 API 클라이언트
 */
export const projectsApi = {
  list: () => api.get<{ projects: unknown[]; activeProjectId: string | null }>('/api/projects'),

  getAllData: () => api.get<unknown>('/api/projects/all-data'),

  browse: () => api.post<{ path: string | null; cancelled: boolean }>('/api/projects/browse'),

  add: (path: string) => api.post<{ project: unknown }>('/api/projects', { path }),

  remove: (projectId: string) => api.delete<void>(`/api/projects/${projectId}`),

  activate: (projectId: string) => api.put<{ project: unknown }>(`/api/projects/${projectId}/activate`),

  updateName: (projectId: string, name: string) =>
    api.put<{ project: unknown }>(`/api/projects/${projectId}/name`, { name }),

  updatePath: (projectId: string, path: string) =>
    api.put<{ project: unknown }>(`/api/projects/${projectId}/path`, { path }),

  reorder: (projectIds: string[]) =>
    api.put<{ projects: unknown[] }>('/api/projects/reorder', { projectIds }),

  getChanges: (projectId: string) =>
    api.get<{ changes: unknown[] }>(`/api/projects/${projectId}/changes`),
}

export const changesApi = {
  list: () => api.get<{ changes: unknown[] }>('/api/changes'),

  listArchived: () => api.get<{ changes: unknown[] }>('/api/changes/archived'),

  getArchived: (changeId: string) => api.get<{ id: string; files: Record<string, string> }>(`/api/changes/archived/${changeId}`),

  getTasks: (changeId: string) => api.get<unknown>(`/api/changes/${changeId}/tasks`),

  toggleTask: (changeId: string, taskId: string) =>
    api.patch<{ task: unknown }>(`/api/changes/tasks/${changeId}/${taskId}`),

  getPlan: (changeId: string, taskId: string) =>
    api.get<{ taskId: string; changeId: string; content: string | null; exists: boolean }>(
      `/api/changes/plans/${changeId}/${taskId}`
    ),
}

export const flowApi = {
  listChanges: () => api.get<{ changes: unknown[] }>('/api/flow/changes'),

  getChangeCounts: (status?: string) =>
    api.get<{ counts: Record<string, number>; detailed: Record<string, unknown> }>(
      `/api/flow/changes/counts${status ? `?status=${status}` : ''}`
    ),

  getChange: (changeId: string) => api.get<{ change: unknown; stages: unknown }>(`/api/flow/changes/${changeId}`),

  syncChanges: () => api.post<{ synced: number; created: number; updated: number; projects: number }>('/api/flow/sync'),

  syncAllChanges: () =>
    api.post<{ synced: number; created: number; updated: number; projects: number }>('/api/flow/sync/all'),

  syncChange: (changeId: string) =>
    api.post<{ changeId: string; tasksCreated: number; tasksUpdated: number }>(`/api/flow/changes/${changeId}/sync`),

  archiveChange: (changeId: string, options?: { skipSpecs?: boolean; force?: boolean }) =>
    api.post<{ changeId: string; archived: boolean; filesMoved: boolean }>(`/api/flow/changes/${changeId}/archive`, options),

  fixValidation: (changeId: string) =>
    api.post<{ changeId: string; proposalFixed: boolean; specsFixed: number }>(`/api/flow/changes/${changeId}/fix-validation`),

  getProposal: (changeId: string) => api.get<{ changeId: string; content: string | null }>(`/api/flow/changes/${changeId}/proposal`),

  getDesign: (changeId: string) => api.get<{ changeId: string; content: string | null }>(`/api/flow/changes/${changeId}/design`),

  getSpec: (changeId: string) =>
    api.get<{ changeId: string; content: string | null; specId: string | null }>(`/api/flow/changes/${changeId}/spec`),

  getSpecById: (changeId: string, specId: string) =>
    api.get<{ specId: string; content: string | null; location: string | null }>(
      `/api/flow/changes/${changeId}/specs/${specId}`
    ),

  listTasks: (params?: { changeId?: string; stage?: string; status?: string; standalone?: boolean; includeArchived?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.changeId) searchParams.set('changeId', params.changeId)
    if (params?.stage) searchParams.set('stage', params.stage)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.standalone) searchParams.set('standalone', 'true')
    if (params?.includeArchived) searchParams.set('includeArchived', 'true')
    const query = searchParams.toString()
    return api.get<{ tasks: unknown[] }>(`/api/flow/tasks${query ? `?${query}` : ''}`)
  },

  createTask: (data: { changeId?: string; stage?: string; title: string; description?: string; priority?: string }) =>
    api.post<{ task: unknown }>('/api/flow/tasks', data),

  updateTask: (taskId: string, data: Record<string, unknown>) =>
    api.patch<{ task: unknown }>(`/api/flow/tasks/${taskId}`, data),
}

export const tasksApi = {
  list: (params?: { status?: string; priority?: string; tags?: string; kanban?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.priority) searchParams.set('priority', params.priority)
    if (params?.tags) searchParams.set('tags', params.tags)
    if (params?.kanban) searchParams.set('kanban', 'true')
    const query = searchParams.toString()
    return api.get<unknown>(`/api/tasks${query ? `?${query}` : ''}`)
  },

  listArchived: (params?: { page?: number; limit?: number; search?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.search) searchParams.set('search', params.search)
    const query = searchParams.toString()
    return api.get<unknown>(`/api/tasks/archived${query ? `?${query}` : ''}`)
  },

  get: (taskId: string) => api.get<unknown>(`/api/tasks/${taskId}`),

  create: (data: Record<string, unknown>) => api.post<{ task: unknown }>('/api/tasks', data),

  update: (taskId: string, data: Record<string, unknown>) => api.patch<{ task: unknown }>(`/api/tasks/${taskId}`, data),

  delete: (taskId: string) => api.delete<void>(`/api/tasks/${taskId}`),

  archive: (taskId: string) => api.post<{ task: unknown }>(`/api/tasks/${taskId}/archive`),

  unarchive: (taskId: string) => api.post<{ task: unknown }>(`/api/tasks/${taskId}/unarchive`),

  search: (query: string) => api.get<{ tasks: unknown[] }>(`/api/tasks/search?q=${encodeURIComponent(query)}`),
}

export const healthApi = {
  check: () => api.get<{ status: string; timestamp: string; uptime: number }>('/api/health'),
}

// =============================================
// Export error classes for use throughout the app
// =============================================
export { ApiError, TimeoutError, NetworkError, ValidationError, isApiError, isTimeoutError, isNetworkError, isValidationError, getErrorMessage, getErrorCode } from './errors'

export default api
