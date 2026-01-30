/**
 * EARS Generator (TAG-013)
 *
 * Converts OpenSpec requirements to EARS (Easy Approach to Requirements Syntax) format.
 * EARS patterns:
 * - WHEN (event-driven): WHEN <trigger>, the system SHALL <response>
 * - IF (state-driven): IF <condition>, THEN the system SHALL <response>
 * - WHILE (ongoing): WHILE <state>, the system SHALL <response>
 * - WHERE (feature): WHERE <feature>, the system SHALL <response>
 * - SHALL (ubiquitous): The system SHALL <response>
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 * @see Mavin et al., 2009 - Easy Approach to Requirements Syntax
 */
import type { ParsedOpenSpec, OpenSpecRequirement } from './openspec-parser.js'

// =============================================
// Types
// =============================================

/**
 * EARS requirement pattern types
 */
export type EarsPattern = 'when' | 'if' | 'while' | 'where' | 'shall'

/**
 * Generated EARS requirement
 */
export interface EarsRequirement {
  /** Requirement ID (e.g., FR-001) */
  id: string
  /** EARS pattern type */
  pattern: EarsPattern
  /** Full EARS-formatted requirement text */
  text: string
  /** Original requirement text for reference */
  original: string
  /** Whether this was auto-converted */
  autoConverted: boolean
}

/**
 * Generated EARS spec.md content
 */
export interface GeneratedEarsSpec {
  /** Complete spec.md content */
  content: string
  /** List of generated requirements */
  requirements: EarsRequirement[]
  /** Warnings during generation */
  warnings: string[]
}

// =============================================
// EARS Pattern Detection and Conversion
// =============================================

/**
 * Detect the most appropriate EARS pattern for a requirement
 */
function detectEarsPattern(text: string, typeHint?: string): EarsPattern {
  const lowerText = text.toLowerCase()

  // Use type hint if provided
  if (typeHint && typeHint !== 'unknown') {
    return typeHint as EarsPattern
  }

  // Detect event-driven (WHEN)
  if (
    lowerText.startsWith('when ') ||
    lowerText.includes(' when ') ||
    lowerText.includes('upon ') ||
    lowerText.includes('after ') ||
    lowerText.includes('on ') && lowerText.includes(' event')
  ) {
    return 'when'
  }

  // Detect state-driven (IF)
  if (
    lowerText.startsWith('if ') ||
    lowerText.includes(' if ') ||
    lowerText.includes('provided that') ||
    lowerText.includes('in case')
  ) {
    return 'if'
  }

  // Detect ongoing (WHILE)
  if (
    lowerText.startsWith('while ') ||
    lowerText.includes(' while ') ||
    lowerText.includes('during ') ||
    lowerText.includes('as long as')
  ) {
    return 'while'
  }

  // Detect feature-specific (WHERE)
  if (
    lowerText.startsWith('where ') ||
    lowerText.includes(' where ') ||
    lowerText.includes('for ') && lowerText.includes(' feature')
  ) {
    return 'where'
  }

  // Default to ubiquitous (SHALL)
  return 'shall'
}

/**
 * Convert a requirement to EARS format
 */
function convertToEars(req: OpenSpecRequirement, index: number): EarsRequirement {
  const pattern = detectEarsPattern(req.text, req.typeHint)
  const id = `FR-${String(index + 1).padStart(3, '0')}`
  let text: string
  let autoConverted = false

  // Normalize the text
  const cleanText = req.text
    .replace(/^[-*]\s*/, '')
    .replace(/\*\*BREAKING\*\*/i, '')
    .trim()

  switch (pattern) {
    case 'when':
      text = formatWhenPattern(cleanText)
      autoConverted = !cleanText.toLowerCase().startsWith('when ')
      break

    case 'if':
      text = formatIfPattern(cleanText)
      autoConverted = !cleanText.toLowerCase().startsWith('if ')
      break

    case 'while':
      text = formatWhilePattern(cleanText)
      autoConverted = !cleanText.toLowerCase().startsWith('while ')
      break

    case 'where':
      text = formatWherePattern(cleanText)
      autoConverted = !cleanText.toLowerCase().startsWith('where ')
      break

    case 'shall':
    default:
      text = formatShallPattern(cleanText)
      autoConverted = true
      break
  }

  return {
    id,
    pattern,
    text,
    original: req.text,
    autoConverted,
  }
}

/**
 * Format WHEN pattern
 */
function formatWhenPattern(text: string): string {
  const lowerText = text.toLowerCase()

  // Already has WHEN format
  if (lowerText.startsWith('when ')) {
    // Ensure proper SHALL placement
    if (!lowerText.includes(' shall ')) {
      const parts = text.split(/,\s*/);
      if (parts.length >= 2) {
        return `WHEN ${parts[0].replace(/^when\s+/i, '')}, the system SHALL ${parts.slice(1).join(', ')}.`
      }
      return `WHEN ${text.replace(/^when\s+/i, '')}, the system SHALL respond accordingly.`
    }
    return text.replace(/^when\s+/i, 'WHEN ').replace(/\bshall\b/gi, 'SHALL')
  }

  // Convert to WHEN format
  return `WHEN the user ${text}, the system SHALL respond accordingly.`
}

/**
 * Format IF pattern
 */
function formatIfPattern(text: string): string {
  const lowerText = text.toLowerCase()

  // Already has IF format
  if (lowerText.startsWith('if ')) {
    // Ensure proper THEN placement
    if (!lowerText.includes(' then ')) {
      const parts = text.split(/,\s*/);
      if (parts.length >= 2) {
        return `IF ${parts[0].replace(/^if\s+/i, '')}, THEN the system SHALL ${parts.slice(1).join(', ')}.`
      }
    }
    return text
      .replace(/^if\s+/i, 'IF ')
      .replace(/\bthen\b/gi, 'THEN')
      .replace(/\bshall\b/gi, 'SHALL')
  }

  // Convert to IF format
  return `IF ${text}, THEN the system SHALL handle appropriately.`
}

/**
 * Format WHILE pattern
 */
function formatWhilePattern(text: string): string {
  const lowerText = text.toLowerCase()

  // Already has WHILE format
  if (lowerText.startsWith('while ')) {
    if (!lowerText.includes(' shall ')) {
      const parts = text.split(/,\s*/);
      if (parts.length >= 2) {
        return `WHILE ${parts[0].replace(/^while\s+/i, '')}, the system SHALL ${parts.slice(1).join(', ')}.`
      }
    }
    return text.replace(/^while\s+/i, 'WHILE ').replace(/\bshall\b/gi, 'SHALL')
  }

  // Convert to WHILE format
  return `WHILE ${text}, the system SHALL maintain the state.`
}

/**
 * Format WHERE pattern
 */
function formatWherePattern(text: string): string {
  const lowerText = text.toLowerCase()

  // Already has WHERE format
  if (lowerText.startsWith('where ')) {
    return text.replace(/^where\s+/i, 'WHERE ').replace(/\bshall\b/gi, 'SHALL')
  }

  // Convert to WHERE format
  return `WHERE ${text} is enabled, the system SHALL provide the functionality.`
}

/**
 * Format SHALL (ubiquitous) pattern
 */
function formatShallPattern(text: string): string {
  const lowerText = text.toLowerCase()

  // Already has SHALL
  if (lowerText.includes(' shall ') || lowerText.includes(' must ')) {
    return `The system ${text.replace(/\bshall\b/gi, 'SHALL').replace(/\bmust\b/gi, 'SHALL')}.`
  }

  // Convert to SHALL format
  return `The system SHALL ${text}.`
}

// =============================================
// YAML Frontmatter Generation
// =============================================

/**
 * Generate YAML frontmatter for spec.md
 */
function generateFrontmatter(parsed: ParsedOpenSpec): string {
  const today = new Date().toISOString().split('T')[0]

  const lines = [
    '---',
    `spec_id: ${parsed.id.startsWith('SPEC-') ? parsed.id : `SPEC-${parsed.id.toUpperCase()}`}`,
    `title: ${parsed.title}`,
    'version: 1.0.0',
    'status: planned',
    `created: ${parsed.metadata.created || today}`,
    `updated: ${today}`,
    'author: migration-tool',
    'priority: medium',
    'dependencies: []',
  ]

  // Add tags if available
  if (parsed.metadata.tags) {
    const tags = Array.isArray(parsed.metadata.tags)
      ? parsed.metadata.tags
      : [parsed.metadata.tags]
    lines.push(`tags: [${tags.join(', ')}]`)
  }

  lines.push('lifecycle: spec-anchored')
  lines.push('---')

  return lines.join('\n')
}

// =============================================
// Main Generator Function
// =============================================

/**
 * Generate EARS-formatted spec.md content from parsed OpenSpec
 *
 * @param parsed - Parsed OpenSpec structure
 * @returns Generated spec.md content with EARS requirements
 */
export function generateEarsSpec(parsed: ParsedOpenSpec): GeneratedEarsSpec {
  const warnings: string[] = []
  const requirements: EarsRequirement[] = []

  // Generate frontmatter
  const frontmatter = generateFrontmatter(parsed)

  // Start content
  const contentLines: string[] = [
    frontmatter,
    '',
    `# ${parsed.id.startsWith('SPEC-') ? parsed.id : `SPEC-${parsed.id.toUpperCase()}`}: ${parsed.title}`,
    '',
    '## HISTORY',
    '',
    '| Version | Date       | Author          | Changes                           |',
    '|---------|------------|-----------------|-----------------------------------|',
    `| 1.0.0   | ${new Date().toISOString().split('T')[0]} | migration-tool  | Initial migration from OpenSpec   |`,
    '',
    '---',
    '',
    '## Overview',
    '',
  ]

  // Add description
  if (parsed.description) {
    contentLines.push(parsed.description)
  } else {
    contentLines.push(`This specification defines the requirements for ${parsed.title}.`)
    warnings.push('No description found, placeholder added')
  }

  contentLines.push('')
  contentLines.push('---')
  contentLines.push('')

  // Generate EARS requirements
  contentLines.push('## Functional Requirements')
  contentLines.push('')

  if (parsed.requirements.length > 0) {
    parsed.requirements.forEach((req, index) => {
      const earsReq = convertToEars(req, index)
      requirements.push(earsReq)

      contentLines.push(`### ${earsReq.id}: ${getRequirementTitle(earsReq)}`)
      contentLines.push('')
      contentLines.push(`**[EARS: ${getEarsLabel(earsReq.pattern)}]**`)
      contentLines.push(earsReq.text)
      contentLines.push('')

      if (earsReq.autoConverted) {
        contentLines.push(`<!-- Original: ${earsReq.original} -->`)
        contentLines.push('')
      }
    })
  } else {
    // Generate placeholder requirement
    contentLines.push('### FR-001: Core Functionality')
    contentLines.push('')
    contentLines.push('**[EARS: Ubiquitous]**')
    contentLines.push('<!-- TODO: Manual review required -->')
    contentLines.push('The system SHALL implement the core functionality as specified.')
    contentLines.push('')
    warnings.push('No requirements found, placeholder FR-001 added')
  }

  contentLines.push('---')
  contentLines.push('')

  // Add constraints section
  contentLines.push('## Constraints')
  contentLines.push('')
  contentLines.push('### Technical Constraints')
  contentLines.push('')
  contentLines.push('- TypeScript strict mode enabled')
  contentLines.push('- All code must pass type checking')
  contentLines.push('')

  // Add scope section
  contentLines.push('---')
  contentLines.push('')
  contentLines.push('## Scope')
  contentLines.push('')
  contentLines.push('### In Scope')
  contentLines.push('')
  if (parsed.requirements.length > 0) {
    parsed.requirements.forEach((req, index) => {
      contentLines.push(`- ${requirements[index]?.id || `FR-${index + 1}`}: ${getShortDescription(req.text)}`)
    })
  } else {
    contentLines.push('- Core functionality implementation')
  }
  contentLines.push('')
  contentLines.push('### Out of Scope')
  contentLines.push('')
  contentLines.push('- Future enhancements not specified in this document')
  contentLines.push('')

  // Add success criteria summary
  contentLines.push('---')
  contentLines.push('')
  contentLines.push('## Success Criteria')
  contentLines.push('')
  if (parsed.acceptanceCriteria.length > 0) {
    parsed.acceptanceCriteria.forEach(criterion => {
      contentLines.push(`- ${criterion.text}`)
    })
  } else {
    contentLines.push('- All functional requirements implemented and tested')
    contentLines.push('- 85%+ code coverage achieved')
    warnings.push('No acceptance criteria found, defaults added')
  }
  contentLines.push('')

  // Add references
  contentLines.push('---')
  contentLines.push('')
  contentLines.push('## References')
  contentLines.push('')
  contentLines.push('### Migration Source')
  contentLines.push('')
  contentLines.push(`- Migrated from OpenSpec format`)
  if (parsed.metadata.source) {
    contentLines.push(`- Original source: ${parsed.metadata.source}`)
  }
  contentLines.push('')
  contentLines.push('---')
  contentLines.push('')
  contentLines.push(`**End of ${parsed.id.startsWith('SPEC-') ? parsed.id : `SPEC-${parsed.id.toUpperCase()}`}**`)
  contentLines.push('')

  return {
    content: contentLines.join('\n'),
    requirements,
    warnings,
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Get EARS label for display
 */
function getEarsLabel(pattern: EarsPattern): string {
  switch (pattern) {
    case 'when':
      return 'Event-Driven'
    case 'if':
      return 'State-Driven'
    case 'while':
      return 'Ongoing'
    case 'where':
      return 'Feature-Specific'
    case 'shall':
    default:
      return 'Ubiquitous'
  }
}

/**
 * Extract a short title from requirement text
 */
function getRequirementTitle(req: EarsRequirement): string {
  // Try to extract meaningful title from the requirement
  const text = req.original.replace(/^[-*]\s*/, '').trim()
  const words = text.split(/\s+/).slice(0, 5)
  return words.join(' ') + (words.length < text.split(/\s+/).length ? '...' : '')
}

/**
 * Get short description for scope section
 */
function getShortDescription(text: string): string {
  const clean = text.replace(/^[-*]\s*/, '').trim()
  if (clean.length <= 60) return clean
  return clean.slice(0, 57) + '...'
}
