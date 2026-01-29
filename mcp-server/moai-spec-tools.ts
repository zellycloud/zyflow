/**
 * MoAI SPEC Tools for MCP Server
 * Helper functions for listing, parsing, and managing MoAI SPEC documents
 * alongside existing OpenSpec support.
 */

import { readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  parsePlanFile,
  parseAcceptanceFile,
  parseSpecFile,
} from '@zyflow/parser'
import type {
  ParsedMoaiPlan,
  ParsedMoaiAcceptance,
  ParsedMoaiSpec,
} from '@zyflow/parser'

/**
 * Represents a MoAI SPEC in simplified format for MCP tools
 */
export interface MoaiSpecSummary {
  id: string
  title: string
  description: string
  progress: number
  totalTags: number
  completedTags: number
  created: string
  status: 'draft' | 'active' | 'completed' | 'archived'
}

/**
 * Scan .moai/specs/ directory and list all MoAI SPECs
 */
export async function scanMoaiSpecs(projectPath: string): Promise<MoaiSpecSummary[]> {
  const specsDir = join(projectPath, '.moai', 'specs')
  const specs: MoaiSpecSummary[] = []

  try {
    const entries = await readdir(specsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('SPEC-')) continue

      const specId = entry.name
      const planPath = join(specsDir, specId, 'plan.md')
      const specPath = join(specsDir, specId, 'spec.md')

      try {
        // Read plan.md for TAG chain progress
        const planContent = await readFile(planPath, 'utf-8')
        const parsedPlan = parsePlanFile(planContent)

        // Read spec.md for title and description
        let title = specId
        let description = ''
        let status: 'draft' | 'active' | 'completed' | 'archived' = 'active'

        try {
          const specContent = await readFile(specPath, 'utf-8')
          const parsedSpec = parseSpecFile(specContent)
          title = (parsedSpec.frontmatter.title as string) || specId
          status = (parsedSpec.frontmatter.status as 'draft' | 'active' | 'completed' | 'archived') || 'active'

          // Extract first paragraph as description from spec content
          const lines = specContent.split('\n')
          const bodyStart = lines.findIndex(l => l.startsWith('#'))
          if (bodyStart >= 0) {
            let desc = ''
            for (let i = bodyStart + 1; i < lines.length; i++) {
              if (lines[i].startsWith('#')) break
              if (lines[i].trim()) {
                desc += lines[i] + ' '
              }
              if (desc.length > 150) break
            }
            description = desc.trim().substring(0, 150)
          }
        } catch {
          // Spec.md not required for basic listing
        }

        // Calculate progress from TAG completion
        const tags = parsedPlan.tags || []
        const totalTags = tags.length
        const completedTags = tags.filter(t => t.completed).length
        const progress = totalTags > 0 ? Math.round((completedTags / totalTags) * 100) : 0

        specs.push({
          id: specId,
          title,
          description,
          progress,
          totalTags,
          completedTags,
          created: (parsedPlan.frontmatter.created as string) || new Date().toISOString().split('T')[0],
          status,
        })
      } catch (err) {
        // Log but continue scanning other SPECs
        console.warn(`Failed to parse SPEC ${specId}:`, err)
      }
    }
  } catch {
    // .moai/specs directory doesn't exist or not accessible
  }

  return specs.sort((a, b) => b.progress - a.progress)
}

/**
 * Get complete MoAI SPEC content (plan + acceptance + spec)
 */
export async function getMoaiSpecContext(
  specId: string,
  projectPath: string
): Promise<{
  spec: ParsedMoaiSpec
  plan: ParsedMoaiPlan
  acceptance: ParsedMoaiAcceptance
}> {
  const specsDir = join(projectPath, '.moai', 'specs', specId)

  const specPath = join(specsDir, 'spec.md')
  const planPath = join(specsDir, 'plan.md')
  const acceptancePath = join(specsDir, 'acceptance.md')

  const specContent = await readFile(specPath, 'utf-8')
  const planContent = await readFile(planPath, 'utf-8')
  const acceptanceContent = await readFile(acceptancePath, 'utf-8')

  return {
    spec: parseSpecFile(specContent),
    plan: parsePlanFile(planContent),
    acceptance: parseAcceptanceFile(acceptanceContent),
  }
}

/**
 * Get specific TAG from a MoAI SPEC
 */
export async function getMoaiTag(
  specId: string,
  tagId: string,
  projectPath: string
) {
  const specsDir = join(projectPath, '.moai', 'specs', specId)
  const planPath = join(specsDir, 'plan.md')

  const planContent = await readFile(planPath, 'utf-8')
  const parsed = parsePlanFile(planContent)

  const tag = parsed.tags.find(t => t.id === tagId)
  if (!tag) {
    throw new Error(`TAG ${tagId} not found in SPEC ${specId}`)
  }

  return tag
}

/**
 * Get next incomplete TAG from a MoAI SPEC
 */
export async function getNextMoaiTag(
  specId: string,
  projectPath: string
) {
  const specsDir = join(projectPath, '.moai', 'specs', specId)
  const planPath = join(specsDir, 'plan.md')

  const planContent = await readFile(planPath, 'utf-8')
  const parsed = parsePlanFile(planContent)

  // Find first incomplete TAG respecting dependencies
  for (const tag of parsed.tags) {
    if (!tag.completed) {
      // Check dependencies
      const depsComplete = tag.dependencies.every(depId =>
        parsed.tags.find(t => t.id === depId && t.completed)
      )

      if (depsComplete) {
        return tag
      }
    }
  }

  return null
}

/**
 * Update TAG completion status in plan.md file
 */
export async function updateMoaiTagStatus(
  specId: string,
  tagId: string,
  completed: boolean,
  projectPath: string
): Promise<void> {
  const specsDir = join(projectPath, '.moai', 'specs', specId)
  const planPath = join(specsDir, 'plan.md')

  const content = await readFile(planPath, 'utf-8')
  const lines = content.split('\n')

  // Find the TAG-ID header
  let tagLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp(`^### ${tagId}:`))) {
      tagLineIndex = i
      break
    }
  }

  if (tagLineIndex === -1) {
    throw new Error(`TAG ${tagId} not found in plan.md`)
  }

  // Find and update checkbox in Completion Conditions section
  let updated = false
  for (let i = tagLineIndex + 1; i < lines.length; i++) {
    // Stop at next TAG or major section
    if (lines[i].match(/^###\s+TAG-/) || lines[i].match(/^##\s/)) {
      break
    }

    // Update checkboxes in Completion Conditions
    if (lines[i].match(/^-\s+\*\*Completion Conditions\*\*:/i)) {
      // Found the header, update all checkboxes following it
      let j = i + 1
      while (j < lines.length && !lines[j].match(/^-\s+\*\*/)) {
        if (lines[j].match(/^\s+-\s+\[[ xX]\]/)) {
          lines[j] = lines[j].replace(
            /^(\s+-\s+\[)([ xX])(\].*)$/,
            `$1${completed ? 'x' : ' '}$3`
          )
          updated = true
        }
        j++
      }
    }
  }

  if (!updated) {
    throw new Error(`Failed to update TAG ${tagId} status in plan.md`)
  }

  await writeFile(planPath, lines.join('\n'), 'utf-8')
}

/**
 * Check if a change ID is a MoAI SPEC (starts with SPEC-)
 */
export function isMoaiSpec(changeId: string): boolean {
  return /^SPEC-[A-Z]+-\d+$/.test(changeId)
}

/**
 * Check if a task ID is a MoAI TAG (starts with TAG-)
 */
export function isMoaiTag(taskId: string): boolean {
  return /^TAG-\d+$/.test(taskId)
}

/**
 * Update MoAI TAG status in database
 * This is called after updating plan.md to keep database in sync
 */
export async function updateMoaiTagInDatabase(
  specId: string,
  tagId: string,
  completed: boolean
): Promise<void> {
  try {
    // Lazy import to avoid circular dependencies
    const { initDb } = await import('../server/tasks/db/client.js')
    const { tasks } = await import('../server/tasks/db/schema.js')
    const { eq, and } = await import('drizzle-orm')

    const db = initDb()

    // Update task status where origin='moai' and tagId matches
    const newStatus = completed ? 'done' : 'todo'
    const now = new Date()

    await db.update(tasks)
      .set({
        status: newStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.origin, 'moai'),
          eq(tasks.changeId, specId),
          eq(tasks.tagId, tagId)
        )
      )
      .run()
  } catch (err) {
    // Log but don't fail - database sync is best-effort
    console.warn(`Failed to update MoAI TAG ${tagId} in database:`, err)
  }
}
