/**
 * AI Execution API Types
 * @module server/ai/types
 */

// =============================================
// Provider 타입
// =============================================

/** AI Provider 타입 */
export type AIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode' | 'custom'

/** Provider별 기본 설정 */
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
// 실행 요청 타입
// =============================================

/** AI 실행 요청 */
export interface AIExecuteRequest {
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
  /** 프로젝트 경로 */
  projectPath?: string
}

/** AI 실행 시작 응답 */
export interface AIExecuteResponse {
  /** 성공 여부 */
  success: boolean
  /** 실행 ID (세션 ID) */
  runId?: string
  /** 에러 메시지 */
  error?: string
}

/** AI 실행 중지 응답 */
export interface AIStopResponse {
  /** 성공 여부 */
  success: boolean
  /** 에러 메시지 */
  error?: string
}

// =============================================
// 메시지 타입 (SSE 스트리밍)
// =============================================

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

// =============================================
// Provider 목록 응답
// =============================================

/** Provider 목록 응답 */
export interface AIProvidersResponse {
  /** Provider 목록 */
  providers: AIProviderConfig[]
}

// =============================================
// 실행 상태
// =============================================

/** AI 실행 상태 */
export type AIExecutionStatus = 'idle' | 'running' | 'completed' | 'error'

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
