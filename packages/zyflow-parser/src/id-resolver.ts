/**
 * Legacy ID Resolver
 * Resolves various legacy ID formats to ParsedTask
 */

import type { ParseResult, ParsedTask, ParsedGroup, ParsedPhase, ResolvedTask } from './types.js'

/**
 * Legacy ID format patterns
 */
const LEGACY_PATTERNS = {
  // task-1-1 (Phase-Task)
  phaseTask: /^task-(\d+)-(\d+)$/,
  // task-group-2-1 (Group-Task)
  groupTask: /^task-group-(\d+)-(\d+)$/,
  // 1.1.1 (displayId)
  displayId: /^(\d+)\.(\d+)\.(\d+)$/,
  // 1.1 (group displayId)
  groupDisplayId: /^(\d+)\.(\d+)$/,
  // Content hash (8 hex chars)
  contentHash: /^[a-f0-9]{8}$/,
}

/**
 * ID type enumeration
 */
type IdType = 'internal' | 'displayId' | 'phaseTask' | 'groupTask' | 'contentHash' | 'title' | 'unknown'

/**
 * Detect ID type from string
 */
function detectIdType(id: string): IdType {
  // Internal ID: task-N-M (not containing 'group')
  if (id.startsWith('task-') && !id.includes('group')) {
    if (LEGACY_PATTERNS.phaseTask.test(id)) return 'phaseTask'
    return 'internal'
  }

  // Group-Task ID: task-group-N-M
  if (id.includes('group')) return 'groupTask'

  // Display ID: N.N.N
  if (LEGACY_PATTERNS.displayId.test(id)) return 'displayId'

  // Content hash: 8 hex chars
  if (LEGACY_PATTERNS.contentHash.test(id)) return 'contentHash'

  // Assume title match for anything else
  return 'title'
}

/**
 * Legacy ID Resolver class
 * Resolves various ID formats to ParsedTask with full context
 */
export class LegacyIdResolver {
  private parseResult: ParseResult
  private taskByHash: Map<string, { task: ParsedTask; group: ParsedGroup }>
  private taskByDisplayId: Map<string, { task: ParsedTask; group: ParsedGroup }>

  constructor(parseResult: ParseResult) {
    this.parseResult = parseResult
    this.taskByHash = new Map()
    this.taskByDisplayId = new Map()

    // Build indexes
    for (const group of parseResult.groups) {
      for (const task of group.tasks) {
        this.taskByHash.set(task.contentHash, { task, group })
        this.taskByDisplayId.set(task.displayId, { task, group })
      }
    }
  }

  /**
   * Resolve any ID format to ResolvedTask
   */
  resolve(taskId: string): ResolvedTask | null {
    const idType = detectIdType(taskId)

    switch (idType) {
      case 'internal':
        return this.resolveByInternalId(taskId)
      case 'displayId':
        return this.resolveByDisplayId(taskId)
      case 'phaseTask':
        return this.resolveByPhaseTask(taskId)
      case 'groupTask':
        return this.resolveByGroupTask(taskId)
      case 'contentHash':
        return this.resolveByContentHash(taskId)
      case 'title':
        return this.resolveByTitle(taskId)
      default:
        return null
    }
  }

  /**
   * Resolve multiple ID formats with fallback chain
   * Tries each format in order: displayId -> contentHash -> internal -> title
   */
  resolveWithFallback(taskId: string): ResolvedTask | null {
    // Try direct resolution first
    const direct = this.resolve(taskId)
    if (direct) return direct

    // Fallback chain
    const resolved =
      this.resolveByDisplayId(taskId) ||
      this.resolveByContentHash(taskId) ||
      this.resolveByInternalId(taskId) ||
      this.resolveByTitle(taskId)

    return resolved
  }

  /**
   * Resolve by internal ID (task-3-1)
   */
  private resolveByInternalId(id: string): ResolvedTask | null {
    for (const group of this.parseResult.groups) {
      for (const task of group.tasks) {
        if (task.id === id) {
          const phase = this.findPhase(group.phaseIndex)
          return phase ? { task, group, phase } : null
        }
      }
    }
    return null
  }

  /**
   * Resolve by display ID (1.1.1)
   */
  private resolveByDisplayId(displayId: string): ResolvedTask | null {
    const result = this.taskByDisplayId.get(displayId)
    if (!result) return null

    const phase = this.findPhase(result.group.phaseIndex)
    return phase ? { task: result.task, group: result.group, phase } : null
  }

  /**
   * Resolve by Phase-Task format (task-1-1)
   */
  private resolveByPhaseTask(id: string): ResolvedTask | null {
    const match = id.match(LEGACY_PATTERNS.phaseTask)
    if (!match) return null

    const phaseNum = parseInt(match[1], 10) // 1-based
    const taskNum = parseInt(match[2], 10) // 1-based

    const phase = this.parseResult.phases[phaseNum - 1]
    if (!phase) return null

    // Flatten all tasks in the phase and find by index
    let taskIndex = 0
    for (const group of phase.groups) {
      for (const task of group.tasks) {
        taskIndex++
        if (taskIndex === taskNum) {
          return { task, group, phase }
        }
      }
    }
    return null
  }

  /**
   * Resolve by Group-Task format (task-group-2-1)
   */
  private resolveByGroupTask(id: string): ResolvedTask | null {
    const match = id.match(LEGACY_PATTERNS.groupTask)
    if (!match) return null

    const groupNum = parseInt(match[1], 10) // 1-based
    const taskNum = parseInt(match[2], 10) // 1-based

    const group = this.parseResult.groups[groupNum - 1]
    if (!group) return null

    const task = group.tasks[taskNum - 1]
    if (!task) return null

    const phase = this.findPhase(group.phaseIndex)
    return phase ? { task, group, phase } : null
  }

  /**
   * Resolve by content hash
   */
  private resolveByContentHash(hash: string): ResolvedTask | null {
    const result = this.taskByHash.get(hash)
    if (!result) return null

    const phase = this.findPhase(result.group.phaseIndex)
    return phase ? { task: result.task, group: result.group, phase } : null
  }

  /**
   * Resolve by title (partial match)
   */
  private resolveByTitle(titlePattern: string): ResolvedTask | null {
    const pattern = titlePattern.toLowerCase()

    for (const group of this.parseResult.groups) {
      for (const task of group.tasks) {
        if (task.title.toLowerCase().includes(pattern)) {
          const phase = this.findPhase(group.phaseIndex)
          return phase ? { task, group, phase } : null
        }
      }
    }
    return null
  }

  /**
   * Find phase by index
   */
  private findPhase(phaseIndex: number): ParsedPhase | undefined {
    return this.parseResult.phases[phaseIndex]
  }

  /**
   * Check if ID is in legacy format
   */
  static isLegacyFormat(id: string): boolean {
    const idType = detectIdType(id)
    return idType === 'phaseTask' || idType === 'groupTask'
  }

  /**
   * Emit deprecation warning for legacy ID
   */
  static warnLegacyId(id: string): void {
    if (LegacyIdResolver.isLegacyFormat(id)) {
      console.warn(`[DEPRECATED] Legacy task ID format: ${id}`)
      console.warn(`Use displayId format instead: X.X.X`)
    }
  }
}

/**
 * Create resolver for parse result
 */
export function createResolver(parseResult: ParseResult): LegacyIdResolver {
  return new LegacyIdResolver(parseResult)
}
