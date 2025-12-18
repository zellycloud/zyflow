/**
 * claude-flow API 엔드포인트 통합 테스트
 * @module server/claude-flow/index.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express, { type Express } from 'express'
import { claudeFlowRouter } from './index.js'
import { ClaudeFlowExecutor } from './executor.js'
import type {
  ExecutionRequest,
  ExecutionStatus,
  ExecutionHistoryItem,
} from './types.js'
import { EventEmitter } from 'events'

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
    ClaudeFlowExecutor: vi.fn(() => mockExecutor),
    claudeFlowExecutor: mockExecutor,
  }
})

// Import mocked executor
import { claudeFlowExecutor } from './executor.js'

describe('claude-flow API Endpoints', () => {
  let app: Express

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create fresh express app for each test
    app = express()
    app.use(express.json())
    app.use('/api/claude-flow', claudeFlowRouter)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('POST /api/claude-flow/execute', () => {
    it('should start execution with valid request', async () => {
      const executionId = 'test-execution-id'
      vi.mocked(claudeFlowExecutor.execute).mockResolvedValue(executionId)

      const requestBody: Partial<ExecutionRequest> = {
        projectPath: '/test/project',
        changeId: 'test-change',
        mode: 'full',
      }

      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send(requestBody)

      expect(res.status).toBe(200)
      expect(res.body.executionId).toBe(executionId)
      expect(res.body.message).toBe('Execution started')
      expect(claudeFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/test/project',
          changeId: 'test-change',
          mode: 'full',
        })
      )
    })

    it('should start execution with all optional parameters', async () => {
      const executionId = 'test-execution-id-2'
      vi.mocked(claudeFlowExecutor.execute).mockResolvedValue(executionId)

      const requestBody: Partial<ExecutionRequest> = {
        projectPath: '/test/project',
        changeId: 'test-change',
        taskId: 'task-123',
        mode: 'single',
        strategy: 'development',
        maxAgents: 10,
        timeout: 60000,
      }

      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send(requestBody)

      expect(res.status).toBe(200)
      expect(res.body.executionId).toBe(executionId)
      expect(claudeFlowExecutor.execute).toHaveBeenCalledWith({
        projectPath: '/test/project',
        changeId: 'test-change',
        taskId: 'task-123',
        mode: 'single',
        strategy: 'development',
        maxAgents: 10,
        timeout: 60000,
      })
    })

    it('should return 400 when projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({ changeId: 'test-change' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('projectPath is required')
      expect(claudeFlowExecutor.execute).not.toHaveBeenCalled()
    })

    it('should return 400 when changeId is missing', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({ projectPath: '/test/project' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('changeId is required')
      expect(claudeFlowExecutor.execute).not.toHaveBeenCalled()
    })

    it('should return 500 on executor error', async () => {
      vi.mocked(claudeFlowExecutor.execute).mockRejectedValue(
        new Error('동시 실행 제한 초과')
      )

      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: '/test/project',
          changeId: 'test-change',
        })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('동시 실행 제한 초과')
    })

    it('should use default mode when not specified', async () => {
      vi.mocked(claudeFlowExecutor.execute).mockResolvedValue('exec-id')

      await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: '/test/project',
          changeId: 'test-change',
        })

      expect(claudeFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'full',
        })
      )
    })
  })

  describe('GET /api/claude-flow/status/:id', () => {
    it('should return execution status', async () => {
      const mockStatus: ExecutionStatus = {
        id: 'test-id',
        request: {
          projectPath: '/test/project',
          changeId: 'test-change',
          mode: 'full',
        },
        status: 'running',
        startedAt: '2024-01-01T00:00:00.000Z',
        progress: 50,
        logs: [],
      }

      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(mockStatus)

      const res = await request(app).get('/api/claude-flow/status/test-id')

      expect(res.status).toBe(200)
      expect(res.body.execution).toEqual(mockStatus)
      expect(claudeFlowExecutor.getStatus).toHaveBeenCalledWith('test-id')
    })

    it('should return 404 when execution not found', async () => {
      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(null)

      const res = await request(app).get('/api/claude-flow/status/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Execution not found')
    })

    it('should return completed execution status', async () => {
      const mockStatus: ExecutionStatus = {
        id: 'completed-id',
        request: {
          projectPath: '/test/project',
          changeId: 'test-change',
          mode: 'full',
        },
        status: 'completed',
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:30:00.000Z',
        progress: 100,
        logs: [
          {
            timestamp: '2024-01-01T00:00:00.000Z',
            type: 'system',
            content: 'Execution completed',
          },
        ],
        result: {
          completedTasks: 5,
          totalTasks: 5,
          exitCode: 0,
        },
      }

      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue(mockStatus)

      const res = await request(app).get('/api/claude-flow/status/completed-id')

      expect(res.status).toBe(200)
      expect(res.body.execution.status).toBe('completed')
      expect(res.body.execution.result.completedTasks).toBe(5)
    })
  })

  describe('GET /api/claude-flow/stream/:id', () => {
    it('should return 404 when execution not found for stream', async () => {
      vi.mocked(claudeFlowExecutor.subscribe).mockReturnValue(null)

      const res = await request(app).get('/api/claude-flow/stream/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Execution not found')
    })

    it('should set SSE headers when execution exists', async () => {
      const mockEmitter = new EventEmitter()
      vi.mocked(claudeFlowExecutor.subscribe).mockReturnValue(mockEmitter)
      vi.mocked(claudeFlowExecutor.getStatus).mockReturnValue({
        id: 'stream-test',
        request: {
          projectPath: '/test',
          changeId: 'change',
          mode: 'full',
        },
        status: 'running',
        startedAt: new Date().toISOString(),
        progress: 0,
        logs: [],
      })

      const res = await request(app)
        .get('/api/claude-flow/stream/stream-test')
        .buffer(false)
        .parse((res, callback) => {
          // Close connection after receiving headers
          res.destroy()
          callback(null, '')
        })

      expect(res.headers['content-type']).toContain('text/event-stream')
      expect(res.headers['cache-control']).toBe('no-cache')
      expect(res.headers['connection']).toBe('keep-alive')
    })
  })

  describe('POST /api/claude-flow/stop/:id', () => {
    it('should stop execution successfully', async () => {
      vi.mocked(claudeFlowExecutor.stop).mockReturnValue(true)

      const res = await request(app).post('/api/claude-flow/stop/test-id')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Execution stopped')
      expect(claudeFlowExecutor.stop).toHaveBeenCalledWith('test-id')
    })

    it('should return 404 when execution not found or already stopped', async () => {
      vi.mocked(claudeFlowExecutor.stop).mockReturnValue(false)

      const res = await request(app).post('/api/claude-flow/stop/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Execution not found or already stopped')
    })
  })

  describe('GET /api/claude-flow/history', () => {
    it('should return execution history', async () => {
      const mockHistory: ExecutionHistoryItem[] = [
        {
          id: 'exec-1',
          changeId: 'change-1',
          mode: 'full',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:30:00.000Z',
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
          startedAt: '2024-01-01T01:00:00.000Z',
          completedAt: '2024-01-01T01:05:00.000Z',
          result: {
            completedTasks: 2,
            totalTasks: 5,
            exitCode: 1,
            error: 'Process failed',
          },
        },
      ]

      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue(mockHistory)

      const res = await request(app).get('/api/claude-flow/history')

      expect(res.status).toBe(200)
      expect(res.body.history).toEqual(mockHistory)
      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(
        20,
        undefined
      )
    })

    it('should apply limit parameter', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      await request(app).get('/api/claude-flow/history?limit=5')

      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(5, undefined)
    })

    it('should apply changeId filter', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      await request(app).get('/api/claude-flow/history?changeId=my-change')

      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(
        20,
        'my-change'
      )
    })

    it('should apply both limit and changeId filters', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      await request(app).get(
        '/api/claude-flow/history?limit=10&changeId=test-change'
      )

      expect(claudeFlowExecutor.getHistory).toHaveBeenCalledWith(
        10,
        'test-change'
      )
    })

    it('should return empty array when no history', async () => {
      vi.mocked(claudeFlowExecutor.getHistory).mockReturnValue([])

      const res = await request(app).get('/api/claude-flow/history')

      expect(res.status).toBe(200)
      expect(res.body.history).toEqual([])
    })
  })
})
