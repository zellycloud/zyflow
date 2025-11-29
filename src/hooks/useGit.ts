import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'

// Git 상태 타입
export interface GitStatus {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
  deleted: string[]
  hasConflicts: boolean
  conflictFiles: string[]
  isDirty: boolean
  lastCommitHash: string | null
  lastCommitMessage: string | null
  isGitRepo: boolean
}

export interface GitRemoteUpdates {
  hasUpdates: boolean
  behind: number
  remoteCommits: { hash: string; message: string }[]
}

export interface GitBranches {
  branches: string[]
  currentBranch: string
}

// Git 상태 조회
async function fetchGitStatus(): Promise<GitStatus> {
  const response = await fetch('/api/git/status')
  const json: ApiResponse<GitStatus> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch git status')
  }

  return json.data
}

export function useGitStatus() {
  return useQuery({
    queryKey: ['git', 'status'],
    queryFn: fetchGitStatus,
    refetchInterval: 30000, // 30초마다 자동 갱신
  })
}

// Git 원격 업데이트 확인
async function fetchRemoteUpdates(): Promise<GitRemoteUpdates> {
  const response = await fetch('/api/git/remote-updates')
  const json: ApiResponse<GitRemoteUpdates> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to check remote updates')
  }

  return json.data
}

export function useGitRemoteUpdates() {
  return useQuery({
    queryKey: ['git', 'remote-updates'],
    queryFn: fetchRemoteUpdates,
    enabled: false, // 수동으로만 호출
  })
}

// Git 브랜치 목록
async function fetchGitBranches(all?: boolean): Promise<GitBranches> {
  const url = all ? '/api/git/branches?all=true' : '/api/git/branches'
  const response = await fetch(url)
  const json: ApiResponse<GitBranches> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch branches')
  }

  return json.data
}

export function useGitBranches(all = false) {
  return useQuery({
    queryKey: ['git', 'branches', { all }],
    queryFn: () => fetchGitBranches(all),
  })
}

// Git Pull
async function gitPull(): Promise<{ message: string }> {
  const response = await fetch('/api/git/pull', { method: 'POST' })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to pull')
  }

  return json.data || { message: 'Pull successful' }
}

export function useGitPull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitPull,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'branches'] })
      // 프로젝트 데이터도 갱신 (파일이 변경될 수 있음)
      queryClient.invalidateQueries({ queryKey: ['flow'] })
      queryClient.invalidateQueries({ queryKey: ['changes'] })
    },
  })
}

// Git Push
interface PushOptions {
  remote?: string
  branch?: string
  force?: boolean
}

async function gitPush(options?: PushOptions): Promise<{ message: string }> {
  const response = await fetch('/api/git/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to push')
  }

  return json.data || { message: 'Push successful' }
}

export function useGitPush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitPush,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// Git Fetch
async function gitFetch(options?: { remote?: string; all?: boolean }): Promise<{ message: string }> {
  const response = await fetch('/api/git/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to fetch')
  }

  return json.data || { message: 'Fetch successful' }
}

export function useGitFetch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitFetch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// Git Commit
interface CommitOptions {
  message: string
  all?: boolean
  files?: string[]
}

async function gitCommit(options: CommitOptions): Promise<{ message: string }> {
  const response = await fetch('/api/git/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to commit')
  }

  return json.data || { message: 'Commit successful' }
}

export function useGitCommit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitCommit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// Git Add (Stage)
async function gitAdd(files?: string[]): Promise<{ message: string }> {
  const response = await fetch('/api/git/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to stage files')
  }

  return json.data || { message: 'Files staged' }
}

export function useGitAdd() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitAdd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// Git Checkout
interface CheckoutOptions {
  branch: string
  create?: boolean
}

async function gitCheckout(options: CheckoutOptions): Promise<{ message: string; branch: string }> {
  const response = await fetch('/api/git/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<{ message: string; branch: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to checkout')
  }

  return json.data || { message: 'Checkout successful', branch: options.branch }
}

export function useGitCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitCheckout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'branches'] })
      // 브랜치 변경 시 데이터도 갱신
      queryClient.invalidateQueries({ queryKey: ['flow'] })
      queryClient.invalidateQueries({ queryKey: ['changes'] })
    },
  })
}

// Git Branch 생성
interface CreateBranchOptions {
  name: string
  baseBranch?: string
  checkout?: boolean
}

async function gitCreateBranch(options: CreateBranchOptions): Promise<{ message: string; branch: string }> {
  const response = await fetch('/api/git/branch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const json: ApiResponse<{ message: string; branch: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to create branch')
  }

  return json.data || { message: 'Branch created', branch: options.name }
}

export function useGitCreateBranch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitCreateBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'branches'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}

// Git Stash
interface StashOptions {
  pop?: boolean
  message?: string
}

async function gitStash(options?: StashOptions): Promise<{ message: string }> {
  const response = await fetch('/api/git/stash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
  const json: ApiResponse<{ message: string }> = await response.json()

  if (!json.success) {
    throw new Error(json.error || 'Failed to stash')
  }

  return json.data || { message: 'Stash successful' }
}

export function useGitStash() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gitStash,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] })
    },
  })
}
