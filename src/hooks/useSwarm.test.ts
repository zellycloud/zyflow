/**
 * useSwarm Hook Tests
 *
 * Tests for the Swarm multi-agent execution hook
 * - execute, stop, reset functionality
 * - Agent state updates
 * - Progress calculation
 * - SSE streaming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSwarm, useClaudeFlowExecution } from './useSwarm'
import type { ClaudeFlowLogEntry } from '@/types'
import React from 'react'

// Mock fetch
global.fetch = vi.fn()

// Mock EventSource
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {}
  close = vi.fn()
  url: string

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, callback: (event: MessageEvent) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }
    this.listeners[type].push(callback)
  }

  // Helper to simulate events
  simulateEvent(type: string, data: object) {
    const listeners = this.listeners[type] || []
    listeners.forEach((callback) => {
      callback({ data: JSON.stringify(data) } as MessageEvent)
    })
  }

  simulateError() {
    if (this.onerror) {
      this.onerror()
    }
  }
}

let mockEventSource: MockEventSource | null = null
vi.stubGlobal(
  'EventSource',
  class {
    constructor(url: string) {
      mockEventSource = new MockEventSource(url)
      return mockEventSource
    }
  }
)

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

describe('useSwarm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventSource = null
  })

  afterEach(() => {
    if (mockEventSource) {
      mockEventSource.close()
    }
  })

  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    expect(result.current.execution).toEqual({
      id: null,
      strategy: null,
      maxAgents: 5,
      status: 'idle',
      agents: [],
      progress: 0,
      logs: [],
      error: null,
    })
    expect(result.current.isRunning).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should execute successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    let executionId: string | null = null
    await act(async () => {
      executionId = await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
        strategy: 'development',
        maxAgents: 5,
      })
    })

    expect(executionId).toBe('exec-123')
    expect(result.current.execution.id).toBe('exec-123')
    expect(result.current.execution.strategy).toBe('development')
    expect(result.current.execution.maxAgents).toBe(5)
    expect(result.current.isRunning).toBe(true)
  })

  it('should handle execution error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Execution failed' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    let executionId: string | null = null
    await act(async () => {
      executionId = await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    expect(executionId).toBeNull()
    expect(result.current.execution.status).toBe('failed')
    expect(result.current.error).toBe('Execution failed')
  })

  it('should handle SSE log events', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    // Simulate SSE log event
    const logEntry: ClaudeFlowLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'info',
      content: 'Task started',
    }

    await act(async () => {
      mockEventSource?.simulateEvent('log', logEntry)
    })

    expect(result.current.execution.logs).toHaveLength(1)
    expect(result.current.execution.logs[0].content).toBe('Task started')
  })

  it('should handle SSE progress events', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    // Simulate SSE progress event
    await act(async () => {
      mockEventSource?.simulateEvent('progress', { progress: 50 })
    })

    expect(result.current.execution.progress).toBe(50)
  })

  it('should handle SSE complete events', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    expect(result.current.isRunning).toBe(true)

    // Simulate SSE complete event
    await act(async () => {
      mockEventSource?.simulateEvent('complete', {
        status: 'completed',
        progress: 100,
        logs: [],
      })
    })

    expect(result.current.execution.status).toBe('completed')
    expect(result.current.execution.progress).toBe(100)
    expect(result.current.isRunning).toBe(false)
  })

  it('should stop execution', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ executionId: 'exec-123', message: 'Started' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    expect(result.current.isRunning).toBe(true)

    let stopped: boolean = false
    await act(async () => {
      stopped = await result.current.stop()
    })

    expect(stopped).toBe(true)
    expect(result.current.execution.status).toBe('stopped')
    expect(result.current.isRunning).toBe(false)
  })

  it('should reset state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    // Reset
    act(() => {
      result.current.reset()
    })

    expect(result.current.execution).toEqual({
      id: null,
      strategy: null,
      maxAgents: 5,
      status: 'idle',
      agents: [],
      progress: 0,
      logs: [],
      error: null,
    })
    expect(result.current.isRunning).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should clear logs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    // Add a log
    await act(async () => {
      mockEventSource?.simulateEvent('log', {
        timestamp: new Date().toISOString(),
        type: 'info',
        content: 'Test log',
      })
    })

    expect(result.current.execution.logs).toHaveLength(1)

    // Clear logs
    act(() => {
      result.current.clearLogs()
    })

    expect(result.current.execution.logs).toHaveLength(0)
  })

  it('should fetch history', async () => {
    const mockHistory = [
      {
        id: 'exec-1',
        changeId: 'change-1',
        mode: 'full',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'exec-2',
        changeId: 'change-1',
        mode: 'single',
        status: 'failed',
        startedAt: '2024-01-02T00:00:00Z',
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: mockHistory }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    let history: unknown[] = []
    await act(async () => {
      history = await result.current.fetchHistory('change-1')
    })

    expect(history).toHaveLength(2)
    expect((history[0] as { id: string }).id).toBe('exec-1')
  })

  it('should refresh status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ executionId: 'exec-123', message: 'Started' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          execution: {
            id: 'exec-123',
            status: 'running',
            progress: 75,
            currentTask: 'Testing',
            logs: [{ timestamp: '2024-01-01T00:00:00Z', type: 'info', content: 'Progress' }],
          },
        }),
      } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.execution.progress).toBe(75)
    expect(result.current.execution.currentTask).toBe('Testing')
  })

  it('should handle SSE connection error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useSwarm(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
      })
    })

    // Simulate SSE error
    await act(async () => {
      mockEventSource?.simulateError()
    })

    expect(result.current.error).toBe('SSE 연결 오류')
  })
})

describe('useClaudeFlowExecution (backwards compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventSource = null
  })

  afterEach(() => {
    if (mockEventSource) {
      mockEventSource.close()
    }
  })

  it('should maintain backwards compatible interface', () => {
    const { result } = renderHook(() => useClaudeFlowExecution(), {
      wrapper: createWrapper(),
    })

    // Check that all expected properties exist
    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('logs')
    expect(result.current).toHaveProperty('isRunning')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('execute')
    expect(result.current).toHaveProperty('stop')
    expect(result.current).toHaveProperty('refresh')
    expect(result.current).toHaveProperty('fetchHistory')
    expect(result.current).toHaveProperty('clearLogs')
  })

  it('should return null status when idle', () => {
    const { result } = renderHook(() => useClaudeFlowExecution(), {
      wrapper: createWrapper(),
    })

    expect(result.current.status).toBeNull()
    expect(result.current.isRunning).toBe(false)
  })

  it('should return status object when running', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'exec-123', message: 'Started' }),
    } as Response)

    const { result } = renderHook(() => useClaudeFlowExecution(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.execute({
        projectPath: '/test/project',
        changeId: 'change-1',
        mode: 'full',
      })
    })

    expect(result.current.status).not.toBeNull()
    expect(result.current.status?.id).toBe('exec-123')
    expect(result.current.status?.status).toBe('running')
    expect(result.current.isRunning).toBe(true)
  })
})
