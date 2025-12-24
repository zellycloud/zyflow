/**
 * Agent Session Hook
 *
 * Manages agent session state and SSE streaming
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/config/api'

export interface AgentMessage {
  role: 'user' | 'agent' | 'system' | 'error'
  content: string
  timestamp?: string
  taskId?: string
  cli?: {
    id: string
    name: string
    icon?: string
  }
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
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const API_BASE = API_ENDPOINTS.agents

export interface CLIProfile {
  id: string
  name: string
  icon?: string
}

export function useAgentSession(initialSessionId?: string) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCLI, setActiveCLI] = useState<CLIProfile | undefined>()
  const eventSourceRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()

  // Sync sessionId when initialSessionId changes (e.g., loading from history)
  useEffect(() => {
    if (initialSessionId !== sessionId) {
      setSessionId(initialSessionId)
      // Clear messages when switching sessions - will be repopulated from conversation_history
      setMessages([])
      setError(null)
      setIsStreaming(false)
    }
  }, [initialSessionId])

  // Fetch session status
  const { data: sessionState } = useQuery({
    queryKey: ['agent-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`)
      if (res.status === 404) {
        setSessionId(undefined)
        return null
      }
      if (!res.ok) throw new Error('Failed to fetch session')
      return res.json() as Promise<AgentSessionState>
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      // Stop refetching if we got a 404 or error
      if (!query.state.data && query.state.error) return false
      // Poll less frequently - SSE handles real-time updates
      return isStreaming ? 5000 : false
    },
    staleTime: 2000, // Consider data fresh for 2 seconds
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
                cli: activeCLI,
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

  // Sync messages from conversation history when session is loaded
  useEffect(() => {
    if (sessionState?.conversation_history && sessionState.conversation_history.length > 0) {
      const historyMessages: AgentMessage[] = sessionState.conversation_history.map((item: { role: string; content: string; cli?: CLIProfile }) => ({
        role: item.role === 'assistant' ? 'agent' : 'user',
        content: item.content,
        cli: item.cli,
      }))

      // Restore from history if:
      // 1. Messages are empty (just switched sessions)
      // 2. OR messages length is less than history (session was resumed elsewhere)
      // But NOT if we're actively streaming (to avoid overwriting live messages)
      if (!isStreaming && (messages.length === 0 || messages.length < historyMessages.length)) {
        setMessages(historyMessages)
      }
    }
  }, [sessionState?.conversation_history, isStreaming])

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
          use_cli: true, 
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
    // Optimistic UI update
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      },
    ])

    if (sessionId) {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: content }),
        })
        if (!res.ok) {
           const err = await res.json()
           setError(err.error || 'Failed to send input')
        } else {
          // Reconnect to stream after sending input (for multi-turn conversations)
          // The backend starts a new process with --continue, so we need to listen for its output
          connectStream(sessionId)
        }
      } catch (e: any) {
        setError(e.message)
      }
    }
  }, [sessionId, connectStream])

  // Start session helper
  const startSession = useCallback(
    async (changeId: string, projectPath?: string, initialPrompt?: string, cli?: CLIProfile) => {
      if (cli) {
        setActiveCLI(cli)
      }
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

  // Set active CLI (for when CLI selection changes)
  const setCLI = useCallback((cli: CLIProfile) => {
    setActiveCLI(cli)
  }, [])

  return {
    sessionId,
    messages,
    status: sessionState?.status,
    currentTask: sessionState?.current_task,
    completedTasks: sessionState?.completed_tasks ?? 0,
    totalTasks: sessionState?.total_tasks ?? 0,
    isStreaming,
    error,
    activeCLI,
    startSession,
    setCLI,
    stopSession: stopSessionMutation.mutateAsync,
    resumeSession: resumeSessionMutation.mutateAsync,
    sendMessage,
    isStarting: startSessionMutation.isPending,
    isStopping: stopSessionMutation.isPending,
  }
}

// Hook to list all sessions (from CLI adapter)
export function useAgentSessions() {
  return useQuery({
    queryKey: ['agent-sessions'],
    queryFn: async () => {
      const res = await fetch(API_ENDPOINTS.cliSessions)
      if (!res.ok) throw new Error('Failed to fetch sessions')
      const data = await res.json()
      // Map CLI session format to AgentSessionState format
      const sessions: AgentSessionState[] = (data.sessions || []).map((s: any) => ({
        session_id: s.id,
        change_id: s.changeId,
        status: s.status,
        created_at: s.startedAt,
        updated_at: s.endedAt || s.startedAt,
        project_path: s.projectPath,
        current_task: null,
        completed_tasks: 0,
        total_tasks: 0,
        error: s.error || null,
        conversation_history: s.conversationHistory,
      }))
      return sessions
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
