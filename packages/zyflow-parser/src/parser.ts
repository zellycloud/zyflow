/**
 * ZyFlow Tasks Parser
 * OpenSpec 1.0 compliant parser for tasks.md files
 */

import { createHash } from 'crypto'
import type {
  ParseResult,
  ParsedPhase,
  ParsedGroup,
  ParsedTask,
  ParseMetadata,
  ParseWarning,
  LegacyTasksFile,
  LegacyTaskGroup,
  SyncTask,
} from './types.js'

/**
 * Regex patterns for parsing
 */
const PATTERNS = {
  // Phase: "## Phase 1: Title" or "## 1. Title" or "## Title"
  phase: [
    /^##\s+Phase\s+(\d+)[:.]?\s*(.*)$/i,
    /^##\s+(\d+)\.\s*(.+)$/,
    /^##\s+([^#\d].+)$/,
  ],

  // Section: "### 1.1 Title" or "#### 1.1 Title" or "### Title"
  section: [
    /^#{3,4}\s+([\d.]+)\s+(.+)$/,
    /^#{3,4}\s+([^#\d].+)$/,
  ],

  // Task: "- [x] Title" with optional indent and task-id prefix
  task: /^(\s*)-\s+\[([ xX])\]\s*(?:task-[\d-]+:\s*)?(.+)$/,
} as const

/**
 * Generate content hash for stable task identification
 * Uses group title + task title to create an 8-char hash
 */
function generateContentHash(groupTitle: string, taskTitle: string): string {
  const content = `${groupTitle}::${taskTitle}`
  return createHash('md5').update(content).digest('hex').substring(0, 8)
}

/**
 * Main parser class for tasks.md files
 */
export class TasksParser {
  private warnings: ParseWarning[] = []

  /**
   * Parse tasks.md content (new API)
   */
  parse(changeId: string, content: string): ParseResult {
    const startTime = performance.now()
    this.warnings = []

    const lines = content.split('\n')
    const phases: ParsedPhase[] = []
    const allGroups: ParsedGroup[] = []

    let currentPhase: ParsedPhase | null = null
    let currentGroup: ParsedGroup | null = null
    let globalGroupIndex = 0
    let phaseIndex = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNumber = i + 1

      // Skip empty lines and title (# header)
      if (!line.trim() || line.startsWith('# ')) continue

      // Phase matching (## headers)
      const phaseMatch = this.matchPhase(line)
      if (phaseMatch) {
        // Save previous group/phase
        if (currentGroup && currentGroup.tasks.length > 0) {
          allGroups.push(currentGroup)
          currentPhase?.groups.push(currentGroup)
        }
        if (currentPhase && currentPhase.groups.length > 0) {
          phases.push(currentPhase)
        }

        currentPhase = {
          index: phaseIndex++,
          title: phaseMatch.title,
          groups: [],
          lineNumber,
        }
        currentGroup = null
        continue
      }

      // Section matching (### or #### headers)
      const sectionMatch = this.matchSection(line)
      if (sectionMatch) {
        // Save previous group
        if (currentGroup && currentGroup.tasks.length > 0) {
          allGroups.push(currentGroup)
          if (currentPhase) {
            currentPhase.groups.push(currentGroup)
          }
        }

        const sectionIndex = currentPhase ? currentPhase.groups.length : 0
        const pIndex = currentPhase ? currentPhase.index : 0

        currentGroup = {
          id: `group-${++globalGroupIndex}`,
          displayId: `${pIndex + 1}.${sectionIndex + 1}`,
          title: sectionMatch.title,
          level: 'section',
          phaseIndex: pIndex,
          sectionIndex,
          globalIndex: globalGroupIndex - 1,
          phaseTitle: currentPhase ? currentPhase.title : undefined,
          tasks: [],
        }
        continue
      }

      // If we have a phase but no section yet, create an implicit section
      if (currentPhase && !currentGroup) {
        currentGroup = {
          id: `group-${++globalGroupIndex}`,
          displayId: `${currentPhase.index + 1}.1`,
          title: currentPhase.title,
          level: 'phase',
          phaseIndex: currentPhase.index,
          sectionIndex: 0,
          globalIndex: globalGroupIndex - 1,
          phaseTitle: currentPhase.title,
          tasks: [],
        }
      }

      // Task matching
      const taskMatch = this.matchTask(line)
      if (taskMatch && currentGroup) {
        const taskIndex = currentGroup.tasks.length
        const isSubtask = taskMatch.indent >= 2

        const task: ParsedTask = {
          id: `task-${globalGroupIndex}-${taskIndex + 1}`,
          displayId: `${currentGroup.displayId}.${taskIndex + 1}`,
          contentHash: generateContentHash(currentGroup.title, taskMatch.title),
          title: taskMatch.title,
          completed: taskMatch.completed,
          indent: taskMatch.indent,
          lineNumber,
          rawLine: line,
          groupId: currentGroup.id,
        }

        // Subtask handling
        if (isSubtask) {
          const parentIndex = this.findParentTaskIndex(currentGroup.tasks, taskMatch.indent)
          if (parentIndex !== -1) {
            task.parentTaskIndex = parentIndex
          } else {
            this.warnings.push({
              type: 'orphan-subtask',
              message: `Subtask without parent: ${taskMatch.title}`,
              lineNumber,
            })
          }
        }

        currentGroup.tasks.push(task)
      }
    }

    // Save remaining group/phase
    if (currentGroup && currentGroup.tasks.length > 0) {
      allGroups.push(currentGroup)
      currentPhase?.groups.push(currentGroup)
    }
    if (currentPhase && currentPhase.groups.length > 0) {
      phases.push(currentPhase)
    }

    // Calculate metadata
    const metadata = this.calculateMetadata(allGroups, startTime)

    return {
      changeId,
      phases,
      groups: allGroups,
      metadata,
    }
  }

  /**
   * Parse with legacy API (backward compatible)
   */
  parseLegacy(changeId: string, content: string): LegacyTasksFile {
    const result = this.parse(changeId, content)
    return this.convertToLegacy(result)
  }

  /**
   * Convert ParseResult to SyncTask array for DB synchronization
   */
  toSyncTasks(result: ParseResult): SyncTask[] {
    const syncTasks: SyncTask[] = []

    for (const group of result.groups) {
      for (let i = 0; i < group.tasks.length; i++) {
        const task = group.tasks[i]

        syncTasks.push({
          displayId: task.displayId,
          title: task.title,
          completed: task.completed,
          lineNumber: task.lineNumber,
          groupTitle: group.title,
          groupOrder: group.globalIndex + 1, // 1-based
          taskOrder: i + 1,
          majorTitle: group.phaseTitle ?? group.title,
          majorOrder: group.phaseIndex + 1, // 1-based
          subOrder: group.sectionIndex + 1, // 1-based
        })
      }
    }

    return syncTasks
  }

  /**
   * Match phase header (## level)
   */
  private matchPhase(line: string): { title: string } | null {
    if (!line.startsWith('##') || line.startsWith('###')) return null

    for (const pattern of PATTERNS.phase) {
      const match = line.match(pattern)
      if (match) {
        // "Phase N: Title" or "N. Title" -> extract title
        const title = match[2]?.trim() || match[1]?.trim() || ''
        return { title }
      }
    }
    return null
  }

  /**
   * Match section header (### or #### level)
   */
  private matchSection(line: string): { title: string } | null {
    if (!line.startsWith('###')) return null

    for (const pattern of PATTERNS.section) {
      const match = line.match(pattern)
      if (match) {
        // "1.1 Title" -> "Title" or just "Title"
        const title = match[2]?.trim() || match[1]?.trim() || ''
        return { title }
      }
    }
    return null
  }

  /**
   * Match task line
   */
  private matchTask(
    line: string
  ): { title: string; completed: boolean; indent: number } | null {
    const match = line.match(PATTERNS.task)
    if (!match) return null

    const indent = (match[1] || '').length
    const completed = match[2].toLowerCase() === 'x'
    const title = match[3]?.trim() || ''

    // Skip if title is empty or looks like a header
    if (!title || title.startsWith('#')) return null

    return { title, completed, indent }
  }

  /**
   * Find parent task index for subtask
   */
  private findParentTaskIndex(tasks: ParsedTask[], childIndent: number): number {
    // Search backwards for task with smaller indent
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (tasks[i].indent < childIndent) {
        return i
      }
    }
    return -1
  }

  /**
   * Calculate parse metadata
   */
  private calculateMetadata(groups: ParsedGroup[], startTime: number): ParseMetadata {
    let totalTasks = 0
    let completedTasks = 0

    for (const group of groups) {
      totalTasks += group.tasks.length
      completedTasks += group.tasks.filter((t) => t.completed).length
    }

    return {
      totalTasks,
      completedTasks,
      totalGroups: groups.length,
      format: 'openspec-1.0',
      parseTime: performance.now() - startTime,
      warnings: this.warnings,
    }
  }

  /**
   * Convert ParseResult to legacy format
   */
  private convertToLegacy(result: ParseResult): LegacyTasksFile {
    const groups: LegacyTaskGroup[] = result.groups.map((g) => ({
      id: g.id,
      title: g.title,
      displayId: g.displayId,
      phaseIndex: g.phaseIndex,
      groupIndex: g.sectionIndex,
      majorOrder: g.phaseIndex + 1,
      majorTitle: g.phaseTitle,
      subOrder: g.sectionIndex + 1,
      groupTitle: g.title,
      groupOrder: g.globalIndex + 1,
      tasks: g.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        groupId: g.id,
        lineNumber: t.lineNumber,
        indent: t.indent,
        displayId: t.displayId,
      })),
    }))

    return { changeId: result.changeId, groups }
  }
}

// Singleton instance for convenience
export const parser = new TasksParser()

/**
 * Parse tasks.md file (backward compatible function)
 */
export function parseTasksFile(changeId: string, content: string): LegacyTasksFile {
  return parser.parseLegacy(changeId, content)
}
