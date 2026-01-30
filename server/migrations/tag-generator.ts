/**
 * TAG Chain Generator (TAG-014)
 *
 * Converts OpenSpec tasks to TAG chain format for plan.md.
 * TAG format: TAG-{NUM} with hierarchical task structure.
 *
 * Output structure:
 * - TAG-001: First task
 * - TAG-002: Second task
 *   - Subtask details
 *   - Dependencies and acceptance criteria
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import type { ParsedOpenSpec, OpenSpecTask } from './openspec-parser.js'
import type { EarsRequirement } from './ears-generator.js'

// =============================================
// Types
// =============================================

/**
 * Generated TAG item
 */
export interface GeneratedTag {
  /** TAG identifier (e.g., TAG-001) */
  id: string
  /** Task title */
  title: string
  /** Task status */
  status: 'pending' | 'in_progress' | 'completed'
  /** File reference if applicable */
  file?: string
  /** Dependencies on other TAGs */
  dependencies?: string[]
  /** Brief acceptance criteria */
  acceptanceCriteria?: string[]
  /** Subtasks */
  subtasks?: GeneratedTag[]
  /** Original task for reference */
  original?: OpenSpecTask
}

/**
 * Generated plan.md content
 */
export interface GeneratedPlan {
  /** Complete plan.md content */
  content: string
  /** List of generated TAGs */
  tags: GeneratedTag[]
  /** Warnings during generation */
  warnings: string[]
}

// =============================================
// TAG Generation
// =============================================

/**
 * Convert OpenSpec tasks to TAG chain
 */
function convertTasksToTags(tasks: OpenSpecTask[]): GeneratedTag[] {
  const tags: GeneratedTag[] = []
  let tagCounter = 1

  for (const task of tasks) {
    const tag = convertTaskToTag(task, tagCounter)
    tags.push(tag)
    tagCounter++

    // Handle subtasks
    if (task.subtasks && task.subtasks.length > 0) {
      for (const subtask of task.subtasks) {
        const subTag = convertTaskToTag(subtask, tagCounter, tag.id)
        tags.push(subTag)
        tagCounter++
      }
    }
  }

  return tags
}

/**
 * Convert a single task to TAG format
 */
function convertTaskToTag(
  task: OpenSpecTask,
  index: number,
  parentId?: string
): GeneratedTag {
  const tagId = `TAG-${String(index).padStart(3, '0')}`

  // Detect file reference from task title
  const fileMatch = task.title.match(/`([^`]+\.[a-z]+)`/i) ||
                    task.title.match(/(\S+\.[a-z]{2,4})/i)
  const file = fileMatch ? fileMatch[1] : undefined

  // Generate basic acceptance criteria from task
  const acceptanceCriteria = generateAcceptanceCriteria(task)

  const tag: GeneratedTag = {
    id: tagId,
    title: cleanTaskTitle(task.title),
    status: task.status === 'completed' ? 'completed' : 'pending',
    file,
    acceptanceCriteria,
    original: task,
  }

  if (parentId) {
    tag.dependencies = [parentId]
  }

  return tag
}

/**
 * Clean task title for display
 */
function cleanTaskTitle(title: string): string {
  return title
    .replace(/^[-*]\s*/, '')
    .replace(/^\[[ xX]\]\s*/, '')
    .replace(/`[^`]+`/g, (match) => match) // Keep code blocks
    .trim()
}

/**
 * Generate acceptance criteria from task title
 */
function generateAcceptanceCriteria(task: OpenSpecTask): string[] {
  const criteria: string[] = []
  const title = task.title.toLowerCase()

  // Infer criteria from common task patterns
  if (title.includes('implement') || title.includes('create')) {
    criteria.push('Implementation complete and functional')
  }

  if (title.includes('test')) {
    criteria.push('All tests pass')
    criteria.push('Coverage meets threshold')
  }

  if (title.includes('api') || title.includes('endpoint')) {
    criteria.push('API endpoint responds correctly')
    criteria.push('Error handling implemented')
  }

  if (title.includes('validation') || title.includes('validate')) {
    criteria.push('Validation logic complete')
    criteria.push('Edge cases handled')
  }

  if (title.includes('database') || title.includes('schema')) {
    criteria.push('Database operations work correctly')
    criteria.push('Data integrity maintained')
  }

  // Default criteria if none matched
  if (criteria.length === 0) {
    criteria.push('Task completed successfully')
  }

  return criteria
}

/**
 * Group tasks by phase if phase information is available
 */
function groupTasksByPhase(tags: GeneratedTag[]): Map<string, GeneratedTag[]> {
  const phases = new Map<string, GeneratedTag[]>()

  for (const tag of tags) {
    if (tag.original?.id) {
      const phaseMatch = tag.original.id.match(/^(\d+)\./)
      const phase = phaseMatch ? `Phase ${phaseMatch[1]}` : 'Main Tasks'

      if (!phases.has(phase)) {
        phases.set(phase, [])
      }
      phases.get(phase)!.push(tag)
    } else {
      if (!phases.has('Main Tasks')) {
        phases.set('Main Tasks', [])
      }
      phases.get('Main Tasks')!.push(tag)
    }
  }

  return phases
}

// =============================================
// Plan Content Generation
// =============================================

/**
 * Generate plan.md header
 */
function generatePlanHeader(parsed: ParsedOpenSpec): string[] {
  const specId = parsed.id.startsWith('SPEC-')
    ? parsed.id
    : `SPEC-${parsed.id.toUpperCase()}`

  return [
    `# Implementation Plan: ${specId}`,
    '',
    `**SPEC ID**: ${specId}`,
    `**Title**: ${parsed.title}`,
    `**Version**: 1.0.0`,
    `**Status**: planned`,
    '',
    '---',
    '',
  ]
}

/**
 * Generate technology stack section
 */
function generateTechStackSection(parsed: ParsedOpenSpec): string[] {
  const lines = [
    '## Technology Stack',
    '',
    '### Core Dependencies',
    '',
    '| Library        | Version  | Purpose                          | Status      |',
    '|----------------|----------|----------------------------------|-------------|',
    '| TypeScript     | ~5.9.3   | Type-safe language               | Required    |',
  ]

  // Add any detected technologies from metadata or content
  if (parsed.metadata.dependencies) {
    const deps = Array.isArray(parsed.metadata.dependencies)
      ? parsed.metadata.dependencies
      : [parsed.metadata.dependencies]

    for (const dep of deps) {
      lines.push(`| ${dep}     | latest   | Dependency                       | Required    |`)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines
}

/**
 * Generate TAG section for a single TAG
 */
function generateTagSection(tag: GeneratedTag, requirements?: EarsRequirement[]): string[] {
  const lines: string[] = []

  lines.push(`#### ${tag.id}: ${tag.title}`)
  lines.push(`**Status**: ${tag.status}`)

  if (tag.file) {
    lines.push(`**File**: \`${tag.file}\``)
  }

  if (tag.dependencies && tag.dependencies.length > 0) {
    lines.push(`**Dependencies**: ${tag.dependencies.join(', ')}`)
  }

  lines.push('')
  lines.push('**Tasks**:')

  // Generate task list
  if (tag.original?.description) {
    lines.push(`- ${tag.original.description}`)
  } else {
    lines.push(`- Complete ${tag.title.toLowerCase()}`)
  }

  // Add subtask details if available
  if (tag.original?.subtasks && tag.original.subtasks.length > 0) {
    for (const subtask of tag.original.subtasks) {
      lines.push(`  - ${cleanTaskTitle(subtask.title)}`)
    }
  }

  lines.push('')
  lines.push('**Acceptance Criteria**:')

  if (tag.acceptanceCriteria && tag.acceptanceCriteria.length > 0) {
    for (const criterion of tag.acceptanceCriteria) {
      lines.push(`- ${criterion}`)
    }
  } else {
    lines.push('- Task completed successfully')
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines
}

/**
 * Generate risk analysis section
 */
function generateRiskSection(): string[] {
  return [
    '## Risk Analysis',
    '',
    '### Risk Areas',
    '',
    '| Risk | Impact | Probability | Mitigation |',
    '|------|--------|-------------|------------|',
    '| Implementation complexity | Medium | Medium | Incremental development |',
    '| Integration issues | Medium | Low | Comprehensive testing |',
    '| Timeline slippage | Low | Medium | Regular progress tracking |',
    '',
    '---',
    '',
  ]
}

/**
 * Generate deployment strategy section
 */
function generateDeploymentSection(): string[] {
  return [
    '## Deployment Strategy',
    '',
    '### Incremental Deployment',
    '',
    '1. Complete all TAGs in order',
    '2. Run tests after each TAG completion',
    '3. Review and validate before merging',
    '4. Deploy to staging environment',
    '5. Verify in staging before production',
    '',
    '---',
    '',
  ]
}

/**
 * Generate success criteria summary
 */
function generateSuccessCriteria(tags: GeneratedTag[]): string[] {
  const completedCount = tags.filter(t => t.status === 'completed').length
  const totalCount = tags.length

  return [
    '## Success Criteria Summary',
    '',
    '| Metric | Target | Current |',
    '|--------|--------|---------|',
    `| TAGs Completed | ${totalCount}/${totalCount} | ${completedCount}/${totalCount} |`,
    '| Tests Passing | 100% | - |',
    '| Coverage | >85% | - |',
    '| Type Errors | 0 | - |',
    '',
    '---',
    '',
    '**End of Implementation Plan**',
    '',
  ]
}

// =============================================
// Main Generator Function
// =============================================

/**
 * Generate TAG chain plan.md content from parsed OpenSpec
 *
 * @param parsed - Parsed OpenSpec structure
 * @param requirements - Optional EARS requirements for linking
 * @returns Generated plan.md content with TAG chain
 */
export function generateTagChain(
  parsed: ParsedOpenSpec,
  requirements?: EarsRequirement[]
): GeneratedPlan {
  const warnings: string[] = []

  // Convert tasks to TAGs
  let tags: GeneratedTag[] = []

  if (parsed.tasks.length > 0) {
    tags = convertTasksToTags(parsed.tasks)
  } else {
    // Generate placeholder TAGs from requirements if no tasks
    if (requirements && requirements.length > 0) {
      tags = requirements.map((req, index) => ({
        id: `TAG-${String(index + 1).padStart(3, '0')}`,
        title: `Implement ${req.id}`,
        status: 'pending' as const,
        acceptanceCriteria: [`${req.id} fully implemented`, 'Tests passing'],
      }))
      warnings.push('No tasks found, generated TAGs from requirements')
    } else {
      // Generate minimal placeholder
      tags = [{
        id: 'TAG-001',
        title: 'Implementation Task',
        status: 'pending',
        acceptanceCriteria: ['Task completed successfully'],
      }]
      warnings.push('No tasks found, placeholder TAG-001 added')
    }
  }

  // Build content
  const contentLines: string[] = []

  // Header
  contentLines.push(...generatePlanHeader(parsed))

  // Technology Stack
  contentLines.push(...generateTechStackSection(parsed))

  // Implementation Phases
  contentLines.push('## Implementation Phases')
  contentLines.push('')

  // Group tags by phase
  const phases = groupTasksByPhase(tags)

  for (const [phaseName, phaseTags] of phases) {
    contentLines.push(`### **${phaseName}**`)
    contentLines.push('')
    contentLines.push(`**Objective**: Complete ${phaseName.toLowerCase()} tasks`)
    contentLines.push('')
    contentLines.push(`**Estimated TAGs**: ${phaseTags.length}`)
    contentLines.push('')

    for (const tag of phaseTags) {
      contentLines.push(...generateTagSection(tag, requirements))
    }
  }

  // Risk Analysis
  contentLines.push(...generateRiskSection())

  // Deployment Strategy
  contentLines.push(...generateDeploymentSection())

  // Success Criteria
  contentLines.push(...generateSuccessCriteria(tags))

  return {
    content: contentLines.join('\n'),
    tags,
    warnings,
  }
}

/**
 * Format TAG for simple list output
 */
export function formatTagList(tags: GeneratedTag[]): string {
  const lines: string[] = []

  for (const tag of tags) {
    const status = tag.status === 'completed' ? '[x]' : '[ ]'
    lines.push(`- ${status} **${tag.id}**: ${tag.title}`)

    if (tag.dependencies && tag.dependencies.length > 0) {
      lines.push(`  - Dependencies: ${tag.dependencies.join(', ')}`)
    }
  }

  return lines.join('\n')
}
