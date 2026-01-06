import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/config/api'

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
export function useDocsList(projectPath?: string) {
  return useQuery({
    queryKey: ['docs', 'list', projectPath],
    queryFn: async (): Promise<DocItem[]> => {
      if (!projectPath) return []

      const params = new URLSearchParams({ projectPath })
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
export function useDocContent(projectPath?: string, docPath?: string) {
  return useQuery({
    queryKey: ['docs', 'content', projectPath, docPath],
    queryFn: async (): Promise<DocContent | null> => {
      if (!projectPath || !docPath) return null

      const params = new URLSearchParams({ projectPath, docPath })
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
export function useDocSearch(projectPath?: string, query?: string) {
  return useQuery({
    queryKey: ['docs', 'search', projectPath, query],
    queryFn: async (): Promise<DocSearchResult[]> => {
      if (!projectPath || !query || query.length < 2) return []

      const params = new URLSearchParams({ projectPath, query })
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useSaveDocContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      docPath,
      content,
    }: {
      projectPath: string
      docPath: string
      content: string
    }) => {
      const res = await fetch(`${API_BASE}/docs/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, docPath, content }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save document')
      }

      return res.json()
    },
    onSuccess: (_, { projectPath, docPath }) => {
      // 캐시 무효화 (목록 및 해당 문서 내용)
      queryClient.invalidateQueries({ queryKey: ['docs', 'content', projectPath, docPath] })
      queryClient.invalidateQueries({ queryKey: ['docs', 'list', projectPath] }) // 변경일 업데이트 등을 위해
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
