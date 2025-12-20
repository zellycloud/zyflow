/**
 * useClaude Hook Tests (Backwards Compatibility)
 *
 * Tests to verify that useClaude maintains backwards compatibility
 * with existing code while internally using useAI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useClaude } from './useClaude'
import type { ClaudeMessage, ClaudeExecution, ClaudeModel } from './useClaude'
import type { AIMessage } from '@/types/ai'

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

describe('useClaude (Backwards Compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should export ClaudeModel type correctly', () => {
    // Type test - if this compiles, the types are correctly exported
    const model: ClaudeModel = 'sonnet'
    expect(['haiku', 'sonnet', 'opus']).toContain(model)
  })

  it('should export ClaudeMessage interface correctly', () => {
    // Type test - verify ClaudeMessage interface
    const message: ClaudeMessage = {
      type: 'output',
      runId: 'run-123',
      content: 'Hello',
    }
    expect(message.type).toBe('output')
    expect(message.runId).toBe('run-123')
    expect(message.content).toBe('Hello')
  })

  it('should export ClaudeExecution interface correctly', () => {
    // Type test - verify ClaudeExecution interface
    const execution: ClaudeExecution = {
      runId: 'run-123',
      status: 'running',
      messages: [],
      error: null,
    }
    expect(execution.runId).toBe('run-123')
    expect(execution.status).toBe('running')
  })

  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useClaude())

    expect(result.current.execution).toEqual({
      runId: null,
      status: 'idle',
      messages: [],
      error: null,
    })
  })

  it('should accept legacy execute parameters', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123', provider: 'claude', model: 'sonnet' },
      { type: 'complete', status: 'completed' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useClaude())

    // Use legacy parameter format
    await act(async () => {
      await result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
        model: 'sonnet',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('completed')
    })

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith(
      '/api/ai/execute',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"provider":"claude"'),
      })
    )
  })

  it('should use default model when not specified', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123' },
      { type: 'complete', status: 'completed' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useClaude())

    // Execute without specifying model
    await act(async () => {
      await result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    // Verify default model 'sonnet' was used
    expect(fetch).toHaveBeenCalledWith(
      '/api/ai/execute',
      expect.objectContaining({
        body: expect.stringContaining('"model":"sonnet"'),
      })
    )
  })

  it('should convert AIMessage to ClaudeMessage format', async () => {
    const mockMessages: AIMessage[] = [
      {
        type: 'start',
        runId: 'run-123',
        taskId: 'task-1',
        changeId: 'change-1',
      },
      {
        type: 'output',
        content: 'Processing...',
        data: { type: 'tool_use', name: 'read_file' },
      },
      {
        type: 'complete',
        status: 'completed',
        exitCode: 0,
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useClaude())

    await act(async () => {
      await result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('completed')
    })

    // Verify messages are in ClaudeMessage format
    expect(result.current.execution.messages).toHaveLength(3)

    // Check first message
    const firstMessage = result.current.execution.messages[0]
    expect(firstMessage.type).toBe('start')
    expect(firstMessage.runId).toBe('run-123')
    expect(firstMessage.taskId).toBe('task-1')
    expect(firstMessage.changeId).toBe('change-1')

    // Check second message with data
    const secondMessage = result.current.execution.messages[1]
    expect(secondMessage.type).toBe('output')
    expect(secondMessage.content).toBe('Processing...')
    expect(secondMessage.data?.type).toBe('tool_use')
    expect(secondMessage.data?.name).toBe('read_file')

    // Check complete message
    const thirdMessage = result.current.execution.messages[2]
    expect(thirdMessage.type).toBe('complete')
    expect(thirdMessage.status).toBe('completed')
    expect(thirdMessage.exitCode).toBe(0)
  })

  it('should stop execution', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123' },
    ]

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

    const { result } = renderHook(() => useClaude())

    act(() => {
      result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('running')
    })

    await act(async () => {
      await result.current.stop()
    })

    expect(result.current.execution.status).toBe('idle')

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

    const { result } = renderHook(() => useClaude())

    await act(async () => {
      await result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('completed')
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.execution).toEqual({
      runId: null,
      status: 'idle',
      messages: [],
      error: null,
    })
  })

  it('should handle error and set error message', async () => {
    // Reset fetch mock to avoid interference from previous tests
    vi.mocked(fetch).mockReset()

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'Server error' }),
    } as unknown as Response)

    const { result } = renderHook(() => useClaude())

    await act(async () => {
      await result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
      })
    })

    await waitFor(() => {
      expect(result.current.execution.status).toBe('error')
    })

    expect(result.current.execution.error).toBe('Server error')
  })

  it('should accept context parameter', async () => {
    const mockMessages: AIMessage[] = [
      { type: 'start', runId: 'run-123' },
      { type: 'complete', status: 'completed' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createMockSSEStream(mockMessages),
    } as unknown as Response)

    const { result } = renderHook(() => useClaude())

    await act(async () => {
      await result.current.execute({
        changeId: 'change-1',
        taskId: 'task-1',
        taskTitle: 'Test Task',
        context: 'Additional context for the task',
      })
    })

    // Verify context was passed
    expect(fetch).toHaveBeenCalledWith(
      '/api/ai/execute',
      expect.objectContaining({
        body: expect.stringContaining('"context":"Additional context for the task"'),
      })
    )
  })

  it('should work with all ClaudeModel values', async () => {
    const models: ClaudeModel[] = ['haiku', 'sonnet', 'opus']

    for (const model of models) {
      vi.clearAllMocks()

      const mockMessages: AIMessage[] = [
        { type: 'start', runId: `run-${model}` },
        { type: 'complete', status: 'completed' },
      ]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(mockMessages),
      } as unknown as Response)

      const { result } = renderHook(() => useClaude())

      await act(async () => {
        await result.current.execute({
          changeId: 'change-1',
          taskId: 'task-1',
          taskTitle: 'Test Task',
          model,
        })
      })

      await waitFor(() => {
        expect(result.current.execution.status).toBe('completed')
      })

      expect(fetch).toHaveBeenCalledWith(
        '/api/ai/execute',
        expect.objectContaining({
          body: expect.stringContaining(`"model":"${model}"`),
        })
      )
    }
  })
})
