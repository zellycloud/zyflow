/**
 * Agent Session Hook
 *
 * Manages agent session state and SSE streaming
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface AgentMessage {
  role: 'user' | 'agent' | 'system' | 'error'
  content: string
  timestamp?: string
  taskId?: string
}

export interface AgentSessionState {
  session_id: string
  change_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped'
  created_at: string
  updated_at: string
  project_path: string
  current_task: string | null
  completed_tasks: number
  total_tasks: number
  error: string | null
}

const API_BASE = 'http://localhost:3001/api/agents'

export function useAgentSession(initialSessionId?: string) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()

  // Fetch session status
  const { data: sessionState } = useQuery({
    queryKey: ['agent-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch session')
      return res.json() as Promise<AgentSessionState>
    },
    enabled: !!sessionId,
    refetchInterval: isStreaming ? 2000 : false,
  })

  // Connect to SSE stream
  const connectStream = useCallback((sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource(`${API_BASE}/sessions/${sid}/stream`)
    eventSourceRef.current = eventSource
    setIsStreaming(true)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        switch (data.type) {
          case 'task_start':
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: `Starting task: ${data.task_title || data.task_id}`,
                timestamp: data.timestamp,
                taskId: data.task_id,
              },
            ])
            break

          case 'task_complete':
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: `Completed task: ${data.task_title || data.task_id}`,
                timestamp: data.timestamp,
                taskId: data.task_id,
              },
            ])
            break

          case 'agent_response':
          case 'llm_response':
            setMessages((prev) => [
              ...prev,
              {
                role: 'agent',
                content: data.content || data.output,
                timestamp: data.timestamp,
              },
            ])
            break

          case 'error':
            setMessages((prev) => [
              ...prev,
              {
                role: 'error',
                content: data.error || data.message,
                timestamp: data.timestamp,
              },
            ])
            break

          case 'session_complete':
            setIsStreaming(false)
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: 'Session completed successfully',
                timestamp: data.timestamp,
              },
            ])
            queryClient.invalidateQueries({ queryKey: ['agent-session', sid] })
            break

          case 'session_stopped':
            setIsStreaming(false)
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: 'Session stopped',
                timestamp: data.timestamp,
              },
            ])
            break

          default:
            // Log unknown events for debugging
            console.log('Unknown SSE event:', data)
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e)
      }
    }

    eventSource.onerror = () => {
      setIsStreaming(false)
      eventSource.close()
    }

    return eventSource
  }, [queryClient])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Start new session
  const startSessionMutation = useMutation({
    mutationFn: async ({
      changeId,
      projectPath,
      initialPrompt,
    }: {
      changeId: string
      projectPath?: string
      initialPrompt?: string
    }) => {
      const res = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change_id: changeId,
          project_path: projectPath,
          initial_prompt: initialPrompt,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to start session')
      }

      return res.json()
    },
    onSuccess: (data) => {
      const sid = data.session_id
      setSessionId(sid)
      setError(null)
      connectStream(sid)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Stop session
  const stopSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No active session')

      const res = await fetch(`${API_BASE}/sessions/${sessionId}/stop`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to stop session')
      }

      return res.json()
    },
    onSuccess: () => {
      setIsStreaming(false)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      queryClient.invalidateQueries({ queryKey: ['agent-session', sessionId] })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Resume session
  const resumeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session to resume')

      const res = await fetch(`${API_BASE}/sessions/${sessionId}/resume`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to resume session')
      }

      return res.json()
    },
    onSuccess: () => {
      if (sessionId) {
        connectStream(sessionId)
      }
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Send message (for user input during session)
  const sendMessage = useCallback(async (content: string) => {
    // Add user message to chat
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      },
    ])

    // If no session, this should start one
    // If session exists, this would send input to stdin (not yet implemented)
  }, [])

  // Start session helper
  const startSession = useCallback(
    async (changeId: string, projectPath?: string, initialPrompt?: string) => {
      if (initialPrompt) {
        setMessages([
          {
            role: 'user',
            content: initialPrompt,
            timestamp: new Date().toISOString(),
          },
        ])
      }
      await startSessionMutation.mutateAsync({ changeId, projectPath, initialPrompt })
    },
    [startSessionMutation]
  )

  return {
    sessionId,
    messages,
    status: sessionState?.status,
    currentTask: sessionState?.current_task,
    completedTasks: sessionState?.completed_tasks ?? 0,
    totalTasks: sessionState?.total_tasks ?? 0,
    isStreaming,
    error,
    startSession,
    stopSession: stopSessionMutation.mutateAsync,
    resumeSession: resumeSessionMutation.mutateAsync,
    sendMessage,
    isStarting: startSessionMutation.isPending,
    isStopping: stopSessionMutation.isPending,
  }
}

// Hook to list all sessions
export function useAgentSessions() {
  return useQuery({
    queryKey: ['agent-sessions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/sessions`)
      if (!res.ok) throw new Error('Failed to fetch sessions')
      return res.json() as Promise<AgentSessionState[]>
    },
  })
}

// Hook to get session logs
export function useAgentLogs(sessionId?: string) {
  return useQuery({
    queryKey: ['agent-logs', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/logs`)
      if (!res.ok) throw new Error('Failed to fetch logs')
      return res.json()
    },
    enabled: !!sessionId,
  })
}
