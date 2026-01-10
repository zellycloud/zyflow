/**
 * LEANN Index Status Hook
 *
 * LEANN 인덱스 상태 조회 및 인덱싱 트리거
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/config/api'

export interface ProjectIndexStatus {
  projectId: string
  projectName: string
  projectPath: string
  indexed: boolean
  indexSize?: string
  pathExists?: boolean
}

interface LeannIndexesResponse {
  success: boolean
  data: ProjectIndexStatus[]
  leannInstalled: boolean
  warning?: string
}

interface IndexProjectResponse {
  success: boolean
  message?: string
  error?: string
  indexName?: string
}

/**
 * LEANN 인덱스 상태 조회 훅
 */
export function useLeannIndexStatus() {
  return useQuery({
    queryKey: ['leann', 'indexes'],
    queryFn: async (): Promise<{
      projects: ProjectIndexStatus[]
      leannInstalled: boolean
      warning?: string
    }> => {
      const res = await fetch(`${API_ENDPOINTS.base}/leann/indexes`)
      if (!res.ok) {
        throw new Error('Failed to fetch index status')
      }
      const data: LeannIndexesResponse = await res.json()
      return {
        projects: data.data || [],
        leannInstalled: data.leannInstalled,
        warning: data.warning,
      }
    },
    staleTime: 30000, // 30초 캐시
    refetchOnWindowFocus: false,
  })
}

/**
 * 프로젝트 인덱싱 mutation 훅
 */
export function useIndexProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectPath,
      projectName,
    }: {
      projectPath: string
      projectName: string
    }): Promise<IndexProjectResponse> => {
      const res = await fetch(`${API_ENDPOINTS.base}/leann/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, projectName }),
      })

      const data: IndexProjectResponse = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start indexing')
      }

      return data
    },
    onSuccess: () => {
      // 인덱싱 완료 후 상태 갱신
      queryClient.invalidateQueries({ queryKey: ['leann', 'indexes'] })
    },
  })
}
