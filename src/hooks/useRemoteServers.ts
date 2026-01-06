/**
 * Remote Servers Hook
 * 원격 서버 관리를 위한 React Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  RemoteServer,
  RemoteServersResponse,
  RemoteServerResponse,
  TestConnectionResponse,
  BrowseRemoteResponse,
  AddRemoteServerRequest,
  AddRemoteProjectRequest,
  Project,
  RemoteDirectoryListing,
  SSHConfigHost,
  SSHConfigResponse,
} from '@/types'

const API_BASE = '/api/remote'

// ============================================
// Query Keys
// ============================================
export const remoteKeys = {
  all: ['remote'] as const,
  servers: () => [...remoteKeys.all, 'servers'] as const,
  server: (id: string) => [...remoteKeys.servers(), id] as const,
  browse: (serverId: string, path: string) => [...remoteKeys.all, 'browse', serverId, path] as const,
  projects: () => [...remoteKeys.all, 'projects'] as const,
  sshConfig: () => [...remoteKeys.all, 'ssh-config'] as const,
}

// ============================================
// 서버 목록 조회
// ============================================
export function useRemoteServers() {
  return useQuery({
    queryKey: remoteKeys.servers(),
    queryFn: async (): Promise<RemoteServer[]> => {
      const res = await fetch(`${API_BASE}/servers`)
      if (!res.ok) throw new Error('Failed to fetch remote servers')
      const data: RemoteServersResponse = await res.json()
      return data.servers
    },
    staleTime: 30 * 1000, // 30초
  })
}

// ============================================
// SSH Config 호스트 목록 (~/.ssh/config)
// ============================================
export function useSSHConfigHosts() {
  return useQuery({
    queryKey: remoteKeys.sshConfig(),
    queryFn: async (): Promise<SSHConfigHost[]> => {
      const res = await fetch(`${API_BASE}/ssh-config`)
      if (!res.ok) throw new Error('Failed to fetch SSH config')
      const data: SSHConfigResponse = await res.json()
      return data.hosts
    },
    staleTime: 60 * 1000, // 1분
  })
}

// ============================================
// SSH Config에서 서버 추가
// ============================================
export function useAddServerFromSSHConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (hostAlias: string): Promise<RemoteServer> => {
      const res = await fetch(`${API_BASE}/servers/from-ssh-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostAlias }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add server from SSH config')
      }
      const data: RemoteServerResponse = await res.json()
      return data.server
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: remoteKeys.servers() })
    },
  })
}

// ============================================
// 단일 서버 조회
// ============================================
export function useRemoteServer(serverId: string) {
  return useQuery({
    queryKey: remoteKeys.server(serverId),
    queryFn: async (): Promise<RemoteServer> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}`)
      if (!res.ok) throw new Error('Failed to fetch server')
      const data: RemoteServerResponse = await res.json()
      return data.server
    },
    enabled: !!serverId,
  })
}

// ============================================
// 서버 추가
// ============================================
export function useAddRemoteServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: AddRemoteServerRequest): Promise<RemoteServer> => {
      const res = await fetch(`${API_BASE}/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add server')
      }
      const data: RemoteServerResponse = await res.json()
      return data.server
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: remoteKeys.servers() })
    },
  })
}

// ============================================
// 서버 수정
// ============================================
export function useUpdateRemoteServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      serverId,
      updates,
    }: {
      serverId: string
      updates: Partial<RemoteServer>
    }): Promise<RemoteServer> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update server')
      const data: RemoteServerResponse = await res.json()
      return data.server
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: remoteKeys.server(serverId) })
      queryClient.invalidateQueries({ queryKey: remoteKeys.servers() })
    },
  })
}

// ============================================
// 서버 삭제
// ============================================
export function useRemoveRemoteServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (serverId: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to remove server')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: remoteKeys.servers() })
    },
  })
}

// ============================================
// 연결 테스트
// ============================================
export function useTestConnection() {
  return useMutation({
    mutationFn: async (serverId: string): Promise<TestConnectionResponse> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}/test`, {
        method: 'POST',
      })
      const data: TestConnectionResponse = await res.json()
      return data
    },
  })
}

// ============================================
// 연결 종료
// ============================================
export function useDisconnect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (serverId: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}/disconnect`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to disconnect')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: remoteKeys.servers() })
    },
  })
}

// ============================================
// 디렉토리 탐색
// ============================================
export function useBrowseRemote(serverId: string, path: string) {
  return useQuery({
    queryKey: remoteKeys.browse(serverId, path),
    queryFn: async (): Promise<RemoteDirectoryListing> => {
      const res = await fetch(
        `${API_BASE}/servers/${serverId}/browse?path=${encodeURIComponent(path)}`
      )
      if (!res.ok) throw new Error('Failed to browse directory')
      const data: BrowseRemoteResponse = await res.json()
      return data.listing
    },
    enabled: !!serverId && !!path,
    staleTime: 10 * 1000, // 10초
  })
}

// ============================================
// 원격 프로젝트 추가
// ============================================
export function useAddRemoteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: AddRemoteProjectRequest): Promise<Project> => {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add remote project')
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      // 프로젝트 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-all-data'] })
    },
  })
}

// ============================================
// 원격 프로젝트 목록
// ============================================
export function useRemoteProjects() {
  return useQuery({
    queryKey: remoteKeys.projects(),
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch(`${API_BASE}/projects`)
      if (!res.ok) throw new Error('Failed to fetch remote projects')
      const data = await res.json()
      return data.projects
    },
  })
}

// ============================================
// 명령어 실행 (mutation)
// ============================================
export function useExecuteRemoteCommand() {
  return useMutation({
    mutationFn: async ({
      serverId,
      command,
      cwd,
      timeout,
    }: {
      serverId: string
      command: string
      cwd?: string
      timeout?: number
    }): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd, timeout }),
      })
      if (!res.ok) throw new Error('Command execution failed')
      return res.json()
    },
  })
}

// ============================================
// Git 상태 조회
// ============================================
export function useRemoteGitStatus(serverId: string, projectPath: string) {
  return useQuery({
    queryKey: [...remoteKeys.all, 'git', 'status', serverId, projectPath],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/servers/${serverId}/git/status?path=${encodeURIComponent(projectPath)}`
      )
      if (!res.ok) throw new Error('Failed to get git status')
      return res.json()
    },
    enabled: !!serverId && !!projectPath,
    refetchInterval: 30 * 1000, // 30초마다 갱신
  })
}

// ============================================
// Git Pull
// ============================================
export function useRemoteGitPull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      serverId,
      path,
    }: {
      serverId: string
      path: string
    }): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}/git/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!res.ok) throw new Error('Git pull failed')
      return res.json()
    },
    onSuccess: (_, { serverId, path }) => {
      queryClient.invalidateQueries({
        queryKey: [...remoteKeys.all, 'git', 'status', serverId, path],
      })
    },
  })
}

// ============================================
// Git Push
// ============================================
export function useRemoteGitPush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      serverId,
      path,
    }: {
      serverId: string
      path: string
    }): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      const res = await fetch(`${API_BASE}/servers/${serverId}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!res.ok) throw new Error('Git push failed')
      return res.json()
    },
    onSuccess: (_, { serverId, path }) => {
      queryClient.invalidateQueries({
        queryKey: [...remoteKeys.all, 'git', 'status', serverId, path],
      })
    },
  })
}
