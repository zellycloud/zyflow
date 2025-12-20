/**
 * AI Provider 타입 정의
 * @module types/ai
 */

// =============================================
// Provider 타입
// =============================================

/** AI Provider 타입 */
export type AIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode' | 'custom'

/** Provider별 설정 정보 */
export interface AIProviderConfig {
  id: AIProvider
  name: string
  icon: string
  enabled: boolean
  available: boolean
  selectedModel?: string
  availableModels: string[]
  order: number
}

// =============================================
// 실행 상태 타입
// =============================================

/** AI 실행 상태 */
export type AIExecutionStatus = 'idle' | 'running' | 'completed' | 'error'

/** AI 메시지 타입 */
export type AIMessageType = 'start' | 'output' | 'text' | 'stderr' | 'complete' | 'error'

/** AI SSE 메시지 */
export interface AIMessage {
  /** 메시지 타입 */
  type: AIMessageType
  /** 실행 ID */
  runId?: string
  /** Provider */
  provider?: AIProvider
  /** 모델 */
  model?: string
  /** Task ID */
  taskId?: string
  /** Change ID */
  changeId?: string
  /** 데이터 (tool_use 등) */
  data?: {
    type?: string
    message?: { content?: string }
    name?: string
    input?: Record<string, unknown>
    content?: string
  }
  /** 텍스트 내용 */
  content?: string
  /** 완료 상태 */
  status?: 'completed' | 'error'
  /** 종료 코드 */
  exitCode?: number
  /** 에러 메시지 */
  message?: string
  /** 타임스탬프 */
  timestamp?: string
}

/** AI 실행 정보 */
export interface AIExecution {
  /** 실행 ID */
  runId: string | null
  /** Provider */
  provider: AIProvider | null
  /** 모델 */
  model: string | null
  /** 상태 */
  status: AIExecutionStatus
  /** 메시지 목록 */
  messages: AIMessage[]
  /** 에러 */
  error: string | null
}

// =============================================
// 요청/응답 타입
// =============================================

/** AI 실행 요청 파라미터 */
export interface AIExecuteParams {
  /** AI Provider */
  provider: AIProvider
  /** 모델 (선택, 미지정 시 기본 모델 사용) */
  model?: string
  /** Change ID */
  changeId: string
  /** Task ID */
  taskId: string
  /** Task Title */
  taskTitle: string
  /** 추가 컨텍스트 */
  context?: string
}

/** Provider 목록 응답 */
export interface AIProvidersResponse {
  providers: AIProviderConfig[]
}

// =============================================
// 유틸리티 타입
// =============================================

/** Provider별 아이콘 매핑 */
export const PROVIDER_ICONS: Record<AIProvider, string> = {
  claude: '🤖',
  gemini: '💎',
  codex: '🧠',
  qwen: '🌟',
  kilo: '⚡',
  opencode: '🔓',
  custom: '🔧',
}

/** Provider별 기본 모델 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude: 'sonnet',
  gemini: 'gemini-2.5-flash',
  codex: 'gpt-5.1-codex',
  qwen: 'qwen-coder-plus',
  kilo: '',
  opencode: '',
  custom: '',
}

// =============================================
// Consensus 타입
// =============================================

/** Consensus 전략 */
export type ConsensusStrategy =
  | 'majority'     // 다수결 (가장 많이 나온 결과 채택)
  | 'weighted'     // 가중 투표 (Provider별 신뢰도 기반)
  | 'unanimous'    // 만장일치 (모든 AI가 동의해야 함)
  | 'best-of-n'    // N개 중 최고 품질 선택

/** Consensus 설정 */
export interface ConsensusConfig {
  strategy: ConsensusStrategy
  providers: AIProvider[]
  /** 가중치 (weighted 전략용) */
  weights?: Partial<Record<AIProvider, number>>
  /** 최소 합의 비율 (0-1) */
  threshold?: number
  /** 타임아웃 (ms) */
  timeout?: number
}

/** 개별 Provider 결과 */
export interface ProviderResult {
  provider: AIProvider
  model?: string
  success: boolean
  output: string
  confidence?: number
  duration: number
  error?: string
}

/** Consensus 결과 */
export interface ConsensusResult {
  success: boolean
  strategy: ConsensusStrategy
  finalOutput: string
  confidence: number
  providerResults: ProviderResult[]
  agreement: number
  metadata: {
    totalProviders: number
    successfulProviders: number
    averageDuration: number
  }
}

/** Consensus 추천 정보 */
export interface ConsensusRecommendation {
  shouldUseConsensus: boolean
  strategy: ConsensusStrategy
  providers: AIProvider[]
  reason: string
}
