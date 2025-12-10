// MCP Server specific types

export interface Task {
  id: string
  title: string
  completed: boolean
  groupId: string
  lineNumber: number
  indent?: number // 들여쓰기 레벨 (0=상위, 2+=하위 태스크)
  displayId?: string // 표시용 ID (예: "1.1.1") - 순서 기반 자동 생성
}

export interface TaskGroup {
  id: string
  title: string
  tasks: Task[]
  displayId?: string // 표시용 그룹 ID (예: "1.1") - 순서 기반 자동 생성
  phaseIndex?: number // Phase 내 순서 (0-based)
  groupIndex?: number // 전체 그룹 순서 (0-based)
}

export interface TasksFile {
  changeId: string
  groups: TaskGroup[]
}

export interface Change {
  id: string
  title: string
  description?: string
  progress: number
  totalTasks: number
  completedTasks: number
}

export interface TaskContext {
  changeId: string
  proposal: string
  relatedSpec?: string
  suggestedFiles: string[]
  completedTasks: string[]
  remainingTasks: number
}

export interface NextTaskResponse {
  task: Task | null
  context: TaskContext
  group: string
}

export interface TaskContextResponse {
  task: Task
  context: TaskContext
  group: string
}
