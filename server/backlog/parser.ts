/**
 * Backlog.md 파서
 * YAML frontmatter + 마크다운 섹션 파싱
 *
 * 파일 형식:
 * ---
 * id: task-007
 * title: OAuth2 인증 구현
 * status: In Progress
 * assignees: [@alice]
 * labels: [auth, backend]
 * priority: high
 * blocked_by: [task-003]
 * parent: task-001
 * due_date: 2024-01-15
 * milestone: Sprint 3
 * ---
 *
 * ## Description
 * OAuth2 기반 소셜 로그인 구현
 *
 * ## Plan
 * 1. Google OAuth 설정
 * 2. 토큰 관리 로직
 *
 * ## Acceptance Criteria
 * - [ ] Google 로그인 동작
 * - [ ] 토큰 갱신 자동화
 *
 * ## Notes
 * - 2024-01-03: API 키 발급 완료
 */

export interface BacklogTask {
  // YAML frontmatter 필드
  backlogFileId: string // task-007
  title: string
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'archived'
  assignees?: string[] // [@alice, @bob]
  labels?: string[] // [auth, backend]
  priority: 'low' | 'medium' | 'high'
  blockedBy?: string[] // [task-003]
  parent?: string // task-001
  dueDate?: string // ISO 8601
  milestone?: string // Sprint 3

  // 마크다운 섹션
  description?: string
  plan?: string
  acceptanceCriteria?: string
  notes?: string

  // 파일 메타데이터
  filePath: string
  fileModifiedAt?: string
}

/**
 * YAML frontmatter 파싱
 */
function parseYamlFrontmatter(content: string): Record<string, unknown> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    return {}
  }

  const yaml = frontmatterMatch[1]
  const result: Record<string, unknown> = {}

  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    // 배열 파싱: [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1)
      result[key] = arrayContent
        .split(',')
        .map((item) => item.trim().replace(/^[@"']|["']$/g, ''))
        .filter(Boolean)
    }
    // 문자열
    else {
      // 따옴표 제거
      value = value.replace(/^["']|["']$/g, '')
      result[key] = value
    }
  }

  return result
}

/**
 * 마크다운 섹션 파싱
 * ## Section Name 형식의 섹션 추출
 */
function parseMarkdownSections(content: string): Record<string, string> {
  // frontmatter 이후 내용만 추출
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
  const body = bodyMatch ? bodyMatch[1] : content

  const sections: Record<string, string> = {}
  const sectionRegex = /^##\s+(.+)$/gm
  const matches = [...body.matchAll(sectionRegex)]

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const sectionName = match[1].trim().toLowerCase().replace(/\s+/g, '_')
    const startIndex = match.index! + match[0].length
    const endIndex = matches[i + 1]?.index ?? body.length
    const sectionContent = body.slice(startIndex, endIndex).trim()

    sections[sectionName] = sectionContent
  }

  return sections
}

/**
 * Status 문자열을 FlowTaskStatus로 변환
 */
function normalizeStatus(
  status: string
): 'todo' | 'in-progress' | 'review' | 'done' | 'archived' {
  const normalized = status.toLowerCase().replace(/\s+/g, '-')

  switch (normalized) {
    case 'to-do':
    case 'todo':
    case 'backlog':
    case 'new':
      return 'todo'
    case 'in-progress':
    case 'in_progress':
    case 'doing':
    case 'started':
      return 'in-progress'
    case 'review':
    case 'reviewing':
    case 'testing':
      return 'review'
    case 'done':
    case 'completed':
    case 'finished':
      return 'done'
    case 'archived':
    case 'closed':
      return 'archived'
    default:
      return 'todo'
  }
}

/**
 * Priority 문자열을 정규화
 */
function normalizePriority(priority: string): 'low' | 'medium' | 'high' {
  const normalized = priority.toLowerCase()

  switch (normalized) {
    case 'high':
    case 'critical':
    case 'urgent':
      return 'high'
    case 'medium':
    case 'normal':
    case 'default':
      return 'medium'
    case 'low':
    case 'minor':
      return 'low'
    default:
      return 'medium'
  }
}

/**
 * 단일 Backlog 파일 파싱
 */
export function parseBacklogFile(
  content: string,
  filePath: string
): BacklogTask | null {
  try {
    const frontmatter = parseYamlFrontmatter(content)
    const sections = parseMarkdownSections(content)

    // 필수 필드 검증
    const id = (frontmatter.id as string) || ''
    const title = (frontmatter.title as string) || ''

    if (!id || !title) {
      console.warn(`Invalid backlog file (missing id or title): ${filePath}`)
      return null
    }

    const task: BacklogTask = {
      backlogFileId: id,
      title,
      status: normalizeStatus((frontmatter.status as string) || 'todo'),
      priority: normalizePriority((frontmatter.priority as string) || 'medium'),
      filePath,

      // Optional frontmatter fields
      assignees: frontmatter.assignees as string[] | undefined,
      labels: frontmatter.labels as string[] | undefined,
      blockedBy: frontmatter.blocked_by as string[] | undefined,
      parent: frontmatter.parent as string | undefined,
      dueDate: frontmatter.due_date as string | undefined,
      milestone: frontmatter.milestone as string | undefined,

      // Markdown sections
      description: sections.description,
      plan: sections.plan,
      acceptanceCriteria: sections.acceptance_criteria,
      notes: sections.notes,
    }

    return task
  } catch (error) {
    console.error(`Failed to parse backlog file: ${filePath}`, error)
    return null
  }
}

/**
 * BacklogTask를 마크다운 파일 내용으로 직렬화
 */
export function serializeBacklogTask(task: BacklogTask): string {
  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`id: ${task.backlogFileId}`)
  lines.push(`title: ${task.title}`)
  lines.push(`status: ${task.status}`)

  if (task.assignees?.length) {
    lines.push(`assignees: [${task.assignees.map((a) => `@${a.replace(/^@/, '')}`).join(', ')}]`)
  }

  if (task.labels?.length) {
    lines.push(`labels: [${task.labels.join(', ')}]`)
  }

  lines.push(`priority: ${task.priority}`)

  if (task.blockedBy?.length) {
    lines.push(`blocked_by: [${task.blockedBy.join(', ')}]`)
  }

  if (task.parent) {
    lines.push(`parent: ${task.parent}`)
  }

  if (task.dueDate) {
    lines.push(`due_date: ${task.dueDate}`)
  }

  if (task.milestone) {
    lines.push(`milestone: ${task.milestone}`)
  }

  lines.push('---')
  lines.push('')

  // Markdown sections
  if (task.description) {
    lines.push('## Description')
    lines.push(task.description)
    lines.push('')
  }

  if (task.plan) {
    lines.push('## Plan')
    lines.push(task.plan)
    lines.push('')
  }

  if (task.acceptanceCriteria) {
    lines.push('## Acceptance Criteria')
    lines.push(task.acceptanceCriteria)
    lines.push('')
  }

  if (task.notes) {
    lines.push('## Notes')
    lines.push(task.notes)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Backlog 디렉토리의 모든 파일 ID 목록 반환
 * 파일명에서 task ID 추출: task-007-oauth.md -> task-007
 */
export function extractTaskIdFromFilename(filename: string): string | null {
  // task-{id}-{title}.md 또는 task-{id}.md 형식
  const match = filename.match(/^(task-\d+)(?:-.*)?\.md$/)
  return match ? match[1] : null
}

/**
 * task ID로 파일명 생성
 */
export function generateBacklogFilename(
  taskId: string,
  title: string
): string {
  // 제목을 파일명으로 사용 가능하게 변환
  const slugTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  return `${taskId}-${slugTitle}.md`
}
