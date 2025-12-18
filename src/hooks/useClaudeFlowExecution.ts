/**
 * claude-flow 실행 관리 훅
 * @module hooks/useClaudeFlowExecution
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  ClaudeFlowExecutionMode,
  ClaudeFlowStrategy,
  ClaudeFlowExecutionStatus,
  ClaudeFlowLogEntry,
  ClaudeFlowHistoryItem,
  ClaudeFlowExecuteResponse,
  ClaudeFlowStatusResponse,
  ClaudeFlowHistoryResponse,
} from '@/types'

const API_BASE = '/api/claude-flow'

interface UseClaudeFlowExecutionOptions {
  /** 자동으로 SSE 연결 */
  autoConnect?: boolean
  /** 완료 시 tasks 쿼리 무효화 */
  invalidateOnComplete?: boolean
}

interface UseClaudeFlowExecutionReturn {
  /** 현재 실행 상태 */
  status: ClaudeFlowExecutionStatus | null
  /** 로그 목록 */
  logs: ClaudeFlowLogEntry[]
  /** 실행 중 여부 */
  isRunning: boolean
  /** 에러 */
  error: string | null
  /** 실행 시작 */
  execute: (params: {
    projectPath: string
    changeId: string
    taskId?: string
    mode?: ClaudeFlowExecutionMode
    strategy?: ClaudeFlowStrategy
    maxAgents?: number
  }) => Promise<string | null>
  /** 실행 중지 */
  stop: () => Promise<boolean>
  /** 상태 새로고침 */
  refresh: () => Promise<void>
  /** 히스토리 조회 */
  fetchHistory: (changeId?: string) => Promise<ClaudeFlowHistoryItem[]>
  /** 로그 초기화 */
  clearLogs: () => void
}

/**
 * claude-flow 실행을 관리하는 훅
 */
export function useClaudeFlowExecution(
  options: UseClaudeFlowExecutionOptions = {}
): UseClaudeFlowExecutionReturn {
  const { autoConnect = true, invalidateOnComplete = true } = options

  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const executionIdRef = useRef<string | null>(null)

  const [status, setStatus] = useState<ClaudeFlowExecutionStatus | null>(null)
  const [logs, setLogs] = useState<ClaudeFlowLogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * SSE 연결 시작
   */
  const connectSSE = useCallback((executionId: string) => {
    // 기존 연결 정리
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource(`${API_BASE}/stream/${executionId}`)
    eventSourceRef.current = eventSource

    eventSource.addEventListener('log', (event) => {
      const log: ClaudeFlowLogEntry = JSON.parse(event.data)
      setLogs(prev => [...prev, log])
    })

    eventSource.addEventListener('progress', (event) => {
      const { progress } = JSON.parse(event.data)
      setStatus(prev => prev ? { ...prev, progress } : null)
    })

    eventSource.addEventListener('status', (event) => {
      const newStatus: ClaudeFlowExecutionStatus = JSON.parse(event.data)
      setStatus(newStatus)

      if (['completed', 'failed', 'stopped'].includes(newStatus.status)) {
        setIsRunning(false)
      }
    })

    eventSource.addEventListener('complete', (event) => {
      const finalStatus: ClaudeFlowExecutionStatus = JSON.parse(event.data)
      setStatus(finalStatus)
      setIsRunning(false)

      // SSE 연결 종료
      eventSource.close()
      eventSourceRef.current = null

      // 쿼리 무효화
      if (invalidateOnComplete) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        queryClient.invalidateQueries({ queryKey: ['change'] })
      }
    })

    eventSource.onerror = () => {
      setError('SSE 연결 오류')
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [invalidateOnComplete, queryClient])

  /**
   * 실행 시작
   */
  const execute = useCallback(async (params: {
    projectPath: string
    changeId: string
    taskId?: string
    mode?: ClaudeFlowExecutionMode
    strategy?: ClaudeFlowStrategy
    maxAgents?: number
  }): Promise<string | null> => {
    setError(null)
    setLogs([])

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          mode: params.mode ?? 'full',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Execution failed')
      }

      const data: ClaudeFlowExecuteResponse = await response.json()
      executionIdRef.current = data.executionId
      setIsRunning(true)

      // SSE 연결
      if (autoConnect) {
        connectSSE(data.executionId)
      }

      return data.executionId
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    }
  }, [autoConnect, connectSSE])

  /**
   * 실행 중지
   */
  const stop = useCallback(async (): Promise<boolean> => {
    if (!executionIdRef.current) return false

    try {
      const response = await fetch(`${API_BASE}/stop/${executionIdRef.current}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Stop failed')
      }

      setIsRunning(false)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return false
    }
  }, [])

  /**
   * 상태 새로고침
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!executionIdRef.current) return

    try {
      const response = await fetch(`${API_BASE}/status/${executionIdRef.current}`)

      if (!response.ok) {
        throw new Error('Status fetch failed')
      }

      const data: ClaudeFlowStatusResponse = await response.json()
      setStatus(data.execution)
      setLogs(data.execution.logs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [])

  /**
   * 히스토리 조회
   */
  const fetchHistory = useCallback(async (
    changeId?: string
  ): Promise<ClaudeFlowHistoryItem[]> => {
    try {
      const url = new URL(`${API_BASE}/history`, window.location.origin)
      if (changeId) {
        url.searchParams.set('changeId', changeId)
      }

      const response = await fetch(url.toString())

      if (!response.ok) {
        throw new Error('History fetch failed')
      }

      const data: ClaudeFlowHistoryResponse = await response.json()
      return data.history
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return []
    }
  }, [])

  /**
   * 로그 초기화
   */
  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  /**
   * 컴포넌트 언마운트 시 정리
   */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  return {
    status,
    logs,
    isRunning,
    error,
    execute,
    stop,
    refresh,
    fetchHistory,
    clearLogs,
  }
}
