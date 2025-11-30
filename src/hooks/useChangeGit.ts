/**
 * Change-Git 연계 훅
 * OpenSpec Change: integrate-git-workflow (Phase 2)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'

// Change 브랜치 정보
export interface ChangeBranchInfo {
  isChangeBranch: boolean
  changeId: string | null
  branch: string
}

// Change 브랜치 목록 항목
export interface ChangeBranch {
  name: string
  changeId: string
  isRemote: boolean
  isCurrent: boolean
}

// 커밋 메시지 stage 타입
export type CommitMessageStage = 'spec' | 'task' | 'code' | 'test' | 'commit' | 'docs'

// uncommitted changes 정보
export interface UncommittedChanges {
  hasChanges: boolean
  staged: string[]
  modified: string[]
  untracked: string[]
  deleted: string[]
  summary: string
}

// Change 브랜치 시작 결과
export interface StartChangeBranchResult {
  branch: string
  created: boolean
  stashed: boolean
  message: string
}

// Change 커밋 결과
export interface ChangeCommitResult {
  message: string
  formattedMessage: string
}

// ==================== 현재 Change 브랜치 정보 ====================

async function fetchCurrentChangeBranch(): Promise<ChangeBranchInfo> {
  const response = await fetch('/api/git/change/current')
  const json: ApiResponse<ChangeBranchInfo> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch current change branch')
  }

  return json.data
}

export function useCurrentChangeBranch() {
  return useQuery({
    queryKey: ['git', 'change', 'current'],
    queryFn: fetchCurrentChangeBranch,
    refetchInterval: 30000, // 30초마다 자동 갱신
  })
}

// ==================== Change 브랜치 목록 ====================

async function fetchChangeBranches(): Promise<{ branches: ChangeBranch[] }> {
  const response = await fetch('/api/git/change/branches')
  const json: ApiResponse<{ branches: ChangeBranch[] }> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch change branches')
  }

  return json.data
}

export function useChangeBranches() {
  return useQuery({
    queryKey: ['git', 'change', 'branches'],
    queryFn: fetchChangeBranches,
  })
}

// ==================== Change 브랜치 존재 여부 확인 ====================

async function fetchChangeBranchExists(
  changeId: string
): Promise<{ exists: boolean; branchName: string; changeId: string }> {
  const response = await fetch(`/api/git/change/${encodeURIComponent(changeId)}/exists`)
  const json: ApiResponse<{ exists: boolean; branchName: string; changeId: string }> =
    await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to check change branch')
  }

  return json.data
}

export function useChangeBranchExists(changeId: string) {
  return useQuery({
    queryKey: ['git', 'change', changeId, 'exists'],
    queryFn: () => fetchChangeBranchExists(changeId),
    enabled: !!changeId,
  })
}

// ==================== uncommitted changes 확인 ====================

async function fetchUncommittedChanges(): Promise<UncommittedChanges> {
  const response = await fetch('/api/git/uncommitted')
  const json: ApiResponse<UncommittedChanges> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to check uncommitted changes')
  }

  return json.data
}

export function useUncommittedChanges() {
  return useQuery({
    queryKey: ['git', 'uncommitted'],
    queryFn: fetchUncommittedChanges,
  })
}

// ==================== Change 브랜치 시작 ====================

interface StartChangeBranchOptions {
  changeId: string
  baseBranch?: string
  stashChanges?: boolean
  force?: boolean
}

async function startChangeBranch(options: StartChangeBranchOptions): Promise<StartChangeBranchResult> {
  const response = await fetch('/api/git/change/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<StartChangeBranchResult> & { hasUncommittedChanges?: boolean } =
    await response.json()

  if (!json.success) {
    const error = new Error(json.error || 'Failed to start change branch') as Error & {
      hasUncommittedChanges?: boolean
    }
    error.hasUncommittedChanges = json.hasUncommittedChanges
    throw error
  }

  return json.data!
}

export function useStartChangeBranch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: startChangeBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'branches'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'change'] })
      queryClient.invalidateQueries({ queryKey: ['flow'] })
    },
  })
}

// ==================== Change 커밋 ====================

interface ChangeCommitOptions {
  changeId: string
  stage: CommitMessageStage
  description: string
  files?: string[]
  all?: boolean
  template?: string
}

async function commitForChange(options: ChangeCommitOptions): Promise<ChangeCommitResult> {
  const response = await fetch('/api/git/change/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<ChangeCommitResult> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to commit for change')
  }

  return json.data!
}

export function useChangeCommit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: commitForChange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'uncommitted'] })
    },
  })
}

// ==================== Change 브랜치 푸시 ====================

interface ChangePushOptions {
  changeId: string
  setUpstream?: boolean
  force?: boolean
}

async function pushChangeBranch(options: ChangePushOptions): Promise<{ message: string }> {
  const response = await fetch('/api/git/change/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to push change branch')
  }

  return json.data!
}

export function useChangePush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: pushChangeBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// ==================== 통합 훅: Change Git 워크플로우 ====================

export function useChangeGitWorkflow(changeId: string | null) {
  const currentBranch = useCurrentChangeBranch()
  const branchExists = useChangeBranchExists(changeId || '')
  const uncommitted = useUncommittedChanges()
  const startBranch = useStartChangeBranch()
  const commit = useChangeCommit()
  const push = useChangePush()

  // 현재 Change 브랜치에 있는지 확인
  const isOnChangeBranch =
    currentBranch.data?.isChangeBranch && currentBranch.data?.changeId === changeId

  // Change 브랜치가 존재하는지
  const hasBranch = branchExists.data?.exists ?? false

  // uncommitted changes가 있는지
  const hasUncommittedChanges = uncommitted.data?.hasChanges ?? false

  return {
    // 상태
    currentBranch: currentBranch.data,
    isOnChangeBranch,
    hasBranch,
    hasUncommittedChanges,
    uncommittedSummary: uncommitted.data?.summary,

    // 로딩 상태
    isLoading:
      currentBranch.isLoading ||
      branchExists.isLoading ||
      uncommitted.isLoading,

    // 작업
    startBranch: (options?: { baseBranch?: string; stashChanges?: boolean; force?: boolean }) =>
      startBranch.mutateAsync({
        changeId: changeId || '',
        ...options,
      }),
    commit: (options: { stage: CommitMessageStage; description: string; files?: string[]; all?: boolean }) =>
      commit.mutateAsync({
        changeId: changeId || '',
        ...options,
      }),
    push: (options?: { setUpstream?: boolean; force?: boolean }) =>
      push.mutateAsync({
        changeId: changeId || '',
        ...options,
      }),

    // Mutation 상태
    isStarting: startBranch.isPending,
    isCommitting: commit.isPending,
    isPushing: push.isPending,

    // 에러
    error: startBranch.error || commit.error || push.error,

    // 새로고침
    refetch: () => {
      currentBranch.refetch()
      branchExists.refetch()
      uncommitted.refetch()
    },
  }
}