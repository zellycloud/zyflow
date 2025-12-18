/**
 * 실행 기록 조회 훅
 * @module hooks/useExecutionHistory
 */

import { useQuery } from '@tanstack/react-query'

export interface ExecutionLog {
  runId: string
  changeId: string
  taskId: string
  taskTitle: string
  status: 'completed' | 'error'
  startedAt: string
  completedAt: string
  output: string[]
}

interface ExecutionLogsResponse {
  success: boolean
  data?: {
    logs: ExecutionLog[]
  }
  error?: string
}

/**
 * 실행 기록을 조회하는 훅
 * @param changeId 변경 ID
 */
export function useExecutionHistory(changeId: string | null) {
  return useQuery<ExecutionLog[]>({
    queryKey: ['executionHistory', changeId],
    queryFn: async () => {
      if (!changeId) return []

      const response = await fetch(`/api/claude/logs/${changeId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch execution history')
      }

      const data: ExecutionLogsResponse = await response.json()
      if (!data.success || !data.data?.logs) {
        return []
      }

      // 최신순 정렬
      return data.data.logs.sort((a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
    },
    enabled: !!changeId,
    staleTime: 30 * 1000, // 30초
  })
}
