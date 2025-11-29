import type { TaskGroup, Task, TasksFile } from '../src/types/index.js'

/**
 * Extended TaskGroup with hierarchy info for 3-level structure
 * ## 1. Major Section (majorOrder=1, majorTitle="데이터베이스 및 기반")
 * ### 1.1 Sub Section (majorOrder=1, subOrder=1, title="1.1 DB 스키마 확장")
 * - [ ] 1.1.1 Task (taskOrder=1)
 */
interface ExtendedTaskGroup extends TaskGroup {
  majorOrder?: number    // "## 1." -> 1
  majorTitle?: string    // "## 1. 데이터베이스 및 기반" -> "데이터베이스 및 기반"
  subOrder?: number      // "### 1.1" -> 1 (second part)
}

/**
 * Parse tasks.md content into structured data
 * Supports 3-level hierarchy:
 * - Major groups: "## 1. Section" or "## Phase 0: Section"
 * - Sub groups: "### 1.1 Subsection"
 * - Tasks: "- [ ] 1.1.1 Task"
 */
export function parseTasksFile(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const groups: ExtendedTaskGroup[] = []
  let currentGroup: ExtendedTaskGroup | null = null
  let currentMajorOrder = 0
  let currentMajorTitle = ''
  let groupCounter = 0
  let taskCounter = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // Match major group headers: "## 1. Section Name"
    const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/)
    // Match phase format: "## Phase 0: Section Name"
    const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i)
    // Match plain format: "## Section Name"
    const plainGroupMatch = line.match(/^##\s+(.+)$/)

    if (numberedGroupMatch) {
      currentMajorOrder = parseInt(numberedGroupMatch[1])
      currentMajorTitle = numberedGroupMatch[2].trim()
      // Don't create group yet, wait for ### subsection or tasks
      taskCounter = 0
      continue
    }

    if (phaseGroupMatch) {
      currentMajorOrder = parseInt(phaseGroupMatch[1])
      currentMajorTitle = `Phase ${phaseGroupMatch[1]}: ${phaseGroupMatch[2].trim()}`
      const groupId = `group-phase-${phaseGroupMatch[1]}`
      currentGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle
      }
      groups.push(currentGroup)
      taskCounter = 0
      continue
    }

    // Match subsection headers: "### 1.1 Subsection Name"
    const subsectionMatch = line.match(/^###\s+([\d.]+)\s+(.+)$/)
    if (subsectionMatch) {
      const subsectionNumber = subsectionMatch[1] // "1.1"
      const parts = subsectionNumber.split('.')
      const majorNum = parseInt(parts[0]) // 1
      const subNum = parts.length > 1 ? parseInt(parts[1]) : 1 // 1

      // Use current major info if available, otherwise derive from subsection number
      const effectiveMajorOrder = currentMajorOrder || majorNum
      const effectiveMajorTitle = currentMajorTitle || `Section ${majorNum}`

      const groupId = `group-${subsectionNumber.replace(/\./g, '-')}`
      const groupTitle = `${subsectionNumber} ${subsectionMatch[2].trim()}`

      currentGroup = {
        id: groupId,
        title: groupTitle,
        tasks: [],
        majorOrder: effectiveMajorOrder,
        majorTitle: effectiveMajorTitle,
        subOrder: subNum
      }
      groups.push(currentGroup)
      taskCounter = 0
      continue
    }

    // Plain ## header (fallback)
    if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch) {
      if (line.startsWith('# ')) continue
      groupCounter++
      currentMajorOrder = groupCounter
      currentMajorTitle = plainGroupMatch[1].trim()
      const groupId = `group-${groupCounter}`
      currentGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle
      }
      groups.push(currentGroup)
      taskCounter = 0
      continue
    }

    // Match task items - two formats:
    // 1. "- [ ] 1.1 Task" - numbered task
    // 2. "- [ ] Task" - unnumbered task (auto-generate ID)
    const numberedTaskMatch = line.match(/^-\s+\[([ xX])\]\s+([\d.]+)\s+(.+)$/)
    const plainTaskMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/)

    if (numberedTaskMatch && currentGroup) {
      const completed = numberedTaskMatch[1].toLowerCase() === 'x'
      const taskNumber = numberedTaskMatch[2]
      const taskTitle = numberedTaskMatch[3].trim()
      const taskId = `task-${taskNumber.replace(/\./g, '-')}`

      const task: Task = {
        id: taskId,
        title: taskTitle,
        completed,
        groupId: currentGroup.id,
        lineNumber,
      }

      currentGroup.tasks.push(task)
      taskCounter++
    } else if (plainTaskMatch && currentGroup && !numberedTaskMatch) {
      const completed = plainTaskMatch[1].toLowerCase() === 'x'
      const taskTitle = plainTaskMatch[2].trim()
      taskCounter++
      const taskId = `task-${currentGroup.id}-${taskCounter}`

      const task: Task = {
        id: taskId,
        title: taskTitle,
        completed,
        groupId: currentGroup.id,
        lineNumber,
      }

      currentGroup.tasks.push(task)
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

  let foundTask: Task | null = null
  let currentGroupId = ''
  let groupCounter = 0
  let taskCounter = 0

  // Check if taskId is numbered (task-1-1) or auto-generated (task-group-xxx-n)
  const isNumberedTask = /^task-[\d-]+$/.test(taskId) && !taskId.includes('group')
  const taskNumber = isNumberedTask
    ? taskId.replace('task-', '').replace(/-/g, '.')
    : null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track current group - multiple formats
    const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/)
    const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i)
    const subsectionMatch = line.match(/^###\s+([\d.]+)\s+(.+)$/)
    const plainGroupMatch = line.match(/^##\s+(.+)$/)

    if (numberedGroupMatch) {
      currentGroupId = `group-${numberedGroupMatch[1]}`
      taskCounter = 0
    } else if (phaseGroupMatch) {
      currentGroupId = `group-phase-${phaseGroupMatch[1]}`
      taskCounter = 0
    } else if (subsectionMatch) {
      currentGroupId = `group-${subsectionMatch[1].replace(/\./g, '-')}`
      taskCounter = 0
    } else if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch && !line.startsWith('# ')) {
      groupCounter++
      currentGroupId = `group-${groupCounter}`
      taskCounter = 0
    }

    // Try numbered task match first
    const numberedTaskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)([\d.]+)(\s+.+)$/)
    if (numberedTaskMatch) {
      taskCounter++
      if (isNumberedTask && numberedTaskMatch[4] === taskNumber) {
        const wasCompleted = numberedTaskMatch[2].toLowerCase() === 'x'
        const newCompleted = !wasCompleted
        const newCheckmark = newCompleted ? 'x' : ' '

        lines[i] = `${numberedTaskMatch[1]}${newCheckmark}${numberedTaskMatch[3]}${numberedTaskMatch[4]}${numberedTaskMatch[5]}`

        foundTask = {
          id: taskId,
          title: numberedTaskMatch[5].trim(),
          completed: newCompleted,
          groupId: currentGroupId,
          lineNumber: i + 1,
        }
        break
      }
      continue
    }

    // Try plain task match (unnumbered)
    const plainTaskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)(.+)$/)
    if (plainTaskMatch && currentGroupId) {
      taskCounter++
      const generatedTaskId = `task-${currentGroupId}-${taskCounter}`

      if (!isNumberedTask && generatedTaskId === taskId) {
        const wasCompleted = plainTaskMatch[2].toLowerCase() === 'x'
        const newCompleted = !wasCompleted
        const newCheckmark = newCompleted ? 'x' : ' '

        lines[i] = `${plainTaskMatch[1]}${newCheckmark}${plainTaskMatch[3]}${plainTaskMatch[4]}`

        foundTask = {
          id: taskId,
          title: plainTaskMatch[4].trim(),
          completed: newCompleted,
          groupId: currentGroupId,
          lineNumber: i + 1,
        }
        break
      }
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
