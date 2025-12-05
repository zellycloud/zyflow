// MCP Server specific types

export interface Task {
  id: string
  title: string
  completed: boolean
  groupId: string
  lineNumber: number
  indent?: number // 들여쓰기 레벨 (0=상위, 2+=하위 태스크)
}

export interface TaskGroup {
  id: string
  title: string
  tasks: Task[]
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
