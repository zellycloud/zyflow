/**
 * MoAI SPEC Parser
 * Parses MoAI SPEC documents: plan.md, acceptance.md, spec.md
 *
 * Uses regex/string parsing (no external libraries) consistent
 * with the existing OpenSpec parser approach.
 */

import type {
  SpecFrontmatter,
  ParsedTag,
  ParsedCondition,
  ParsedMoaiPlan,
  ParsedAcceptanceCriteria,
  ParsedMoaiAcceptance,
  ParsedRequirement,
  ParsedMoaiSpec,
} from './moai-types.js'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter between --- markers.
 * Handles simple key: value pairs, arrays in [] notation, and bare values.
 */
export function parseFrontmatter(content: string): SpecFrontmatter {
  const fm: Record<string, unknown> = {}

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return { spec_id: '', phase: '', created: '' }
  }

  const lines = match[1].split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    const rawValue = line.slice(colonIdx + 1).trim()

    if (!key) continue

    // Array notation: [item1, item2]
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1).trim()
      if (inner === '') {
        fm[key] = []
      } else {
        fm[key] = inner.split(',').map((s) => s.trim())
      }
      continue
    }

    // Numeric values
    if (/^\d+$/.test(rawValue)) {
      fm[key] = Number(rawValue)
      continue
    }

    fm[key] = rawValue
  }

  return {
    spec_id: '',
    phase: '',
    created: '',
    ...fm,
  } as SpecFrontmatter
}

/**
 * Strip the frontmatter block from content, returning only the body.
 */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/**
 * Parse checkbox lines into ParsedCondition[].
 * Matches both `- [ ]` and `- [x]` (case-insensitive).
 */
function parseCheckboxes(lines: string[]): ParsedCondition[] {
  const conditions: ParsedCondition[] = []
  const pattern = /^\s*-\s+\[([ xX])\]\s+(.+)$/

  for (const line of lines) {
    const m = line.match(pattern)
    if (m) {
      conditions.push({
        checked: m[1].toLowerCase() === 'x',
        text: m[2].trim(),
      })
    }
  }

  return conditions
}

// ---------------------------------------------------------------------------
// Plan parser
// ---------------------------------------------------------------------------

/**
 * Parse a plan.md file content into structured TAG chain data.
 *
 * Expected structure:
 * ```
 * ---
 * spec_id: SPEC-XXX
 * phase: plan
 * ...
 * ---
 * # Title
 * ## Strategy
 * ...
 * ## TAG Chain
 * ### TAG-001: Title
 * - **Scope**: ...
 * - **Purpose**: ...
 * - **Dependencies**: ...
 * - **Completion Conditions**:
 *   - [ ] condition text
 * ```
 */
export function parsePlanFile(content: string): ParsedMoaiPlan {
  const frontmatter = parseFrontmatter(content)
  const specId = (frontmatter.spec_id as string) || ''
  const body = stripFrontmatter(content)
  const lines = body.split('\n')

  let strategy: string | undefined
  const tags: ParsedTag[] = []

  // State tracking
  let inStrategy = false
  let inTagChain = false
  let currentTag: Partial<ParsedTag> | null = null
  let inConditions = false
  const strategyLines: string[] = []
  const conditionLines: string[] = []

  for (const line of lines) {
    // H2 headers switch sections
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      // Flush previous tag
      if (currentTag) {
        flushTag(tags, currentTag, conditionLines)
        currentTag = null
        inConditions = false
        conditionLines.length = 0
      }

      const h2Title = line.replace(/^##\s+/, '').trim()

      if (/^strategy$/i.test(h2Title)) {
        inStrategy = true
        inTagChain = false
        continue
      }

      if (/^tag\s+chain$/i.test(h2Title)) {
        inStrategy = false
        inTagChain = true
        continue
      }

      // Any other H2 ends both sections
      inStrategy = false
      inTagChain = false
      continue
    }

    // Collect strategy text
    if (inStrategy) {
      strategyLines.push(line)
      continue
    }

    // Inside TAG Chain section
    if (inTagChain) {
      // H3 header = new TAG
      const tagMatch = line.match(/^###\s+(TAG-\d+):\s*(.+)$/)
      if (tagMatch) {
        // Flush previous tag
        if (currentTag) {
          flushTag(tags, currentTag, conditionLines)
          conditionLines.length = 0
        }

        currentTag = {
          id: tagMatch[1],
          title: tagMatch[2].trim(),
          scope: '',
          purpose: '',
          dependencies: [],
          conditions: [],
          completed: false,
        }
        inConditions = false
        continue
      }

      if (!currentTag) continue

      // Metadata lines inside a TAG block
      const scopeMatch = line.match(/^-\s+\*\*Scope\*\*:\s*(.+)$/)
      if (scopeMatch) {
        currentTag.scope = scopeMatch[1].trim()
        inConditions = false
        continue
      }

      const purposeMatch = line.match(/^-\s+\*\*Purpose\*\*:\s*(.+)$/)
      if (purposeMatch) {
        currentTag.purpose = purposeMatch[1].trim()
        inConditions = false
        continue
      }

      const depsMatch = line.match(/^-\s+\*\*Dependencies\*\*:\s*(.+)$/)
      if (depsMatch) {
        const depsRaw = depsMatch[1].trim()
        if (/^none$/i.test(depsRaw)) {
          currentTag.dependencies = []
        } else {
          currentTag.dependencies = depsRaw
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d.length > 0)
        }
        inConditions = false
        continue
      }

      // Start of completion conditions block
      if (/^-\s+\*\*Completion Conditions\*\*:/i.test(line)) {
        inConditions = true
        continue
      }

      // Checkbox lines (conditions)
      if (inConditions && /^\s+-\s+\[[ xX]\]/.test(line)) {
        conditionLines.push(line)
        continue
      }
    }
  }

  // Flush last tag
  if (currentTag) {
    flushTag(tags, currentTag, conditionLines)
  }

  // Build strategy string
  if (strategyLines.length > 0) {
    strategy = strategyLines.join('\n').trim() || undefined
  }

  return { frontmatter, specId, tags, strategy }
}

/**
 * Finalize a partial tag into the tags array.
 */
function flushTag(
  tags: ParsedTag[],
  partial: Partial<ParsedTag>,
  conditionLines: string[]
): void {
  const conditions = parseCheckboxes(conditionLines)
  const tag: ParsedTag = {
    id: partial.id ?? '',
    title: partial.title ?? '',
    scope: partial.scope ?? '',
    purpose: partial.purpose ?? '',
    dependencies: partial.dependencies ?? [],
    conditions,
    completed: conditions.length > 0 && conditions.every((c) => c.checked),
  }
  tags.push(tag)
}

// ---------------------------------------------------------------------------
// Acceptance parser
// ---------------------------------------------------------------------------

/**
 * Parse an acceptance.md file content into structured acceptance criteria.
 *
 * Expected structure:
 * ```
 * ---
 * spec_id: SPEC-XXX
 * phase: acceptance
 * ...
 * ---
 * # Title
 * ## AC-1: Title
 * **Given** ...
 * **When** ...
 * **Then** ...
 * ### Success Metrics
 * - [ ] metric
 * ---
 * ## Definition of Done
 * - [ ] item
 * ```
 */
export function parseAcceptanceFile(content: string): ParsedMoaiAcceptance {
  const frontmatter = parseFrontmatter(content)
  const specId = (frontmatter.spec_id as string) || ''
  const body = stripFrontmatter(content)
  const lines = body.split('\n')

  const criteria: ParsedAcceptanceCriteria[] = []
  const definitionOfDone: ParsedCondition[] = []

  // State
  let currentAC: Partial<ParsedAcceptanceCriteria> | null = null
  let inSuccessMetrics = false
  let inDefinitionOfDone = false
  let collectingThen = false
  const thenLines: string[] = []
  const metricsLines: string[] = []

  for (const line of lines) {
    // H2 header: new AC section or Definition of Done
    const acMatch = line.match(/^##\s+(AC-\d+):\s*(.+)$/)
    if (acMatch) {
      // Flush previous AC
      flushAC(criteria, currentAC, metricsLines, thenLines)

      currentAC = {
        id: acMatch[1],
        title: acMatch[2].trim(),
        given: '',
        when: '',
        then: '',
        successMetrics: [],
        verified: false,
      }
      inSuccessMetrics = false
      inDefinitionOfDone = false
      collectingThen = false
      metricsLines.length = 0
      thenLines.length = 0
      continue
    }

    // Detect "## Definition of Done"
    if (/^##\s+Definition of Done/i.test(line)) {
      // Flush current AC
      flushAC(criteria, currentAC, metricsLines, thenLines)
      currentAC = null
      inDefinitionOfDone = true
      inSuccessMetrics = false
      collectingThen = false
      continue
    }

    // Any other H2 ends current section
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      flushAC(criteria, currentAC, metricsLines, thenLines)
      currentAC = null
      inDefinitionOfDone = false
      inSuccessMetrics = false
      collectingThen = false
      continue
    }

    // Definition of Done checkboxes
    if (inDefinitionOfDone) {
      if (/^\s*-\s+\[[ xX]\]/.test(line)) {
        const parsed = parseCheckboxes([line])
        definitionOfDone.push(...parsed)
      }
      continue
    }

    if (!currentAC) continue

    // H3 inside AC: Success Metrics or Verification Method
    if (line.startsWith('### ')) {
      collectingThen = false
      if (/^###\s+Success Metrics/i.test(line)) {
        inSuccessMetrics = true
      } else {
        inSuccessMetrics = false
      }
      continue
    }

    // Horizontal rule (---) acts as AC separator
    if (/^---\s*$/.test(line)) {
      continue
    }

    // Success metrics checkboxes
    if (inSuccessMetrics) {
      if (/^\s*-\s+\[[ xX]\]/.test(line)) {
        metricsLines.push(line)
      }
      continue
    }

    // Gherkin clauses
    const givenMatch = line.match(/^\*\*Given\*\*\s+(.+)$/)
    if (givenMatch) {
      currentAC.given = givenMatch[1].trim()
      collectingThen = false
      continue
    }

    const whenMatch = line.match(/^\*\*When\*\*\s+(.+)$/)
    if (whenMatch) {
      currentAC.when = whenMatch[1].trim()
      collectingThen = false
      continue
    }

    const thenMatch = line.match(/^\*\*Then\*\*\s+(.+)$/)
    if (thenMatch) {
      thenLines.length = 0
      thenLines.push(thenMatch[1].trim())
      collectingThen = true
      continue
    }

    // Continuation lines for Then clause (bullet points)
    if (collectingThen && line.startsWith('- ') && !/^\s*-\s+\[[ xX]\]/.test(line)) {
      thenLines.push(line.replace(/^-\s+/, '').trim())
      continue
    }

    // Non-matching line inside AC ends Then collection
    if (collectingThen && line.trim() !== '') {
      collectingThen = false
    }
  }

  // Flush last AC
  flushAC(criteria, currentAC, metricsLines, thenLines)

  return { frontmatter, specId, criteria, definitionOfDone }
}

/**
 * Finalize a partial AC into the criteria array.
 */
function flushAC(
  criteria: ParsedAcceptanceCriteria[],
  partial: Partial<ParsedAcceptanceCriteria> | null,
  metricsLines: string[],
  thenLines: string[]
): void {
  if (!partial || !partial.id) return

  const successMetrics = parseCheckboxes(metricsLines)

  const ac: ParsedAcceptanceCriteria = {
    id: partial.id,
    title: partial.title ?? '',
    given: partial.given ?? '',
    when: partial.when ?? '',
    then: thenLines.length > 0 ? thenLines.join('\n') : partial.then ?? '',
    successMetrics,
    verified: successMetrics.length > 0 && successMetrics.every((m) => m.checked),
  }
  criteria.push(ac)
}

// ---------------------------------------------------------------------------
// Spec parser
// ---------------------------------------------------------------------------

/**
 * Parse a spec.md file content into structured EARS requirements.
 *
 * Expected structure:
 * ```
 * ---
 * spec_id: SPEC-XXX
 * title: ...
 * ...
 * ---
 * # Title
 * ## Functional Requirements
 * ### FR-1: Title
 * **[EARS: Ubiquitous]**
 * The system shall ...
 * ```
 */
export function parseSpecFile(content: string): ParsedMoaiSpec {
  const frontmatter = parseFrontmatter(content)
  const specId = (frontmatter.spec_id as string) || ''
  const body = stripFrontmatter(content)
  const lines = body.split('\n')

  const requirements: ParsedRequirement[] = []

  // State
  let currentSectionId = ''
  let currentSectionTitle = ''
  let currentEarsCategory = ''
  let reqCounter = 0
  const reqTextLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // H3 section: ### FR-1: Title or ### NFR-1: Title
    const sectionMatch = line.match(/^###\s+((?:FR|NFR)-\d+):\s*(.+)$/)
    if (sectionMatch) {
      // Flush previous requirement text
      flushRequirement(requirements, currentSectionId, currentSectionTitle, currentEarsCategory, reqTextLines, reqCounter)

      currentSectionId = sectionMatch[1]
      currentSectionTitle = sectionMatch[2].trim()
      currentEarsCategory = ''
      reqCounter = 0
      reqTextLines.length = 0
      continue
    }

    // Any H2 or H3 that is not FR/NFR resets context
    if (/^#{2,3}\s+/.test(line) && !sectionMatch) {
      flushRequirement(requirements, currentSectionId, currentSectionTitle, currentEarsCategory, reqTextLines, reqCounter)
      // Only reset section if it is another H3 (not H2, which is a parent section)
      if (line.startsWith('### ')) {
        currentSectionId = ''
        currentSectionTitle = ''
      }
      currentEarsCategory = ''
      reqCounter = 0
      reqTextLines.length = 0
      continue
    }

    if (!currentSectionId) continue

    // EARS marker: **[EARS: Type]**
    const earsMatch = line.match(/^\*\*\[EARS:\s*(.+?)\]\*\*\s*$/)
    if (earsMatch) {
      // Flush any previous requirement in this section
      flushRequirement(requirements, currentSectionId, currentSectionTitle, currentEarsCategory, reqTextLines, reqCounter)
      reqTextLines.length = 0

      currentEarsCategory = earsMatch[1].trim()
      reqCounter++
      continue
    }

    // Collect requirement text lines (non-empty, non-header)
    if (currentEarsCategory && line.trim().length > 0) {
      reqTextLines.push(line.trim())
    }
  }

  // Flush last requirement
  flushRequirement(requirements, currentSectionId, currentSectionTitle, currentEarsCategory, reqTextLines, reqCounter)

  return { frontmatter, specId, requirements }
}

/**
 * Determine the EARS requirement type from text content.
 */
function detectRequirementType(text: string): 'shall' | 'should' | 'may' | 'will' {
  const lower = text.toLowerCase()
  if (lower.includes(' shall ')) return 'shall'
  if (lower.includes(' should ')) return 'should'
  if (lower.includes(' may ')) return 'may'
  if (lower.includes(' will ')) return 'will'
  return 'shall' // Default for EARS requirements
}

/**
 * Finalize a requirement and add it to the requirements array.
 */
function flushRequirement(
  requirements: ParsedRequirement[],
  sectionId: string,
  sectionTitle: string,
  earsCategory: string,
  textLines: string[],
  counter: number
): void {
  if (!sectionId || !earsCategory || textLines.length === 0) return

  const text = textLines.join(' ')
  const id = counter > 0 ? `${sectionId}.${counter}` : sectionId

  requirements.push({
    id,
    title: sectionTitle,
    type: detectRequirementType(text),
    text,
    earsCategory,
  })
}
