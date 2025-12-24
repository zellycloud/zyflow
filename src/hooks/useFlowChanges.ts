import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  FlowChange,
  FlowTask,
  Stage,
  ApiResponse,
  FlowSyncResponse,
  FlowChangeCountsResponse,
  ProjectChangeCounts
} from '@/types'
import { API_ENDPOINTS } from '@/config/api'

const API_BASE = API_ENDPOINTS.base

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

export function useFlowChanges(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}
  
  return useQuery({
    queryKey: ['flow', 'changes'],
    queryFn: async (): Promise<FlowChange[]> => {
      const res = await fetch(`${API_BASE}/flow/changes`)
      const json: ApiResponse<FlowChangesData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.changes ?? []
    },
    enabled,
    staleTime: 30000, // 30초간 데이터 신선하게 유지
    gcTime: 300000, // 5분 후 메모리에서 정리
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

export function useFlowChangeCounts(options?: {
  status?: 'active' | 'completed' | 'all'
  enabled?: boolean
}) {
  const { status = 'active', enabled = true } = options || {}
  
  return useQuery({
    queryKey: ['flow', 'changes', 'counts', status],
    queryFn: async (): Promise<Record<string, number>> => {
      const params = new URLSearchParams()
      params.set('status', status) // 항상 status 파라미터 전달

      const res = await fetch(`${API_BASE}/flow/changes/counts?${params}`)
      const json: ApiResponse<FlowChangeCountsResponse> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.counts ?? {}
    },
    enabled,
    staleTime: 30000, // 30초간 데이터 신선하게 유지
    gcTime: 300000, // 5분 후 메모리에서 정리
  })
}

// 프로젝트별 상세 Change 집계 (active/completed/total)
export function useFlowChangeCountsDetailed(options?: {
  enabled?: boolean
}) {
  const { enabled = true } = options || {}
  
  return useQuery({
    queryKey: ['flow', 'changes', 'counts', 'detailed'],
    queryFn: async (): Promise<Record<string, ProjectChangeCounts>> => {
      const res = await fetch(`${API_BASE}/flow/changes/counts`)
      const json: ApiResponse<FlowChangeCountsResponse> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.detailed ?? {}
    },
    enabled,
    staleTime: 30000, // 30초간 데이터 신선하게 유지
    gcTime: 300000, // 5분 후 메모리에서 정리
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
  includeArchived?: boolean
}

export function useFlowTasks(filters: FlowTaskFilters = {}, options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}
  const params = new URLSearchParams()
  if (filters.changeId) params.set('changeId', filters.changeId)
  if (filters.stage) params.set('stage', filters.stage)
  if (filters.status) params.set('status', filters.status)
  if (filters.standalone) params.set('standalone', 'true')
  if (filters.includeArchived) params.set('includeArchived', 'true')

  return useQuery({
    queryKey: ['flow', 'tasks', filters],
    queryFn: async (): Promise<FlowTask[]> => {
      const res = await fetch(`${API_BASE}/flow/tasks?${params}`)
      const json: ApiResponse<FlowTasksData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.tasks ?? []
    },
    enabled,
    staleTime: 30000, // 30초간 데이터 신선하게 유지
    gcTime: 300000, // 5분 후 메모리에서 정리
  })
}

interface CreateFlowTaskInput {
  changeId?: string
  stage?: Stage
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  groupTitle?: string
  groupOrder?: number
  taskOrder?: number
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
// 선택 상태 관리 훅
// =============================================

export type SelectedItem =
  | { type: 'project'; projectId: string }
  | { type: 'change'; projectId: string; changeId: string }
  | { type: 'standalone-tasks'; projectId: string }
  | { type: 'project-settings'; projectId: string }
  | { type: 'agent'; projectId: string; changeId?: string }
  | { type: 'post-task'; projectId: string }
  | { type: 'archived'; projectId: string; archivedChangeId?: string }
  | { type: 'docs'; projectId: string }
  | { type: 'settings' }

export function useSelectedItem() {
  const queryClient = useQueryClient()
  
  // 선택 상태 변경 시 관련 쿼리들 미리 가져오기
  const selectItem = (item: SelectedItem | null) => {
    if (!item) return
    
    // 프로젝트 활성화
    queryClient.invalidateQueries({
      queryKey: ['projects'],
      refetchType: 'active'
    })
    
    // 관련 데이터 refetch (캐시 무효화 후 다시 가져오기)
    switch (item.type) {
      case 'project':
        queryClient.invalidateQueries({
          queryKey: ['flow', 'changes'],
          refetchType: 'active'
        })
        queryClient.invalidateQueries({
          queryKey: ['flow', 'tasks', { standalone: true }],
          refetchType: 'active'
        })
        break

      case 'change':
        queryClient.invalidateQueries({
          queryKey: ['flow', 'changes', item.changeId],
          refetchType: 'active'
        })
        queryClient.invalidateQueries({
          queryKey: ['flow', 'tasks', { changeId: item.changeId }],
          refetchType: 'active'
        })
        break

      case 'standalone-tasks':
        queryClient.invalidateQueries({
          queryKey: ['flow', 'tasks', { standalone: true }],
          refetchType: 'active'
        })
        break

      case 'project-settings':
        // Project Settings 페이지는 별도 데이터 refetch 불필요
        break

      case 'agent':
        // Agent 페이지는 관련 Change 데이터 refetch
        if (item.changeId) {
          queryClient.invalidateQueries({
            queryKey: ['flow', 'changes', item.changeId],
            refetchType: 'active'
          })
        }
        break

      case 'post-task':
        // Post-Task 페이지는 관련 데이터 refetch
        queryClient.invalidateQueries({
          queryKey: ['post-task'],
          refetchType: 'active'
        })
        break

      case 'settings':
        // Settings 페이지는 별도 데이터 refetch 불필요
        break
    }
  }
  
  return {
    selectItem
  }
}

// 선택된 항목에 따른 관련 데이터 훅
export function useSelectedData(selectedItem: SelectedItem | null) {
  const { data: changes } = useFlowChanges()
  const { data: tasks } = useFlowTasks({
    changeId: selectedItem?.type === 'change' ? selectedItem.changeId : undefined,
    standalone: selectedItem?.type === 'standalone-tasks' ? true : undefined
  })
  const { data: changeDetail } = useFlowChangeDetail(
    selectedItem?.type === 'change' ? (selectedItem.changeId ?? null) : null
  )
  
  return {
    changes,
    tasks,
    changeDetail
  }
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
  groupTitle?: string
  groupOrder?: number
  taskOrder?: number
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

// =============================================
// Archive Change API
// =============================================

interface ArchiveChangeInput {
  changeId: string
  skipSpecs?: boolean
  force?: boolean
  autoFix?: boolean
}

interface ArchiveChangeResult {
  changeId: string
  archived: boolean
  filesMoved?: boolean
  stdout: string
  stderr: string
}

interface ArchiveValidationError {
  success: false
  error: string
  validationErrors: string[]
  canForce: boolean
  hint: string
}

export function useArchiveChange() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ changeId, skipSpecs, force, autoFix }: ArchiveChangeInput): Promise<ArchiveChangeResult> => {
      // First attempt
      let res = await fetch(`${API_BASE}/flow/changes/${changeId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipSpecs, force }),
      })

      // Check for validation error (422)
      if (res.status === 422 && autoFix) {
        const errorJson = await res.json() as ArchiveValidationError

        // Try to auto-fix validation errors
        const fixRes = await fetch(`${API_BASE}/flow/changes/${changeId}/fix-validation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors: errorJson.validationErrors }),
        })

        if (fixRes.ok) {
          // Retry archive after fix
          res = await fetch(`${API_BASE}/flow/changes/${changeId}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skipSpecs }),
          })
        }
      }

      const json = await res.json()
      if (!json.success) {
        // If still failing and canForce, include that info in error
        if (json.canForce) {
          const error = new Error(json.error) as Error & { validationErrors?: string[]; canForce?: boolean }
          error.validationErrors = json.validationErrors
          error.canForce = json.canForce
          throw error
        }
        throw new Error(json.error)
      }
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow', 'changes'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'changes', 'counts'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
    },
  })
}
