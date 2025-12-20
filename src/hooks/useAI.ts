/**
 * AI Provider 실행 훅
 * @module hooks/useAI
 *
 * 단일 AI Provider 실행을 관리하는 훅
 * - Provider 선택 (Claude, Gemini, Codex 등)
 * - 모델 선택
 * - SSE 스트리밍 처리
 */

import { useState, useCallback, useRef } from 'react'
import type {
  AIProvider,
  AIExecution,
  AIMessage,
  AIExecuteParams,
  AIProviderConfig,
  AIProvidersResponse,
} from '@/types/ai'

// Re-export types for convenience
export type { AIProvider, AIExecution, AIMessage, AIExecuteParams, AIProviderConfig }

const API_BASE = '/api/ai'

interface UseAIReturn {
  /** 현재 실행 상태 */
  execution: AIExecution
  /** 실행 시작 */
  execute: (params: AIExecuteParams) => Promise<void>
  /** 실행 중지 */
  stop: () => Promise<void>
  /** 상태 초기화 */
  reset: () => void
}

/**
 * AI Provider 실행을 관리하는 훅
 */
export function useAI(): UseAIReturn {
  const [execution, setExecution] = useState<AIExecution>({
    runId: null,
    provider: null,
    model: null,
    status: 'idle',
    messages: [],
    error: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * AI 실행 시작
   */
  const execute = useCallback(async (params: AIExecuteParams) => {
    // Abort any existing execution
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    setExecution({
      runId: null,
      provider: params.provider,
      model: params.model || null,
      status: 'running',
      messages: [],
      error: null,
    })

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as AIMessage

              setExecution((prev) => ({
                ...prev,
                runId: data.runId || prev.runId,
                provider: data.provider || prev.provider,
                model: data.model || prev.model,
                messages: [...prev.messages, data],
                status:
                  data.type === 'complete'
                    ? data.status === 'completed'
                      ? 'completed'
                      : 'error'
                    : data.type === 'error'
                      ? 'error'
                      : 'running',
                error: data.type === 'error' ? data.message || 'Unknown error' : prev.error,
              }))
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setExecution((prev) => ({
          ...prev,
          status: 'idle',
          error: 'Cancelled',
        }))
      } else {
        setExecution((prev) => ({
          ...prev,
          status: 'error',
          error: (error as Error).message,
        }))
      }
    }
  }, [])

  /**
   * 실행 중지
   */
  const stop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (execution.runId) {
      try {
        await fetch(`${API_BASE}/stop/${execution.runId}`, {
          method: 'POST',
        })
      } catch {
        // Ignore errors
      }
    }

    setExecution((prev) => ({
      ...prev,
      status: 'idle',
    }))
  }, [execution.runId])

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    setExecution({
      runId: null,
      provider: null,
      model: null,
      status: 'idle',
      messages: [],
      error: null,
    })
  }, [])

  return {
    execution,
    execute,
    stop,
    reset,
  }
}

/**
 * Provider 목록을 가져오는 유틸리티 함수
 */
export async function fetchAIProviders(): Promise<AIProviderConfig[]> {
  try {
    const response = await fetch(`${API_BASE}/providers`)
    if (!response.ok) {
      throw new Error('Failed to fetch providers')
    }
    const data: AIProvidersResponse = await response.json()
    return data.providers
  } catch (error) {
    console.error('Error fetching AI providers:', error)
    return []
  }
}
