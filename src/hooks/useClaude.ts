import { useState, useCallback, useRef } from 'react'

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

export interface ClaudeExecution {
  runId: string | null
  status: 'idle' | 'running' | 'completed' | 'error'
  messages: ClaudeMessage[]
  error: string | null
}

export type ClaudeModel = 'haiku' | 'sonnet' | 'opus'

export function useClaude() {
  const [execution, setExecution] = useState<ClaudeExecution>({
    runId: null,
    status: 'idle',
    messages: [],
    error: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const execute = useCallback(
    async (params: {
      changeId: string
      taskId: string
      taskTitle: string
      context?: string
      model?: ClaudeModel
    }) => {
      // Abort any existing execution
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      setExecution({
        runId: null,
        status: 'running',
        messages: [],
        error: null,
      })

      try {
        const response = await fetch('/api/claude/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`)
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
                const data = JSON.parse(line.slice(6)) as ClaudeMessage

                setExecution((prev) => ({
                  ...prev,
                  runId: data.runId || prev.runId,
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
    },
    []
  )

  const stop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (execution.runId) {
      try {
        await fetch(`/api/claude/stop/${execution.runId}`, {
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

  const reset = useCallback(() => {
    setExecution({
      runId: null,
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
