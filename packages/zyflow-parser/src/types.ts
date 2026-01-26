/**
 * ZyFlow Parser Types
 * OpenSpec 1.0 compliant task parsing types
 */

/**
 * Task completion status
 */
export type TaskStatus = 'pending' | 'completed'

/**
 * Parsed task from tasks.md
 */
export interface ParsedTask {
  // === Identifiers ===
  /** Internal ID: "task-{groupIdx}-{taskIdx}" */
  id: string
  /** Display ID: "1.1.1" (sequence-based) */
  displayId: string
  /** Content hash for stable identification (8 chars) */
  contentHash: string

  // === Content ===
  title: string
  completed: boolean

  // === Hierarchy ===
  /** Indentation level (0, 2, 4) */
  indent: number
  /** Parent task index for subtasks */
  parentTaskIndex?: number

  // === File Reference ===
  lineNumber: number
  /** Original line (for debugging) */
  rawLine: string

  // === Relations ===
  groupId: string
}

/**
 * Parsed group (section) from tasks.md
 */
export interface ParsedGroup {
  // === Identifiers ===
  /** Group ID: "group-{idx}" */
  id: string
  /** Display ID: "1.1" */
  displayId: string

  // === Content ===
  title: string

  // === Hierarchy ===
  /** Header level: 'phase' (##) or 'section' (###) */
  level: 'phase' | 'section'
  /** Phase index (0-based) */
  phaseIndex: number
  /** Section index within phase (0-based) */
  sectionIndex: number
  /** Global group index (0-based) */
  globalIndex: number

  // === Parent Reference ===
  /** Parent phase title */
  phaseTitle?: string

  // === Tasks ===
  tasks: ParsedTask[]
}

/**
 * Parsed phase (top-level ## header)
 */
export interface ParsedPhase {
  /** Phase index (0-based) */
  index: number
  title: string
  groups: ParsedGroup[]
  lineNumber: number
}

/**
 * Complete parse result
 */
export interface ParseResult {
  changeId: string
  phases: ParsedPhase[]
  /** Flat list of all groups (for backward compatibility) */
  groups: ParsedGroup[]
  metadata: ParseMetadata
}

/**
 * Parse metadata
 */
export interface ParseMetadata {
  totalTasks: number
  completedTasks: number
  totalGroups: number
  /** Detected format */
  format: 'openspec-1.0' | 'legacy'
  /** Parse time in ms */
  parseTime: number
  warnings: ParseWarning[]
}

/**
 * Parse warning
 */
export interface ParseWarning {
  type: 'duplicate-id' | 'orphan-subtask' | 'invalid-indent' | 'unknown-format'
  message: string
  lineNumber?: number
}

/**
 * Resolved task with full context
 */
export interface ResolvedTask {
  task: ParsedTask
  group: ParsedGroup
  phase: ParsedPhase
}

/**
 * Task for DB synchronization (sync-tasks.ts compatible)
 */
export interface SyncTask {
  displayId: string
  title: string
  completed: boolean
  lineNumber: number

  // Hierarchy info (DB column mapping)
  groupTitle: string
  /** Global group order (1-based) */
  groupOrder: number
  /** Task order within group (1-based) */
  taskOrder: number
  /** Phase title */
  majorTitle: string
  /** Phase order (1-based) */
  majorOrder: number
  /** Section order within phase (1-based) */
  subOrder: number
}

// ============================================================
// Legacy Types (Backward Compatibility)
// ============================================================

/**
 * Legacy TaskGroup (existing interface)
 */
export interface LegacyTaskGroup {
  id: string
  title: string
  tasks: LegacyTask[]
  displayId?: string
  phaseIndex?: number
  groupIndex?: number
  majorOrder?: number
  majorTitle?: string
  subOrder?: number
  groupTitle?: string
  groupOrder?: number
}

/**
 * Legacy Task (existing interface)
 */
export interface LegacyTask {
  id: string
  title: string
  completed: boolean
  groupId: string
  lineNumber: number
  indent?: number
  displayId?: string
}

/**
 * Legacy TasksFile (existing interface)
 */
export interface LegacyTasksFile {
  changeId: string
  groups: LegacyTaskGroup[]
}

/**
 * Status update result
 */
export interface UpdateResult {
  newContent: string
  task: LegacyTask
}
