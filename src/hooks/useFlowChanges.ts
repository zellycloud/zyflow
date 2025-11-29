import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { FlowChange, FlowTask, Stage, ApiResponse, FlowSyncResponse } from '@/types'

const API_BASE = 'http://localhost:3001/api'

// =============================================
// Flow Changes API
// =============================================

interface FlowChangesData {
  changes: FlowChange[]
}

interface FlowChangeDetailData {
  change: FlowChange
  stages: Record<Stage, { total: number; completed: number; tasks: FlowTask[] }>
}

export function useFlowChanges() {
  return useQuery({
    queryKey: ['flow', 'changes'],
    queryFn: async (): Promise<FlowChange[]> => {
      const res = await fetch(`${API_BASE}/flow/changes`)
      const json: ApiResponse<FlowChangesData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.changes ?? []
    },
  })
}

export function useFlowChangeDetail(changeId: string | null) {
  return useQuery({
    queryKey: ['flow', 'changes', changeId],
    queryFn: async (): Promise<FlowChangeDetailData | null> => {
      if (!changeId) return null
      const res = await fetch(`${API_BASE}/flow/changes/${changeId}`)
      // 404 응답 처리 - Change가 현재 프로젝트에 없는 경우
      if (res.status === 404) {
        return null
      }
      const json: ApiResponse<FlowChangeDetailData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? null
    },
    enabled: !!changeId,
    retry: false, // 404인 경우 재시도하지 않음
  })
}

export function useSyncFlowChanges() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<FlowSyncResponse> => {
      const res = await fetch(`${API_BASE}/flow/sync`, { method: 'POST' })
      const json: ApiResponse<FlowSyncResponse> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow', 'changes'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'changes', 'counts'] })
    },
  })
}

// 프로젝트별 활성 Change 수
interface FlowChangeCounts {
  counts: Record<string, number>
}

export function useFlowChangeCounts() {
  return useQuery({
    queryKey: ['flow', 'changes', 'counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await fetch(`${API_BASE}/flow/changes/counts`)
      const json: ApiResponse<FlowChangeCounts> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.counts ?? {}
    },
  })
}

// =============================================
// Flow Tasks API
// =============================================

interface FlowTasksData {
  tasks: FlowTask[]
}

interface FlowTaskFilters {
  changeId?: string
  stage?: Stage
  status?: string
  standalone?: boolean
}

export function useFlowTasks(filters: FlowTaskFilters = {}) {
  const params = new URLSearchParams()
  if (filters.changeId) params.set('changeId', filters.changeId)
  if (filters.stage) params.set('stage', filters.stage)
  if (filters.status) params.set('status', filters.status)
  if (filters.standalone) params.set('standalone', 'true')

  return useQuery({
    queryKey: ['flow', 'tasks', filters],
    queryFn: async (): Promise<FlowTask[]> => {
      const res = await fetch(`${API_BASE}/flow/tasks?${params}`)
      const json: ApiResponse<FlowTasksData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.tasks ?? []
    },
  })
}

interface CreateFlowTaskInput {
  changeId?: string
  stage?: Stage
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
}

export function useCreateFlowTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateFlowTaskInput): Promise<FlowTask> => {
      const res = await fetch(`${API_BASE}/flow/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json: ApiResponse<{ task: FlowTask }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!.task
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow'] })
    },
  })
}

// =============================================
// Proposal & Spec Content API
// =============================================

interface ProposalData {
  changeId: string
  content: string | null
}

export function useProposalContent(changeId: string | null) {
  return useQuery({
    queryKey: ['flow', 'changes', changeId, 'proposal'],
    queryFn: async (): Promise<string | null> => {
      if (!changeId) return null
      const res = await fetch(`${API_BASE}/flow/changes/${changeId}/proposal`)
      // 404 응답 처리 - Change가 현재 프로젝트에 없는 경우
      if (res.status === 404) {
        return null
      }
      const json: ApiResponse<ProposalData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.content ?? null
    },
    enabled: !!changeId,
    retry: false, // 404인 경우 재시도하지 않음
  })
}

interface DesignData {
  changeId: string
  content: string | null
}

export function useDesignContent(changeId: string | null) {
  return useQuery({
    queryKey: ['flow', 'changes', changeId, 'design'],
    queryFn: async (): Promise<string | null> => {
      if (!changeId) return null
      const res = await fetch(`${API_BASE}/flow/changes/${changeId}/design`)
      // 404 응답 처리 - Change가 현재 프로젝트에 없는 경우
      if (res.status === 404) {
        return null
      }
      const json: ApiResponse<DesignData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.content ?? null
    },
    enabled: !!changeId,
    retry: false, // 404인 경우 재시도하지 않음
  })
}

interface SpecData {
  changeId: string
  content: string | null
  specId: string | null
}

// Change의 첫 번째 spec.md 내용 가져오기 (Spec 탭용)
export function useChangeSpec(changeId: string | null) {
  return useQuery({
    queryKey: ['flow', 'changes', changeId, 'spec'],
    queryFn: async (): Promise<string | null> => {
      if (!changeId) return null
      const res = await fetch(`${API_BASE}/flow/changes/${changeId}/spec`)
      // 404 응답 처리 - Change가 현재 프로젝트에 없는 경우
      if (res.status === 404) {
        return null
      }
      const json: ApiResponse<SpecData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.content ?? null
    },
    enabled: !!changeId,
    retry: false, // 404인 경우 재시도하지 않음
  })
}

interface SpecDetailData {
  specId: string
  content: string | null
  location: 'change' | 'archived' | null
}

// 특정 specId의 spec.md 내용 가져오기
export function useChangeSpecContent(changeId: string | null, specId: string | null) {
  return useQuery({
    queryKey: ['flow', 'changes', changeId, 'specs', specId],
    queryFn: async (): Promise<SpecDetailData | null> => {
      if (!changeId || !specId) return null
      const res = await fetch(`${API_BASE}/flow/changes/${changeId}/specs/${specId}`)
      // 404 응답 처리 - Change가 현재 프로젝트에 없는 경우
      if (res.status === 404) {
        return null
      }
      const json: ApiResponse<SpecDetailData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? null
    },
    enabled: !!changeId && !!specId,
    retry: false, // 404인 경우 재시도하지 않음
  })
}

// =============================================
// Flow Tasks Update API
// =============================================

interface UpdateFlowTaskInput {
  id: number
  changeId?: string | null
  stage?: Stage
  title?: string
  description?: string
  status?: string
  priority?: 'low' | 'medium' | 'high'
  order?: number
}

export function useUpdateFlowTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateFlowTaskInput): Promise<FlowTask> => {
      const res = await fetch(`${API_BASE}/flow/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json: ApiResponse<{ task: FlowTask }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!.task
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow'] })
    },
  })
}
