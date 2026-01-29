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
  completedTasks?: number
  totalTasks?: number
}

// Task Origin 타입
export type TaskOrigin = 'openspec' | 'inbox' | 'imported' | 'backlog'

// Flow Task (DB 기반)
export interface FlowTask {
  id: number
  changeId?: string // null이면 독립 태스크
  stage: Stage
  origin?: TaskOrigin // 태스크 출처
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

  // =============================================
  // Backlog.md 확장 필드 (origin='backlog' 전용)
  // =============================================
  parentTaskId?: number // 서브태스크 부모 ID
  blockedBy?: string[] // 의존하는 태스크 ID 목록
  plan?: string // ## Plan 섹션 (마크다운)
  acceptanceCriteria?: string // ## Acceptance Criteria 섹션 (마크다운)
  notes?: string // ## Notes 섹션 (마크다운)
  dueDate?: string // 마감일 (ISO 8601)
  milestone?: string // 마일스톤/스프린트 이름
  backlogFileId?: string // backlog/*.md 파일의 task-id (예: "task-007")

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

// =============================================
// MoAI SPEC 타입 (타입 안전성 강화)
// =============================================
export interface MoaiSpecRequirement {
  id: string
  title: string
  description: string
  type: 'functional' | 'non-functional' | 'constraint'
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface MoaiSpecAcceptanceCriteria {
  id: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface MoaiSpecProgress {
  completed: number
  total: number
  percentage: number
}

// OpenSpec 변경 사항 - discriminator 추가
export interface OpenSpecChangeWithType extends Change {
  type: 'openspec'
}

// MoAI SPEC
export interface MoaiSpecWithType {
  type: 'spec'
  id: string
  specId?: string
  title: string
  status: ChangeStatus
  progress: MoaiSpecProgress
  spec: {
    content: string
    requirements: MoaiSpecRequirement[]
  }
  plan: {
    content: string
    tags: Array<{
      id: string
      name: string
      color?: string
    }>
    progress: MoaiSpecProgress
  }
  acceptance: {
    content: string
    criteria: MoaiSpecAcceptanceCriteria[]
  }
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

// Discriminated Union Type
export type FlowItem = OpenSpecChangeWithType | MoaiSpecWithType

// =============================================
// Type Guards
// =============================================
export function isOpenSpecChange(item: FlowItem): item is OpenSpecChangeWithType {
  return item.type === 'openspec'
}

export function isMoaiSpec(item: FlowItem): item is MoaiSpecWithType {
  return item.type === 'spec'
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

// =============================================
// 원격 연결 타입
// =============================================
export type RemoteConnectionType = 'ssh' | 'docker' | 'wsl'
export type RemoteAuthType = 'password' | 'privateKey' | 'agent'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface SSHAuthConfig {
  type: RemoteAuthType
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export interface RemoteServer {
  id: string
  name: string
  host: string
  port: number
  auth: SSHAuthConfig
  createdAt: string
  lastConnectedAt?: string
  status?: ConnectionStatus
  error?: string
}

export interface RemoteFileEntry {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modifiedAt: string
  permissions: string
}

export interface RemoteDirectoryListing {
  path: string
  entries: RemoteFileEntry[]
}

// Project
export interface Project {
  id: string
  name: string
  path: string
  addedAt: string
  // 원격 연결 정보 (optional - 로컬 프로젝트는 없음)
  remote?: {
    type: RemoteConnectionType
    serverId: string
    host: string
    user: string
  }
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
// Remote Server API 타입
// =============================================
export interface RemoteServersResponse {
  servers: RemoteServer[]
}

export interface RemoteServerResponse {
  server: RemoteServer
}

export interface TestConnectionResponse {
  success: boolean
  message: string
  serverInfo?: {
    os: string
    hostname: string
  }
}

export interface BrowseRemoteResponse {
  listing: RemoteDirectoryListing
}

export interface AddRemoteServerRequest {
  name: string
  host: string
  port?: number
  auth: SSHAuthConfig
}

export interface AddRemoteProjectRequest {
  serverId: string
  name: string
  path: string
}

// SSH Config Host (from ~/.ssh/config)
export interface SSHConfigHost {
  name: string
  hostName: string
  user: string
  port: number
  identityFile?: string
}

export interface SSHConfigResponse {
  hosts: SSHConfigHost[]
}

// =============================================
// Swarm 실행 관련 타입
// =============================================

/** 실행 모드 */
export type SwarmExecutionMode = 'full' | 'single' | 'analysis'

/** swarm 전략 */
export type SwarmStrategy = 'development' | 'research' | 'testing'

/** 실행 상태 값 */
export type SwarmStatusValue =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'

/** 로그 타입 */
export type SwarmLogType =
  | 'info'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'assistant'
  | 'system'
  | 'progress'

/** AI Provider 타입 */
export type SwarmAIProvider = 'claude' | 'gemini' | 'codex' | 'qwen' | 'kilo' | 'opencode' | 'custom'

/** 실행 요청 */
export interface SwarmExecutionRequest {
  projectPath: string
  changeId: string
  taskId?: string
  mode: SwarmExecutionMode
  strategy?: SwarmStrategy
  maxAgents?: number
  timeout?: number
  /** AI Provider (v2 - 다중 Provider 지원) */
  provider?: SwarmAIProvider
  /** 모델 (v2 - 다중 Provider 지원) */
  model?: string
}

/** 로그 항목 */
export interface SwarmLogEntry {
  timestamp: string
  type: SwarmLogType
  content: string
  metadata?: Record<string, unknown>
}

/** 실행 결과 */
export interface SwarmExecutionResult {
  completedTasks: number
  totalTasks: number
  modifiedFiles?: string[]
  error?: string
  exitCode?: number
}

/** 실행 상태 */
export interface SwarmExecutionStatus {
  id: string
  request: SwarmExecutionRequest
  status: SwarmStatusValue
  startedAt: string
  completedAt?: string
  progress: number
  currentTask?: string
  logs: SwarmLogEntry[]
  result?: SwarmExecutionResult
}

/** 히스토리 항목 */
export interface SwarmHistoryItem {
  id: string
  changeId: string
  mode: SwarmExecutionMode
  status: SwarmStatusValue
  startedAt: string
  completedAt?: string
  result?: SwarmExecutionResult
}

/** API 응답: 실행 시작 */
export interface SwarmExecuteResponse {
  executionId: string
  message: string
}

/** API 응답: 상태 조회 */
export interface SwarmStatusResponse {
  execution: SwarmExecutionStatus
}

/** API 응답: 히스토리 */
export interface SwarmHistoryResponse {
  history: SwarmHistoryItem[]
}

// =============================================
// 하위 호환성 alias (deprecated)
// =============================================
/** @deprecated SwarmExecutionMode 사용 권장 */
export type ClaudeFlowExecutionMode = SwarmExecutionMode
/** @deprecated SwarmStrategy 사용 권장 */
export type ClaudeFlowStrategy = SwarmStrategy
/** @deprecated SwarmStatusValue 사용 권장 */
export type ClaudeFlowStatusValue = SwarmStatusValue
/** @deprecated SwarmLogType 사용 권장 */
export type ClaudeFlowLogType = SwarmLogType
/** @deprecated SwarmAIProvider 사용 권장 */
export type ClaudeFlowAIProvider = SwarmAIProvider
/** @deprecated SwarmExecutionRequest 사용 권장 */
export type ClaudeFlowExecutionRequest = SwarmExecutionRequest
/** @deprecated SwarmLogEntry 사용 권장 */
export type ClaudeFlowLogEntry = SwarmLogEntry
/** @deprecated SwarmExecutionResult 사용 권장 */
export type ClaudeFlowExecutionResult = SwarmExecutionResult
/** @deprecated SwarmExecutionStatus 사용 권장 */
export type ClaudeFlowExecutionStatus = SwarmExecutionStatus
/** @deprecated SwarmHistoryItem 사용 권장 */
export type ClaudeFlowHistoryItem = SwarmHistoryItem
/** @deprecated SwarmExecuteResponse 사용 권장 */
export type ClaudeFlowExecuteResponse = SwarmExecuteResponse
/** @deprecated SwarmStatusResponse 사용 권장 */
export type ClaudeFlowStatusResponse = SwarmStatusResponse
/** @deprecated SwarmHistoryResponse 사용 권장 */
export type ClaudeFlowHistoryResponse = SwarmHistoryResponse

// =============================================
// UI Navigation Types
// =============================================
export type SelectedItem =
  | { type: 'project'; projectId: string }
  | { type: 'change'; projectId: string; changeId: string }
  | { type: 'spec'; projectId: string; specId: string }
  | { type: 'standalone-tasks'; projectId: string }
  | { type: 'backlog'; projectId: string }
  | { type: 'project-settings'; projectId: string }
  | { type: 'agent'; projectId: string; changeId?: string }
  | { type: 'archived'; projectId: string; archivedChangeId?: string }
  | { type: 'docs'; projectId: string; docPath?: string }
  | { type: 'alerts'; projectId: string }
  | { type: 'settings' }
  | null

