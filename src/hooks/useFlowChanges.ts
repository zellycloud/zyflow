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
  projectId?: string
}

export function useFlowTasks(filters: FlowTaskFilters = {}, options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}
  const params = new URLSearchParams()
  if (filters.changeId) params.set('changeId', filters.changeId)
  if (filters.stage) params.set('stage', filters.stage)
  if (filters.status) params.set('status', filters.status)
  if (filters.standalone) params.set('standalone', 'true')
  if (filters.includeArchived) params.set('includeArchived', 'true')
  if (filters.projectId) params.set('projectId', filters.projectId)

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
  | { type: 'backlog'; projectId: string }
  | { type: 'project-settings'; projectId: string }
  | { type: 'agent'; projectId: string; changeId?: string }
  | { type: 'archived'; projectId: string; archivedChangeId?: string }
  | { type: 'docs'; projectId: string }
  | { type: 'alerts'; projectId: string }
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

      case 'backlog':
        queryClient.invalidateQueries({
          queryKey: ['backlog'],
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
  const projectId = selectedItem && 'projectId' in selectedItem ? selectedItem.projectId : undefined
  const { data: changes } = useFlowChanges()
  const { data: tasks } = useFlowTasks({
    changeId: selectedItem?.type === 'change' ? selectedItem.changeId : undefined,
    standalone: selectedItem?.type === 'standalone-tasks' ? true : undefined,
    projectId
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
  projectId?: string
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
    mutationFn: async ({ changeId, skipSpecs, force, autoFix, projectId }: ArchiveChangeInput): Promise<ArchiveChangeResult> => {
      // First attempt
      let res = await fetch(`${API_BASE}/flow/changes/${changeId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipSpecs, force, projectId }),
      })

      // Check for validation error (422)
      if (res.status === 422 && autoFix) {
        const errorJson = await res.json() as ArchiveValidationError

        // Try to auto-fix validation errors
        const fixRes = await fetch(`${API_BASE}/flow/changes/${changeId}/fix-validation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors: errorJson.validationErrors, projectId }),
        })

        if (fixRes.ok) {
          // Retry archive after fix
          res = await fetch(`${API_BASE}/flow/changes/${changeId}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skipSpecs, projectId }),
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

// =============================================
// Backlog API
// =============================================

interface BacklogTaskFilters {
  projectId?: string
  includeArchived?: boolean
}

// Backlog 태스크 조회 (origin=backlog 필터 사용)
export function useBacklogTasks(filters: BacklogTaskFilters = {}, options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}
  const params = new URLSearchParams()
  params.set('origin', 'backlog')
  if (filters.projectId) params.set('projectId', filters.projectId)
  if (filters.includeArchived) params.set('includeArchived', 'true')

  return useQuery({
    queryKey: ['backlog', 'tasks', filters],
    queryFn: async (): Promise<FlowTask[]> => {
      const res = await fetch(`${API_BASE}/flow/tasks?${params}`)
      const json: ApiResponse<{ tasks: FlowTask[] }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.tasks ?? []
    },
    enabled,
    staleTime: 30000,
    gcTime: 300000,
  })
}

// Backlog 통계
interface BacklogStats {
  total: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byMilestone: Record<string, number>
}

export function useBacklogStats(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}

  return useQuery({
    queryKey: ['backlog', 'stats'],
    queryFn: async (): Promise<BacklogStats> => {
      const res = await fetch(`${API_BASE}/flow/backlog/stats`)
      const json: ApiResponse<BacklogStats> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    enabled,
    staleTime: 30000,
    gcTime: 300000,
  })
}

// Backlog 동기화
interface BacklogSyncResult {
  synced: number
  created: number
  updated: number
  deleted: number
}

export function useSyncBacklog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<BacklogSyncResult> => {
      const res = await fetch(`${API_BASE}/flow/backlog/sync`, { method: 'POST' })
      const json: ApiResponse<BacklogSyncResult> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
    },
  })
}

// Backlog 태스크 생성
interface CreateBacklogTaskInput {
  title: string
  description?: string
  status?: string
  priority?: 'low' | 'medium' | 'high'
  assignees?: string[]
  labels?: string[]
  blockedBy?: string[]
  parent?: string
  dueDate?: string
  milestone?: string
  plan?: string
  acceptanceCriteria?: string
  notes?: string
}

interface CreateBacklogTaskResult {
  backlogFileId: string
  filePath: string
  synced: BacklogSyncResult
}

export function useCreateBacklogTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateBacklogTaskInput): Promise<CreateBacklogTaskResult> => {
      const res = await fetch(`${API_BASE}/flow/backlog/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json: ApiResponse<CreateBacklogTaskResult> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
    },
  })
}

// Backlog 태스크 수정
interface UpdateBacklogTaskInput {
  backlogFileId: string
  title?: string
  description?: string
  status?: string
  priority?: 'low' | 'medium' | 'high'
  assignees?: string[]
  labels?: string[]
  blockedBy?: string[]
  parent?: string
  dueDate?: string
  milestone?: string
  plan?: string
  acceptanceCriteria?: string
  notes?: string
}

export function useUpdateBacklogTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ backlogFileId, ...data }: UpdateBacklogTaskInput): Promise<CreateBacklogTaskResult> => {
      const res = await fetch(`${API_BASE}/flow/backlog/tasks/${backlogFileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json: ApiResponse<CreateBacklogTaskResult> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
    },
  })
}

// Backlog 태스크 삭제
interface DeleteBacklogTaskInput {
  backlogFileId: string
  archive?: boolean
}

export function useDeleteBacklogTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ backlogFileId, archive = false }: DeleteBacklogTaskInput): Promise<void> => {
      const params = archive ? '?archive=true' : ''
      const res = await fetch(`${API_BASE}/flow/backlog/tasks/${backlogFileId}${params}`, {
        method: 'DELETE',
      })
      const json: ApiResponse<unknown> = await res.json()
      if (!json.success) throw new Error(json.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
    },
  })
}

// Backlog 태스크 상세
interface BacklogTaskDetail extends FlowTask {
  subtasks?: Array<{
    id: number
    title: string
    status: string
    priority: string
  }>
}

export function useBacklogTaskDetail(backlogFileId: string | null, options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}

  return useQuery({
    queryKey: ['backlog', 'tasks', backlogFileId],
    queryFn: async (): Promise<BacklogTaskDetail | null> => {
      if (!backlogFileId) return null
      const res = await fetch(`${API_BASE}/flow/backlog/tasks/${backlogFileId}`)
      if (res.status === 404) return null
      const json: ApiResponse<{ task: BacklogTaskDetail }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data?.task ?? null
    },
    enabled: enabled && !!backlogFileId,
    staleTime: 30000,
    gcTime: 300000,
  })
}

// =============================================
// Migration API Hooks
// =============================================

// 마이그레이션 미리보기 결과
interface MigrationPreview {
  count: number
  tasks: Array<{
    id: number
    title: string
    description: string | null
    status: string
    priority: string
    tags: string | null
    assignee: string | null
    createdAt: string
    updatedAt: string
  }>
}

// 마이그레이션 대상 Inbox 태스크 미리보기
export function useMigrationPreview(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {}

  return useQuery({
    queryKey: ['backlog', 'migration', 'preview'],
    queryFn: async (): Promise<MigrationPreview> => {
      const res = await fetch(`${API_BASE}/flow/backlog/migration/preview`)
      const json: ApiResponse<MigrationPreview> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    enabled,
    staleTime: 30000,
    gcTime: 300000,
  })
}

// 마이그레이션 결과
interface MigrationResult {
  success: boolean
  migratedCount: number
  skippedCount: number
  errors: string[]
  tasks: Array<{
    id: number
    title: string
    backlogFileId: string
    status: 'migrated' | 'skipped' | 'error'
    reason?: string
  }>
}

// Inbox 전체를 Backlog로 마이그레이션
export function useMigrateAllToBacklog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<MigrationResult> => {
      const res = await fetch(`${API_BASE}/flow/backlog/migration`, {
        method: 'POST',
      })
      const json: ApiResponse<MigrationResult> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
    },
  })
}

// 선택된 Inbox 태스크들만 Backlog로 마이그레이션
export function useMigrateSelectedToBacklog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskIds: number[]): Promise<MigrationResult> => {
      const res = await fetch(`${API_BASE}/flow/backlog/migration/selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      })
      const json: ApiResponse<MigrationResult> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
    },
  })
}
