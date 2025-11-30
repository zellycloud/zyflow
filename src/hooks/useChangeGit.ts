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

// ==================== GitHub PR 관련 훅 ====================

export interface GitHubAuthStatus {
  authenticated: boolean
  user?: string
  repo?: { owner: string; repo: string } | null
  error?: string
}

export interface PullRequestInfo {
  number: number
  url: string
  title: string
  state: string
  headBranch: string
  baseBranch: string
}

// GitHub 인증 상태 확인
async function fetchGitHubAuth(): Promise<GitHubAuthStatus> {
  const response = await fetch('/api/git/github/auth')
  const json: ApiResponse<GitHubAuthStatus> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to check GitHub auth')
  }

  return json.data
}

export function useGitHubAuth() {
  return useQuery({
    queryKey: ['github', 'auth'],
    queryFn: fetchGitHubAuth,
    staleTime: 60000, // 1분간 캐시
  })
}

// 현재 브랜치의 PR 정보
async function fetchCurrentPR(): Promise<{ pr: PullRequestInfo | null }> {
  const response = await fetch('/api/git/github/pr/current')
  const json: ApiResponse<{ pr: PullRequestInfo | null }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to get current PR')
  }

  return json.data!
}

export function useCurrentPR() {
  return useQuery({
    queryKey: ['github', 'pr', 'current'],
    queryFn: fetchCurrentPR,
  })
}

// PR 생성
interface CreatePROptions {
  changeId: string
  changeTitle: string
  baseBranch?: string
  draft?: boolean
  description?: string
}

async function createPR(options: CreatePROptions): Promise<{ pr: PullRequestInfo; url: string }> {
  const response = await fetch('/api/git/github/pr/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<{ pr: PullRequestInfo; url: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to create PR')
  }

  return json.data!
}

export function useCreatePR() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createPR,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github', 'pr'] })
    },
  })
}

// ==================== 원격 상태 모니터링 훅 ====================

export interface RemoteUpdate {
  hasUpdates: boolean
  behind: number
  remoteCommits: { hash: string; message: string }[]
}

export interface PotentialConflict {
  hasPotentialConflicts: boolean
  files: string[]
}

// 원격 업데이트 확인
async function fetchRemoteUpdates(): Promise<RemoteUpdate> {
  const response = await fetch('/api/git/remote-updates')
  const json: ApiResponse<RemoteUpdate> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to check remote updates')
  }

  return json.data
}

export function useRemoteUpdates(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: ['git', 'remote-updates'],
    queryFn: fetchRemoteUpdates,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval ?? 60000, // 기본 1분마다 체크
    staleTime: 30000, // 30초간 캐시
  })
}

// 충돌 가능성 감지
async function fetchPotentialConflicts(): Promise<PotentialConflict> {
  const response = await fetch('/api/git/potential-conflicts')
  const json: ApiResponse<PotentialConflict> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to detect conflicts')
  }

  return json.data
}

export function usePotentialConflicts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['git', 'potential-conflicts'],
    queryFn: fetchPotentialConflicts,
    enabled: options?.enabled ?? false, // 기본 비활성화 (수동으로 트리거)
    staleTime: 60000,
  })
}

// Git fetch 실행
async function gitFetch(): Promise<{ message: string }> {
  const response = await fetch('/api/git/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to fetch')
  }

  return json.data!
}

export function useGitFetch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitFetch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'remote-updates'] })
    },
  })
}

// Git pull 실행
async function gitPull(): Promise<{ message: string }> {
  const response = await fetch('/api/git/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to pull')
  }

  return json.data!
}

export function useGitPull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitPull,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git'] })
    },
  })
}

// ==================== 충돌 해결 훅 ====================

export interface ConflictFile {
  file: string
  content?: string
}

export interface ConflictInfo {
  hasConflicts: boolean
  files: string[]
}

// 현재 충돌 파일 목록 조회
async function fetchConflicts(): Promise<ConflictInfo> {
  const response = await fetch('/api/git/conflicts')
  const json: ApiResponse<ConflictInfo> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to get conflicts')
  }

  return json.data
}

export function useConflicts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['git', 'conflicts'],
    queryFn: fetchConflicts,
    enabled: options?.enabled ?? true,
    refetchInterval: 5000, // 5초마다 확인
  })
}

// 특정 충돌 파일 내용 조회
async function fetchConflictFile(file: string): Promise<ConflictFile> {
  const response = await fetch(`/api/git/conflicts/${encodeURIComponent(file)}`)
  const json: ApiResponse<ConflictFile> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to get conflict file')
  }

  return json.data
}

export function useConflictFile(file: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['git', 'conflicts', file],
    queryFn: () => fetchConflictFile(file),
    enabled: (options?.enabled ?? true) && !!file,
  })
}

// 충돌 해결 (ours/theirs)
interface ResolveConflictOptions {
  file: string
  strategy: 'ours' | 'theirs'
}

async function resolveConflict(options: ResolveConflictOptions): Promise<{ file: string; strategy: string; message: string }> {
  const response = await fetch('/api/git/conflicts/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<{ file: string; strategy: string; message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to resolve conflict')
  }

  return json.data!
}

export function useResolveConflict() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resolveConflict,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'conflicts'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// 수동 편집 후 충돌 해결 마킹
async function markConflictResolved(file: string): Promise<{ file: string; message: string }> {
  const response = await fetch('/api/git/conflicts/mark-resolved', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  })
  const json: ApiResponse<{ file: string; message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to mark conflict resolved')
  }

  return json.data!
}

export function useMarkConflictResolved() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markConflictResolved,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'conflicts'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// Merge 중단
async function abortMerge(): Promise<{ message: string }> {
  const response = await fetch('/api/git/merge/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to abort merge')
  }

  return json.data!
}

export function useAbortMerge() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: abortMerge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git'] })
    },
  })
}

// Merge 계속 (충돌 해결 후)
async function continueMerge(): Promise<{ message: string }> {
  const response = await fetch('/api/git/merge/continue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const json: ApiResponse<{ message: string }> & { remainingConflicts?: string[] } = await response.json()

  if (!json.success) {
    const error = new Error(json.error || 'Failed to continue merge') as Error & {
      remainingConflicts?: string[]
    }
    error.remainingConflicts = json.remainingConflicts
    throw error
  }

  return json.data!
}

export function useContinueMerge() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: continueMerge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git'] })
    },
  })
}

// 통합 충돌 해결 훅
export function useConflictResolution() {
  const conflicts = useConflicts()
  const resolveConflict = useResolveConflict()
  const markResolved = useMarkConflictResolved()
  const abortMerge = useAbortMerge()
  const continueMerge = useContinueMerge()

  return {
    // 상태
    hasConflicts: conflicts.data?.hasConflicts ?? false,
    conflictFiles: conflicts.data?.files ?? [],
    isLoading: conflicts.isLoading,

    // 액션
    resolveWithOurs: (file: string) => resolveConflict.mutateAsync({ file, strategy: 'ours' }),
    resolveWithTheirs: (file: string) => resolveConflict.mutateAsync({ file, strategy: 'theirs' }),
    markAsResolved: (file: string) => markResolved.mutateAsync(file),
    abortMerge: () => abortMerge.mutateAsync(),
    continueMerge: () => continueMerge.mutateAsync(),

    // 액션 상태
    isResolving: resolveConflict.isPending,
    isMarking: markResolved.isPending,
    isAborting: abortMerge.isPending,
    isContinuing: continueMerge.isPending,

    // 에러
    error: conflicts.error || resolveConflict.error || markResolved.error || abortMerge.error || continueMerge.error,

    // 새로고침
    refetch: conflicts.refetch,
  }
}