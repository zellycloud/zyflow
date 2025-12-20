/**
 * claude-flow 통합 타입 정의
 * @module server/claude-flow/types
 */

// =============================================
// 실행 요청 타입
// =============================================

/** 실행 모드 */
export type ExecutionMode = 'full' | 'single' | 'analysis'

/** swarm 전략 */
export type SwarmStrategy = 'development' | 'research' | 'testing'

/** AI Provider 타입 */
export type AIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode' | 'custom'

/** 실행 요청 */
export interface ExecutionRequest {
  /** 프로젝트 경로 */
  projectPath: string
  /** OpenSpec Change ID */
  changeId: string
  /** 특정 태스크만 실행 (optional) */
  taskId?: string
  /** 실행 모드 */
  mode: ExecutionMode
  /** swarm 전략 (기본: development) */
  strategy?: SwarmStrategy
  /** 최대 에이전트 수 (기본: 5) */
  maxAgents?: number
  /** 타임아웃 ms (기본: 30분) */
  timeout?: number
  /** AI Provider (기본: claude) */
  provider?: AIProvider
  /** 모델 (Provider별 기본값 사용) */
  model?: string
}

// =============================================
// 실행 상태 타입
// =============================================

/** 실행 상태 값 */
export type ExecutionStatusValue =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'

/** 로그 타입 */
export type LogType =
  | 'info'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'assistant'
  | 'system'
  | 'progress'

/** 로그 항목 */
export interface LogEntry {
  /** 타임스탬프 (ISO 8601) */
  timestamp: string
  /** 로그 타입 */
  type: LogType
  /** 로그 내용 */
  content: string
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>
}

/** 실행 결과 */
export interface ExecutionResult {
  /** 완료된 태스크 수 */
  completedTasks: number
  /** 전체 태스크 수 */
  totalTasks: number
  /** 생성/수정된 파일 목록 */
  modifiedFiles?: string[]
  /** 에러 메시지 (실패 시) */
  error?: string
  /** 종료 코드 */
  exitCode?: number
}

/** 실행 상태 */
export interface ExecutionStatus {
  /** 실행 ID */
  id: string
  /** 실행 요청 정보 */
  request: ExecutionRequest
  /** 현재 상태 */
  status: ExecutionStatusValue
  /** 시작 시간 (ISO 8601) */
  startedAt: string
  /** 완료 시간 (ISO 8601) */
  completedAt?: string
  /** 진행률 (0-100) */
  progress: number
  /** 현재 처리 중인 태스크 */
  currentTask?: string
  /** 로그 항목들 */
  logs: LogEntry[]
  /** 실행 결과 */
  result?: ExecutionResult
}

// =============================================
// API 응답 타입
// =============================================

/** 실행 시작 응답 */
export interface ExecuteResponse {
  /** 실행 ID */
  executionId: string
  /** 메시지 */
  message: string
}

/** 상태 조회 응답 */
export interface StatusResponse {
  execution: ExecutionStatus
}

/** 히스토리 항목 */
export interface ExecutionHistoryItem {
  id: string
  changeId: string
  mode: ExecutionMode
  status: ExecutionStatusValue
  startedAt: string
  completedAt?: string
  result?: ExecutionResult
}

/** 히스토리 조회 응답 */
export interface HistoryResponse {
  history: ExecutionHistoryItem[]
}

/** 중지 응답 */
export interface StopResponse {
  success: boolean
  message: string
}

// =============================================
// SSE 이벤트 타입
// =============================================

/** SSE 이벤트 타입 */
export type SSEEventType =
  | 'log'
  | 'progress'
  | 'status'
  | 'complete'
  | 'error'

/** SSE 이벤트 데이터 */
export interface SSEEvent {
  type: SSEEventType
  data: LogEntry | ExecutionStatus | ExecutionResult
}

// =============================================
// claude-flow 출력 파싱 타입
// =============================================

/** Claude Code stream-json 출력 형식 */
export interface ClaudeFlowOutput {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'error' | 'system' | 'user' | 'result'
  /** 메시지 텍스트 */
  message?: string
  /** subtype (예: 'text' for assistant) */
  subtype?: string
  /** 도구 이름 */
  name?: string
  /** 도구 입력 */
  input?: Record<string, unknown>
  /** 결과 내용 */
  content?: string
  /** 에러 메시지 */
  error?: string
  /** 총 비용 (USD) - result 타입용 */
  total_cost_usd?: number
  /** 실행 시간 (ms) - result 타입용 */
  duration_ms?: number
  /** API 호출 시간 (ms) - result 타입용 */
  duration_api_ms?: number
  /** 세션 ID */
  session_id?: string
}

// =============================================
// 프롬프트 빌더 타입
// =============================================

/** 프롬프트 섹션 */
export interface PromptSection {
  title: string
  content: string
}

/** 프롬프트 빌드 옵션 */
export interface PromptBuildOptions {
  /** CLAUDE.md 전체 포함 여부 (기본: 요약만) */
  includeFullClaudeMd?: boolean
  /** design.md 포함 여부 */
  includeDesign?: boolean
  /** 관련 specs 포함 여부 */
  includeSpecs?: boolean
  /** 최대 토큰 수 제한 */
  maxTokens?: number
}
