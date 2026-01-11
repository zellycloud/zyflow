/**
 * ADK Configuration
 *
 * Google ADK 기반 멀티 에이전트 시스템 설정
 */

export interface ADKConfig {
  apiKey: string
  model: string
  maxRetries: number
  timeout: number
}

// 기본 설정
export const defaultConfig: ADKConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: 'gemini-2.0-flash-exp',
  maxRetries: 3,
  timeout: 120000, // 2분
}

/**
 * 설정 검증
 */
export function validateConfig(config: ADKConfig): void {
  if (!config.apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }
}

/**
 * 환경별 설정 로드
 */
export function loadConfig(): ADKConfig {
  const config: ADKConfig = {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || defaultConfig.model,
    maxRetries: parseInt(process.env.ADK_MAX_RETRIES || '3', 10),
    timeout: parseInt(process.env.ADK_TIMEOUT || '120000', 10),
  }

  return config
}
