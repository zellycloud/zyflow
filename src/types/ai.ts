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
