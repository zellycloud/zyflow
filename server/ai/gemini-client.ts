/**
 * Gemini API Client
 *
 * Google Gemini API 직접 통합
 * - gemini-2.0-flash 모델 사용
 * - 레이트 리밋 (60 req/min)
 * - 스트리밍 응답 지원
 * - 에러 핸들링 및 재시도
 */

import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai'

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
  apiKey: string
  model?: string
  maxRetries?: number
  timeout?: number
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
}

export class GeminiClient {
  private client: GoogleGenerativeAI
  private model: GenerativeModel
  private rateLimiter: RateLimiter
  private maxRetries: number
  private timeout: number

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error('GEMINI_API_KEY is required')
    }

    this.client = new GoogleGenerativeAI(config.apiKey)
    this.model = this.client.getGenerativeModel({
      model: config.model || 'gemini-2.0-flash-exp',
    })

    // 60 requests per minute = 1 request per second
    this.rateLimiter = new RateLimiter(60, 1)
    this.maxRetries = config.maxRetries ?? 3
    this.timeout = config.timeout ?? 60000 // 60 seconds
  }

  /**
   * 텍스트 생성
   */
  async generate(prompt: string, options?: GenerationOptions): Promise<GeminiResponse> {
    await this.rateLimiter.acquire()

    let lastError: Error | undefined

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.generateWithTimeout(prompt, options)
        return this.parseResult(result)
      } catch (error) {
        lastError = error as Error

        // 재시도 가능한 에러인지 확인
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
   * 스트리밍 생성 (async generator)
   */
  async *generateStream(
    prompt: string,
    options?: GenerationOptions
  ): AsyncGenerator<string, void, unknown> {
    await this.rateLimiter.acquire()

    const generationConfig = this.buildGenerationConfig(options)

    const result = await this.model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    })

    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) {
        yield text
      }
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
   * 타임아웃 포함 생성
   */
  private async generateWithTimeout(
    prompt: string,
    options?: GenerationOptions
  ): Promise<GenerateContentResult> {
    const generationConfig = this.buildGenerationConfig(options)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      })

      return result
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * GenerationConfig 빌드
   */
  private buildGenerationConfig(options?: GenerationOptions) {
    return {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 8192,
      topP: options?.topP ?? 0.95,
      topK: options?.topK,
      stopSequences: options?.stopSequences,
    }
  }

  /**
   * 결과 파싱
   */
  private parseResult(result: GenerateContentResult): GeminiResponse {
    const response = result.response
    const text = response.text()

    return {
      text,
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
      finishReason: response.candidates?.[0]?.finishReason,
    }
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
        message.includes('429')
      )
    }
    return false
  }
}

// 싱글톤 인스턴스 (환경변수에서 API 키 로드)
let clientInstance: GeminiClient | null = null

export function getGeminiClient(): GeminiClient {
  if (!clientInstance) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    clientInstance = new GeminiClient({ apiKey })
  }
  return clientInstance
}

/**
 * 테스트용 클라이언트 생성
 */
export function createTestClient(apiKey: string): GeminiClient {
  return new GeminiClient({ apiKey })
}
