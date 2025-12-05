import type { TaskGroup, Task, TasksFile } from './types.js'

/**
 * Extended TaskGroup with hierarchy info for 3-level structure
 */
interface ExtendedTaskGroup extends TaskGroup {
  majorOrder?: number
  majorTitle?: string
  subOrder?: number
  groupTitle?: string
  groupOrder?: number
}

/**
 * Parse tasks.md content into structured data
 * Uses the same flexible parser as the server for consistency
 */
export function parseTasksFile(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const groups: ExtendedTaskGroup[] = []
  let currentGroup: ExtendedTaskGroup | null = null
  let groupCounter = 0
  let taskCounter = 0

  // 더 유연한 정규식 패턴 (server/parser-utils.ts와 동일)
  const patterns = {
    majorSections: [
      /^##\s+(\d+)\.\s*(.+)$/,           // "## 1. Section"
      /^##\s+Phase\s+(\d+):\s*(.+)$/i,   // "## Phase 1: Section"
      /^##\s+(.+)$/                       // "## Section" (plain)
    ],
    subsections: [
      /^#{3,4}\s+([\d.]+)\s+(.+)$/,     // "### 1.1 Subsection"
      /^#{3,4}\s+(.+)$/                   // "### Subsection" (plain)
    ],
    // 태스크 패턴들 (들여쓰기된 하위 태스크도 지원)
    tasks: [
      /^(\s*)-\s+\[([ xX])\]\s*([\d.]+)\s*(.+)$/,  // "- [ ] 1.1 Task" 또는 "  - [ ] 1.1 Task"
      /^(\s*)-\s+\[([ xX])\]\s*(.+)$/               // "- [ ] Task" 또는 "  - [ ] Task"
    ]
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1
    let matched = false

    // 메인 섹션 확인
    for (const pattern of patterns.majorSections) {
      const match = line.match(pattern)
      if (match) {
        if (currentGroup) {
          groups.push(currentGroup)
        }

        groupCounter++
        let majorOrder: number | undefined
        let majorTitle: string

        if (match[1] && /^\d+$/.test(match[1])) {
          majorOrder = parseInt(match[1])
          majorTitle = match[2]?.trim() || `Section ${majorOrder}`
        } else if (match[0] && /Phase\s+(\d+)/i.test(match[0])) {
          const phaseMatch = match[0].match(/Phase\s+(\d+)/i)
          majorOrder = phaseMatch ? parseInt(phaseMatch[1]) : groupCounter
          majorTitle = match[0].replace(/^##\s+/, '').trim()
        } else {
          majorOrder = groupCounter
          majorTitle = match[1]?.trim() || `Section ${groupCounter}`
        }

        currentGroup = {
          id: `group-${groupCounter}`,
          title: majorTitle,
          tasks: [],
          majorOrder,
          majorTitle,
          subOrder: 1,
          groupTitle: majorTitle,
          groupOrder: groupCounter
        }
        taskCounter = 0
        matched = true
        break
      }
    }

    if (matched) continue

    // 서브섹션 확인
    if (line.startsWith('###') || line.startsWith('####')) {
      for (const pattern of patterns.subsections) {
        const match = line.match(pattern)
        if (match) {
          if (currentGroup) {
            groups.push(currentGroup)
          }

          groupCounter++
          let subOrder: number | undefined
          let subTitle: string

          if (match[1] && /^[\d.]+$/.test(match[1])) {
            const parts = match[1].split('.')
            subOrder = parts.length > 1 ? parseInt(parts[1]) : 1
            subTitle = `${match[1]} ${match[2]?.trim() || ''}`.trim()
          } else {
            subOrder = groupCounter
            subTitle = match[1]?.trim() || `Subsection ${groupCounter}`
          }

          const parentMajorOrder: number = currentGroup?.majorOrder ?? groupCounter
          const parentMajorTitle: string = currentGroup?.majorTitle ?? subTitle
          currentGroup = {
            id: `group-${groupCounter}`,
            title: subTitle,
            tasks: [],
            majorOrder: parentMajorOrder,
            majorTitle: parentMajorTitle,
            subOrder,
            groupTitle: subTitle,
            groupOrder: groupCounter
          }
          taskCounter = 0
          matched = true
          break
        }
      }
    }

    if (matched) continue

    // 태스크 확인 (들여쓰기된 하위 태스크 포함)
    if (currentGroup) {
      for (const pattern of patterns.tasks) {
        const match = line.match(pattern)
        if (match) {
          // match[1] = 들여쓰기, match[2] = 체크 상태
          const indent = match[1] || ''
          const completed = match[2]?.toLowerCase() === 'x'
          let taskTitle: string
          let taskId: string

          // 첫 번째 패턴: 번호가 있는 태스크 (match[3]=번호, match[4]=타이틀)
          if (match[3] && /^[\d.]+$/.test(match[3])) {
            taskTitle = match[4]?.trim() || ''
            taskId = `task-${match[3].replace(/\./g, '-')}`
          } else {
            // 두 번째 패턴: 일반 태스크 (match[3]=타이틀)
            taskTitle = match[3]?.trim() || ''
            taskCounter++
            taskId = `task-${currentGroup.id}-${taskCounter}`
          }

          if (taskTitle) {
            const task: Task = {
              id: taskId,
              title: taskTitle,
              completed,
              groupId: currentGroup.id,
              lineNumber,
              indent: indent.length  // 들여쓰기 레벨 저장
            }

            currentGroup.tasks.push(task)
            matched = true
            break
          }
        }
      }
    }
  }

  // 마지막 그룹 저장
  if (currentGroup) {
    groups.push(currentGroup)
  }

  return { changeId, groups }
}

/**
 * Set task completion status in file content
 * Uses the same parsing logic as parseTasksFile for consistency
 */
export function setTaskStatus(
  content: string,
  taskId: string,
  completed: boolean
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

  // 동일한 패턴 사용 (parseTasksFile과 일치)
  const patterns = {
    majorSections: [
      /^##\s+(\d+)\.\s*(.+)$/,
      /^##\s+Phase\s+(\d+):\s*(.+)$/i,
      /^##\s+(.+)$/
    ],
    subsections: [
      /^#{3,4}\s+([\d.]+)\s+(.+)$/,
      /^#{3,4}\s+(.+)$/
    ]
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let matchedSection = false

    // 메인 섹션 확인
    for (const pattern of patterns.majorSections) {
      const match = line.match(pattern)
      if (match) {
        groupCounter++
        currentGroupId = `group-${groupCounter}`
        taskCounter = 0
        matchedSection = true
        break
      }
    }

    if (matchedSection) continue

    // 서브섹션 확인
    if (line.startsWith('###') || line.startsWith('####')) {
      for (const pattern of patterns.subsections) {
        const match = line.match(pattern)
        if (match) {
          groupCounter++
          currentGroupId = `group-${groupCounter}`
          taskCounter = 0
          matchedSection = true
          break
        }
      }
    }

    if (matchedSection) continue

    // Try numbered task match first (들여쓰기 포함)
    const numberedTaskMatch = line.match(/^(\s*)(-\s+\[)([ xX])(\]\s*)([\d.]+)(\s*.+)$/)
    if (numberedTaskMatch) {
      if (isNumberedTask && numberedTaskMatch[5] === taskNumber) {
        const newCheckmark = completed ? 'x' : ' '
        const indent = numberedTaskMatch[1] || ''

        lines[i] = `${indent}${numberedTaskMatch[2]}${newCheckmark}${numberedTaskMatch[4]}${numberedTaskMatch[5]}${numberedTaskMatch[6]}`

        foundTask = {
          id: taskId,
          title: numberedTaskMatch[6].trim(),
          completed,
          groupId: currentGroupId,
          lineNumber: i + 1,
          indent: indent.length,
        }
        break
      }
      continue
    }

    // Try plain task match (unnumbered, 들여쓰기 포함)
    const plainTaskMatch = line.match(/^(\s*)(-\s+\[)([ xX])(\]\s*)(.+)$/)
    if (plainTaskMatch && currentGroupId) {
      taskCounter++
      const generatedTaskId = `task-${currentGroupId}-${taskCounter}`

      if (!isNumberedTask && generatedTaskId === taskId) {
        const newCheckmark = completed ? 'x' : ' '
        const indent = plainTaskMatch[1] || ''

        lines[i] = `${indent}${plainTaskMatch[2]}${newCheckmark}${plainTaskMatch[4]}${plainTaskMatch[5]}`

        foundTask = {
          id: taskId,
          title: plainTaskMatch[5].trim(),
          completed,
          groupId: currentGroupId,
          lineNumber: i + 1,
          indent: indent.length,
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
