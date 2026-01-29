/**
 * MoAI SPEC Types
 * Types for parsing MoAI SPEC documents (spec.md, plan.md, acceptance.md)
 */

/**
 * YAML frontmatter metadata from SPEC documents
 */
export interface SpecFrontmatter {
  spec_id: string
  phase: string
  created: string
  [key: string]: unknown
}

/**
 * TAG chain item from plan.md
 */
export interface ParsedTag {
  /** TAG identifier, e.g. "TAG-001" */
  id: string
  /** TAG title, e.g. "Characterization Tests for Core Components" */
  title: string
  /** Scope of files/modules affected */
  scope: string
  /** Purpose description */
  purpose: string
  /** Dependencies on other TAGs, e.g. ["TAG-001"] or [] */
  dependencies: string[]
  /** Completion condition checkboxes */
  conditions: ParsedCondition[]
  /** True if all conditions are checked */
  completed: boolean
}

/**
 * Checkbox condition from plan.md or acceptance.md
 */
export interface ParsedCondition {
  /** Condition text */
  text: string
  /** True if [x], false if [ ] */
  checked: boolean
}

/**
 * Acceptance criteria from acceptance.md (Gherkin format)
 */
export interface ParsedAcceptanceCriteria {
  /** Criteria identifier, e.g. "AC-1" */
  id: string
  /** Criteria title */
  title: string
  /** Given clause */
  given: string
  /** When clause */
  when: string
  /** Then clause */
  then: string
  /** Success metric checkboxes */
  successMetrics: ParsedCondition[]
  /** True if all success metrics are checked */
  verified: boolean
}

/**
 * EARS requirement from spec.md
 */
export interface ParsedRequirement {
  /** Requirement identifier, e.g. "FR-1.1" */
  id: string
  /** Section title containing this requirement */
  title: string
  /** EARS type classification */
  type: 'shall' | 'should' | 'may' | 'will'
  /** Full requirement text */
  text: string
  /** EARS category, e.g. "Ubiquitous", "Event-Driven" */
  earsCategory?: string
}

/**
 * Complete parsed plan.md result
 */
export interface ParsedMoaiPlan {
  frontmatter: SpecFrontmatter
  specId: string
  tags: ParsedTag[]
  /** Strategy section text */
  strategy?: string
}

/**
 * Complete parsed acceptance.md result
 */
export interface ParsedMoaiAcceptance {
  frontmatter: SpecFrontmatter
  specId: string
  criteria: ParsedAcceptanceCriteria[]
  definitionOfDone: ParsedCondition[]
}

/**
 * Complete parsed spec.md result
 */
export interface ParsedMoaiSpec {
  frontmatter: SpecFrontmatter
  specId: string
  requirements: ParsedRequirement[]
}
