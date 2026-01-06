import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/config/api'
import { toast } from 'sonner'

export interface DocItem {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: DocItem[]
}

export interface DocContent {
  id: string
  name: string
  path: string
  content: string
  lastModified: string
}

export interface DocSearchResult {
  path: string
  name: string
  matches: string[]
}

const API_BASE = API_ENDPOINTS.base

/**
 * 프로젝트의 문서 목록 조회
 */
export function useDocsList(projectPath?: string, remote?: { serverId: string }) {
  return useQuery({
    queryKey: ['docs', 'list', projectPath, remote?.serverId],
    queryFn: async (): Promise<DocItem[]> => {
      if (!projectPath) return []

      const params = new URLSearchParams({ projectPath })
      if (remote) {
        params.append('serverId', remote.serverId)
      }
      
      const res = await fetch(`${API_BASE}/docs?${params}`)

      if (!res.ok) {
        throw new Error('Failed to fetch docs list')
      }

      const data = await res.json()
      return data.data || []
    },
    enabled: !!projectPath,
    staleTime: 30000, // 30초
  })
}

/**
 * 특정 문서 내용 조회
 */
export function useDocContent(projectPath?: string, docPath?: string, remote?: { serverId: string }) {
  return useQuery({
    queryKey: ['docs', 'content', projectPath, docPath, remote?.serverId],
    queryFn: async (): Promise<DocContent | null> => {
      if (!projectPath || !docPath) return null

      const params = new URLSearchParams({ projectPath, docPath })
      if (remote) {
        params.append('serverId', remote.serverId)
      }
      
      const res = await fetch(`${API_BASE}/docs/content?${params}`)

      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error('Failed to fetch doc content')
      }

      const data = await res.json()
      return data.data || null
    },
    enabled: !!projectPath && !!docPath,
    staleTime: 10000, // 10초
  })
}

/**
 * 문서 검색
 */
export function useDocSearch(projectPath?: string, query?: string, remote?: { serverId: string }) {
  return useQuery({
    queryKey: ['docs', 'search', projectPath, query, remote?.serverId],
    queryFn: async (): Promise<DocSearchResult[]> => {
      if (!projectPath || !query || query.length < 2) return []

      const params = new URLSearchParams({ projectPath, query })
      if (remote) {
        params.append('serverId', remote.serverId)
      }
      
      const res = await fetch(`${API_BASE}/docs/search?${params}`)

      if (!res.ok) {
        throw new Error('Failed to search docs')
      }

      const data = await res.json()
      return data.data || []
    },
    enabled: !!projectPath && !!query && query.length >= 2,
    staleTime: 5000, // 5초
  })
}

/**
 * 문서 내용 저장
 */
export function useSaveDocContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      docPath,
      content,
      remote,
    }: {
      projectPath: string
      docPath: string
      content: string
      remote?: { serverId: string }
    }) => {
      const body: any = { projectPath, docPath, content }
      if (remote) {
        body.serverId = remote.serverId
      }

      const res = await fetch(`${API_BASE}/docs/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save document')
      }

      return res.json()
    },
    onSuccess: (_, { projectPath, docPath, remote }) => {
      // 캐시 무효화 (목록 및 해당 문서 내용)
      queryClient.invalidateQueries({ queryKey: ['docs', 'content', projectPath, docPath, remote?.serverId] })
      queryClient.invalidateQueries({ queryKey: ['docs', 'list', projectPath, remote?.serverId] })
      toast.success('문서가 저장되었습니다')
    },
    onError: (error) => {
      console.error('Save error:', error)
      toast.error(`저장 실패: ${error.message}`)
    },
  })
}

/**
 * 문서 트리에서 모든 파일 경로 추출 (검색/팔레트용)
 */
export function flattenDocTree(items: DocItem[]): DocItem[] {
  const result: DocItem[] = []

  function traverse(items: DocItem[]) {
    for (const item of items) {
      if (item.type === 'file') {
        result.push(item)
      }
      if (item.children) {
        traverse(item.children)
      }
    }
  }

  traverse(items)
  return result
}
