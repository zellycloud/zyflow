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
}

// Task item from tasks.md
export interface Task {
  id: string
  title: string
  completed: boolean
  groupId: string
  lineNumber: number
}

// Task group (section in tasks.md)
export interface TaskGroup {
  id: string
  title: string
  tasks: Task[]
  majorOrder?: number // For subsections like "### 1.1", this is 1
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
