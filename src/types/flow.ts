/**
 * Flow API Types with MoAI SPEC Support
 *
 * Discriminated union types for handling both OpenSpec and MoAI SPEC formats
 */

// =============================================
// Stage Types
// =============================================
export type Stage = 'spec' | 'changes' | 'task' | 'code' | 'test' | 'commit' | 'docs'
export type ChangeStatus = 'active' | 'completed' | 'archived'
export type FlowTaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'archived'

// =============================================
// OpenSpec Change Type (File-based, for backward compatibility)
// =============================================
export interface OpenSpecChange {
  type: 'openspec'
  id: string
  title: string
  description?: string
  progress: number // 0-100
  totalTasks: number
  completedTasks: number
  updatedAt?: string // ISO 8601 date string
}

// =============================================
// MoAI SPEC Type (MoAI Framework)
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

export interface MoaiSpec {
  type: 'spec'
  id: string
  specId?: string // SPEC-XXX format
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

// =============================================
// Discriminated Union Type
// =============================================
/**
 * FlowItem represents either an OpenSpec change or a MoAI SPEC
 * Use the `type` discriminator to distinguish between them
 *
 * @example
 * ```tsx
 * const items: FlowItem[] = await fetchFlowItems()
 * items.forEach(item => {
 *   if (item.type === 'spec') {
 *     // Handle MoAI SPEC
 *     console.log(item.spec.requirements)
 *   } else if (item.type === 'openspec') {
 *     // Handle OpenSpec change
 *     console.log(item.description)
 *   }
 * })
 * ```
 */
export type FlowItem = OpenSpecChange | MoaiSpec

// =============================================
// Type Guards for Discriminated Union
// =============================================
/**
 * Type guard to check if a FlowItem is an OpenSpec change
 */
export function isOpenSpecChange(item: FlowItem): item is OpenSpecChange {
  return item.type === 'openspec'
}

/**
 * Type guard to check if a FlowItem is a MoAI SPEC
 */
export function isMoaiSpec(item: FlowItem): item is MoaiSpec {
  return item.type === 'spec'
}

// =============================================
// Stage Info (for database queries)
// =============================================
export interface StageInfo {
  stage?: Stage
  total: number
  completed: number
  tasks: FlowTask[]
}

// =============================================
// Flow Change (Database-based)
// =============================================
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
  stages?: Record<Stage, StageInfo>
  // UI 집계 데이터 (Change 상세 조회 시 포함)
  completedTasks?: number
  totalTasks?: number
}

// =============================================
// Task Origin Type
// =============================================
export type TaskOrigin = 'openspec' | 'inbox' | 'imported' | 'backlog'

// =============================================
// Flow Task (Database-based)
// =============================================
export interface FlowTask {
  id: number
  changeId?: string
  stage: Stage
  origin?: TaskOrigin
  title: string
  description?: string
  status: FlowTaskStatus
  priority: 'low' | 'medium' | 'high'
  tags?: string[]
  assignee?: string
  order: number
  groupTitle?: string
  groupOrder?: number
  taskOrder?: number
  majorTitle?: string
  subOrder?: number
  displayId?: string

  // Backlog-specific fields
  parentTaskId?: number
  blockedBy?: string[]
  plan?: string
  acceptanceCriteria?: string
  notes?: string
  dueDate?: string
  milestone?: string
  backlogFileId?: string

  createdAt: string
  updatedAt: string
  archivedAt?: string
}

// =============================================
// Legacy Types (for backward compatibility)
// =============================================

// Legacy Change type (same as OpenSpecChange)
export interface Change extends OpenSpecChange {
  type: 'openspec'
}

// Task item from tasks.md
export interface Task {
  id: string
  title: string
  completed: boolean
  groupId: string
  lineNumber: number
  indent?: number
  displayId?: string
}

// Task group (section in tasks.md)
export interface TaskGroup {
  id: string
  title: string
  tasks: Task[]
  majorOrder?: number
  displayId?: string
}

// Parsed tasks.md structure
export interface TasksFile {
  changeId: string
  groups: TaskGroup[]
}

// =============================================
// API Response Wrapper
// =============================================
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  details?: unknown
}

// =============================================
// Response Types
// =============================================

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

export interface DetailPlan {
  taskId: string
  changeId: string
  content: string
  exists: boolean
}

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
// Flow API Response Types
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
// Change Counts Response
// =============================================
export interface ProjectChangeCounts {
  active: number
  completed: number
  total: number
}

export interface FlowChangeCountsResponse {
  counts: Record<string, number>
  detailed: Record<string, ProjectChangeCounts>
}

// =============================================
// Extended Types
// =============================================

export interface ExtendedTaskGroup extends TaskGroup {
  majorOrder?: number
  majorTitle?: string
  subOrder?: number
  groupTitle?: string
  groupOrder?: number
}

export interface ExtendedTasksFile extends TasksFile {
  groups: ExtendedTaskGroup[]
}

// =============================================
// Settings & Integration Types
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
// Archived Changes
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
