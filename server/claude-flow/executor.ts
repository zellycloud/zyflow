/**
 * claude-flow 실행 관리자
 * @module server/claude-flow/executor
 */

import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { OpenSpecPromptBuilder } from './prompt-builder.js'
import type {
  ExecutionRequest,
  ExecutionStatus,
  ExecutionStatusValue,
  LogEntry,
  LogType,
  ClaudeFlowOutput,
  ExecutionResult,
  ExecutionHistoryItem,
} from './types.js'

/** 기본 타임아웃 (30분) */
const DEFAULT_TIMEOUT = 30 * 60 * 1000

/** 최대 동시 실행 수 */
const MAX_CONCURRENT_EXECUTIONS = 1

/**
 * 실행 인스턴스 정보
 */
interface ExecutionInstance {
  status: ExecutionStatus
  process: ChildProcess | null
  emitter: EventEmitter
  timeoutId?: NodeJS.Timeout
}

/**
 * claude-flow 프로세스 실행 및 관리
 */
export class ClaudeFlowExecutor {
  /** 실행 중인 인스턴스들 */
  private executions: Map<string, ExecutionInstance> = new Map()

  /** 히스토리 (메모리 저장, 추후 DB로 전환 가능) */
  private history: ExecutionHistoryItem[] = []

  /** 최대 히스토리 크기 */
  private maxHistorySize = 100

  /**
   * 새 실행 시작
   */
  async execute(request: ExecutionRequest): Promise<string> {
    // 동시 실행 제한 확인
    const runningCount = Array.from(this.executions.values()).filter(
      e => e.status.status === 'running'
    ).length

    if (runningCount >= MAX_CONCURRENT_EXECUTIONS) {
      throw new Error(
        `동시 실행 제한 초과 (최대 ${MAX_CONCURRENT_EXECUTIONS}개)`
      )
    }

    const executionId = randomUUID()
    const timeout = request.timeout ?? DEFAULT_TIMEOUT

    // 프롬프트 빌드
    const promptBuilder = new OpenSpecPromptBuilder(
      request.projectPath,
      request.changeId,
      request.mode,
      request.taskId
    )

    const prompt = await promptBuilder.build()

    // 실행 상태 초기화
    const status: ExecutionStatus = {
      id: executionId,
      request,
      status: 'pending',
      startedAt: new Date().toISOString(),
      progress: 0,
      logs: [],
    }

    const emitter = new EventEmitter()
    const instance: ExecutionInstance = {
      status,
      process: null,
      emitter,
    }

    this.executions.set(executionId, instance)

    // 비동기로 프로세스 시작
    setImmediate(() => this.startProcess(executionId, prompt, timeout))

    return executionId
  }

  /**
   * Claude Code 프로세스 직접 시작 (Swarm/단일 모드 공통)
   * - claude-flow swarm 대신 Claude Code를 직접 실행하여 실시간 로그 표시
   */
  private async startProcess(
    executionId: string,
    prompt: string,
    timeout: number
  ): Promise<void> {
    const instance = this.executions.get(executionId)
    if (!instance) return

    const mode = instance.status.request.mode
    const isSwarmMode = mode === 'full' || mode === 'analysis'

    this.updateStatus(executionId, 'running')
    this.addLog(executionId, 'system', `Claude Code 실행 중... (${isSwarmMode ? 'Swarm' : '단일'} 모드)`)

    // 프롬프트를 임시 파일로 저장 (쉘 이스케이프 문제 방지)
    const promptFile = join(tmpdir(), `claude-flow-prompt-${executionId}.txt`)
    // 래퍼 스크립트 생성
    const scriptFile = join(tmpdir(), `claude-flow-runner-${executionId}.sh`)

    try {
      // Swarm 모드인 경우 프롬프트에 멀티에이전트 지시 추가
      let finalPrompt = prompt
      if (isSwarmMode) {
        const swarmInstructions = `
## Swarm 실행 모드

이 태스크는 **Swarm 멀티에이전트 모드**로 실행됩니다.
- 전략: ${instance.status.request.strategy || 'development'}
- 최대 에이전트: ${instance.status.request.maxAgents || 5}

### 실행 지침
1. 태스크를 분석하고 하위 태스크로 분해하세요.
2. 가능한 경우 Task 도구를 사용하여 병렬로 에이전트를 생성하세요.
3. 각 에이전트에게 명확한 책임을 부여하세요.
4. 모든 작업 완료 후 결과를 종합하세요.

---

`
        finalPrompt = swarmInstructions + prompt
      }

      await writeFile(promptFile, finalPrompt, 'utf-8')

      // Claude Code 직접 실행 (claude-flow swarm 대신)
      // 이렇게 하면 단일 실행과 동일한 JSON 스트림 출력을 받을 수 있음
      const scriptArgs: string[] = [
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--max-tokens', '16000',
      ]

      // 모델 설정 (Provider에 따라)
      const provider = instance.status.request.provider || 'claude'
      const model = instance.status.request.model

      if (provider === 'claude' && model) {
        // Claude 모델 매핑
        const modelMap: Record<string, string> = {
          'opus': 'claude-opus-4-5-20251101',
          'sonnet': 'claude-sonnet-4-20250514',
          'haiku': 'claude-3-5-haiku-20241022',
        }
        const fullModel = modelMap[model] || model
        scriptArgs.push('--model', fullModel)
      }

      const scriptContent = `#!/bin/bash
cd "${instance.status.request.projectPath}"
exec claude -p "${promptFile}" ${scriptArgs.join(' ')}
`
      await writeFile(scriptFile, scriptContent, { mode: 0o755 })

      const proc = spawn('bash', [scriptFile], {
        cwd: instance.status.request.projectPath,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // stdin을 즉시 닫아서 대화형 입력 대기 방지
      proc.stdin?.end()

      // 프로세스 종료 시 임시 파일 정리
      proc.on('close', () => {
        unlink(promptFile).catch(() => {})
        unlink(scriptFile).catch(() => {})
      })

      instance.process = proc

      // 타임아웃 설정
      instance.timeoutId = setTimeout(() => {
        this.addLog(executionId, 'error', `타임아웃 (${timeout / 1000}초)`)
        this.stop(executionId)
      }, timeout)

      // stdout 처리
      let buffer = ''
      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        buffer += text

        // 디버그: raw output 기록
        console.log('[claude-flow stdout]', text.substring(0, 200))

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim()) {
            this.parseOutput(executionId, line)
          }
        }
      })

      // stderr 처리
      proc.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim()
        if (message) {
          this.addLog(executionId, 'error', message)
        }
      })

      // 프로세스 종료 처리
      proc.on('close', (code) => {
        if (instance.timeoutId) {
          clearTimeout(instance.timeoutId)
        }

        const finalStatus: ExecutionStatusValue =
          code === 0 ? 'completed' : 'failed'

        instance.status.result = {
          completedTasks: this.countCompletedTasks(instance.status.logs),
          totalTasks: this.countTotalTasks(instance.status.logs),
          exitCode: code ?? undefined,
          error: code !== 0 ? `프로세스가 코드 ${code}로 종료됨` : undefined,
        }

        this.updateStatus(executionId, finalStatus)
        this.addLog(
          executionId,
          'system',
          `실행 완료 (exit code: ${code})`
        )

        // 히스토리에 추가
        this.addToHistory(instance.status)
      })

      proc.on('error', (error) => {
        this.addLog(executionId, 'error', `프로세스 에러: ${error.message}`)
        this.updateStatus(executionId, 'failed')
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.addLog(executionId, 'error', `시작 실패: ${message}`)
      this.updateStatus(executionId, 'failed')
    }
  }

  /**
   * Claude Code JSON 출력 파싱
   */
  private parseOutput(executionId: string, line: string): void {
    // 먼저 JSON 파싱 시도
    try {
      const output: ClaudeFlowOutput = JSON.parse(line)

      let logType: LogType = 'info'
      let content = ''

      switch (output.type) {
        case 'assistant':
          logType = 'assistant'
          // subtype이 'text'인 경우 실제 응답 텍스트
          if (output.subtype === 'text') {
            content = output.message ?? ''
          } else {
            content = output.message ?? ''
          }
          break
        case 'user':
          // 사용자 입력 (프롬프트) - 스킵하거나 짧게 표시
          logType = 'info'
          content = '[프롬프트 전송됨]'
          break
        case 'tool_use':
          logType = 'tool_use'
          content = `🔧 Tool: ${output.name}`
          this.addLog(executionId, logType, content, {
            name: output.name,
            input: output.input,
          })
          // 진행률 증가
          this.incrementProgress(executionId)
          return
        case 'tool_result':
          logType = 'tool_result'
          // 결과를 적절히 잘라서 표시
          const resultContent = output.content ?? ''
          content = resultContent.length > 500
            ? resultContent.substring(0, 500) + '...'
            : resultContent
          break
        case 'error':
          logType = 'error'
          content = output.error ?? output.message ?? ''
          break
        case 'system':
          logType = 'system'
          content = output.message ?? ''
          break
        case 'result':
          // 실행 완료
          logType = 'system'
          content = `✅ 실행 완료 (비용: $${output.total_cost_usd?.toFixed(4) ?? '?'}, 시간: ${((output.duration_ms ?? 0) / 1000).toFixed(1)}초)`
          this.updateProgress(executionId, 100)
          break
        default:
          content = line
      }

      if (content) {
        this.addLog(executionId, logType, content)
      }

      // 진행률 업데이트 (태스크 완료 감지)
      if (
        output.type === 'tool_result' &&
        (output.content?.includes('체크박스') || output.content?.includes('완료') || output.content?.includes('done'))
      ) {
        this.incrementProgress(executionId)
      }
    } catch {
      // JSON 파싱 실패시 일반 텍스트로 처리
      if (!line.trim()) return

      // 텍스트 출력에서 상태 감지
      const trimmedLine = line.trim()

      // 시스템 메시지 감지
      if (trimmedLine.startsWith('🐝') || trimmedLine.startsWith('📋') ||
          trimmedLine.startsWith('🎯') || trimmedLine.startsWith('🏗') ||
          trimmedLine.startsWith('🤖') || trimmedLine.startsWith('🚀') ||
          trimmedLine.startsWith('✓') || trimmedLine.startsWith('💡') ||
          trimmedLine.startsWith('🛑') || trimmedLine.startsWith('⚠')) {
        this.addLog(executionId, 'system', trimmedLine)

        // 진행 단계별 progress 업데이트
        if (trimmedLine.includes('Launching')) {
          this.updateProgress(executionId, 10)
        } else if (trimmedLine.includes('launched')) {
          this.updateProgress(executionId, 30)
        } else if (trimmedLine.includes('completed successfully')) {
          this.updateProgress(executionId, 100)
        }
        return
      }

      // 에러 메시지 감지
      if (trimmedLine.startsWith('❌') || trimmedLine.toLowerCase().includes('error')) {
        this.addLog(executionId, 'error', trimmedLine)
        return
      }

      // 진행 메시지 (Done! 등)
      if (trimmedLine.startsWith('Done!') || trimmedLine.includes('완료')) {
        this.addLog(executionId, 'assistant', trimmedLine)
        this.updateProgress(executionId, 90)
        return
      }

      // 일반 출력
      this.addLog(executionId, 'info', trimmedLine)
    }
  }

  /**
   * 진행률 설정
   */
  private updateProgress(executionId: string, progress: number): void {
    const instance = this.executions.get(executionId)
    if (!instance) return

    instance.status.progress = Math.max(instance.status.progress, progress)
    instance.emitter.emit('progress', instance.status.progress)
  }

  /**
   * 실행 상태 업데이트
   */
  private updateStatus(
    executionId: string,
    status: ExecutionStatusValue
  ): void {
    const instance = this.executions.get(executionId)
    if (!instance) return

    instance.status.status = status

    if (status === 'completed' || status === 'failed' || status === 'stopped') {
      instance.status.completedAt = new Date().toISOString()
    }

    instance.emitter.emit('status', instance.status)
  }

  /**
   * 로그 추가
   */
  private addLog(
    executionId: string,
    type: LogType,
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    const instance = this.executions.get(executionId)
    if (!instance) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      content,
      metadata,
    }

    instance.status.logs.push(entry)
    instance.emitter.emit('log', entry)
  }

  /**
   * 진행률 증가
   */
  private incrementProgress(executionId: string): void {
    const instance = this.executions.get(executionId)
    if (!instance) return

    // 간단한 진행률 계산 (실제로는 태스크 수 기반으로 개선 필요)
    instance.status.progress = Math.min(
      100,
      instance.status.progress + 10
    )

    instance.emitter.emit('progress', instance.status.progress)
  }

  /**
   * 완료된 태스크 수 계산
   */
  private countCompletedTasks(logs: LogEntry[]): number {
    return logs.filter(
      log =>
        log.type === 'tool_result' &&
        (log.content.includes('완료') || log.content.includes('체크'))
    ).length
  }

  /**
   * 전체 태스크 수 계산
   */
  private countTotalTasks(_logs: LogEntry[]): number {
    // 실제 구현에서는 tasks.md 파싱 결과 사용
    return 0
  }

  /**
   * 실행 중지
   */
  stop(executionId: string): boolean {
    const instance = this.executions.get(executionId)
    if (!instance || !instance.process) return false

    if (instance.timeoutId) {
      clearTimeout(instance.timeoutId)
    }

    // SIGTERM으로 먼저 시도
    instance.process.kill('SIGTERM')

    // 5초 후에도 종료되지 않으면 SIGKILL
    setTimeout(() => {
      if (instance.process && !instance.process.killed) {
        instance.process.kill('SIGKILL')
      }
    }, 5000)

    this.updateStatus(executionId, 'stopped')
    this.addLog(executionId, 'system', '사용자에 의해 중지됨')

    return true
  }

  /**
   * 실행 상태 조회
   */
  getStatus(executionId: string): ExecutionStatus | null {
    const instance = this.executions.get(executionId)
    return instance?.status ?? null
  }

  /**
   * SSE 스트림을 위한 이벤트 구독
   */
  subscribe(executionId: string): EventEmitter | null {
    const instance = this.executions.get(executionId)
    return instance?.emitter ?? null
  }

  /**
   * 히스토리에 추가
   */
  private addToHistory(status: ExecutionStatus): void {
    this.history.unshift({
      id: status.id,
      changeId: status.request.changeId,
      mode: status.request.mode,
      status: status.status,
      startedAt: status.startedAt,
      completedAt: status.completedAt,
      result: status.result,
    })

    // 최대 크기 유지
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize)
    }
  }

  /**
   * 히스토리 조회
   */
  getHistory(limit = 20, changeId?: string): ExecutionHistoryItem[] {
    let items = this.history

    if (changeId) {
      items = items.filter(item => item.changeId === changeId)
    }

    return items.slice(0, limit)
  }

  /**
   * 완료된 실행 정리 (메모리 관리)
   */
  cleanup(): void {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000 // 1시간

    for (const [id, instance] of this.executions.entries()) {
      if (
        instance.status.status !== 'running' &&
        instance.status.completedAt
      ) {
        const completedTime = new Date(instance.status.completedAt).getTime()
        if (now - completedTime > maxAge) {
          this.executions.delete(id)
        }
      }
    }
  }
}

/** 싱글톤 인스턴스 */
export const claudeFlowExecutor = new ClaudeFlowExecutor()

// 주기적 정리 (10분마다)
setInterval(() => claudeFlowExecutor.cleanup(), 10 * 60 * 1000)
