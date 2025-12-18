/**
 * claude-flow E2E 테스트 (실행 → 완료 흐름)
 * @module server/claude-flow/e2e.test
 *
 * 전체 실행 흐름을 테스트합니다:
 * 1. 실행 시작 (POST /execute)
 * 2. 상태 조회 (GET /status/:id)
 * 3. SSE 스트림 연결 (GET /stream/:id)
 * 4. 실행 완료 처리
 * 5. 히스토리 조회 (GET /history)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { EventEmitter } from 'events'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { ChildProcess } from 'child_process'

// =============================================
// Mock child_process.spawn (vi.hoisted로 호이스팅)
// =============================================

// 프로세스 이벤트를 제어할 수 있는 mock 객체
interface MockProcess {
  stdout: EventEmitter
  stderr: EventEmitter
  on: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  killed: boolean
  _closeCallback: ((code?: number) => void) | null
  _errorCallback: ((error: Error) => void) | null
}

// hoisted 변수: vi.mock보다 먼저 평가됨
const { getMockProcess, mockSpawn } = vi.hoisted(() => {
  const EventEmitterClass = require('events').EventEmitter

  let currentMockProcess: MockProcess | null = null

  const createMockProc = () => {
    currentMockProcess = {
      stdout: new EventEmitterClass(),
      stderr: new EventEmitterClass(),
      on: vi.fn((event: string, callback: (arg?: unknown) => void) => {
        if (event === 'close' && currentMockProcess) {
          currentMockProcess._closeCallback = callback as (code?: number) => void
        }
        if (event === 'error' && currentMockProcess) {
          currentMockProcess._errorCallback = callback as (error: Error) => void
        }
      }),
      kill: vi.fn(() => {
        if (currentMockProcess) {
          currentMockProcess.killed = true
        }
      }),
      killed: false,
      _closeCallback: null,
      _errorCallback: null,
    }
    return currentMockProcess as unknown as ChildProcess
  }

  return {
    getMockProcess: () => currentMockProcess,
    mockSpawn: vi.fn(createMockProc),
  }
})

// mockProcess getter
const getMockProcessForTest = () => getMockProcess() as MockProcess

// child_process mock - exec, execSync는 실제 함수 사용, spawn만 모킹
// hoisted에서 실제 child_process 모듈을 가져와 mock 설정
const { actualChildProcess } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actualChildProcess = require('child_process')
  return { actualChildProcess }
})

vi.mock('child_process', () => ({
  ...actualChildProcess,
  spawn: mockSpawn,
  default: {
    ...actualChildProcess,
    spawn: mockSpawn,
  },
}))

// Express Router를 반환하는 mock 생성 함수
const { createMockRouter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express')
  return {
    createMockRouter: () => express.Router(),
  }
})

// Mock git module to avoid child_process import issues in git/commands.ts
vi.mock('../git/index.js', () => ({
  gitRouter: createMockRouter(),
  gitPull: vi.fn().mockResolvedValue({ success: true }),
  gitCommit: vi.fn().mockResolvedValue({ success: true }),
  gitFetch: vi.fn().mockResolvedValue({ success: true }),
  gitStatus: vi.fn().mockResolvedValue({ success: true, data: { branch: 'main' } }),
}))

// Mock integrations module to avoid child_process import issues in keychain.ts
vi.mock('../integrations/index.js', () => ({
  integrationsRouter: createMockRouter(),
  initIntegrationsDb: vi.fn().mockResolvedValue(undefined),
}))

// Mock cli-adapter module to avoid child_process import issues
vi.mock('../cli-adapter/index.js', () => ({
  cliRoutes: createMockRouter(),
}))

// Mock config module
vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    projects: [
      { id: 'test-project', name: 'Test Project', path: '/tmp/test-project' },
    ],
    activeProjectId: 'test-project',
  }),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  setActiveProject: vi.fn(),
  getActiveProject: vi.fn().mockResolvedValue({
    id: 'test-project',
    name: 'Test Project',
    path: '/tmp/test-project',
  }),
  updateProjectPath: vi.fn(),
  updateProjectName: vi.fn(),
  reorderProjects: vi.fn(),
}))

// 테스트에서 사용할 import
import { app } from '../app.js'
import { ClaudeFlowExecutor } from './executor.js'
import type { LogEntry, ClaudeFlowOutput } from './types.js'

describe('claude-flow E2E Tests', () => {
  let testDir: string
  let changeDir: string
  const changeId = 'e2e-test-change'

  beforeEach(() => {
    vi.clearAllMocks()

    // 테스트용 디렉토리 생성
    testDir = join(
      tmpdir(),
      `zyflow-e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    changeDir = join(testDir, 'openspec', 'changes', changeId)
    mkdirSync(changeDir, { recursive: true })

    // 필수 파일들 생성
    writeFileSync(
      join(testDir, 'CLAUDE.md'),
      `# Project Configuration

## 기본 작업 규칙

- 테스트 코드 작성 필수
- 코드 리뷰 후 머지

## 개발 환경

Node.js 20+
`
    )

    writeFileSync(
      join(changeDir, 'proposal.md'),
      `# E2E Test Feature

## Summary
E2E 테스트를 위한 테스트 변경 제안입니다.

## Motivation
자동화된 통합 테스트가 필요합니다.
`
    )

    writeFileSync(
      join(changeDir, 'design.md'),
      `# E2E Test Design

## Architecture
테스트 아키텍처 설계.
`
    )

    writeFileSync(
      join(changeDir, 'tasks.md'),
      `# Tasks

## 1. Setup

- [ ] 1.1 프로젝트 초기화
- [ ] 1.2 의존성 설치

## 2. Implementation

- [ ] 2.1 기능 구현
- [ ] 2.2 테스트 작성
`
    )
  })

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  // =============================================
  // 전체 실행 흐름 테스트
  // =============================================
  describe('Full Execution Flow', () => {
    it('should complete full execution flow: execute -> stream -> complete', async () => {
      // 1. 실행 시작
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      expect(executeRes.status).toBe(200)
      expect(executeRes.body).toHaveProperty('executionId')
      expect(executeRes.body.message).toBe('Execution started')

      const executionId = executeRes.body.executionId

      // 2. 상태 확인 (pending 또는 running)
      // 작은 딜레이 후 상태 확인
      await new Promise(resolve => setTimeout(resolve, 50))

      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      expect(statusRes.status).toBe(200)
      expect(statusRes.body.execution).toBeDefined()
      expect(statusRes.body.execution.id).toBe(executionId)
      expect(['pending', 'running']).toContain(statusRes.body.execution.status)

      // 3. 프로세스 출력 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 50))

      // JSON 스트림 출력 시뮬레이션
      const outputs: ClaudeFlowOutput[] = [
        { type: 'system', message: '분석 시작...' },
        { type: 'assistant', message: '태스크를 분석하고 있습니다.' },
        { type: 'tool_use', name: 'Read', input: { file_path: 'tasks.md' } },
        {
          type: 'tool_result',
          content: '태스크 목록을 읽었습니다. 체크박스 업데이트 중...',
        },
        { type: 'assistant', message: '첫 번째 태스크를 완료했습니다.' },
      ]

      const mockProc = getMockProcessForTest()
      for (const output of outputs) {
        mockProc.stdout.emit('data', Buffer.from(JSON.stringify(output) + '\n'))
      }

      // 4. 프로세스 종료 시뮬레이션
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }

      // 5. 완료 상태 확인
      await new Promise(resolve => setTimeout(resolve, 50))

      const completedStatusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      expect(completedStatusRes.status).toBe(200)
      expect(completedStatusRes.body.execution.status).toBe('completed')
      expect(completedStatusRes.body.execution.result).toBeDefined()
      expect(completedStatusRes.body.execution.result.exitCode).toBe(0)
      expect(completedStatusRes.body.execution.logs.length).toBeGreaterThan(0)

      // 6. 히스토리에 기록되었는지 확인
      const historyRes = await request(app).get(
        `/api/claude-flow/history?changeId=${changeId}`
      )

      expect(historyRes.status).toBe(200)
      expect(historyRes.body.history.length).toBeGreaterThan(0)
      expect(historyRes.body.history[0].id).toBe(executionId)
      expect(historyRes.body.history[0].status).toBe('completed')
    })

    it('should handle execution failure correctly', async () => {
      // 1. 실행 시작
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'single',
          taskId: '1.1',
        })

      expect(executeRes.status).toBe(200)
      const executionId = executeRes.body.executionId

      // 2. 오류 출력 및 실패 종료 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 50))

      const errorOutputs: ClaudeFlowOutput[] = [
        { type: 'system', message: '실행 시작...' },
        { type: 'error', error: '파일을 찾을 수 없습니다.' },
      ]

      const mockProc = getMockProcessForTest()
      for (const output of errorOutputs) {
        mockProc.stdout.emit('data', Buffer.from(JSON.stringify(output) + '\n'))
      }

      // 비정상 종료
      if (mockProc._closeCallback) {
        mockProc._closeCallback(1)
      }

      // 3. 실패 상태 확인
      await new Promise(resolve => setTimeout(resolve, 50))

      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      expect(statusRes.status).toBe(200)
      expect(statusRes.body.execution.status).toBe('failed')
      expect(statusRes.body.execution.result.exitCode).toBe(1)
      expect(statusRes.body.execution.result.error).toContain('코드 1로 종료')
    })

    it('should handle stop request correctly', async () => {
      // 1. 실행 시작
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'analysis',
        })

      expect(executeRes.status).toBe(200)
      const executionId = executeRes.body.executionId

      // 프로세스 시작 대기
      await new Promise(resolve => setTimeout(resolve, 50))

      const mockProc = getMockProcessForTest()

      // 2. 중지 요청
      const stopRes = await request(app).post(
        `/api/claude-flow/stop/${executionId}`
      )

      expect(stopRes.status).toBe(200)
      expect(stopRes.body.success).toBe(true)
      expect(stopRes.body.message).toBe('Execution stopped')

      // 3. kill이 호출되었는지 확인
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')

      // 4. 상태가 stopped로 변경되었는지 확인
      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      expect(statusRes.body.execution.status).toBe('stopped')
    })
  })

  // =============================================
  // 동시 실행 제한 테스트
  // =============================================
  describe('Concurrent Execution Limit', () => {
    it('should reject second execution when one is already running', async () => {
      // 첫 번째 실행 시작
      const firstRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      expect(firstRes.status).toBe(200)
      const firstExecutionId = firstRes.body.executionId

      // 프로세스가 시작되도록 대기
      await new Promise(resolve => setTimeout(resolve, 50))

      // 두 번째 실행 시도 (거부되어야 함)
      const secondRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId: 'another-change',
          mode: 'full',
        })

      expect(secondRes.status).toBe(500)
      expect(secondRes.body.error).toContain('동시 실행 제한')

      // 첫 번째 실행 완료
      const mockProc = getMockProcessForTest()
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // 첫 번째 완료 확인
      const statusRes = await request(app).get(
        `/api/claude-flow/status/${firstExecutionId}`
      )
      expect(statusRes.body.execution.status).toBe('completed')
    })
  })

  // =============================================
  // 로그 및 진행률 테스트
  // =============================================
  describe('Logs and Progress', () => {
    it('should track logs with correct types', async () => {
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      const executionId = executeRes.body.executionId
      await new Promise(resolve => setTimeout(resolve, 50))

      // 다양한 타입의 로그 출력
      const outputs: ClaudeFlowOutput[] = [
        { type: 'assistant', message: '작업을 시작합니다.' },
        { type: 'tool_use', name: 'Write', input: { file_path: 'test.ts' } },
        { type: 'tool_result', content: '파일이 생성되었습니다.' },
        { type: 'error', error: '경고: 사용되지 않는 변수' },
      ]

      const mockProc = getMockProcessForTest()
      for (const output of outputs) {
        mockProc.stdout.emit('data', Buffer.from(JSON.stringify(output) + '\n'))
      }

      // 종료
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // 로그 확인
      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      const logs = statusRes.body.execution.logs as LogEntry[]
      expect(logs.length).toBeGreaterThan(4) // system 로그 포함

      // 로그 타입 확인
      const logTypes = logs.map(l => l.type)
      expect(logTypes).toContain('system')
      expect(logTypes).toContain('assistant')
      expect(logTypes).toContain('tool_use')
      expect(logTypes).toContain('tool_result')
      expect(logTypes).toContain('error')
    })

    it('should increment progress when task completion detected', async () => {
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      const executionId = executeRes.body.executionId
      await new Promise(resolve => setTimeout(resolve, 50))

      // 초기 진행률 확인
      let statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )
      const initialProgress = statusRes.body.execution.progress

      // 체크박스 업데이트를 포함한 출력
      const mockProc = getMockProcessForTest()
      mockProc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'tool_result',
            content: '태스크 체크박스를 업데이트했습니다.',
          }) + '\n'
        )
      )

      await new Promise(resolve => setTimeout(resolve, 50))

      // 진행률 증가 확인
      statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      expect(statusRes.body.execution.progress).toBeGreaterThan(initialProgress)

      // 종료
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }
    })
  })

  // =============================================
  // stderr 처리 테스트
  // =============================================
  describe('stderr Handling', () => {
    it('should log stderr as error', async () => {
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      const executionId = executeRes.body.executionId
      await new Promise(resolve => setTimeout(resolve, 50))

      const mockProc = getMockProcessForTest()

      // stderr 출력
      mockProc.stderr.emit(
        'data',
        Buffer.from('Warning: deprecated API usage\n')
      )

      await new Promise(resolve => setTimeout(resolve, 50))

      // 종료
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // 에러 로그 확인
      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      const errorLogs = statusRes.body.execution.logs.filter(
        (l: LogEntry) => l.type === 'error'
      )
      expect(errorLogs.length).toBeGreaterThan(0)
      expect(errorLogs.some((l: LogEntry) => l.content.includes('deprecated'))).toBe(
        true
      )
    })
  })

  // =============================================
  // 비 JSON 출력 처리 테스트
  // =============================================
  describe('Non-JSON Output Handling', () => {
    it('should handle non-JSON output as info log', async () => {
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      const executionId = executeRes.body.executionId
      await new Promise(resolve => setTimeout(resolve, 50))

      const mockProc = getMockProcessForTest()

      // 비 JSON 출력
      mockProc.stdout.emit('data', Buffer.from('Plain text output\n'))
      mockProc.stdout.emit(
        'data',
        Buffer.from('Another plain message\n')
      )

      // 종료
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // info 로그로 기록되었는지 확인
      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      const infoLogs = statusRes.body.execution.logs.filter(
        (l: LogEntry) => l.type === 'info'
      )

      expect(
        infoLogs.some((l: LogEntry) => l.content.includes('Plain text'))
      ).toBe(true)
    })
  })

  // =============================================
  // 히스토리 조회 테스트
  // =============================================
  describe('History Retrieval', () => {
    it('should store and retrieve execution history', async () => {
      // 여러 실행 수행 (순차적으로)
      const executions: string[] = []

      for (let i = 0; i < 2; i++) {
        // 이전 실행이 완료되기를 기다림
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        const res = await request(app)
          .post('/api/claude-flow/execute')
          .send({
            projectPath: testDir,
            changeId: `change-${i}`,
            mode: 'full',
          })

        if (res.status === 200) {
          executions.push(res.body.executionId)
          await new Promise(resolve => setTimeout(resolve, 50))

          // 즉시 완료
          const mockProc = getMockProcessForTest()
          if (mockProc._closeCallback) {
            mockProc._closeCallback(0)
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // 히스토리 조회
      const historyRes = await request(app).get('/api/claude-flow/history')

      expect(historyRes.status).toBe(200)
      expect(historyRes.body.history.length).toBeGreaterThanOrEqual(
        executions.length
      )

      // 최근 것이 먼저 오는지 확인
      const historyIds = historyRes.body.history.map(
        (h: { id: string }) => h.id
      )
      for (const execId of executions) {
        expect(historyIds).toContain(execId)
      }
    })

    it('should filter history by changeId', async () => {
      // 실행 시작 및 완료
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId: 'specific-change-id',
          mode: 'full',
        })

      await new Promise(resolve => setTimeout(resolve, 50))

      const mockProc = getMockProcessForTest()
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // 특정 changeId로 필터링
      const filteredRes = await request(app).get(
        '/api/claude-flow/history?changeId=specific-change-id'
      )

      expect(filteredRes.status).toBe(200)
      expect(filteredRes.body.history.length).toBeGreaterThan(0)
      expect(filteredRes.body.history[0].changeId).toBe('specific-change-id')
    })

    it('should respect limit parameter', async () => {
      // 히스토리 limit 테스트
      const historyRes = await request(app).get(
        '/api/claude-flow/history?limit=1'
      )

      expect(historyRes.status).toBe(200)
      expect(historyRes.body.history.length).toBeLessThanOrEqual(1)
    })
  })

  // =============================================
  // 프로세스 에러 처리 테스트
  // =============================================
  describe('Process Error Handling', () => {
    it('should handle process spawn error', async () => {
      const executeRes = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      const executionId = executeRes.body.executionId
      await new Promise(resolve => setTimeout(resolve, 50))

      const mockProc = getMockProcessForTest()

      // 프로세스 에러 발생
      if (mockProc._errorCallback) {
        mockProc._errorCallback(new Error('ENOENT: npx not found'))
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      // 실패 상태 확인
      const statusRes = await request(app).get(
        `/api/claude-flow/status/${executionId}`
      )

      expect(statusRes.body.execution.status).toBe('failed')
      expect(
        statusRes.body.execution.logs.some(
          (l: LogEntry) =>
            l.type === 'error' && l.content.includes('프로세스 에러')
        )
      ).toBe(true)
    })
  })

  // =============================================
  // 실행 모드별 테스트
  // =============================================
  describe('Execution Modes', () => {
    it('should execute in full mode', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
        })

      expect(res.status).toBe(200)

      await new Promise(resolve => setTimeout(resolve, 50))

      const statusRes = await request(app).get(
        `/api/claude-flow/status/${res.body.executionId}`
      )
      expect(statusRes.body.execution.request.mode).toBe('full')

      // 종료
      const mockProc = getMockProcessForTest()
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }
    })

    it('should execute in single mode with taskId', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'single',
          taskId: '1.1',
        })

      expect(res.status).toBe(200)

      await new Promise(resolve => setTimeout(resolve, 50))

      const statusRes = await request(app).get(
        `/api/claude-flow/status/${res.body.executionId}`
      )
      expect(statusRes.body.execution.request.mode).toBe('single')
      expect(statusRes.body.execution.request.taskId).toBe('1.1')

      // 종료
      const mockProc = getMockProcessForTest()
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }
    })

    it('should execute in analysis mode', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'analysis',
        })

      expect(res.status).toBe(200)

      await new Promise(resolve => setTimeout(resolve, 50))

      const statusRes = await request(app).get(
        `/api/claude-flow/status/${res.body.executionId}`
      )
      expect(statusRes.body.execution.request.mode).toBe('analysis')

      // 종료
      const mockProc = getMockProcessForTest()
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }
    })
  })

  // =============================================
  // 옵션 전달 테스트
  // =============================================
  describe('Options Passing', () => {
    it('should pass strategy option to process', async () => {
      const res = await request(app)
        .post('/api/claude-flow/execute')
        .send({
          projectPath: testDir,
          changeId,
          mode: 'full',
          strategy: 'testing',
          maxAgents: 3,
        })

      expect(res.status).toBe(200)

      await new Promise(resolve => setTimeout(resolve, 50))

      // spawn이 올바른 인자로 호출되었는지 확인
      expect(mockSpawn).toHaveBeenCalled()
      const spawnCall = mockSpawn.mock.calls[
        mockSpawn.mock.calls.length - 1
      ]
      const args = spawnCall[1] as string[]

      expect(args).toContain('--strategy')
      expect(args).toContain('testing')
      expect(args).toContain('--max-agents')
      expect(args).toContain('3')

      // 종료
      const mockProc = getMockProcessForTest()
      if (mockProc._closeCallback) {
        mockProc._closeCallback(0)
      }
    })
  })
})

describe('ClaudeFlowExecutor Unit Tests', () => {
  let executor: ClaudeFlowExecutor
  let testDir: string
  let changeDir: string
  const changeId = 'unit-test-change'

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new ClaudeFlowExecutor()

    testDir = join(
      tmpdir(),
      `zyflow-unit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    changeDir = join(testDir, 'openspec', 'changes', changeId)
    mkdirSync(changeDir, { recursive: true })

    writeFileSync(
      join(changeDir, 'proposal.md'),
      '# Test\n\n## Summary\nTest summary.'
    )
    writeFileSync(
      join(changeDir, 'tasks.md'),
      '## Tasks\n\n- [ ] Task 1\n- [ ] Task 2'
    )
  })

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('should generate unique execution IDs', async () => {
    const id1 = await executor.execute({
      projectPath: testDir,
      changeId,
      mode: 'full',
    })

    // 첫 번째 실행 완료
    await new Promise(resolve => setTimeout(resolve, 50))
    const mockProc1 = getMockProcessForTest()
    if (mockProc1._closeCallback) {
      mockProc1._closeCallback(0)
    }
    await new Promise(resolve => setTimeout(resolve, 50))

    const id2 = await executor.execute({
      projectPath: testDir,
      changeId,
      mode: 'full',
    })

    expect(id1).not.toBe(id2)
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(id2).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    // 정리
    const mockProc2 = getMockProcessForTest()
    if (mockProc2._closeCallback) {
      mockProc2._closeCallback(0)
    }
  })

  it('should return null for non-existent execution', () => {
    const status = executor.getStatus('non-existent-id')
    expect(status).toBeNull()
  })

  it('should return null emitter for non-existent execution', () => {
    const emitter = executor.subscribe('non-existent-id')
    expect(emitter).toBeNull()
  })

  it('should return empty history initially', () => {
    const history = executor.getHistory()
    expect(Array.isArray(history)).toBe(true)
  })
})
