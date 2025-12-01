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
  
  // 중복된 그룹 제목 확인
  const groupTitles = groups.map(g => g.title)
  const duplicateTitles = groupTitles.filter((title, index) => groupTitles.indexOf(title) !== index)
  if (duplicateTitles.length > 0) {
    warnings.push(`중복된 그룹 제목: ${duplicateTitles.join(', ')}`)
  }
  
  // 그룹 순서 확인
  const majorOrders = groups.filter(g => g.majorOrder !== undefined).map(g => g.majorOrder!)
  const sortedOrders = [...majorOrders].sort((a, b) => a - b)
  if (JSON.stringify(majorOrders) !== JSON.stringify(sortedOrders)) {
    warnings.push('그룹 순서가 정렬되어 있지 않습니다')
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 그룹 순서를 재정렬하는 함수
 */
export function reorderGroups(groups: ExtendedTaskGroup[]): ExtendedTaskGroup[] {
  // 먼저 그룹에 순서 정보가 없으면 추가
  const groupsWithOrder = groups.map((group, index) => ({
    ...group,
    groupOrder: group.groupOrder ?? index + 1,
    majorOrder: group.majorOrder ?? index + 1
  }))
  
  // 정렬
  return groupsWithOrder.sort((a, b) => {
    // majorOrder가 있으면 우선 정렬
    if (a.majorOrder !== undefined && b.majorOrder !== undefined) {
      if (a.majorOrder !== b.majorOrder) {
        return a.majorOrder - b.majorOrder
      }
      // majorOrder가 같으면 subOrder로 정렬
      if (a.subOrder !== undefined && b.subOrder !== undefined) {
        return a.subOrder - b.subOrder
      }
    }
    // groupOrder로 정렬
    return (a.groupOrder ?? 0) - (b.groupOrder ?? 0)
  })
}

/**
 * 중복된 그룹 제목을 처리하는 함수
 */
export function resolveDuplicateGroupTitles(groups: ExtendedTaskGroup[]): ExtendedTaskGroup[] {
  const titleCounts = new Map<string, number>()
  const result: ExtendedTaskGroup[] = []
  
  for (const group of groups) {
    const baseTitle = group.title
    const count = titleCounts.get(baseTitle) ?? 0
    
    if (count > 0) {
      // 중복된 제목에 숫자 접미사 추가 (첫 중복은 1부터 시작)
      const newTitle = `${baseTitle} (${count})`
      result.push({
        ...group,
        title: newTitle,
        groupTitle: newTitle
      })
    } else {
      result.push(group)
    }
    
    titleCounts.set(baseTitle, count + 1)
  }
  
  return result
}

/**
 * 다양한 형식의 tasks.md 파일을 파싱하는 유연한 함수
 */
export function parseTasksFileFlexible(changeId: string, content: string): TasksFile {
  const lines = content.split('\n')
  const groups: ExtendedTaskGroup[] = []
  let currentGroup: ExtendedTaskGroup | null = null
  let groupCounter = 0
  let taskCounter = 0
  
  // 더 유연한 정규식 패턴
  const patterns = {
    // 메인 섹션 패턴들
    majorSections: [
      /^##\s+(\d+)\.\s*(.+)$/,           // "## 1. Section"
      /^##\s+Phase\s+(\d+):\s*(.+)$/i,   // "## Phase 1: Section"
      /^##\s+(.+)$/                       // "## Section" (plain)
    ],
    // 서브섹션 패턴들
    subsections: [
      /^#{3,4}\s+([\d.]+)\s+(.+)$/,     // "### 1.1 Subsection"
      /^#{3,4}\s+(.+)$/                   // "### Subsection" (plain)
    ],
    // 태스크 패턴들
    tasks: [
      /^-\s+\[([ xX])\]\s*([\d.]+)\s*(.+)$/,  // "- [ ] 1.1 Task"
      /^-\s+\[([ xX])\]\s*(.+)$/               // "- [ ] Task" (plain)
    ]
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1
    let matched = false
    
    // 메인 섹션 확인 (먼저 확인해야 함)
    for (const pattern of patterns.majorSections) {
      const match = line.match(pattern)
      if (match) {
        // 이전 그룹 저장
        if (currentGroup) {
          groups.push(currentGroup)
        }
        
        groupCounter++
        let majorOrder: number | undefined
        let majorTitle: string
        
        if (match[1] && /^\d+$/.test(match[1])) {
          // 번호가 있는 섹션
          majorOrder = parseInt(match[1])
          majorTitle = match[2]?.trim() || `Section ${majorOrder}`
        } else if (match[0] && /Phase\s+(\d+)/i.test(match[0])) {
          // Phase 형식
          const phaseMatch = match[0].match(/Phase\s+(\d+)/i)
          majorOrder = phaseMatch ? parseInt(phaseMatch[1]) : groupCounter
          majorTitle = match[0].replace(/^##\s+/, '').trim()
        } else {
          // 일반 섹션
          majorOrder = groupCounter
          majorTitle = match[1]?.trim() || `Section ${groupCounter}`
        }
        
        currentGroup = {
          id: `group-${majorOrder ?? groupCounter}`,
          title: majorTitle,
          tasks: [],
          majorOrder,
          majorTitle,
          subOrder: 1,
          groupTitle: majorTitle,
          groupOrder: majorOrder ?? groupCounter
        }
        taskCounter = 0
        matched = true
        break
      }
    }
    
    if (matched) continue
    
    // 서브섹션 확인 (###으로 시작하는 경우만)
    if (line.startsWith('###') || line.startsWith('####')) {
      for (const pattern of patterns.subsections) {
        const match = line.match(pattern)
        if (match) {
          // 이전 그룹 저장
          if (currentGroup) {
            groups.push(currentGroup)
          }
          
          groupCounter++
          let subOrder: number | undefined
          let subTitle: string
          
          if (match[1] && /^[\d.]+$/.test(match[1])) {
            // 번호가 있는 서브섹션
            const parts = match[1].split('.')
            subOrder = parts.length > 1 ? parseInt(parts[1]) : 1
            subTitle = `${match[1]} ${match[2]?.trim() || ''}`.trim()
          } else {
            // 일반 서브섹션
            subOrder = groupCounter
            subTitle = match[1]?.trim() || `Subsection ${groupCounter}`
          }
          
          currentGroup = {
            id: `group-${groupCounter}`,
            title: subTitle,
            tasks: [],
            majorOrder: currentGroup?.majorOrder ?? groupCounter,
            majorTitle: currentGroup?.majorTitle ?? subTitle,
            subOrder,
            groupTitle: subTitle,
            groupOrder: currentGroup?.groupOrder ?? groupCounter
          }
          taskCounter = 0
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
          const completed = match[1]?.toLowerCase() === 'x'
          let taskTitle: string
          let taskId: string
          
          if (match[2] && /^[\d.]+$/.test(match[2])) {
            // 번호가 있는 태스크
            taskTitle = match[3]?.trim() || ''
            taskId = `task-${match[2].replace(/\./g, '-')}`
          } else {
            // 일반 태스크
            taskTitle = match[2]?.trim() || ''
            taskCounter++
            taskId = `task-${currentGroup.id}-${taskCounter}`
          }
          
          if (taskTitle) {
            const task: Task = {
              id: taskId,
              title: taskTitle,
              completed,
              groupId: currentGroup.id,
              lineNumber
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
  
  // 후처리: 유효성 검사 및 재정렬
  const validation = validateGroupStructure(groups)
  if (!validation.isValid) {
    console.warn('파싱 경고:', validation.errors)
  }
  if (validation.warnings.length > 0) {
    console.warn('파싱 경고:', validation.warnings)
  }
  
  // 중복 제목 처리 및 재정렬
  let processedGroups = resolveDuplicateGroupTitles(groups)
  processedGroups = reorderGroups(processedGroups)
  
  return { changeId, groups: processedGroups }
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
} {
  return {
    majorOrder: group.majorOrder ?? 1,
    majorTitle: group.majorTitle ?? group.title,
    subOrder: group.subOrder ?? 1,
    groupTitle: group.groupTitle ?? group.title,
    groupOrder: group.groupOrder ?? 1
  }
}