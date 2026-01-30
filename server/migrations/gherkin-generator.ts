/**
 * Gherkin Generator (TAG-015)
 *
 * Converts acceptance criteria to Gherkin format (Given/When/Then).
 * Generates acceptance.md with structured test scenarios.
 *
 * Gherkin format:
 * - Feature: High-level description
 * - Scenario: Specific test case
 *   - Given: Initial context
 *   - When: Action/event
 *   - Then: Expected outcome
 *   - And: Additional conditions
 *
 * @see SPEC-VISIBILITY-001 Phase 3
 */
import type { ParsedOpenSpec, OpenSpecCriterion } from './openspec-parser.js'
import type { EarsRequirement } from './ears-generator.js'

// =============================================
// Types
// =============================================

/**
 * Gherkin step type
 */
export type GherkinStepType = 'Given' | 'When' | 'Then' | 'And' | 'But'

/**
 * Single Gherkin step
 */
export interface GherkinStep {
  type: GherkinStepType
  text: string
}

/**
 * Gherkin scenario
 */
export interface GherkinScenario {
  /** Scenario name */
  name: string
  /** Optional description */
  description?: string
  /** Scenario steps */
  steps: GherkinStep[]
  /** Optional tags (e.g., @smoke, @regression) */
  tags?: string[]
  /** Is this a Scenario Outline with examples? */
  isOutline?: boolean
  /** Example data for Scenario Outline */
  examples?: Array<Record<string, string>>
}

/**
 * Gherkin feature
 */
export interface GherkinFeature {
  /** Feature name */
  name: string
  /** Feature description */
  description?: string
  /** Background steps (run before each scenario) */
  background?: GherkinStep[]
  /** Scenarios in this feature */
  scenarios: GherkinScenario[]
  /** Feature tags */
  tags?: string[]
}

/**
 * Generated acceptance.md content
 */
export interface GeneratedAcceptance {
  /** Complete acceptance.md content */
  content: string
  /** Generated feature structure */
  feature: GherkinFeature
  /** Warnings during generation */
  warnings: string[]
}

// =============================================
// Gherkin Pattern Detection
// =============================================

/**
 * Common patterns for detecting Given/When/Then components
 */
const PATTERNS = {
  // Given patterns - initial state/context
  given: [
    /^(?:given|assuming|provided|with)\s+/i,
    /^(?:the user|the system|an? )\s+(?:is|has|exists)/i,
    /^(?:there (?:is|are|exists?))\s+/i,
  ],

  // When patterns - actions/events
  when: [
    /^(?:when|if|upon|after)\s+/i,
    /^(?:the user|the system)\s+(?:clicks?|submits?|enters?|selects?|triggers?)/i,
    /^(?:on|during)\s+/i,
  ],

  // Then patterns - expected outcomes
  then: [
    /^(?:then|should|shall|must|expect)\s+/i,
    /^(?:the system|the user|it)\s+(?:should|shall|must|will)/i,
    /^(?:verify|ensure|confirm|check)\s+/i,
  ],
}

/**
 * Detect Gherkin step type from text
 */
function detectStepType(text: string): GherkinStepType {
  const lowerText = text.toLowerCase()

  for (const pattern of PATTERNS.given) {
    if (pattern.test(lowerText)) return 'Given'
  }

  for (const pattern of PATTERNS.when) {
    if (pattern.test(lowerText)) return 'When'
  }

  for (const pattern of PATTERNS.then) {
    if (pattern.test(lowerText)) return 'Then'
  }

  // Default to Then for acceptance criteria
  return 'Then'
}

// =============================================
// Conversion Functions
// =============================================

/**
 * Convert an acceptance criterion to Gherkin scenario
 */
function criterionToScenario(
  criterion: OpenSpecCriterion,
  index: number
): GherkinScenario {
  const text = criterion.text
  const steps: GherkinStep[] = []

  // Try to parse existing WHEN/THEN structure
  const whenThenMatch = text.match(/WHEN\s+(.+?)\s+THEN\s+(.+)/i)
  if (whenThenMatch) {
    steps.push({ type: 'Given', text: 'the system is in a valid state' })
    steps.push({ type: 'When', text: whenThenMatch[1].trim() })
    steps.push({ type: 'Then', text: whenThenMatch[2].trim() })

    return {
      name: extractScenarioName(criterion.text),
      steps,
    }
  }

  // Try to parse Given/When/Then from text
  const givenMatch = text.match(/given\s+(.+?)(?=when|then|$)/i)
  const whenMatch = text.match(/when\s+(.+?)(?=then|$)/i)
  const thenMatch = text.match(/then\s+(.+)/i)

  if (givenMatch || whenMatch || thenMatch) {
    if (givenMatch) steps.push({ type: 'Given', text: givenMatch[1].trim() })
    if (whenMatch) steps.push({ type: 'When', text: whenMatch[1].trim() })
    if (thenMatch) steps.push({ type: 'Then', text: thenMatch[1].trim() })

    // Ensure we have at least a Then
    if (steps.length === 0 || !steps.find(s => s.type === 'Then')) {
      steps.push({ type: 'Then', text: text })
    }

    return {
      name: extractScenarioName(criterion.text),
      steps,
    }
  }

  // Default: generate steps from criterion text
  return generateDefaultScenario(criterion, index)
}

/**
 * Generate a default scenario from criterion text
 */
function generateDefaultScenario(
  criterion: OpenSpecCriterion,
  index: number
): GherkinScenario {
  const text = criterion.text
  const steps: GherkinStep[] = []

  // Detect step type from the criterion text
  const detectedType = detectStepType(text)

  // Generate context-appropriate steps
  if (detectedType === 'Given') {
    steps.push({ type: 'Given', text: cleanStepText(text) })
    steps.push({ type: 'When', text: 'the relevant action is performed' })
    steps.push({ type: 'Then', text: 'the system behaves correctly' })
  } else if (detectedType === 'When') {
    steps.push({ type: 'Given', text: 'the system is ready' })
    steps.push({ type: 'When', text: cleanStepText(text) })
    steps.push({ type: 'Then', text: 'the expected outcome occurs' })
  } else {
    // Default: treat as expected outcome (Then)
    steps.push({ type: 'Given', text: 'the system is in a valid state' })
    steps.push({ type: 'When', text: 'the user performs the action' })
    steps.push({ type: 'Then', text: cleanStepText(text) })
  }

  return {
    name: extractScenarioName(text) || `Scenario ${index + 1}`,
    steps,
  }
}

/**
 * Extract a scenario name from criterion text
 */
function extractScenarioName(text: string): string {
  // Remove common prefixes
  let name = text
    .replace(/^[-*]\s*\[[ xX]\]\s*/, '')
    .replace(/^(?:should|shall|must|verify|ensure|check)\s+/i, '')
    .replace(/^(?:the system|it)\s+(?:should|shall|must)\s+/i, '')
    .trim()

  // Capitalize first letter
  name = name.charAt(0).toUpperCase() + name.slice(1)

  // Truncate if too long
  if (name.length > 80) {
    name = name.slice(0, 77) + '...'
  }

  // Remove trailing punctuation
  name = name.replace(/[.!?]$/, '')

  return name
}

/**
 * Clean step text for Gherkin format
 */
function cleanStepText(text: string): string {
  return text
    .replace(/^[-*]\s*\[[ xX]\]\s*/, '')
    .replace(/^(?:given|when|then|and|but)\s+/i, '')
    .replace(/^(?:should|shall|must)\s+/i, '')
    .replace(/^(?:the system|it)\s+/, '')
    .trim()
}

/**
 * Convert EARS requirements to Gherkin scenarios
 */
function requirementToScenario(req: EarsRequirement): GherkinScenario {
  const steps: GherkinStep[] = []
  const text = req.text

  // Parse EARS patterns
  switch (req.pattern) {
    case 'when':
      {
        const match = text.match(/WHEN\s+(.+?),?\s+(?:the system\s+)?SHALL\s+(.+)/i)
        if (match) {
          steps.push({ type: 'Given', text: 'the system is in normal operation' })
          steps.push({ type: 'When', text: match[1].trim() })
          steps.push({ type: 'Then', text: match[2].trim().replace(/\.$/, '') })
        }
      }
      break

    case 'if':
      {
        const match = text.match(/IF\s+(.+?),?\s+THEN\s+(?:the system\s+)?SHALL\s+(.+)/i)
        if (match) {
          steps.push({ type: 'Given', text: match[1].trim() })
          steps.push({ type: 'When', text: 'the condition is evaluated' })
          steps.push({ type: 'Then', text: match[2].trim().replace(/\.$/, '') })
        }
      }
      break

    case 'while':
      {
        const match = text.match(/WHILE\s+(.+?),?\s+(?:the system\s+)?SHALL\s+(.+)/i)
        if (match) {
          steps.push({ type: 'Given', text: match[1].trim() })
          steps.push({ type: 'When', text: 'the state is maintained' })
          steps.push({ type: 'Then', text: match[2].trim().replace(/\.$/, '') })
        }
      }
      break

    default:
      {
        const match = text.match(/(?:The system\s+)?SHALL\s+(.+)/i)
        if (match) {
          steps.push({ type: 'Given', text: 'the system is available' })
          steps.push({ type: 'When', text: 'the functionality is invoked' })
          steps.push({ type: 'Then', text: match[1].trim().replace(/\.$/, '') })
        }
      }
  }

  // Fallback if no steps generated
  if (steps.length === 0) {
    steps.push({ type: 'Given', text: 'the system is ready' })
    steps.push({ type: 'When', text: 'the requirement is tested' })
    steps.push({ type: 'Then', text: 'it meets the specification' })
  }

  return {
    name: `${req.id}: ${extractScenarioName(req.original)}`,
    steps,
    tags: [`@${req.id}`],
  }
}

// =============================================
// Content Generation
// =============================================

/**
 * Format a single Gherkin step
 */
function formatStep(step: GherkinStep, indent: string = '    '): string {
  return `${indent}${step.type} ${step.text}`
}

/**
 * Format a Gherkin scenario
 */
function formatScenario(scenario: GherkinScenario): string[] {
  const lines: string[] = []

  // Tags
  if (scenario.tags && scenario.tags.length > 0) {
    lines.push(`  ${scenario.tags.join(' ')}`)
  }

  // Scenario header
  const scenarioType = scenario.isOutline ? 'Scenario Outline' : 'Scenario'
  lines.push(`  ${scenarioType}: ${scenario.name}`)

  // Description
  if (scenario.description) {
    lines.push(`    ${scenario.description}`)
  }

  // Steps
  for (const step of scenario.steps) {
    lines.push(formatStep(step))
  }

  // Examples for Scenario Outline
  if (scenario.isOutline && scenario.examples && scenario.examples.length > 0) {
    lines.push('')
    lines.push('    Examples:')
    const keys = Object.keys(scenario.examples[0])
    lines.push(`      | ${keys.join(' | ')} |`)
    for (const example of scenario.examples) {
      const values = keys.map(k => example[k] || '')
      lines.push(`      | ${values.join(' | ')} |`)
    }
  }

  return lines
}

/**
 * Format a complete Gherkin feature
 */
function formatFeature(feature: GherkinFeature): string {
  const lines: string[] = []

  // Feature tags
  if (feature.tags && feature.tags.length > 0) {
    lines.push(feature.tags.join(' '))
  }

  // Feature header
  lines.push(`Feature: ${feature.name}`)

  // Description
  if (feature.description) {
    lines.push(`  ${feature.description}`)
  }

  lines.push('')

  // Background
  if (feature.background && feature.background.length > 0) {
    lines.push('  Background:')
    for (const step of feature.background) {
      lines.push(formatStep(step))
    }
    lines.push('')
  }

  // Scenarios
  for (let i = 0; i < feature.scenarios.length; i++) {
    if (i > 0) lines.push('')
    lines.push(...formatScenario(feature.scenarios[i]))
  }

  return lines.join('\n')
}

/**
 * Generate acceptance.md header
 */
function generateHeader(parsed: ParsedOpenSpec): string[] {
  const specId = parsed.id.startsWith('SPEC-')
    ? parsed.id
    : `SPEC-${parsed.id.toUpperCase()}`

  return [
    `# Acceptance Criteria: ${specId}`,
    '',
    `**SPEC ID**: ${specId}`,
    `**Title**: ${parsed.title}`,
    `**Version**: 1.0.0`,
    '',
    '---',
    '',
    '## Overview',
    '',
    'This document defines the acceptance criteria in Gherkin format (Given/When/Then).',
    'Each scenario represents a testable requirement that must pass for acceptance.',
    '',
    '---',
    '',
  ]
}

/**
 * Generate edge cases section
 */
function generateEdgeCases(feature: GherkinFeature): string[] {
  const lines = [
    '## Edge Cases',
    '',
    'The following edge cases should be considered during testing:',
    '',
  ]

  // Generate common edge cases based on feature content
  const edgeCases = [
    'Empty or null inputs',
    'Maximum length inputs',
    'Concurrent access scenarios',
    'Network failure recovery',
    'Invalid authentication tokens',
  ]

  for (const edgeCase of edgeCases) {
    lines.push(`- [ ] ${edgeCase}`)
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines
}

/**
 * Generate test coverage matrix
 */
function generateCoverageMatrix(
  feature: GherkinFeature,
  requirements?: EarsRequirement[]
): string[] {
  const lines = [
    '## Test Coverage Matrix',
    '',
    '| Requirement | Scenario | Status |',
    '|-------------|----------|--------|',
  ]

  for (const scenario of feature.scenarios) {
    const reqId = scenario.tags?.find(t => t.startsWith('@FR-') || t.startsWith('@REQ-'))?.slice(1) || '-'
    lines.push(`| ${reqId} | ${scenario.name.slice(0, 40)} | Pending |`)
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines
}

// =============================================
// Main Generator Function
// =============================================

/**
 * Generate Gherkin-formatted acceptance.md from parsed OpenSpec
 *
 * @param parsed - Parsed OpenSpec structure
 * @param requirements - Optional EARS requirements for enhanced scenarios
 * @returns Generated acceptance.md content with Gherkin scenarios
 */
export function generateGherkinCriteria(
  parsed: ParsedOpenSpec,
  requirements?: EarsRequirement[]
): GeneratedAcceptance {
  const warnings: string[] = []
  const scenarios: GherkinScenario[] = []

  // Generate scenarios from acceptance criteria
  if (parsed.acceptanceCriteria.length > 0) {
    for (let i = 0; i < parsed.acceptanceCriteria.length; i++) {
      const scenario = criterionToScenario(parsed.acceptanceCriteria[i], i)
      scenarios.push(scenario)
    }
  }

  // Generate additional scenarios from EARS requirements
  if (requirements && requirements.length > 0) {
    for (const req of requirements) {
      const scenario = requirementToScenario(req)
      // Avoid duplicates
      if (!scenarios.find(s => s.name.includes(req.id))) {
        scenarios.push(scenario)
      }
    }
  }

  // Generate placeholder if no scenarios
  if (scenarios.length === 0) {
    scenarios.push({
      name: 'Core Functionality Works',
      steps: [
        { type: 'Given', text: 'the system is properly configured' },
        { type: 'When', text: 'the user invokes the core functionality' },
        { type: 'Then', text: 'the system responds correctly' },
      ],
    })
    warnings.push('No acceptance criteria found, placeholder scenario added')
  }

  // Create feature
  const specId = parsed.id.startsWith('SPEC-')
    ? parsed.id
    : `SPEC-${parsed.id.toUpperCase()}`

  const feature: GherkinFeature = {
    name: parsed.title,
    description: parsed.description,
    scenarios,
    tags: [`@${specId}`],
  }

  // Build content
  const contentLines: string[] = []

  // Header
  contentLines.push(...generateHeader(parsed))

  // Gherkin Feature
  contentLines.push('## Acceptance Scenarios')
  contentLines.push('')
  contentLines.push('```gherkin')
  contentLines.push(formatFeature(feature))
  contentLines.push('```')
  contentLines.push('')
  contentLines.push('---')
  contentLines.push('')

  // Edge Cases
  contentLines.push(...generateEdgeCases(feature))

  // Coverage Matrix
  contentLines.push(...generateCoverageMatrix(feature, requirements))

  // Validation Checklist
  contentLines.push('## Validation Checklist')
  contentLines.push('')
  contentLines.push('Before marking this SPEC as complete, verify:')
  contentLines.push('')
  contentLines.push('- [ ] All scenarios pass in test suite')
  contentLines.push('- [ ] Edge cases have been tested')
  contentLines.push('- [ ] Code coverage meets threshold (85%+)')
  contentLines.push('- [ ] No regression in existing functionality')
  contentLines.push('- [ ] Documentation is up to date')
  contentLines.push('')
  contentLines.push('---')
  contentLines.push('')
  contentLines.push(`**End of Acceptance Criteria for ${specId}**`)
  contentLines.push('')

  return {
    content: contentLines.join('\n'),
    feature,
    warnings,
  }
}
