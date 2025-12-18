/**
 * claude-flow 실행 관리자
 * @module server/claude-flow/executor
 */

import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
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
   * claude-flow 프로세스 시작
   */
  private async startProcess(
    executionId: string,
    prompt: string,
    timeout: number
  ): Promise<void> {
    const instance = this.executions.get(executionId)
    if (!instance) return

    this.updateStatus(executionId, 'running')
    this.addLog(executionId, 'system', 'claude-flow 프로세스 시작...')

    try {
      // claude-flow swarm 명령 실행
      const args = [
        'claude-flow@alpha',
        'swarm',
        prompt,
        '--claude',
        '--stream-json',
      ]

      // 전략 설정
      if (instance.status.request.strategy) {
        args.push('--strategy', instance.status.request.strategy)
      }

      // 최대 에이전트 수
      if (instance.status.request.maxAgents) {
        args.push('--max-agents', String(instance.status.request.maxAgents))
      }

      const proc = spawn('npx', args, {
        cwd: instance.status.request.projectPath,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
        },
        shell: true,
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
        buffer += data.toString()
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
   * claude-flow 출력 파싱
   */
  private parseOutput(executionId: string, line: string): void {
    try {
      const output: ClaudeFlowOutput = JSON.parse(line)

      let logType: LogType = 'info'
      let content = ''

      switch (output.type) {
        case 'assistant':
          logType = 'assistant'
          content = output.message ?? ''
          break
        case 'tool_use':
          logType = 'tool_use'
          content = `Tool: ${output.name}`
          this.addLog(executionId, logType, content, {
            name: output.name,
            input: output.input,
          })
          return
        case 'tool_result':
          logType = 'tool_result'
          content = output.content?.substring(0, 500) ?? ''
          break
        case 'error':
          logType = 'error'
          content = output.error ?? output.message ?? ''
          break
        case 'system':
          logType = 'system'
          content = output.message ?? ''
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
        output.content?.includes('체크박스')
      ) {
        this.incrementProgress(executionId)
      }
    } catch {
      // JSON 파싱 실패시 일반 로그로 처리
      if (line.trim()) {
        this.addLog(executionId, 'info', line)
      }
    }
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
