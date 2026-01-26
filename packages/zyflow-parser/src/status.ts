/**
 * Task Status Updater
 * Update task completion status in tasks.md content
 */

import type { LegacyTask, UpdateResult } from './types.js'
import { TasksParser } from './parser.js'
import { LegacyIdResolver } from './id-resolver.js'

/**
 * Set task status (complete/incomplete) in tasks.md content
 * Returns updated content and task info
 */
export function setTaskStatus(
  content: string,
  taskId: string,
  completed: boolean
): UpdateResult {
  const parser = new TasksParser()
  const result = parser.parse('temp', content)
  const resolver = new LegacyIdResolver(result)

  // Warn if legacy ID format
  LegacyIdResolver.warnLegacyId(taskId)

  // Resolve task ID with fallback chain
  const resolved = resolver.resolveWithFallback(taskId)
  if (!resolved) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const { task, group } = resolved

  // Modify the line
  const lines = content.split('\n')
  const lineIndex = task.lineNumber - 1

  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new Error(`Invalid line number: ${task.lineNumber}`)
  }

  const line = lines[lineIndex]

  // Replace checkbox status
  // Pattern: "- [x]" or "- [ ]" with optional leading whitespace
  const newLine = line.replace(
    /^(\s*-\s+\[)([ xX])(\].*)$/,
    `$1${completed ? 'x' : ' '}$3`
  )

  if (newLine === line) {
    throw new Error(`Failed to update task at line ${task.lineNumber}: no checkbox found`)
  }

  lines[lineIndex] = newLine

  // Return result in legacy format
  return {
    newContent: lines.join('\n'),
    task: {
      id: task.id,
      title: task.title,
      completed,
      groupId: task.groupId,
      lineNumber: task.lineNumber,
      indent: task.indent,
      displayId: task.displayId,
    },
  }
}

/**
 * Toggle task completion status
 * Returns updated content and task info
 */
export function toggleTaskStatus(content: string, taskId: string): UpdateResult {
  const parser = new TasksParser()
  const result = parser.parse('temp', content)
  const resolver = new LegacyIdResolver(result)

  // Resolve task ID
  const resolved = resolver.resolveWithFallback(taskId)
  if (!resolved) {
    throw new Error(`Task not found: ${taskId}`)
  }

  // Toggle the status
  const newCompleted = !resolved.task.completed
  return setTaskStatus(content, taskId, newCompleted)
}

/**
 * Mark multiple tasks as complete
 */
export function markTasksComplete(
  content: string,
  taskIds: string[]
): { newContent: string; updated: number } {
  let currentContent = content
  let updated = 0

  for (const taskId of taskIds) {
    try {
      const result = setTaskStatus(currentContent, taskId, true)
      currentContent = result.newContent
      updated++
    } catch {
      // Skip tasks that can't be found
      console.warn(`Could not mark task complete: ${taskId}`)
    }
  }

  return { newContent: currentContent, updated }
}

/**
 * Mark multiple tasks as incomplete
 */
export function markTasksIncomplete(
  content: string,
  taskIds: string[]
): { newContent: string; updated: number } {
  let currentContent = content
  let updated = 0

  for (const taskId of taskIds) {
    try {
      const result = setTaskStatus(currentContent, taskId, false)
      currentContent = result.newContent
      updated++
    } catch {
      // Skip tasks that can't be found
      console.warn(`Could not mark task incomplete: ${taskId}`)
    }
  }

  return { newContent: currentContent, updated }
}
