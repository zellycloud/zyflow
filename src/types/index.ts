// =============================================
// Flow 파이프라인 타입
// =============================================
export type Stage = 'spec' | 'changes' | 'task' | 'code' | 'test' | 'commit' | 'docs'
export type ChangeStatus = 'active' | 'completed' | 'archived'
export type FlowTaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'archived'

// STAGES, STAGE_CONFIG -> @/constants/stages 로 이동

// Stage별 집계 정보
export interface StageInfo {
  stage?: Stage // API 응답에서는 생략될 수 있음
  total: number
  completed: number
  tasks: FlowTask[]
}

// Flow Change (DB 기반)
export interface FlowChange {
  id: string
  projectId: string
  title: string
  specPath?: string
  status: ChangeStatus
  currentStage: Stage
  progress: number // 0-100
  createdAt: string
  updatedAt: string
  // UI용 집계 데이터
  stages?: Record<Stage, StageInfo>
}

// Flow Task (DB 기반)
export interface FlowTask {
  id: number
  changeId?: string // null이면 독립 태스크
  stage: Stage
  title: string
  description?: string
  status: FlowTaskStatus
  priority: 'low' | 'medium' | 'high'
  tags?: string[]
  assignee?: string
  order: number
  // tasks.md 구조 유지 (3단계 계층: ## Major > ### Sub > - Task)
  groupTitle?: string // tasks.md 섹션 제목 (### 1.1 Sub Section)
  groupOrder?: number // 섹션 순서 (majorOrder, e.g., 1, 2, 3)
  taskOrder?: number // 섹션 내 작업 순서
  majorTitle?: string // ## 1. 대제목 (Major Section)
  subOrder?: number // ### 1.x에서 x 값 (Sub Section 순서)
  displayId?: string // 표시용 ID (예: "1.1.1") - 순서 기반 자동 생성
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

// =============================================
// 기존 OpenSpec 타입 (파일 기반 - 호환성 유지)
// =============================================

// OpenSpec Change (proposal)
export interface Change {
  id: string
  title: string
  description?: string
  progress: number // 0-100
  totalTasks: number
  completedTasks: number
  updatedAt?: string // ISO 8601 날짜 문자열 - 문서 최종 수정 시간
}

// Task item from tasks.md
export interface Task {
  id: string
  title: string
  completed: boolean
  groupId: string
  lineNumber: number
  indent?: number // 들여쓰기 레벨 (0=상위, 2+=하위 태스크)
  displayId?: string // 표시용 ID (예: "1.1.1") - 순서 기반 자동 생성
}

// Task group (section in tasks.md)
export interface TaskGroup {
  id: string
  title: string
  tasks: Task[]
  majorOrder?: number // For subsections like "### 1.1", this is 1
  displayId?: string // 표시용 그룹 ID (예: "1.1") - 순서 기반 자동 생성
}

// Parsed tasks.md structure
export interface TasksFile {
  changeId: string
  groups: TaskGroup[]
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface ChangesResponse {
  changes: Change[]
}

export interface TasksResponse {
  changeId: string
  groups: TaskGroup[]
}

export interface ToggleTaskResponse {
  task: Task
}

// Detail plan
export interface DetailPlan {
  taskId: string
  changeId: string
  content: string
  exists: boolean
}

// Spec (capability)
export interface Spec {
  id: string
  title: string
  requirementsCount: number
}

export interface SpecsResponse {
  specs: Spec[]
}

export interface SpecContentResponse {
  id: string
  content: string
}

// Project
export interface Project {
  id: string
  name: string
  path: string
  addedAt: string
}

export interface ProjectsResponse {
  projects: Project[]
  activeProjectId: string | null
}

// Project with full data (changes + specs)
export interface ProjectWithData extends Project {
  changes: Change[]
  specs: Spec[]
}

export interface ProjectsAllDataResponse {
  projects: ProjectWithData[]
  activeProjectId: string | null
}

// =============================================
// Flow API 응답 타입
// =============================================
export interface FlowChangesResponse {
  changes: FlowChange[]
}

export interface FlowChangeDetailResponse {
  change: FlowChange
  stages: Record<Stage, StageInfo>
}

export interface FlowTasksResponse {
  tasks: FlowTask[]
}

export interface FlowSyncResponse {
  synced: number
  created: number
  updated: number
}

// =============================================
// 프로젝트별 Change 집계 API 타입
// =============================================

export interface ProjectChangeCounts {
  active: number
  completed: number
  total: number
}

export interface FlowChangeCountsResponse {
  counts: Record<string, number> // 하위 호환성을 위한 단일 집계
  detailed: Record<string, ProjectChangeCounts> // 상세 집계 (active/completed/total)
}

// =============================================
// Tasks.md 파서 확장 타입
// =============================================

export interface ExtendedTaskGroup extends TaskGroup {
  majorOrder?: number    // "## 1." -> 1
  majorTitle?: string    // "## 1. 데이터베이스 및 기반" -> "데이터베이스 및 기반"
  subOrder?: number      // "### 1.1" -> 1 (second part)
  groupTitle?: string    // 그룹 제목 (title과 동일하지만 명시적)
  groupOrder?: number    // 그룹 순서 (majorOrder와 동일하지만 명시적)
}

export interface ExtendedTasksFile extends TasksFile {
  groups: ExtendedTaskGroup[]
}

// =============================================
// Integration Local Settings 타입
// =============================================

export type SettingsSource = 'local' | 'global' | 'hybrid'

export interface LocalSettingsStatus {
  hasLocal: boolean
  hasGlobal: boolean
  primary: SettingsSource
}

export interface LocalSettingsStatusResponse {
  projectPath: string
  status: LocalSettingsStatus
}

export interface InitLocalSettingsResponse {
  success: boolean
  zyflowPath: string
  created: string[]
}

export interface ExportToLocalResponse {
  success: boolean
  zyflowPath: string
  exported: string[]
}

// =============================================
// Archived Changes 타입
// =============================================

export interface ArchivedChange {
  id: string
  title: string
  progress: number
  totalTasks: number
  completedTasks: number
  archivedAt: string | null
}

export interface ArchivedChangesResponse {
  changes: ArchivedChange[]
}

export interface ArchivedChangeDetail {
  id: string
  files: Record<string, string>
}

export interface ArchivedChangeDetailResponse {
  id: string
  files: Record<string, string>
}

// =============================================
// claude-flow 실행 관련 타입
// =============================================

/** 실행 모드 */
export type ClaudeFlowExecutionMode = 'full' | 'single' | 'analysis'

/** swarm 전략 */
export type ClaudeFlowStrategy = 'development' | 'research' | 'testing'

/** 실행 상태 값 */
export type ClaudeFlowStatusValue =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'

/** 로그 타입 */
export type ClaudeFlowLogType =
  | 'info'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'assistant'
  | 'system'
  | 'progress'

/** AI Provider 타입 (claude-flow Swarm 용) */
export type ClaudeFlowAIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode' | 'custom'

/** 실행 요청 */
export interface ClaudeFlowExecutionRequest {
  projectPath: string
  changeId: string
  taskId?: string
  mode: ClaudeFlowExecutionMode
  strategy?: ClaudeFlowStrategy
  maxAgents?: number
  timeout?: number
  /** AI Provider (v2 - 다중 Provider 지원) */
  provider?: ClaudeFlowAIProvider
  /** 모델 (v2 - 다중 Provider 지원) */
  model?: string
}

/** 로그 항목 */
export interface ClaudeFlowLogEntry {
  timestamp: string
  type: ClaudeFlowLogType
  content: string
  metadata?: Record<string, unknown>
}

/** 실행 결과 */
export interface ClaudeFlowExecutionResult {
  completedTasks: number
  totalTasks: number
  modifiedFiles?: string[]
  error?: string
  exitCode?: number
}

/** 실행 상태 */
export interface ClaudeFlowExecutionStatus {
  id: string
  request: ClaudeFlowExecutionRequest
  status: ClaudeFlowStatusValue
  startedAt: string
  completedAt?: string
  progress: number
  currentTask?: string
  logs: ClaudeFlowLogEntry[]
  result?: ClaudeFlowExecutionResult
}

/** 히스토리 항목 */
export interface ClaudeFlowHistoryItem {
  id: string
  changeId: string
  mode: ClaudeFlowExecutionMode
  status: ClaudeFlowStatusValue
  startedAt: string
  completedAt?: string
  result?: ClaudeFlowExecutionResult
}

/** API 응답: 실행 시작 */
export interface ClaudeFlowExecuteResponse {
  executionId: string
  message: string
}

/** API 응답: 상태 조회 */
export interface ClaudeFlowStatusResponse {
  execution: ClaudeFlowExecutionStatus
}

/** API 응답: 히스토리 */
export interface ClaudeFlowHistoryResponse {
  history: ClaudeFlowHistoryItem[]
}
