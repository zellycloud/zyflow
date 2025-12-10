import type { TaskGroup, Task, TasksFile } from './types.js'

/**
 * Extended TaskGroup with hierarchy info for 3-level structure
 * 순서 기반 displayId를 사용하여 안정적인 넘버링 제공
 */
interface ExtendedTaskGroup extends TaskGroup {
  majorOrder?: number
  majorTitle?: string
  subOrder?: number
  groupTitle?: string
  groupOrder?: number
}

/**
 * Phase 정보를 추적하기 위한 인터페이스
 */
interface PhaseInfo {
  index: number        // 0-based Phase 순서
  title: string
  groupCount: number   // Phase 내 그룹 수 (태스크가 있는 그룹만)
}

/**
 * Parse tasks.md content into structured data
 *
 * 핵심 원칙:
 * 1. tasks.md의 명시적 넘버링(task-1-1 등)은 무시
 * 2. 순서 기반으로 displayId 자동 생성 (1.1.1, 1.1.2, ...)
 * 3. lineNumber는 파일 참조용으로만 사용
 */
export function parseTasksFile(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const rawGroups: ExtendedTaskGroup[] = []
  let currentGroup: ExtendedTaskGroup | null = null

  // 정규식 패턴
  const patterns = {
    // Phase/Major 섹션: ## Phase 1: Title 또는 ## 1. Title 또는 ## Title
    majorSections: [
      /^##\s+Phase\s+(\d+)[:.]?\s*(.*)$/i,   // "## Phase 1: Section"
      /^##\s+(\d+)\.\s*(.+)$/,                // "## 1. Section"
      /^##\s+(.+)$/                            // "## Section" (plain)
    ],
    // 서브섹션: ### 1.1 Title 또는 ### Group: Title 또는 ### Title
    subsections: [
      /^#{3,4}\s+[\d.]+\s+(.+)$/,              // "### 1.1 Subsection" - 숫자 무시하고 제목만
      /^#{3,4}\s+(.+)$/                         // "### Subsection" (plain)
    ],
    // 태스크: - [x] task-1-1: Title 또는 - [ ] Title
    tasks: [
      /^(\s*)-\s+\[([ xX])\]\s*(?:task-[\d-]+:\s*)?(.+)$/,  // task-X-X: 프리픽스 무시
      /^(\s*)-\s+\[([ xX])\]\s*[\d.]+\s+(.+)$/,              // 숫자 프리픽스 무시
      /^(\s*)-\s+\[([ xX])\]\s*(.+)$/                        // 일반 태스크
    ]
  }

  // 1단계: 원시 파싱 (그룹과 태스크 수집)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1
    let matched = false

    // 메인 섹션(Phase) 확인
    for (const pattern of patterns.majorSections) {
      const match = line.match(pattern)
      if (match) {
        if (currentGroup) {
          rawGroups.push(currentGroup)
        }

        // Phase 제목 추출 (숫자는 무시)
        let title: string
        if (match[2] !== undefined) {
          // Phase N: Title 또는 N. Title 형식
          title = match[2]?.trim() || match[0].replace(/^##\s+/, '').trim()
        } else {
          // ## Title 형식
          title = match[1]?.trim() || ''
        }

        currentGroup = {
          id: '',  // 나중에 설정
          title,
          tasks: [],
          majorTitle: title,
        }
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
            rawGroups.push(currentGroup)
          }

          const title = match[1]?.trim() || ''
          const parentMajorTitle: string = currentGroup?.majorTitle || title

          currentGroup = {
            id: '',  // 나중에 설정
            title,
            tasks: [],
            majorTitle: parentMajorTitle,
            groupTitle: title,
          }
          matched = true
          break
        }
      }
    }

    if (matched) continue

    // 태스크 확인
    if (currentGroup) {
      for (const pattern of patterns.tasks) {
        const match = line.match(pattern)
        if (match) {
          const indent = match[1] || ''
          const completed = match[2]?.toLowerCase() === 'x'
          const taskTitle = match[3]?.trim() || ''

          if (taskTitle) {
            const task: Task = {
              id: '',  // 나중에 설정
              title: taskTitle,
              completed,
              groupId: '',  // 나중에 설정
              lineNumber,
              indent: indent.length
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
    rawGroups.push(currentGroup)
  }

  // 2단계: 태스크가 있는 그룹만 필터링하고 순서 기반 ID 부여
  const groupsWithTasks = rawGroups.filter(g => g.tasks.length > 0)

  // Phase 그룹화 (majorTitle 기준)
  const phaseMap = new Map<string, { groups: ExtendedTaskGroup[], index: number }>()
  let phaseIndex = 0

  for (const group of groupsWithTasks) {
    const phaseName = group.majorTitle || 'Default'
    if (!phaseMap.has(phaseName)) {
      phaseMap.set(phaseName, { groups: [], index: phaseIndex++ })
    }
    phaseMap.get(phaseName)!.groups.push(group)
  }

  // 3단계: displayId 할당
  const finalGroups: ExtendedTaskGroup[] = []
  let globalGroupIndex = 0

  for (const [phaseName, phaseData] of phaseMap) {
    const { groups: phaseGroups, index: pIndex } = phaseData

    for (let gIndex = 0; gIndex < phaseGroups.length; gIndex++) {
      const group = phaseGroups[gIndex]
      globalGroupIndex++

      // 그룹 displayId: Phase.Group (1.1, 1.2, 2.1, ...)
      const groupDisplayId = `${pIndex + 1}.${gIndex + 1}`

      group.id = `group-${globalGroupIndex}`
      group.displayId = groupDisplayId
      group.phaseIndex = pIndex
      group.groupIndex = gIndex
      group.majorOrder = pIndex + 1
      group.subOrder = gIndex + 1
      group.groupOrder = globalGroupIndex
      group.groupTitle = group.title

      // 태스크 displayId 할당
      for (let tIndex = 0; tIndex < group.tasks.length; tIndex++) {
        const task = group.tasks[tIndex]

        // 태스크 displayId: Phase.Group.Task (1.1.1, 1.1.2, ...)
        const taskDisplayId = `${groupDisplayId}.${tIndex + 1}`

        task.id = `task-${globalGroupIndex}-${tIndex + 1}`
        task.displayId = taskDisplayId
        task.groupId = group.id
      }

      finalGroups.push(group)
    }
  }

  return { changeId, groups: finalGroups }
}

/**
 * Set task completion status in file content
 *
 * 태스크 찾기 전략:
 * 1. displayId로 찾기 (권장)
 * 2. 제목 패턴 매칭으로 찾기 (폴백)
 * 3. lineNumber는 현재 파일에서 실시간으로 찾음
 */
export function setTaskStatus(
  content: string,
  taskId: string,
  completed: boolean
): { newContent: string; task: Task } {
  const lines = content.split('\n')

  // 먼저 파일을 파싱해서 태스크 찾기
  const parsed = parseTasksFile('temp', content)

  // taskId로 태스크 찾기 (id 또는 displayId)
  let targetTask: Task | null = null
  let targetGroup: TaskGroup | null = null

  for (const group of parsed.groups) {
    for (const task of group.tasks) {
      if (task.id === taskId || task.displayId === taskId) {
        targetTask = task
        targetGroup = group
        break
      }
    }
    if (targetTask) break
  }

  // 레거시 ID 형식 지원 (task-group-N-M 또는 task-N-N)
  if (!targetTask) {
    // task-group-2-1 형식 파싱
    const legacyGroupMatch = taskId.match(/^task-group-(\d+)-(\d+)$/)
    if (legacyGroupMatch) {
      const groupNum = parseInt(legacyGroupMatch[1])
      const taskNum = parseInt(legacyGroupMatch[2])

      // 그룹 순서로 찾기
      let groupIndex = 0
      for (const group of parsed.groups) {
        groupIndex++
        if (groupIndex === groupNum && group.tasks.length >= taskNum) {
          targetTask = group.tasks[taskNum - 1]
          targetGroup = group
          break
        }
      }
    }

    // task-1-1 형식 (레거시 - 첫 번째 Phase의 첫 번째 그룹의 첫 번째 태스크)
    const legacyNumMatch = taskId.match(/^task-(\d+)-(\d+)$/)
    if (!targetTask && legacyNumMatch) {
      const phaseNum = parseInt(legacyNumMatch[1])
      const taskNum = parseInt(legacyNumMatch[2])

      // Phase별로 그룹화된 것에서 찾기
      for (const group of parsed.groups) {
        const extGroup = group as ExtendedTaskGroup
        if (extGroup.majorOrder === phaseNum || extGroup.phaseIndex === phaseNum - 1) {
          if (group.tasks.length >= taskNum) {
            targetTask = group.tasks[taskNum - 1]
            targetGroup = group
            break
          }
        }
      }
    }
  }

  if (!targetTask) {
    throw new Error(`Task not found: ${taskId}`)
  }

  // lineNumber를 사용해서 해당 라인 수정
  const lineIndex = targetTask.lineNumber - 1
  const line = lines[lineIndex]

  // 체크박스 상태 변경
  const newLine = line.replace(
    /^(\s*-\s+\[)([ xX])(\].*)$/,
    `$1${completed ? 'x' : ' '}$3`
  )

  if (newLine === line) {
    throw new Error(`Failed to update task at line ${targetTask.lineNumber}`)
  }

  lines[lineIndex] = newLine

  // 업데이트된 태스크 반환
  const updatedTask: Task = {
    ...targetTask,
    completed,
  }

  return {
    newContent: lines.join('\n'),
    task: updatedTask,
  }
}

/**
 * 제목으로 태스크 찾기 (보조 함수)
 * 태스크 제목의 일부로 검색
 */
export function findTaskByTitle(
  content: string,
  titlePattern: string
): Task | null {
  const parsed = parseTasksFile('temp', content)

  const pattern = titlePattern.toLowerCase()

  for (const group of parsed.groups) {
    for (const task of group.tasks) {
      if (task.title.toLowerCase().includes(pattern)) {
        return task
      }
    }
  }

  return null
}
