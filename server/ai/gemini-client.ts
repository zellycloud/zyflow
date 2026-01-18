/**
 * Gemini REST API Client with Claude Code CLI Fallback
 *
 * Gemini REST API를 사용한 AI 코드 분석 및 수정
 * - gemini-3-flash-preview (1차)
 * - Claude Code CLI 폴백 (2차)
 * - 레이트 리밋 및 재시도
 */

import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

// Rate limiter
class RateLimiter {
  private tokens: number
  private maxTokens: number
  private refillRate: number // tokens per second
  private lastRefill: number

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens
    this.tokens = maxTokens
    this.refillRate = refillRate
    this.lastRefill = Date.now()
  }

  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.refillRate * 1000
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      this.refill()
    }

    this.tokens -= 1
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }
}

export interface GeminiConfig {
  model?: string
  maxRetries?: number
  timeout?: number
  apiKey?: string
  enableClaudeFallback?: boolean
}

export interface GenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  stopSequences?: string[]
}

export interface GeminiResponse {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason?: string
  provider?: 'gemini' | 'claude'
}

export class GeminiClient {
  private model: string
  private rateLimiter: RateLimiter
  private maxRetries: number
  private timeout: number
  private apiKey: string
  private enableClaudeFallback: boolean
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  constructor(config: GeminiConfig = {}) {
    this.model = config.model || 'gemini-3-flash-preview'
    // 60 requests per minute = 1 request per second
    this.rateLimiter = new RateLimiter(60, 1)
    this.maxRetries = config.maxRetries ?? 3
    this.timeout = config.timeout ?? 120000 // 120 seconds
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || ''
    this.enableClaudeFallback = config.enableClaudeFallback ?? true
  }

  /**
   * Gemini API가 사용 가능한지 확인
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}?key=${this.apiKey}`
      )
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Claude Code CLI가 사용 가능한지 확인
   */
  async isClaudeAvailable(): Promise<boolean> {
    try {
      await execAsync('which claude')
      return true
    } catch {
      return false
    }
  }

  /**
   * 텍스트 생성 (Gemini 1차 → Claude 2차)
   */
  async generate(prompt: string, options?: GenerationOptions): Promise<GeminiResponse> {
    await this.rateLimiter.acquire()

    // 1차: Gemini API 시도
    try {
      const result = await this.executeGeminiAPI(prompt, options)
      console.log(`[AI] Gemini ${this.model} succeeded`)
      return { ...result, provider: 'gemini' }
    } catch (geminiError) {
      console.log(`[AI] Gemini failed: ${geminiError}`)

      // 2차: Claude Code CLI 폴백
      if (this.enableClaudeFallback) {
        try {
          console.log('[AI] Falling back to Claude Code CLI...')
          const result = await this.executeClaudeCLI(prompt)
          console.log('[AI] Claude Code CLI succeeded')
          return { ...result, provider: 'claude' }
        } catch (claudeError) {
          console.log(`[AI] Claude Code CLI failed: ${claudeError}`)
          throw new Error(`Both Gemini and Claude failed. Gemini: ${geminiError}, Claude: ${claudeError}`)
        }
      }

      throw geminiError
    }
  }

  /**
   * 구조화된 JSON 출력 생성
   */
  async generateJSON<T>(prompt: string, options?: GenerationOptions): Promise<T> {
    const jsonPrompt = `${prompt}

IMPORTANT: Your response must be valid JSON only. Do not include any markdown code blocks, explanations, or other text. Start directly with { or [ and end with } or ].`

    const response = await this.generate(jsonPrompt, options)

    try {
      // JSON 블록 추출 시도
      let jsonText = response.text.trim()

      // markdown 코드 블록 제거
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7)
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3)
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3)
      }

      return JSON.parse(jsonText.trim()) as T
    } catch {
      throw new Error(`Failed to parse JSON response: ${response.text.slice(0, 200)}...`)
    }
  }

  /**
   * 코드 분석 전용 메서드
   */
  async analyzeCode(code: string, errorMessage: string, context?: string): Promise<GeminiResponse> {
    const prompt = `You are an expert code analyzer. Analyze the following code error and provide a fix.

## Error Message
${errorMessage}

## Code
\`\`\`
${code}
\`\`\`

${context ? `## Additional Context\n${context}` : ''}

## Task
1. Identify the root cause of the error
2. Explain why this error occurred
3. Provide a corrected version of the code

Respond in JSON format:
{
  "rootCause": "Brief explanation of the root cause",
  "explanation": "Detailed explanation of why this happened",
  "fixedCode": "The corrected code",
  "confidence": 0.0-1.0
}`

    return this.generate(prompt, {
      temperature: 0.2, // 낮은 temperature로 일관성 유지
      maxTokens: 4096,
    })
  }

  /**
   * 에러 수정 제안 생성
   */
  async suggestFix(
    errorType: string,
    errorMessage: string,
    codeSnippet: string,
    filePath: string
  ): Promise<{
    fix: string
    explanation: string
    confidence: number
  }> {
    const prompt = `You are an expert code fixer. Generate a fix for the following error.

## Error Type: ${errorType}
## Error Message: ${errorMessage}
## File: ${filePath}

## Code with Error:
\`\`\`
${codeSnippet}
\`\`\`

Generate a minimal fix that resolves the error. Respond in JSON format:
{
  "fix": "The corrected code snippet (only the changed parts)",
  "explanation": "Brief explanation of the fix",
  "confidence": 0.0-1.0
}`

    return this.generateJSON<{
      fix: string
      explanation: string
      confidence: number
    }>(prompt, {
      temperature: 0.1,
      maxTokens: 2048,
    })
  }

  /**
   * Gemini REST API 실행
   */
  private async executeGeminiAPI(
    prompt: string,
    options?: GenerationOptions
  ): Promise<GeminiResponse> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`

    const body = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 8192,
        topP: options?.topP ?? 0.95,
        topK: options?.topK ?? 40,
      }
    }

    let lastError: Error | undefined

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || response.statusText
          throw new Error(`Gemini API error ${response.status}: ${errorMessage}`)
        }

        const data = await response.json() as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>
            }
            finishReason?: string
          }>
          usageMetadata?: {
            promptTokenCount?: number
            candidatesTokenCount?: number
            totalTokenCount?: number
          }
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const finishReason = data.candidates?.[0]?.finishReason

        return {
          text,
          finishReason,
          usage: data.usageMetadata ? {
            promptTokens: data.usageMetadata.promptTokenCount || 0,
            completionTokens: data.usageMetadata.candidatesTokenCount || 0,
            totalTokenCount: data.usageMetadata.totalTokenCount || 0,
          } as { promptTokens: number; completionTokens: number; totalTokens: number } : undefined,
        }
      } catch (error) {
        lastError = error as Error

        // 재시도 불가능한 에러
        if (!this.isRetryableError(error)) {
          throw error
        }

        // 지수 백오프
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        console.log(`[Gemini] Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('Max retries exceeded')
  }

  /**
   * Claude Code CLI 실행
   */
  private async executeClaudeCLI(prompt: string): Promise<GeminiResponse> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-p', prompt,
        '--output-format', 'text',
        '--allowedTools', 'Read,Grep,Glob',
        '--dangerously-skip-permissions',
      ]

      const proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeout,
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM')
        reject(new Error('Claude CLI timeout'))
      }, this.timeout)

      proc.on('close', (code) => {
        clearTimeout(timeoutId)

        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`))
          return
        }

        resolve({
          text: stdout.trim(),
          finishReason: 'stop',
        })
      })

      proc.on('error', (error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
    })
  }

  /**
   * 재시도 가능한 에러인지 확인
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return (
        message.includes('rate limit') ||
        message.includes('quota') ||
        message.includes('timeout') ||
        message.includes('temporarily') ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('aborted')
      )
    }
    return false
  }

  /**
   * 현재 모델 정보 반환
   */
  getModel(): string {
    return this.model
  }

  /**
   * 모델 변경
   */
  setModel(model: string): void {
    this.model = model
  }
}

// 싱글톤 인스턴스
let clientInstance: GeminiClient | null = null

export function getGeminiClient(): GeminiClient {
  if (!clientInstance) {
    clientInstance = new GeminiClient()
  }
  return clientInstance
}

/**
 * 테스트용 클라이언트 생성
 */
export function createTestClient(model?: string): GeminiClient {
  return new GeminiClient({ model })
}

/**
 * AI 상태 정보 반환
 */
export async function getAIStatus(): Promise<{
  gemini: { available: boolean; model: string }
  claude: { available: boolean; version: string | null }
}> {
  const client = getGeminiClient()

  const [geminiAvailable, claudeAvailable] = await Promise.all([
    client.isAvailable(),
    client.isClaudeAvailable(),
  ])

  let claudeVersion: string | null = null
  if (claudeAvailable) {
    try {
      const { stdout } = await execAsync('claude --version')
      claudeVersion = stdout.trim()
    } catch {
      // ignore
    }
  }

  return {
    gemini: {
      available: geminiAvailable,
      model: client.getModel(),
    },
    claude: {
      available: claudeAvailable,
      version: claudeVersion,
    },
  }
}
