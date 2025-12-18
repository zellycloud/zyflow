/**
 * claude-flow API 엔드포인트 통합 테스트
 * @module server/claude-flow/api.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { claudeFlowExecutor, ClaudeFlowExecutor } from './executor.js'
import type { ExecutionStatus, ExecutionHistoryItem } from './types.js'

// Mock executor module
vi.mock('./executor.js', () => {
  const mockExecutor = {
    execute: vi.fn(),
    getStatus: vi.fn(),
    subscribe: vi.fn(),
    stop: vi.fn(),
    getHistory: vi.fn(),
    cleanup: vi.fn(),
  }

  return {
    claudeFlowExecutor: mockExecutor,
    ClaudeFlowExecutor: vi.fn(() => mockExecutor),
  }
})

// Mock config module to avoid file system operations
vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    projects: [
      { id: 'test-project', name: 'Test Project', path: '/tmp/test-project' },
    ],
    activeProjectId: 'test-project',
  }),
  addProject: vi.fn().mockResolvedValue({
    id: 'new-project',
    name: 'New Project',
    path: '/tmp/new-project',
  }),
  removeProject: vi.fn().mockResolvedValue(undefined),
  setActiveProject: vi.fn().mockResolvedValue(undefined),
  getActiveProject: vi.fn().mockResolvedValue({
    id: 'test-project',
    name: 'Test Project',
    path: '/tmp/test-project',
  }),
}))

describe('claude-flow API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // =============================================
  // POST /api/claude-flow/execute
  // =============================================
  describe('POST /api/claude-flow/execute', () => {
    it('returns 400 when projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({ changeId: 'test-change' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('projectPath is required')
    })

    it('returns 400 when changeId is missing', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({ projectPath: '/tmp/test' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('changeId is required')
    })

    it('successfully starts execution with required fields', async () => {
      const mockExecutionId = 'exec-12345'
      vi.mocked(claudeFlowExecutor.execute).mockResolvedValue(mockExecutionId)

      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: '/tmp/test-project',
          changeId: 'test-change',
        })

      expect(res.status).toBe(200)
      expect(res.body.executionId).toBe(mockExecutionId)
      expect(res.body.message).toBe('Execution started')
      expect(claudeFlowExecutor.execute).toHaveBeenCalledWith({
        projectPath: '/tmp/test-project',
        changeId: 'test-change',
        taskId: undefined,
        mode: 'full',
        strategy: undefined,
        maxAgents: undefined,
        timeout: undefined,
      })
    })

    it('passes all optional parameters correctly', async () => {
      const mockExecutionId = 'exec-67890'
      vi.mocked(claudeFlowExecutor.execute).mockResolvedValue(mockExecutionId)

      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: '/tmp/test-project',
          changeId: 'test-change',
          taskId: 'task-123',
          mode: 'single',
          strategy: 'testing',
          maxAgents: 3,
          timeout: 60000,
        })

      expect(res.status).toBe(200)
      expect(res.body.executionId).toBe(mockExecutionId)
      expect(claudeFlowExecutor.execute).toHaveBeenCalledWith({
        projectPath: '/tmp/test-project',
        changeId: 'test-change',
        taskId: 'task-123',
        mode: 'single',
        strategy: 'testing',
        maxAgents: 3,
        timeout: 60000,
      })
    })

    it('returns 500 when executor throws error', async () => {
      vi.mocked(claudeFlowExecutor.execute).mockRejectedValue(
        new Error('동시 실행 제한 초과 (최대 1개)')
      )

      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: '/tmp/test-project',
          changeId: 'test-change',
        })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('동시 실행 제한 초과 (최대 1개)')
    })
  })

  // =============================================
  // GET /api/claude-flow/status/:id
  // =============================================
  describe('GET /api/claude-flow/status/:id', () => {
    it('returns 404 when execution not found', async () => {
      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(null)

      const res = await request(app).get('/api/claude-flow/status/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Execution not found')
    })

    it('returns execution status when found', async () => {
      const mockStatus: ExecutionStatus = {
        id: 'exec-12345',
        request: {
          projectPath: '/tmp/test',
          changeId: 'test-change',
          mode: 'full',
        },
        status: 'running',
        startedAt: '2025-12-18T10:00:00.000Z',
        progress: 50,
        currentTask: 'Building components',
        logs: [
          {
            timestamp: '2025-12-18T10:00:00.000Z',
            type: 'system',
            content: 'claude-flow 프로세스 시작...',
          },
        ],
      }

      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(mockStatus)

      const res = await request(app).get('/api/claude-flow/status/exec-12345')

      expect(res.status).toBe(200)
      expect(res.body.execution).toEqual(mockStatus)
      expect(res.body.execution.id).toBe('exec-12345')
      expect(res.body.execution.status).toBe('running')
      expect(res.body.execution.progress).toBe(50)
    })

    it('returns completed status with result', async () => {
      const mockStatus: ExecutionStatus = {
        id: 'exec-completed',
        request: {
          projectPath: '/tmp/test',
          changeId: 'test-change',
          mode: 'full',
        },
        status: 'completed',
        startedAt: '2025-12-18T10:00:00.000Z',
        completedAt: '2025-12-18T10:30:00.000Z',
        progress: 100,
        logs: [],
        result: {
          completedTasks: 5,
          totalTasks: 5,
          modifiedFiles: ['src/App.tsx', 'src/components/Button.tsx'],
          exitCode: 0,
        },
      }

      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(mockStatus)

      const res = await request(app).get(
        '/api/claude-flow/status/exec-completed'
      )

      expect(res.status).toBe(200)
      expect(res.body.execution.status).toBe('completed')
      expect(res.body.execution.result?.completedTasks).toBe(5)
      expect(res.body.execution.result?.exitCode).toBe(0)
    })
  })

  // =============================================
  // POST /api/claude-flow/stop/:id
  // =============================================
  describe('POST /api/claude-flow/stop/:id', () => {
    it('returns 404 when execution not found', async () => {
      vi.mocked(claudeFlowExecutor.stop).mockReturnValue(false)

      const res = await request(app).post('/api/claude-flow/stop/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Execution not found or already stopped')
    })

    it('successfully stops execution', async () => {
      vi.mocked(claudeFlowExecutor.stop).mockReturnValue(true)

      const res = await request(app).post('/api/claude-flow/stop/exec-12345')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Execution stopped')
      expect(claudeFlowExecutor.stop).toHaveBeenCalledWith('exec-12345')
    })
  })

  // =============================================
  // GET /api/claude-flow/history
  // =============================================
  describe('GET /api/claude-flow/history', () => {
    it('returns empty history when no executions', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      const res = await request(app).get('/api/claude-flow/history')

      expect(res.status).toBe(200)
      expect(res.body.history).toEqual([])
      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(
        20,
        undefined
      )
    })

    it('returns execution history', async () => {
      const mockHistory: ExecutionHistoryItem[] = [
        {
          id: 'exec-1',
          changeId: 'change-1',
          mode: 'full',
          status: 'completed',
          startedAt: '2025-12-18T10:00:00.000Z',
          completedAt: '2025-12-18T10:30:00.000Z',
          result: {
            completedTasks: 5,
            totalTasks: 5,
            exitCode: 0,
          },
        },
        {
          id: 'exec-2',
          changeId: 'change-2',
          mode: 'single',
          status: 'failed',
          startedAt: '2025-12-18T09:00:00.000Z',
          completedAt: '2025-12-18T09:15:00.000Z',
          result: {
            completedTasks: 2,
            totalTasks: 5,
            exitCode: 1,
            error: '프로세스가 코드 1로 종료됨',
          },
        },
      ]

      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue(mockHistory)

      const res = await request(app).get('/api/claude-flow/history')

      expect(res.status).toBe(200)
      expect(res.body.history).toHaveLength(2)
      expect(res.body.history[0].id).toBe('exec-1')
      expect(res.body.history[0].status).toBe('completed')
      expect(res.body.history[1].id).toBe('exec-2')
      expect(res.body.history[1].status).toBe('failed')
    })

    it('respects limit parameter', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      const res = await request(app).get('/api/claude-flow/history?limit=5')

      expect(res.status).toBe(200)
      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(5, undefined)
    })

    it('filters by changeId', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      const res = await request(app).get(
        '/api/claude-flow/history?changeId=my-change'
      )

      expect(res.status).toBe(200)
      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(
        20,
        'my-change'
      )
    })

    it('respects both limit and changeId parameters', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      const res = await request(app).get(
        '/api/claude-flow/history?limit=10&changeId=specific-change'
      )

      expect(res.status).toBe(200)
      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(
        10,
        'specific-change'
      )
    })
  })

  // =============================================
  // GET /api/claude-flow/stream/:id (SSE)
  // =============================================
  describe('GET /api/claude-flow/stream/:id', () => {
    it('returns 404 when execution not found', async () => {
      vi.mocked(claudeFlowExecutor.subscribe).mockReturnValue(null)

      const res = await request(app).get('/api/claude-flow/stream/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Execution not found')
    })

    // Note: SSE streaming tests are limited in supertest
    // Full SSE testing would require a different approach
    // (e.g., using EventSource in a real HTTP server context)
  })
})

describe('claude-flow API Response Types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ExecuteResponse has correct structure', async () => {
    vi.mocked(claudeFlowExecutor.execute).mockResolvedValue('exec-123')

    const res = await request(app)
      .post('/api/claude-flow/execute')
      .send({
        projectPath: '/tmp/test',
        changeId: 'change-1',
      })

    expect(res.body).toHaveProperty('executionId')
    expect(res.body).toHaveProperty('message')
    expect(typeof res.body.executionId).toBe('string')
    expect(typeof res.body.message).toBe('string')
  })

  it('StatusResponse has correct structure', async () => {
    const mockStatus: ExecutionStatus = {
      id: 'exec-123',
      request: {
        projectPath: '/tmp/test',
        changeId: 'change-1',
        mode: 'full',
      },
      status: 'running',
      startedAt: '2025-12-18T10:00:00.000Z',
      progress: 25,
      logs: [],
    }

    vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(mockStatus)

    const res = await request(app).get('/api/claude-flow/status/exec-123')

    expect(res.body).toHaveProperty('execution')
    expect(res.body.execution).toHaveProperty('id')
    expect(res.body.execution).toHaveProperty('request')
    expect(res.body.execution).toHaveProperty('status')
    expect(res.body.execution).toHaveProperty('startedAt')
    expect(res.body.execution).toHaveProperty('progress')
    expect(res.body.execution).toHaveProperty('logs')
    expect(Array.isArray(res.body.execution.logs)).toBe(true)
  })

  it('StopResponse has correct structure', async () => {
    vi.mocked(claudeFlowExecutor.stop).mockReturnValue(true)

    const res = await request(app).post('/api/claude-flow/stop/exec-123')

    expect(res.body).toHaveProperty('success')
    expect(res.body).toHaveProperty('message')
    expect(typeof res.body.success).toBe('boolean')
    expect(typeof res.body.message).toBe('string')
  })

  it('HistoryResponse has correct structure', async () => {
    const mockHistory: ExecutionHistoryItem[] = [
      {
        id: 'exec-1',
        changeId: 'change-1',
        mode: 'full',
        status: 'completed',
        startedAt: '2025-12-18T10:00:00.000Z',
      },
    ]

    vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue(mockHistory)

    const res = await request(app).get('/api/claude-flow/history')

    expect(res.body).toHaveProperty('history')
    expect(Array.isArray(res.body.history)).toBe(true)
    expect(res.body.history[0]).toHaveProperty('id')
    expect(res.body.history[0]).toHaveProperty('changeId')
    expect(res.body.history[0]).toHaveProperty('mode')
    expect(res.body.history[0]).toHaveProperty('status')
    expect(res.body.history[0]).toHaveProperty('startedAt')
  })
})

describe('claude-flow API Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles non-Error exceptions in execute', async () => {
    vi.mocked(claudeFlowExecutor.execute).mockRejectedValue('string error')

    const res = await request(app)
      .post('/api/claude-flow/execute')
      .send({
        projectPath: '/tmp/test',
        changeId: 'change-1',
      })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('string error')
  })

  it('handles unknown error types gracefully', async () => {
    vi.mocked(claudeFlowExecutor.execute).mockRejectedValue({ code: 'UNKNOWN' })

    const res = await request(app)
      .post('/api/claude-flow/execute')
      .send({
        projectPath: '/tmp/test',
        changeId: 'change-1',
      })

    expect(res.status).toBe(500)
    expect(res.body).toHaveProperty('error')
  })

  it('validates mode parameter accepts valid values', async () => {
    vi.mocked(claudeFlowExecutor.execute).mockResolvedValue('exec-123')

    // Test 'full' mode
    let res = await request(app)
      .post('/api/claude-flow/execute')
      .send({
        projectPath: '/tmp/test',
        changeId: 'change-1',
        mode: 'full',
      })
    expect(res.status).toBe(200)

    // Test 'single' mode
    res = await request(app)
      .post('/api/claude-flow/execute')
      .send({
        projectPath: '/tmp/test',
        changeId: 'change-1',
        mode: 'single',
      })
    expect(res.status).toBe(200)

    // Test 'analysis' mode
    res = await request(app)
      .post('/api/claude-flow/execute')
      .send({
        projectPath: '/tmp/test',
        changeId: 'change-1',
        mode: 'analysis',
      })
    expect(res.status).toBe(200)
  })

  it('validates strategy parameter accepts valid values', async () => {
    vi.mocked(claudeFlowExecutor.execute).mockResolvedValue('exec-123')

    const strategies = ['development', 'research', 'testing']

    for (const strategy of strategies) {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: '/tmp/test',
          changeId: 'change-1',
          strategy,
        })
      expect(res.status).toBe(200)
    }
  })
})
