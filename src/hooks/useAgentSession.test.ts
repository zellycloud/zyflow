/**
 * useAgentSession Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAgentSession, useAgentSessions, useAgentLogs } from './useAgentSession'
import React from 'react'

// Mock fetch
global.fetch = vi.fn()

// Mock EventSource
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(public url: string) {}

  // Helper to simulate messages
  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent)
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror()
    }
  }
}

let mockEventSource: MockEventSource | null = null
vi.stubGlobal('EventSource', class {
  constructor(url: string) {
    mockEventSource = new MockEventSource(url)
    return mockEventSource
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useAgentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventSource = null
  })

  afterEach(() => {
    if (mockEventSource) {
      mockEventSource.close()
    }
  })

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useAgentSession(), {
      wrapper: createWrapper(),
    })

    expect(result.current.sessionId).toBeUndefined()
    expect(result.current.messages).toEqual([])
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should start a session successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: 'test-session-123' }),
    } as Response)

    const { result } = renderHook(() => useAgentSession(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.startSession('test-change', '/test/path', 'Hello')
    })

    expect(result.current.sessionId).toBe('test-session-123')
    expect(result.current.messages.length).toBe(1)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[0].content).toBe('Hello')
  })

  it('should handle session start error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Server error' }),
    } as Response)

    const { result } = renderHook(() => useAgentSession(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      try {
        await result.current.startSession('test-change')
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.error).toBe('Server error')
  })

  it('should add user messages via sendMessage', async () => {
    const { result } = renderHook(() => useAgentSession(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.sendMessage('Test message')
    })

    expect(result.current.messages.length).toBe(1)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[0].content).toBe('Test message')
  })

  it('should stop session successfully', async () => {
    // Mock all fetch calls in order:
    // 1. startSession -> POST /execute
    // 2. useQuery for session state -> GET /sessions/:id (background query)
    // 3. stopSession -> POST /sessions/:id/stop
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'test-session-123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session_id: 'test-session-123',
          status: 'running',
          completed_tasks: 0,
          total_tasks: 5
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Stopped' }),
      } as Response)

    const { result } = renderHook(() => useAgentSession(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.startSession('test-change')
    })

    // Verify session started
    expect(result.current.sessionId).toBe('test-session-123')

    // Wait a bit for the query to settle
    await waitFor(() => {
      expect(result.current.sessionId).toBe('test-session-123')
    })

    await act(async () => {
      await result.current.stopSession()
    })

    expect(result.current.isStreaming).toBe(false)
  })
})

describe('useAgentSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch sessions list', async () => {
    const mockSessions = [
      {
        session_id: 'session-1',
        change_id: 'change-1',
        status: 'running',
        completed_tasks: 2,
        total_tasks: 5,
      },
      {
        session_id: 'session-2',
        change_id: 'change-2',
        status: 'completed',
        completed_tasks: 3,
        total_tasks: 3,
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessions,
    } as Response)

    const { result } = renderHook(() => useAgentSessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].session_id).toBe('session-1')
  })

  it('should handle fetch error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAgentSessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

describe('useAgentLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not fetch when sessionId is undefined', () => {
    const { result } = renderHook(() => useAgentLogs(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.data).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('should fetch logs for a session', async () => {
    const mockLogs = {
      session_id: 'session-1',
      results: [
        { task_id: 'task-1', task_title: 'Task 1', status: 'completed' },
        { task_id: 'task-2', task_title: 'Task 2', status: 'running' },
      ],
      completed_tasks: 1,
      total_tasks: 2,
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockLogs,
    } as Response)

    const { result } = renderHook(() => useAgentLogs('session-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data?.results).toHaveLength(2)
    expect(result.current.data?.completed_tasks).toBe(1)
  })
})
