/**
 * Post-Task React Query Hooks
 *
 * Post-Task Agent API를 위한 React Query 훅들
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/config/api'

const API_BASE = API_ENDPOINTS.base

// =============================================
// Types
// =============================================

export interface TaskCategory {
  id: string
  label: string
  tasks: { id: string; label: string }[]
}

export interface PostTaskRunResult {
  runId: string
  success: boolean
  tasksRun: number
  tasksSucceeded: number
  tasksFailed: number
  totalDuration: number
  summary: {
    task: string
    success: boolean
    issuesFound: number
    issuesFixed: number
  }[]
  reportPath?: string
}

export interface QuarantineItem {
  id: string
  originalPath: string
  quarantinedAt: string
  reason: string
  taskType: string
  status: 'quarantined' | 'pending' | 'expired'
  restoredAt?: string
}

export interface QuarantineStats {
  total: number
  quarantined: number
  pending: number
  expired: number
  totalSize: number
}

export interface TriggerStatus {
  queue: {
    isProcessing: boolean
    queueLength: number
    pending: number
    running: number
    completed: number
    failed: number
  }
  recentTriggers: { key: string; lastRun: string }[]
  scheduler: {
    running: boolean
    jobCount: number
    nextRuns: { id: string; nextRun: string }[]
  }
  eventListener: {
    running: boolean
    listeners: string[]
  }
}

export interface PostTaskReport {
  id: string
  runId: string
  createdAt: string
  taskType: string
  success: boolean
  tasksRun: number
  tasksFailed: number
}

export interface PostTaskReportDetail extends PostTaskReport {
  results: {
    task: string
    success: boolean
    issuesFound: number
    issuesFixed: number
    details?: unknown
  }[]
}

// =============================================
// Categories API
// =============================================

export function usePostTaskCategories() {
  return useQuery({
    queryKey: ['post-task', 'categories'],
    queryFn: async (): Promise<TaskCategory[]> => {
      const res = await fetch(`${API_BASE}/post-task/categories`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.categories ?? []
    },
    staleTime: 300000, // 5분 - 카테고리는 거의 변하지 않음
  })
}

// =============================================
// Run Task API
// =============================================

export interface RunPostTaskInput {
  projectPath: string
  category?: string
  tasks?: string[]
  cli?: 'claude' | 'gemini' | 'qwen' | 'openai'
  model?: 'fast' | 'balanced' | 'powerful'
  dryRun?: boolean
  noCommit?: boolean
}

export function useRunPostTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RunPostTaskInput): Promise<PostTaskRunResult> => {
      const res = await fetch(`${API_BASE}/post-task/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || json.message)
      return json.result
    },
    onSuccess: () => {
      // 실행 완료 후 관련 데이터 갱신
      queryClient.invalidateQueries({ queryKey: ['post-task', 'reports'] })
      queryClient.invalidateQueries({ queryKey: ['post-task', 'quarantine'] })
    },
  })
}

// =============================================
// Quarantine API
// =============================================

export function useQuarantineList(
  projectPath: string,
  filters?: { status?: string; date?: string }
) {
  const params = new URLSearchParams()
  params.set('projectPath', projectPath)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.date) params.set('date', filters.date)

  return useQuery({
    queryKey: ['post-task', 'quarantine', projectPath, filters],
    queryFn: async (): Promise<QuarantineItem[]> => {
      const res = await fetch(`${API_BASE}/post-task/quarantine?${params}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.items ?? []
    },
    enabled: !!projectPath,
    staleTime: 30000,
  })
}

export function useQuarantineStats(projectPath: string) {
  return useQuery({
    queryKey: ['post-task', 'quarantine', 'stats', projectPath],
    queryFn: async (): Promise<QuarantineStats> => {
      const params = new URLSearchParams({ projectPath })
      const res = await fetch(`${API_BASE}/post-task/quarantine/stats?${params}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.stats
    },
    enabled: !!projectPath,
    staleTime: 30000,
  })
}

export function useRestoreQuarantine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      itemId,
    }: {
      projectPath: string
      itemId: string
    }): Promise<{ success: boolean; message: string }> => {
      const res = await fetch(`${API_BASE}/post-task/quarantine/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, itemId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-task', 'quarantine'] })
    },
  })
}

export function useDeleteQuarantine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      itemId,
    }: {
      projectPath: string
      itemId: string
    }): Promise<{ success: boolean; message: string }> => {
      const params = new URLSearchParams({ projectPath })
      const res = await fetch(`${API_BASE}/post-task/quarantine/${itemId}?${params}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-task', 'quarantine'] })
    },
  })
}

// =============================================
// Triggers API
// =============================================

export function useTriggerStatus() {
  return useQuery({
    queryKey: ['post-task', 'triggers', 'status'],
    queryFn: async (): Promise<TriggerStatus> => {
      const res = await fetch(`${API_BASE}/post-task/triggers/status`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.result
    },
    staleTime: 10000, // 10초
    refetchInterval: 30000, // 30초마다 자동 갱신
  })
}

export function useSetupHooks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      action,
    }: {
      projectPath: string
      action: 'install' | 'uninstall' | 'list'
    }): Promise<{ success: boolean; message?: string; result?: unknown }> => {
      const res = await fetch(`${API_BASE}/post-task/triggers/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, action }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-task', 'triggers'] })
    },
  })
}

export function useScheduler() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      action,
    }: {
      projectPath: string
      action: 'start' | 'stop' | 'status'
    }): Promise<{ success: boolean; message?: string; result?: unknown }> => {
      const res = await fetch(`${API_BASE}/post-task/triggers/scheduler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, action }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-task', 'triggers'] })
    },
  })
}

export function useEventListener() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      action,
    }: {
      projectPath: string
      action: 'start' | 'stop' | 'status'
    }): Promise<{ success: boolean; message?: string; result?: unknown }> => {
      const res = await fetch(`${API_BASE}/post-task/triggers/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, action }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-task', 'triggers'] })
    },
  })
}

// =============================================
// Reports API
// =============================================

export function usePostTaskReports(
  projectPath: string,
  options?: { limit?: number; taskType?: string }
) {
  const params = new URLSearchParams()
  params.set('projectPath', projectPath)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.taskType) params.set('taskType', options.taskType)

  return useQuery({
    queryKey: ['post-task', 'reports', projectPath, options],
    queryFn: async (): Promise<PostTaskReport[]> => {
      const res = await fetch(`${API_BASE}/post-task/reports?${params}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.reports ?? []
    },
    enabled: !!projectPath,
    staleTime: 30000,
  })
}

export function usePostTaskReportDetail(projectPath: string, reportId: string | null) {
  return useQuery({
    queryKey: ['post-task', 'reports', projectPath, reportId],
    queryFn: async (): Promise<PostTaskReportDetail | null> => {
      if (!reportId) return null
      const params = new URLSearchParams({ projectPath })
      const res = await fetch(`${API_BASE}/post-task/reports/${reportId}?${params}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.report ?? null
    },
    enabled: !!projectPath && !!reportId,
  })
}
