/**
 * Consensus 패턴 - 다중 AI 합의 시스템
 * @module server/claude-flow/consensus
 *
 * 여러 AI Provider의 결과를 수집하고 합의하여 최종 결과 도출
 */

import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type { AIProvider, ConsensusConfig, ConsensusStrategy, ProviderResult, ConsensusResult } from './types.js'

// Re-export types for convenience
export type { ConsensusStrategy, ConsensusConfig, ProviderResult, ConsensusResult }

/** Provider별 기본 모델 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude: 'sonnet',
  gemini: 'gemini-2.5-flash',
  codex: 'codex-latest',
  qwen: 'qwen-coder',
  kilo: 'kilo-latest',
  opencode: 'opencode-latest',
  custom: ''
}

/** Provider별 기본 가중치 (신뢰도 점수) */
const DEFAULT_WEIGHTS: Record<AIProvider, number> = {
  claude: 1.0,      // 가장 높은 신뢰도
  gemini: 0.85,
  codex: 0.8,
  qwen: 0.75,
  kilo: 0.7,
  opencode: 0.7,
  custom: 0.5
}

/** Execution options for consensus */
export interface ConsensusExecutionOptions {
  /** Working directory for CLI execution */
  projectPath: string
  /** Models to use per provider (optional, uses defaults if not specified) */
  models?: Partial<Record<AIProvider, string>>
  /** Progress callback */
  onProgress?: (provider: AIProvider, status: 'started' | 'completed' | 'failed', result?: ProviderResult) => void
}

/**
 * Consensus 실행기 - 여러 AI Provider를 병렬로 실행하고 결과를 합의
 */
export class ConsensusExecutor extends EventEmitter {
  private config: ConsensusConfig

  constructor(config: ConsensusConfig) {
    super()
    this.config = {
      ...config,
      weights: config.weights ?? DEFAULT_WEIGHTS,
      timeout: config.timeout ?? 300000, // 5분 기본 타임아웃
      threshold: config.threshold ?? 0.5
    }
  }

  /**
   * 다중 Provider 병렬 실행 및 합의
   */
  async execute(prompt: string, options: ConsensusExecutionOptions): Promise<ConsensusResult> {
    this.emit('start', { providers: this.config.providers })

    const results = await this.runProviders(prompt, options)
    const consensus = this.computeConsensus(results)

    this.emit('complete', consensus)
    return consensus
  }

  /**
   * 모든 Provider 병렬 실행
   */
  private async runProviders(prompt: string, options: ConsensusExecutionOptions): Promise<ProviderResult[]> {
    const promises = this.config.providers.map(async (provider) => {
      options.onProgress?.(provider, 'started')

      try {
        const result = await this.runSingleProvider(provider, prompt, options)
        options.onProgress?.(provider, result.success ? 'completed' : 'failed', result)
        return result
      } catch (error) {
        const failResult: ProviderResult = {
          provider,
          success: false,
          output: '',
          duration: 0,
          error: error instanceof Error ? error.message : String(error)
        }
        options.onProgress?.(provider, 'failed', failResult)
        return failResult
      }
    })

    // 타임아웃 적용
    const timeoutPromise = new Promise<ProviderResult[]>((_, reject) => {
      setTimeout(() => reject(new Error(`Consensus timeout after ${this.config.timeout}ms`)), this.config.timeout)
    })

    try {
      return await Promise.race([Promise.all(promises), timeoutPromise])
    } catch (error) {
      // 타임아웃 발생 시 현재까지의 결과 반환
      const partialResults = await Promise.allSettled(promises)
      return partialResults.map((result, i) => {
        if (result.status === 'fulfilled') return result.value
        return {
          provider: this.config.providers[i],
          success: false,
          output: '',
          duration: 0,
          error: 'Timeout'
        }
      })
    }
  }

  /**
   * Provider별 CLI 명령어 생성
   */
  private buildProviderCommand(provider: AIProvider, model?: string): { command: string; args: string[] } {
    switch (provider) {
      case 'claude':
        const claudeArgs = ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions']
        if (model) {
          const modelMap: Record<string, string> = {
            'opus': 'claude-opus-4-5-20251101',
            'sonnet': 'claude-sonnet-4-20250514',
            'haiku': 'claude-3-5-haiku-20241022',
          }
          claudeArgs.push('--model', modelMap[model] || model)
        }
        return { command: 'claude', args: claudeArgs }

      case 'gemini':
        return { command: 'gemini', args: model ? ['--model', model] : [] }

      case 'codex':
        return { command: 'codex', args: model ? ['--model', model] : [] }

      case 'qwen':
        return { command: 'qwen', args: model ? ['--model', model] : [] }

      case 'kilo':
        return { command: 'kilo', args: model ? ['--model', model] : [] }

      case 'opencode':
        return { command: 'opencode', args: model ? ['--model', model] : [] }

      default:
        return { command: 'claude', args: ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'] }
    }
  }

  /**
   * 단일 Provider 실행 - 실제 CLI 호출
   */
  private async runSingleProvider(
    provider: AIProvider,
    prompt: string,
    options: ConsensusExecutionOptions
  ): Promise<ProviderResult> {
    const start = Date.now()
    const model = options.models?.[provider] ?? DEFAULT_MODELS[provider]
    const { command, args } = this.buildProviderCommand(provider, model)

    // 프롬프트를 임시 파일로 저장
    const promptId = randomUUID().slice(0, 8)
    const promptFile = join(tmpdir(), `consensus-prompt-${provider}-${promptId}.txt`)
    const scriptFile = join(tmpdir(), `consensus-runner-${provider}-${promptId}.sh`)

    try {
      await writeFile(promptFile, prompt, 'utf-8')

      // 래퍼 스크립트 생성
      const scriptContent = `#!/bin/bash
cd "${options.projectPath}"
exec ${command} ${args.join(' ')} < "${promptFile}"
`
      await writeFile(scriptFile, scriptContent, { mode: 0o755 })

      // CLI 실행
      const output = await this.executeCommand(scriptFile, options.projectPath, provider)

      // 파일 정리
      await Promise.all([unlink(promptFile), unlink(scriptFile)]).catch(() => {})

      // 출력에서 confidence 추출 (가능한 경우)
      const confidence = this.extractConfidence(output, provider)

      return {
        provider,
        model,
        success: true,
        output,
        confidence,
        duration: Date.now() - start
      }
    } catch (error) {
      // 파일 정리
      await Promise.all([unlink(promptFile), unlink(scriptFile)]).catch(() => {})

      return {
        provider,
        model,
        success: false,
        output: '',
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * CLI 명령 실행
   */
  private executeCommand(scriptFile: string, cwd: string, provider: AIProvider): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', [scriptFile], {
        cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe']
      })

      proc.stdin?.end()

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      // Provider별 타임아웃 (기본 5분)
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM')
        reject(new Error(`${provider} execution timeout`))
      }, this.config.timeout)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve(this.extractOutput(stdout, provider))
        } else {
          reject(new Error(`${provider} exited with code ${code}: ${stderr || stdout}`))
        }
      })

      proc.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * Provider 출력에서 최종 응답 추출
   */
  private extractOutput(rawOutput: string, provider: AIProvider): string {
    if (provider === 'claude') {
      // Claude JSON stream에서 assistant 메시지 추출
      const lines = rawOutput.split('\n').filter(Boolean)
      const messages: string[] = []

      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          if (json.type === 'assistant' && json.subtype === 'text' && json.message) {
            messages.push(json.message)
          }
        } catch {
          // JSON이 아닌 라인 무시
        }
      }

      return messages.join('\n') || rawOutput
    }

    // 다른 Provider는 raw output 반환
    return rawOutput.trim()
  }

  /**
   * 출력에서 confidence 점수 추출 (가능한 경우)
   */
  private extractConfidence(output: string, provider: AIProvider): number {
    // 기본 신뢰도 점수 (Provider 기본값 사용)
    const baseConfidence = DEFAULT_WEIGHTS[provider]

    // 출력 길이/품질 기반 보정
    const hasContent = output.length > 100
    const hasCodeBlocks = output.includes('```')
    const hasStructure = output.includes('\n\n') || output.includes('##')

    let confidence = baseConfidence
    if (hasContent) confidence += 0.05
    if (hasCodeBlocks) confidence += 0.05
    if (hasStructure) confidence += 0.05

    return Math.min(confidence, 1.0)
  }

  /**
   * Consensus 계산
   */
  private computeConsensus(results: ProviderResult[]): ConsensusResult {
    const successfulResults = results.filter(r => r.success)

    if (successfulResults.length === 0) {
      return {
        success: false,
        strategy: this.config.strategy,
        finalOutput: '',
        confidence: 0,
        providerResults: results,
        agreement: 0,
        metadata: {
          totalProviders: results.length,
          successfulProviders: 0,
          averageDuration: 0
        }
      }
    }

    let finalOutput: string
    let confidence: number
    let agreement: number

    switch (this.config.strategy) {
      case 'majority':
        ({ output: finalOutput, confidence, agreement } = this.majorityVote(successfulResults))
        break
      case 'weighted':
        ({ output: finalOutput, confidence, agreement } = this.weightedVote(successfulResults))
        break
      case 'unanimous':
        ({ output: finalOutput, confidence, agreement } = this.unanimousVote(successfulResults))
        break
      case 'best-of-n':
        ({ output: finalOutput, confidence, agreement } = this.bestOfN(successfulResults))
        break
      default:
        finalOutput = successfulResults[0].output
        confidence = successfulResults[0].confidence || 0.5
        agreement = 1 / successfulResults.length
    }

    return {
      success: true,
      strategy: this.config.strategy,
      finalOutput,
      confidence,
      providerResults: results,
      agreement,
      metadata: {
        totalProviders: results.length,
        successfulProviders: successfulResults.length,
        averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length
      }
    }
  }

  private majorityVote(results: ProviderResult[]): { output: string; confidence: number; agreement: number } {
    // 유사도 기반 그룹화 (Jaccard similarity 사용)
    const groups = this.groupBySimilarity(results, this.config.threshold ?? 0.5)

    // 가장 큰 그룹 찾기
    let largestGroup: ProviderResult[] = []
    for (const group of groups) {
      if (group.length > largestGroup.length) {
        largestGroup = group
      }
    }

    if (largestGroup.length === 0) {
      return { output: '', confidence: 0, agreement: 0 }
    }

    const agreement = largestGroup.length / results.length

    // 그룹 내에서 가장 높은 confidence를 가진 결과 선택
    const bestInGroup = largestGroup.reduce((best, current) =>
      (current.confidence ?? 0) > (best.confidence ?? 0) ? current : best
    )

    // 합의 수준에 따른 confidence 보정
    const adjustedConfidence = (bestInGroup.confidence ?? 0.5) * (0.5 + agreement * 0.5)

    return {
      output: bestInGroup.output,
      confidence: adjustedConfidence,
      agreement
    }
  }

  private weightedVote(results: ProviderResult[]): { output: string; confidence: number; agreement: number } {
    const weights = this.config.weights || {}
    let maxWeight = 0
    let bestResult: ProviderResult | null = null

    for (const result of results) {
      const weight = weights[result.provider] || 1
      const score = weight * (result.confidence || 0.5)

      if (score > maxWeight) {
        maxWeight = score
        bestResult = result
      }
    }

    return {
      output: bestResult?.output || '',
      confidence: bestResult?.confidence || 0.5,
      agreement: 1 / results.length // 가중 투표는 단일 선택
    }
  }

  private unanimousVote(results: ProviderResult[]): { output: string; confidence: number; agreement: number } {
    // 모든 결과가 유사한지 확인
    const firstHash = this.hashOutput(results[0].output)
    const unanimous = results.every(r => this.hashOutput(r.output) === firstHash)

    if (unanimous) {
      const avgConfidence = results.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / results.length
      return {
        output: results[0].output,
        confidence: avgConfidence,
        agreement: 1
      }
    }

    return {
      output: '',
      confidence: 0,
      agreement: 0
    }
  }

  private bestOfN(results: ProviderResult[]): { output: string; confidence: number; agreement: number } {
    // 가장 높은 confidence를 가진 결과 선택
    let best: ProviderResult = results[0]

    for (const result of results) {
      if ((result.confidence || 0) > (best.confidence || 0)) {
        best = result
      }
    }

    return {
      output: best.output,
      confidence: best.confidence || 0.5,
      agreement: 1 / results.length
    }
  }

  /**
   * 출력 해시 (유사성 비교용)
   * 간단한 n-gram 기반 해시 + 정규화
   */
  private hashOutput(output: string): string {
    // 정규화: 공백 제거, 소문자 변환, 특수문자 제거
    const normalized = output
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9가-힣\s]/g, '')

    // 핵심 키워드 추출 (첫 200자)
    return normalized.substring(0, 200)
  }

  /**
   * 두 출력 간의 유사도 계산 (0-1)
   * Jaccard similarity 기반
   */
  private calculateSimilarity(output1: string, output2: string): number {
    const words1 = new Set(output1.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const words2 = new Set(output2.toLowerCase().split(/\s+/).filter(w => w.length > 2))

    if (words1.size === 0 && words2.size === 0) return 1
    if (words1.size === 0 || words2.size === 0) return 0

    const intersection = new Set([...words1].filter(w => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  /**
   * 결과들을 유사도 기반으로 그룹화
   */
  private groupBySimilarity(results: ProviderResult[], threshold = 0.5): ProviderResult[][] {
    const groups: ProviderResult[][] = []

    for (const result of results) {
      let addedToGroup = false

      for (const group of groups) {
        // 그룹의 첫 번째 결과와 유사도 비교
        const similarity = this.calculateSimilarity(result.output, group[0].output)
        if (similarity >= threshold) {
          group.push(result)
          addedToGroup = true
          break
        }
      }

      if (!addedToGroup) {
        groups.push([result])
      }
    }

    return groups
  }
}

/**
 * Consensus 실행기 생성 헬퍼
 */
export function createConsensusExecutor(config: ConsensusConfig): ConsensusExecutor {
  return new ConsensusExecutor(config)
}

/**
 * 사용 가능한 Provider 목록 조회
 */
export async function getAvailableProviders(): Promise<AIProvider[]> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)

  const providers: AIProvider[] = []
  const providerCommands: Record<AIProvider, string> = {
    claude: 'claude --version',
    gemini: 'gemini --version',
    codex: 'codex --version',
    qwen: 'qwen --version',
    kilo: 'kilo --version',
    opencode: 'opencode --version',
    custom: ''
  }

  for (const [provider, command] of Object.entries(providerCommands)) {
    if (!command) continue

    try {
      await execAsync(command, { timeout: 5000 })
      providers.push(provider as AIProvider)
    } catch {
      // Provider not available
    }
  }

  return providers
}
