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
  groupTitle?: string    // 그룹 제목 (title과 동일하지만 명시적)
  groupOrder?: number    // 그룹 순서 (majorOrder와 동일하지만 명시적)
}

/**
 * Parse tasks.md content into structured data
 *
 * Supports multiple formats:
 * - 3-level: "## 1. Major" > "### 1.1 Sub" > "- [ ] 1.1.1 Task"
 * - 2-level: "## 1. Section" > "- [ ] Task"
 * - Phase: "## Phase 0:" > "### 0.1 Sub" > "- [ ] 0.1.1 Task"
 * - Plain: "## Section" > "- [ ] Task"
 * - 4-level headers: "#### 1.1 Sub" treated as subsection
 */
export function parseTasksFile(changeId: string, content: string): TasksFile {
  return parseTasksFileOriginal(changeId, content)
}

/**
 * 기존 파서 로직 (fallback용)
 */
function parseTasksFileOriginal(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const groups: ExtendedTaskGroup[] = []
  let currentGroup: ExtendedTaskGroup | null = null
  let currentMajorOrder = 0
  let currentMajorTitle = ''
  let groupCounter = 0
  let taskCounter = 0
  // Track if we have a pending major section without subsections
  let pendingMajorGroup: ExtendedTaskGroup | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // Match major group headers: "## 1. Section Name"
    const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/)
    // Match phase format: "## Phase 0: Section Name"
    const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i)
    // Match plain format: "## Section Name" (not starting with #)
    const plainGroupMatch = line.match(/^##\s+([^#].*)$/)

    // Match subsection headers: "### 1.1 Subsection" or "#### 1.1 Subsection"
    const subsectionMatch = line.match(/^#{3,4}\s+([\d.]+)\s+(.+)$/)
    // Match plain subsection: "### Subsection Name" (no number)
    const plainSubsectionMatch = line.match(/^###\s+([^#\d].*)$/)

    if (numberedGroupMatch) {
      // Flush pending major group if it has tasks
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup)
      }

      currentMajorOrder = parseInt(numberedGroupMatch[1])
      currentMajorTitle = numberedGroupMatch[2].trim()

      // Create a pending group for tasks that come directly under ##
      const groupId = `group-${currentMajorOrder}`
      pendingMajorGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle,
        subOrder: 1,
        groupTitle: currentMajorTitle,
        groupOrder: currentMajorOrder
      }
      currentGroup = pendingMajorGroup
      taskCounter = 0
      continue
    }

    if (phaseGroupMatch) {
      // Flush pending major group
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup)
      }

      currentMajorOrder = parseInt(phaseGroupMatch[1])
      currentMajorTitle = `Phase ${phaseGroupMatch[1]}: ${phaseGroupMatch[2].trim()}`

      // Create pending group for Phase
      const groupId = `group-phase-${phaseGroupMatch[1]}`
      pendingMajorGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle,
        subOrder: 1,
        groupTitle: currentMajorTitle,
        groupOrder: currentMajorOrder
      }
      currentGroup = pendingMajorGroup
      taskCounter = 0
      continue
    }

    // Subsection with number: "### 1.1 Name" or "#### 1.1 Name"
    if (subsectionMatch) {
      // If we have a pending major group, add it before processing subsections
      if (pendingMajorGroup) {
        groups.push(pendingMajorGroup)
        pendingMajorGroup = null
      }

      const subsectionNumber = subsectionMatch[1] // "1.1" or "0.1"
      const parts = subsectionNumber.split('.')
      const majorNum = parseInt(parts[0]) // 1 or 0
      const subNum = parts.length > 1 ? parseInt(parts[1]) : 1 // 1

      // Use current major info if available, otherwise derive from subsection number
      const effectiveMajorOrder = currentMajorOrder !== 0 || currentMajorTitle ? currentMajorOrder : majorNum
      const effectiveMajorTitle = currentMajorTitle || `Section ${majorNum}`

      const groupId = `group-${subsectionNumber.replace(/\./g, '-')}`
      const groupTitle = `${subsectionNumber} ${subsectionMatch[2].trim()}`

      currentGroup = {
        id: groupId,
        title: groupTitle,
        tasks: [],
        majorOrder: effectiveMajorOrder,
        majorTitle: effectiveMajorTitle,
        subOrder: subNum,
        groupTitle: groupTitle,
        groupOrder: effectiveMajorOrder
      }
      groups.push(currentGroup)
      taskCounter = 0
      continue
    }

    // Plain subsection: "### Subsection Name" (no number)
    // These are often just labels/headers without tasks (e.g., "### 준비 작업 (Week 1)")
    // Don't create a group for them - just update context for any #### subsections that follow
    if (plainSubsectionMatch && !subsectionMatch) {
      // Flush pending major group if needed
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup)
      }
      pendingMajorGroup = null

      // Don't create a group - just skip this header
      // Tasks that follow will be captured by #### subsections or numbered tasks
      taskCounter = 0
      continue
    }

    // Plain ## header (fallback) - "## Section Name"
    if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch) {
      if (line.startsWith('# ') && !line.startsWith('## ')) continue

      // Flush pending major group
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup)
      }

      groupCounter++
      currentMajorOrder = groupCounter
      currentMajorTitle = plainGroupMatch[1].trim()

      const groupId = `group-${groupCounter}`
      pendingMajorGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle,
        subOrder: 1,
        groupTitle: currentMajorTitle,
        groupOrder: currentMajorOrder
      }
      currentGroup = pendingMajorGroup
      taskCounter = 0
      continue
    }

    // Match task items - two formats:
    // 1. "- [ ] 1.1.1 Task" - numbered task
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

  // Flush any remaining pending group
  if (pendingMajorGroup) {
    groups.push(pendingMajorGroup)
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
