/**
 * useAI Hook Tests
 *
 * Tests for the AI Provider execution hook
 * - execute, stop, reset functionality
 * - SSE streaming handling
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAI, fetchAIProviders } from './useAI'
import type { AIMessage, AIProviderConfig } from '@/types/ai'

// Mock fetch
global.fetch = vi.fn()

// Mock ReadableStream for SSE testing
function createMockSSEStream(messages: AIMessage[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0

  return new ReadableStream({
    pull(controller) {
      if (index < messages.length) {
        const message = messages[index]
        const data = `data: ${JSON.stringify(message)}\n\n`
        controller.enqueue(encoder.encode(data))
        index++
      } else {
        controller.close()
      }
    },
  })
}

describe('useAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useAI())

    expect(result.current.execution).toEqual({
      runId: null,
      provider: null,
      model: null,
      status: 'idle',
      messages: [],
      error: null,
    })
  })

  it('should execute successfully with SSE streaming', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123', provider: 'claude', model: 'sonnet' },
      { type: 'output', content: 'Hello, world!' },
      { type: 'complete', status: 'completed' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.execute({
        provider: 'claude',
        model: 'sonnet',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('completed')
    })

    expect(result.current.execution.runId).toBe('run-123')
    expect(result.current.execution.provider).toBe('claude')
    expect(result.current.execution.model).toBe('sonnet')
    expect(result.current.execution.messages).toHaveLength(3)
    expect(result.current.execution.error).toBeNull()
  })

  it('should handle HTTP error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    } as unknown as Response)

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.execute({
        provider: 'claude',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('error')
    })

    expect(result.current.execution.error).toBe('Internal server error')
  })

  it('should handle SSE error message', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123' },
      { type: 'error', message: 'Something went wrong' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.execute({
        provider: 'claude',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('error')
    })

    expect(result.current.execution.error).toBe('Something went wrong')
  })

  it('should handle network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.execute({
        provider: 'claude',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('error')
    })

    expect(result.current.execution.error).toBe('Network error')
  })

  it('should stop execution', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123' },
      { type: 'output', content: 'Processing...' },
    ]

    // Mock the stream that won't complete naturally
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
        const encoder = new TextEncoder()
        mockMessages.forEach((msg) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
        })
      },
    })

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response)

    const { result } = renderHook(() => useAI())

    // Start execution without awaiting (it won't complete)
    act(() => {
      result.current.execute({
        provider: 'claude',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    // Wait for running state
    await waitFor(() => {
      expect(result.current.execution.status).toBe('running')
    })

    // Stop execution
    await act(async () => {
      await result.current.stop()
    })

    expect(result.current.execution.status).toBe('idle')

    // Cleanup
    if (streamController) {
      (streamController as ReadableStreamDefaultController<Uint8Array>).close()
    }
  })

  it('should reset state', async () => {
    // Reset fetch mock to avoid interference from previous tests
    vi.mocked(fetch).mockReset()

    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123' },
      { type: 'complete', status: 'completed' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.execute({
        provider: 'claude',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('completed')
    })

    // Reset
    act(() => {
      result.current.reset()
    })

    expect(result.current.execution).toEqual({
      runId: null,
      provider: null,
      model: null,
      status: 'idle',
      messages: [],
      error: null,
    })
  })

  it('should handle abort when starting new execution', async () => {
    // Reset fetch mock to avoid interference from previous tests
    vi.mocked(fetch).mockReset()

    const mockMessages1: AIMessage[] = [
      { type: 'start', runId: 'run-1' },
    ]
    const mockMessages2: AIMessage[] = [
      { type: 'start', runId: 'run-2' },
      { type: 'complete', status: 'completed' },
    ]

    // First call will be aborted, second will complete
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(mockMessages1),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(mockMessages2),
      } as unknown as Response)

    const { result } = renderHook(() => useAI())

    // Start first execution (don't await)
    act(() => {
      result.current.execute({
        provider: 'claude',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task 1',
      })
    })

    // Immediately start second execution
    await act(async () => {
      await result.current.execute({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        changeId: 'test-change',
        taskId: 'task-2',
        taskTitle: 'Test Task 2',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('completed')
    })

    // Should have the second execution's runId
    expect(result.current.execution.runId).toBe('run-2')
  })

  it('should update execution state with provider and model from params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream([]),
    } as unknown as Response)

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.execute({
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        changeId: 'test-change',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    // Provider and model should be set from params before SSE messages arrive
    expect(result.current.execution.provider).toBe('gemini')
    expect(result.current.execution.model).toBe('gemini-2.5-pro')
  })
})

describe('fetchAIProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch providers successfully', async () => {
    // Reset fetch mock to avoid interference from previous tests
    vi.mocked(fetch).mockReset()

    const mockProviders: AIProviderConfig[] = [
      {
        id: 'claude',
        name: 'Claude Code',
        icon: '🤖',
        enabled: true,
        available: true,
        selectedModel: 'sonnet',
        availableModels: ['haiku', 'sonnet', 'opus'],
        order: 0,
      },
      {
        id: 'gemini',
        name: 'Gemini CLI',
        icon: '💎',
        enabled: true,
        available: false,
        availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        order: 1,
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ providers: mockProviders }),
    } as unknown as Response)

    const providers = await fetchAIProviders()

    expect(providers).toHaveLength(2)
    expect(providers[0].id).toBe('claude')
    expect(providers[1].id).toBe('gemini')
  })

  it('should return empty array on error', async () => {
    // Reset fetch mock and make it reject
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const providers = await fetchAIProviders()

    expect(providers).toEqual([])
  })

  it('should return empty array on non-ok response', async () => {
    // Reset fetch mock and make it return non-ok
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response)

    const providers = await fetchAIProviders()

    expect(providers).toEqual([])
  })
})
