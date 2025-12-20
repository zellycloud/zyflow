/**
 * Claude Code 실행 훅 (하위 호환 래퍼)
 * @module hooks/useClaude
 *
 * 기존 useClaude 인터페이스를 유지하면서 내부적으로 useAI를 사용
 * 새로운 코드에서는 useAI 직접 사용 권장
 */

import { useCallback } from 'react'
import { useAI } from './useAI'
import type { AIMessage } from '@/types/ai'

// =============================================
// 하위 호환 타입 (기존 인터페이스 유지)
// =============================================

/**
 * Claude 모델 타입 (하위 호환)
 * @deprecated useAI와 함께 AIProvider 타입 사용 권장
 */
export type ClaudeModel = 'haiku' | 'sonnet' | 'opus'

/**
 * Claude 메시지 타입 (하위 호환)
 * @deprecated useAI와 함께 AIMessage 타입 사용 권장
 */
export interface ClaudeMessage {
  type: 'start' | 'output' | 'text' | 'stderr' | 'complete' | 'error'
  runId?: string
  taskId?: string
  changeId?: string
  data?: {
    type?: string
    message?: { content?: string }
    name?: string
    input?: Record<string, unknown>
    content?: string
  }
  content?: string
  status?: 'completed' | 'error'
  exitCode?: number
  message?: string
}

/**
 * Claude 실행 상태 (하위 호환)
 * @deprecated useAI와 함께 AIExecution 타입 사용 권장
 */
export interface ClaudeExecution {
  runId: string | null
  status: 'idle' | 'running' | 'completed' | 'error'
  messages: ClaudeMessage[]
  error: string | null
}

// =============================================
// 훅 구현
// =============================================

/**
 * Claude Code 실행 훅 (하위 호환 래퍼)
 *
 * 기존 코드와의 호환성을 위해 유지됩니다.
 * 새로운 코드에서는 useAI 훅을 직접 사용하세요.
 *
 * @example
 * // 기존 사용법 (계속 동작)
 * const { execution, execute, stop, reset } = useClaude()
 * execute({ changeId, taskId, taskTitle, model: 'sonnet' })
 *
 * // 권장 사용법 (새 코드)
 * const { execution, execute, stop, reset } = useAI()
 * execute({ provider: 'claude', model: 'sonnet', changeId, taskId, taskTitle })
 */
export function useClaude() {
  const ai = useAI()

  /**
   * Claude 실행 (하위 호환)
   */
  const execute = useCallback(
    async (params: {
      changeId: string
      taskId: string
      taskTitle: string
      context?: string
      model?: ClaudeModel
    }) => {
      return ai.execute({
        provider: 'claude',
        model: params.model || 'sonnet',
        changeId: params.changeId,
        taskId: params.taskId,
        taskTitle: params.taskTitle,
        context: params.context,
      })
    },
    [ai]
  )

  // AIMessage를 ClaudeMessage로 변환
  const convertMessages = (messages: AIMessage[]): ClaudeMessage[] => {
    return messages.map((msg) => ({
      type: msg.type as ClaudeMessage['type'],
      runId: msg.runId,
      taskId: msg.taskId,
      changeId: msg.changeId,
      data: msg.data,
      content: msg.content,
      status: msg.status,
      exitCode: msg.exitCode,
      message: msg.message,
    }))
  }

  // 하위 호환 실행 상태 반환
  const execution: ClaudeExecution = {
    runId: ai.execution.runId,
    status: ai.execution.status,
    messages: convertMessages(ai.execution.messages),
    error: ai.execution.error,
  }

  return {
    execution,
    execute,
    stop: ai.stop,
    reset: ai.reset,
  }
}
