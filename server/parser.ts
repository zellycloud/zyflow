import type { TaskGroup, Task, TasksFile } from '../src/types/index.js'

/**
 * Parse tasks.md content into structured data
 */
export function parseTasksFile(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const groups: TaskGroup[] = []
  let currentGroup: TaskGroup | null = null
  let taskIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // Match group headers: ## 1. Section Name
    const groupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/)
    if (groupMatch) {
      const groupId = `group-${groupMatch[1]}`
      const groupTitle = groupMatch[2].trim()
      currentGroup = {
        id: groupId,
        title: groupTitle,
        tasks: [],
      }
      groups.push(currentGroup)
      continue
    }

    // Match task items: - [ ] 1.1 Task title or - [x] 1.1.1 Task title (supports multi-level numbering)
    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+([\d.]+)\s+(.+)$/)
    if (taskMatch && currentGroup) {
      const completed = taskMatch[1].toLowerCase() === 'x'
      const taskNumber = taskMatch[2]
      const taskTitle = taskMatch[3].trim()
      const taskId = `task-${taskNumber.replace(/\./g, '-')}`

      const task: Task = {
        id: taskId,
        title: taskTitle,
        completed,
        groupId: currentGroup.id,
        lineNumber,
      }

      currentGroup.tasks.push(task)
      taskIndex++
    }
  }

  return { changeId, groups }
}

/**
 * Toggle task completion status in file content
 */
export function toggleTaskInFile(
  content: string,
  taskId: string
): { newContent: string; task: Task } {
  const lines = content.split('\n')
  // taskId format: task-1-1-1 -> 1.1.1 (supports multi-level numbering)
  const taskNumber = taskId.replace('task-', '').replace(/-/g, '.')

  let foundTask: Task | null = null
  let currentGroupId = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track current group
    const groupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/)
    if (groupMatch) {
      currentGroupId = `group-${groupMatch[1]}`
    }

    // Find the task line (supports multi-level numbering like 1.1, 1.1.1, 1.1.1.1)
    const taskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)([\d.]+)(\s+.+)$/)
    if (taskMatch && taskMatch[4] === taskNumber) {
      const wasCompleted = taskMatch[2].toLowerCase() === 'x'
      const newCompleted = !wasCompleted
      const newCheckmark = newCompleted ? 'x' : ' '

      lines[i] = `${taskMatch[1]}${newCheckmark}${taskMatch[3]}${taskMatch[4]}${taskMatch[5]}`

      foundTask = {
        id: taskId,
        title: taskMatch[5].trim(),
        completed: newCompleted,
        groupId: currentGroupId,
        lineNumber: i + 1,
      }
      break
    }
  }

  if (!foundTask) {
    throw new Error(`Task not found: ${taskId}`)
  }

  return {
    newContent: lines.join('\n'),
    task: foundTask,
  }
}
