/**
 * Swarm 실행 관리 훅
 * @module hooks/useSwarm
 *
 * claude-flow Swarm 멀티에이전트 실행을 관리하는 훅
 * (useClaudeFlowExecution에서 리네임)
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
import type { AIProvider, ConsensusConfig, ConsensusResult } from '@/types/ai'

// =============================================
// Swarm 전용 타입
// =============================================

/** Swarm 전략 */
export type SwarmStrategy = ClaudeFlowStrategy

/** Swarm 실행 모드 */
export type SwarmMode = ClaudeFlowExecutionMode

/** Swarm 에이전트 상태 */
export interface SwarmAgent {
  name: string
  type: 'researcher' | 'coder' | 'tester' | 'reviewer' | 'coordinator'
  status: 'idle' | 'working' | 'done'
  currentTask?: string
}

/** Swarm 실행 상태 */
export interface SwarmExecution {
  id: string | null
  strategy: SwarmStrategy | null
  maxAgents: number
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  agents: SwarmAgent[]
  progress: number
  currentTask?: string
  logs: ClaudeFlowLogEntry[]
  error: string | null
  /** AI Provider (v2) */
  provider?: AIProvider
  /** 모델 (v2) */
  model?: string
  /** Consensus 결과 (v2) */
  consensusResult?: ConsensusResult
}

/** Swarm 실행 요청 파라미터 */
export interface SwarmExecuteParams {
  projectPath: string
  changeId: string
  taskId?: string
  mode?: SwarmMode
  strategy?: SwarmStrategy
  maxAgents?: number
  /** AI Provider (v2 - 다중 Provider 지원) */
  provider?: AIProvider
  /** 모델 (v2 - 다중 Provider 지원) */
  model?: string
  /** Consensus 설정 (v2 - 다중 AI 합의) */
  consensus?: ConsensusConfig
}

// =============================================
// 훅 구현
// =============================================

const API_BASE = '/api/claude-flow'

interface UseSwarmOptions {
  /** 자동으로 SSE 연결 */
  autoConnect?: boolean
  /** 완료 시 tasks 쿼리 무효화 */
  invalidateOnComplete?: boolean
}

interface UseSwarmReturn {
  /** 현재 실행 상태 */
  execution: SwarmExecution
  /** 로그 목록 (execution.logs와 동일, 편의성) */
  logs: ClaudeFlowLogEntry[]
  /** 실행 중 여부 */
  isRunning: boolean
  /** 에러 */
  error: string | null
  /** 실행 시작 */
  execute: (params: SwarmExecuteParams) => Promise<string | null>
  /** 실행 중지 */
  stop: () => Promise<boolean>
  /** 상태 새로고침 */
  refresh: () => Promise<void>
  /** 히스토리 조회 */
  fetchHistory: (changeId?: string) => Promise<ClaudeFlowHistoryItem[]>
  /** 로그 초기화 */
  clearLogs: () => void
  /** 상태 초기화 */
  reset: () => void
}

/**
 * Swarm 실행을 관리하는 훅
 *
 * @example
 * const { execution, execute, stop } = useSwarm()
 *
 * // 실행 시작
 * await execute({
 *   projectPath: '/path/to/project',
 *   changeId: 'add-feature',
 *   strategy: 'development',
 *   maxAgents: 5
 * })
 */
export function useSwarm(options: UseSwarmOptions = {}): UseSwarmReturn {
  const { autoConnect = true, invalidateOnComplete = true } = options

  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const executionIdRef = useRef<string | null>(null)

  const [execution, setExecution] = useState<SwarmExecution>({
    id: null,
    strategy: null,
    maxAgents: 5,
    status: 'idle',
    agents: [],
    progress: 0,
    logs: [],
    error: null,
    provider: undefined,
    model: undefined,
    consensusResult: undefined,
  })

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
      setExecution(prev => ({
        ...prev,
        logs: [...prev.logs, log]
      }))
    })

    eventSource.addEventListener('progress', (event) => {
      const { progress } = JSON.parse(event.data)
      setExecution(prev => ({ ...prev, progress }))
    })

    eventSource.addEventListener('consensus', (event) => {
      const consensusResult: ConsensusResult = JSON.parse(event.data)
      setExecution(prev => ({ ...prev, consensusResult }))
    })

    eventSource.addEventListener('status', (event) => {
      const newStatus: ClaudeFlowExecutionStatus = JSON.parse(event.data)
      setExecution(prev => ({
        ...prev,
        status: newStatus.status as SwarmExecution['status'],
        progress: newStatus.progress,
        currentTask: newStatus.currentTask,
        logs: newStatus.logs,
      }))

      if (['completed', 'failed', 'stopped'].includes(newStatus.status)) {
        setIsRunning(false)
      }
    })

    eventSource.addEventListener('complete', (event) => {
      const finalStatus: ClaudeFlowExecutionStatus = JSON.parse(event.data)
      setExecution(prev => ({
        ...prev,
        status: finalStatus.status as SwarmExecution['status'],
        progress: finalStatus.progress,
        logs: finalStatus.logs,
      }))
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
  const execute = useCallback(async (params: SwarmExecuteParams): Promise<string | null> => {
    setError(null)
    setExecution(prev => ({
      ...prev,
      id: null,
      strategy: params.strategy || 'development',
      maxAgents: params.maxAgents || 5,
      status: 'running',
      progress: 0,
      logs: [],
      error: null,
      provider: params.provider,
      model: params.model,
    }))

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: params.projectPath,
          changeId: params.changeId,
          taskId: params.taskId,
          mode: params.mode ?? 'full',
          strategy: params.strategy ?? 'development',
          maxAgents: params.maxAgents ?? 5,
          provider: params.provider,
          model: params.model,
          consensus: params.consensus,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Execution failed')
      }

      const data: ClaudeFlowExecuteResponse = await response.json()
      executionIdRef.current = data.executionId
      setExecution(prev => ({ ...prev, id: data.executionId }))
      setIsRunning(true)

      // SSE 연결
      if (autoConnect) {
        connectSSE(data.executionId)
      }

      return data.executionId
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setExecution(prev => ({ ...prev, status: 'failed', error: message }))
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
      setExecution(prev => ({ ...prev, status: 'stopped' }))
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
      setExecution(prev => ({
        ...prev,
        status: data.execution.status as SwarmExecution['status'],
        progress: data.execution.progress,
        currentTask: data.execution.currentTask,
        logs: data.execution.logs,
      }))
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
    setExecution(prev => ({ ...prev, logs: [] }))
  }, [])

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    executionIdRef.current = null
    setExecution({
      id: null,
      strategy: null,
      maxAgents: 5,
      status: 'idle',
      agents: [],
      progress: 0,
      logs: [],
      error: null,
      provider: undefined,
      model: undefined,
      consensusResult: undefined,
    })
    setIsRunning(false)
    setError(null)
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
    execution,
    logs: execution.logs,
    isRunning,
    error,
    execute,
    stop,
    refresh,
    fetchHistory,
    clearLogs,
    reset,
  }
}

// =============================================
// 하위 호환 (useClaudeFlowExecution)
// =============================================

/**
 * useClaudeFlowExecution 하위 호환 래퍼
 * @deprecated useSwarm 사용 권장
 */
export function useClaudeFlowExecution(options?: UseSwarmOptions) {
  const swarm = useSwarm(options)

  // useClaudeFlowExecution의 기존 인터페이스와 호환되는 객체 반환
  return {
    status: swarm.execution.status === 'idle' ? null : {
      id: swarm.execution.id || '',
      request: {
        projectPath: '',
        changeId: '',
        mode: 'full' as const,
      },
      status: swarm.execution.status,
      startedAt: new Date().toISOString(),
      progress: swarm.execution.progress,
      currentTask: swarm.execution.currentTask,
      logs: swarm.execution.logs,
    },
    logs: swarm.logs,
    isRunning: swarm.isRunning,
    error: swarm.error,
    execute: async (params: {
      projectPath: string
      changeId: string
      taskId?: string
      mode?: ClaudeFlowExecutionMode
      strategy?: ClaudeFlowStrategy
      maxAgents?: number
    }) => swarm.execute(params),
    stop: swarm.stop,
    refresh: swarm.refresh,
    fetchHistory: swarm.fetchHistory,
    clearLogs: swarm.clearLogs,
  }
}
