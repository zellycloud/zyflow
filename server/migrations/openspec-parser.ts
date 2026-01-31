/**
 * OpenSpec Parser (TAG-012)
 *
 * Parses OpenSpec markdown format to extract structured data for migration.
 * Handles variable OpenSpec structures gracefully including:
 * - proposal.md format (Change-based)
 * - spec.md format (SPEC-based)
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import matter from 'gray-matter'

// =============================================
// Types
// =============================================

/**
 * Parsed task from OpenSpec format
 */
export interface OpenSpecTask {
  /** Task identifier (e.g., "1.1", "2.3") */
  id: string
  /** Task title/description */
  title: string
  /** Optional detailed description */
  description?: string
  /** Task completion status */
  status: 'pending' | 'completed'
  /** Parent task id for hierarchy */
  parentId?: string
  /** Subtasks */
  subtasks?: OpenSpecTask[]
}

/**
 * Parsed requirement from OpenSpec format
 */
export interface OpenSpecRequirement {
  /** Requirement identifier */
  id: string
  /** Requirement text */
  text: string
  /** Requirement type hint for EARS conversion */
  typeHint?: 'when' | 'if' | 'while' | 'shall' | 'unknown'
}

/**
 * Parsed acceptance criterion from OpenSpec format
 */
export interface OpenSpecCriterion {
  /** Criterion text */
  text: string
  /** Whether it's a checkbox item */
  isCheckbox: boolean
  /** Completion status if checkbox */
  completed?: boolean
}

/**
 * Complete parsed OpenSpec structure
 */
export interface ParsedOpenSpec {
  /** SPEC/Change identifier */
  id: string
  /** Document title */
  title: string
  /** Optional description/summary */
  description?: string
  /** List of requirements */
  requirements: OpenSpecRequirement[]
  /** List of tasks */
  tasks: OpenSpecTask[]
  /** Acceptance criteria */
  acceptanceCriteria: OpenSpecCriterion[]
  /** Raw metadata from frontmatter */
  metadata: Record<string, unknown>
  /** Sections that were found */
  foundSections: string[]
  /** Sections that were missing */
  missingSections: string[]
  /** Original content for reference */
  rawContent: string
}

// =============================================
// Section Patterns
// =============================================

/**
 * Common section header patterns in OpenSpec documents
 */
const SECTION_PATTERNS = {
  why: /^##\s*(?:Why|목적|배경|Background)/im,
  whatChanges: /^##\s*(?:What\s*Changes?|변경\s*사항|Changes)/im,
  impact: /^##\s*(?:Impact|영향|영향\s*분석)/im,
  requirements: /^##\s*(?:Requirements?|요구\s*사항|Functional\s*Requirements?)/im,
  tasks: /^##\s*(?:Tasks?|태스크|Implementation\s*Tasks?|Plan)/im,
  acceptanceCriteria: /^##\s*(?:Acceptance\s*Criteria|인수\s*조건|검증\s*조건|Validation|Success\s*Criteria)/im,
  phase: /^##\s*(?:Phase\s*\d+|단계\s*\d+|\d+\.\s*)/im,
  description: /^##\s*(?:Description|설명|개요|Overview)/im,
  notes: /^##\s*(?:Notes?|참고|비고)/im,
  design: /^##\s*(?:Design|설계)/im,
  scenarios: /^####\s*Scenario:/im,
}

// =============================================
// Parsing Functions
// =============================================

/**
 * Extract ID from frontmatter or filename
 */
function extractId(frontmatter: Record<string, unknown>, content: string, defaultId: string): string {
  // Try frontmatter fields
  if (frontmatter.id) return String(frontmatter.id)
  if (frontmatter.spec_id) return String(frontmatter.spec_id)
  if (frontmatter.change_id) return String(frontmatter.change_id)

  // Try to extract from title heading
  const titleMatch = content.match(/^#\s+(?:Change:\s+)?(.+)$/m)
  if (titleMatch) {
    const title = titleMatch[1].trim()
    // Convert title to kebab-case ID
    return title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
  }

  return defaultId
}

/**
 * Extract title from frontmatter or first heading
 */
function extractTitle(frontmatter: Record<string, unknown>, content: string, defaultTitle: string): string {
  if (frontmatter.title) return String(frontmatter.title)

  // Try to extract from first heading
  const titleMatch = content.match(/^#\s+(?:Change:\s+)?(.+)$/m)
  if (titleMatch) {
    return titleMatch[1].trim()
  }

  return defaultTitle
}

/**
 * Extract a section's content by header pattern
 */
function extractSection(content: string, pattern: RegExp): string | null {
  const lines = content.split('\n')
  let inSection = false
  const sectionLines: string[] = []
  let sectionLevel = 0

  for (const line of lines) {
    if (pattern.test(line)) {
      inSection = true
      sectionLevel = (line.match(/^#+/) || [''])[0].length
      continue
    }

    if (inSection) {
      // Check if we hit a new section at same or higher level
      const headingMatch = line.match(/^(#+)\s/)
      if (headingMatch && headingMatch[1].length <= sectionLevel) {
        break
      }
      sectionLines.push(line)
    }
  }

  const result = sectionLines.join('\n').trim()
  return result || null
}

/**
 * Parse requirements from a section
 */
function parseRequirements(sectionContent: string | null): OpenSpecRequirement[] {
  if (!sectionContent) return []

  const requirements: OpenSpecRequirement[] = []
  const lines = sectionContent.split('\n')
  let reqCounter = 1

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Match list items (-, *, numbered)
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/)
    if (listMatch) {
      const text = listMatch[1].trim()
      const typeHint = detectRequirementType(text)

      requirements.push({
        id: `REQ-${String(reqCounter).padStart(3, '0')}`,
        text,
        typeHint,
      })
      reqCounter++
    }
  }

  return requirements
}

/**
 * Detect requirement type for EARS conversion
 */
function detectRequirementType(text: string): OpenSpecRequirement['typeHint'] {
  const lowerText = text.toLowerCase()

  if (lowerText.startsWith('when ') || lowerText.includes(' when ')) {
    return 'when'
  }
  if (lowerText.startsWith('if ') || lowerText.includes(' if ')) {
    return 'if'
  }
  if (lowerText.startsWith('while ') || lowerText.includes(' while ')) {
    return 'while'
  }
  if (lowerText.includes('shall ') || lowerText.includes('must ') || lowerText.includes('should ')) {
    return 'shall'
  }

  return 'unknown'
}

/**
 * Parse tasks from a section, handling hierarchical structure
 */
function parseTasks(sectionContent: string | null): OpenSpecTask[] {
  if (!sectionContent) return []

  const tasks: OpenSpecTask[] = []
  const lines = sectionContent.split('\n')
  let currentPhase = ''
  let phaseCounter = 0
  let taskCounter = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check for phase/section headers
    const phaseMatch = trimmed.match(/^###?\s*(?:Phase\s*)?(\d+)(?:\.\s*|\s*:\s*)(.+)?$/i) ||
                       trimmed.match(/^###?\s*(\d+\.\d+)\s+(.+)$/i)
    if (phaseMatch) {
      phaseCounter++
      currentPhase = phaseMatch[1] || String(phaseCounter)
      taskCounter = 0
      continue
    }

    // Check for checkbox tasks
    const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s+(.+)$/)
    if (checkboxMatch) {
      taskCounter++
      const completed = checkboxMatch[1].toLowerCase() === 'x'
      const title = checkboxMatch[2].trim()
      const indent = line.match(/^(\s*)/)?.[1].length || 0

      const task: OpenSpecTask = {
        id: currentPhase ? `${currentPhase}.${taskCounter}` : String(taskCounter),
        title,
        status: completed ? 'completed' : 'pending',
      }

      // Handle subtasks (indented items)
      if (indent >= 2 && tasks.length > 0) {
        const parent = tasks[tasks.length - 1]
        task.parentId = parent.id
        if (!parent.subtasks) parent.subtasks = []
        parent.subtasks.push(task)
      } else {
        tasks.push(task)
      }
      continue
    }

    // Check for regular list items as tasks
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^(\d+)\.\s+(.+)$/)
    if (listMatch) {
      taskCounter++
      const title = listMatch[2] || listMatch[1]

      tasks.push({
        id: currentPhase ? `${currentPhase}.${taskCounter}` : String(taskCounter),
        title: title.trim(),
        status: 'pending',
      })
    }
  }

  return tasks
}

/**
 * Parse acceptance criteria from a section
 */
function parseAcceptanceCriteria(sectionContent: string | null): OpenSpecCriterion[] {
  if (!sectionContent) return []

  const criteria: OpenSpecCriterion[] = []
  const lines = sectionContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Check for checkbox format
    const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s+(.+)$/)
    if (checkboxMatch) {
      criteria.push({
        text: checkboxMatch[2].trim(),
        isCheckbox: true,
        completed: checkboxMatch[1].toLowerCase() === 'x',
      })
      continue
    }

    // Check for regular list items
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/)
    if (listMatch) {
      criteria.push({
        text: listMatch[1].trim(),
        isCheckbox: false,
      })
    }
  }

  return criteria
}

/**
 * Extract description from multiple possible sections
 */
function extractDescription(content: string, frontmatter: Record<string, unknown>): string | undefined {
  if (frontmatter.description) {
    return String(frontmatter.description)
  }

  // Try Why section first
  const why = extractSection(content, SECTION_PATTERNS.why)
  if (why) return why.split('\n').slice(0, 3).join(' ').trim()

  // Try Description section
  const desc = extractSection(content, SECTION_PATTERNS.description)
  if (desc) return desc.split('\n').slice(0, 3).join(' ').trim()

  // Try to get first paragraph after title
  const lines = content.split('\n')
  let foundTitle = false
  for (const line of lines) {
    if (line.startsWith('# ')) {
      foundTitle = true
      continue
    }
    if (foundTitle && line.trim() && !line.startsWith('#')) {
      return line.trim()
    }
    if (line.startsWith('#')) break
  }

  return undefined
}

/**
 * Parse Gherkin-style scenarios if present
 */
function parseScenarios(content: string): OpenSpecCriterion[] {
  const criteria: OpenSpecCriterion[] = []
  const scenarioMatches = content.matchAll(/####\s*Scenario:\s*(.+?)(?=####\s*Scenario:|$)/gis)

  for (const match of scenarioMatches) {
    const scenarioContent = match[0]
    const scenarioTitle = match[1].trim()

    // Extract WHEN/THEN from scenario
    const whenMatch = scenarioContent.match(/-\s*\*\*WHEN\*\*\s+(.+)/i)
    const thenMatch = scenarioContent.match(/-\s*\*\*THEN\*\*\s+(.+)/i)

    if (whenMatch && thenMatch) {
      criteria.push({
        text: `${scenarioTitle}: WHEN ${whenMatch[1].trim()} THEN ${thenMatch[1].trim()}`,
        isCheckbox: false,
      })
    }
  }

  return criteria
}

// =============================================
// Main Parser Function
// =============================================

/**
 * Parse an OpenSpec markdown file into structured data
 *
 * @param content - Raw markdown content of the OpenSpec file
 * @param defaultId - Default ID to use if not found in content
 * @returns Parsed OpenSpec structure
 */
export function parseOpenSpec(content: string, defaultId: string = 'unknown'): ParsedOpenSpec {
  // Parse frontmatter
  const { data: frontmatter, content: body } = matter(content)

  const foundSections: string[] = []
  const missingSections: string[] = []

  // Extract basic info
  const id = extractId(frontmatter, body, defaultId)
  const title = extractTitle(frontmatter, body, defaultId)
  const description = extractDescription(body, frontmatter)

  // Check and extract sections
  const checkSection = (name: string, pattern: RegExp): string | null => {
    const result = extractSection(body, pattern)
    if (result) {
      foundSections.push(name)
    } else {
      missingSections.push(name)
    }
    return result
  }

  // Parse requirements from multiple possible sources
  let requirements: OpenSpecRequirement[] = []
  const reqSection = checkSection('requirements', SECTION_PATTERNS.requirements)
  if (reqSection) {
    requirements = parseRequirements(reqSection)
  }

  // Also check What Changes section for requirements
  const whatChanges = extractSection(body, SECTION_PATTERNS.whatChanges)
  if (whatChanges && requirements.length === 0) {
    requirements = parseRequirements(whatChanges)
    if (requirements.length > 0) {
      foundSections.push('whatChanges')
    }
  }

  // Parse tasks from multiple possible sources
  let tasks: OpenSpecTask[] = []
  const tasksSection = checkSection('tasks', SECTION_PATTERNS.tasks)
  if (tasksSection) {
    tasks = parseTasks(tasksSection)
  }

  // Also check for Phase sections
  if (tasks.length === 0) {
    const phaseContent = extractSection(body, SECTION_PATTERNS.phase)
    if (phaseContent) {
      tasks = parseTasks(phaseContent)
      if (tasks.length > 0) {
        foundSections.push('phases')
      }
    }
  }

  // Parse acceptance criteria
  let acceptanceCriteria: OpenSpecCriterion[] = []
  const acSection = checkSection('acceptanceCriteria', SECTION_PATTERNS.acceptanceCriteria)
  if (acSection) {
    acceptanceCriteria = parseAcceptanceCriteria(acSection)
  }

  // Also check for Gherkin-style scenarios
  const scenarios = parseScenarios(body)
  if (scenarios.length > 0) {
    acceptanceCriteria = [...acceptanceCriteria, ...scenarios]
    if (!foundSections.includes('scenarios')) {
      foundSections.push('scenarios')
    }
  }

  return {
    id,
    title,
    description,
    requirements,
    tasks,
    acceptanceCriteria,
    metadata: frontmatter,
    foundSections,
    missingSections,
    rawContent: content,
  }
}

/**
 * Validate parsed OpenSpec has minimum required content
 *
 * @param parsed - Parsed OpenSpec structure
 * @returns Validation result with warnings
 */
export function validateParsedOpenSpec(parsed: ParsedOpenSpec): {
  isValid: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []

  // Check required fields
  if (!parsed.id || parsed.id === 'unknown') {
    errors.push('Missing SPEC ID')
  }

  if (!parsed.title || parsed.title === 'unknown') {
    warnings.push('Missing or default title')
  }

  // Check for content
  if (parsed.requirements.length === 0) {
    warnings.push('No requirements found - placeholder will be generated')
  }

  if (parsed.tasks.length === 0) {
    warnings.push('No tasks found - placeholder will be generated')
  }

  if (parsed.acceptanceCriteria.length === 0) {
    warnings.push('No acceptance criteria found - placeholder will be generated')
  }

  // Report missing sections
  if (parsed.missingSections.length > 0) {
    warnings.push(`Missing sections: ${parsed.missingSections.join(', ')}`)
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  }
}
