import type { TaskGroup, Task, TasksFile } from '../src/types/index.js'

/**
 * Extended TaskGroup with hierarchy info for 3-level structure
 */
interface ExtendedTaskGroup extends TaskGroup {
  majorOrder?: number
  majorTitle?: string
  subOrder?: number
  groupTitle?: string
  groupOrder?: number
  displayId?: string
  phaseIndex?: number
  groupIndex?: number
}

/**
 * 그룹 구조를 유효성 검사하는 함수
 */
export function validateGroupStructure(groups: ExtendedTaskGroup[]): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // 중복된 그룹 ID 확인
  const groupIds = groups.map(g => g.id)
  const duplicateIds = groupIds.filter((id, index) => groupIds.indexOf(id) !== index)
  if (duplicateIds.length > 0) {
    errors.push(`중복된 그룹 ID: ${duplicateIds.join(', ')}`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 다양한 형식의 tasks.md 파일을 파싱하는 유연한 함수
 *
 * 핵심 원칙:
 * 1. tasks.md의 명시적 넘버링(task-1-1 등)은 무시
 * 2. 순서 기반으로 displayId 자동 생성 (1.1.1, 1.1.2, ...)
 * 3. lineNumber는 파일 참조용으로만 사용
 * 4. 빈 그룹(태스크가 없는 그룹)은 필터링
 */
export function parseTasksFileFlexible(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const rawGroups: ExtendedTaskGroup[] = []
  let currentGroup: ExtendedTaskGroup | null = null

  // 정규식 패턴
  const patterns = {
    // Phase/Major 섹션: ## Phase 1: Title 또는 ## 1. Title 또는 ## Title
    majorSections: [
      /^##\s+Phase\s+(\d+)[:.]?\s*(.*)$/i,   // "## Phase 1: Section"
      /^##\s+(\d+)\.\s*(.+)$/,               // "## 1. Section"
      /^##\s+(.+)$/                          // "## Section" (plain)
    ],
    // 서브섹션: ### 1.1 Title 또는 ### Group: Title 또는 ### Title
    subsections: [
      /^#{3,4}\s+[\d.]+\s+(.+)$/,  // "### 1.1 Subsection" - 숫자 무시하고 제목만
      /^#{3,4}\s+(.+)$/            // "### Subsection" (plain)
    ],
    // 태스크: - [x] task-1-1: Title 또는 - [ ] Title
    tasks: [
      /^(\s*)-\s+\[([ xX])\]\s*(?:task-[\d-]+:\s*)?(.+)$/,  // task-X-X: 프리픽스 무시
      /^(\s*)-\s+\[([ xX])\]\s*[\d.]+\s+(.+)$/,             // 숫자 프리픽스 무시
      /^(\s*)-\s+\[([ xX])\]\s*(.+)$/                       // 일반 태스크
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

          if (taskTitle && !taskTitle.startsWith('#')) {
            const task: Task = {
              id: '',  // 나중에 설정
              title: taskTitle,
              completed,
              groupId: '',  // 나중에 설정
              lineNumber,
              indent: indent.length,
            }
            currentGroup.tasks.push(task)
          }
          matched = true
          break
        }
      }
    }
  }

  // 마지막 그룹 저장
  if (currentGroup) {
    rawGroups.push(currentGroup)
  }

  // 2단계: 태스크가 있는 그룹만 필터링
  const groupsWithTasks = rawGroups.filter(g => g.tasks.length > 0)

  // Phase 그룹화 (majorTitle 기준)
  const phaseMap = new Map<string, ExtendedTaskGroup[]>()
  for (const group of groupsWithTasks) {
    const phaseName = group.majorTitle || group.title
    if (!phaseMap.has(phaseName)) {
      phaseMap.set(phaseName, [])
    }
    phaseMap.get(phaseName)!.push(group)
  }

  // 3단계: displayId 할당 (순서 기반)
  const finalGroups: ExtendedTaskGroup[] = []
  let pIndex = 0
  let globalGroupIndex = 0

  for (const [, phaseGroups] of phaseMap) {
    pIndex++

    for (let gIndex = 0; gIndex < phaseGroups.length; gIndex++) {
      globalGroupIndex++
      const group = phaseGroups[gIndex]
      const groupDisplayId = `${pIndex}.${gIndex + 1}`

      // 그룹 정보 설정
      group.id = `group-${globalGroupIndex}`
      group.displayId = groupDisplayId
      group.phaseIndex = pIndex - 1
      group.groupIndex = gIndex
      group.majorOrder = pIndex
      group.subOrder = gIndex + 1
      group.groupOrder = globalGroupIndex
      group.groupTitle = group.title

      // 태스크 정보 설정
      for (let tIndex = 0; tIndex < group.tasks.length; tIndex++) {
        const task = group.tasks[tIndex]
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
 * 그룹 정보를 추출하는 헬퍼 함수
 */
export function extractGroupInfo(group: ExtendedTaskGroup): {
  majorOrder: number
  majorTitle: string
  subOrder: number
  groupTitle: string
  groupOrder: number
  displayId?: string
} {
  return {
    majorOrder: group.majorOrder ?? 1,
    majorTitle: group.majorTitle ?? group.title,
    subOrder: group.subOrder ?? 1,
    groupTitle: group.groupTitle ?? group.title,
    groupOrder: group.groupOrder ?? 1,
    displayId: group.displayId
  }
}

// 이전 함수들은 호환성을 위해 유지하지만, 새 로직에서는 사용하지 않음
export function resolveDuplicateGroupTitles(groups: ExtendedTaskGroup[]): ExtendedTaskGroup[] {
  return groups
}

export function reorderGroups(groups: ExtendedTaskGroup[]): ExtendedTaskGroup[] {
  return groups
}
