/**
 * MoAI SPEC Utilities
 *
 * Helper functions for scanning and managing MoAI SPEC files (.moai/specs/ directory).
 * Provides a unified interface for MoAI SPEC operations alongside OpenSpec compatibility.
 */

import { readdir, readFile, access } from 'fs/promises'
import { join } from 'path'

export interface MoaiSpec {
  id: string // SPEC-DOMAIN-NUM format
  title: string
  path: string // .moai/specs/SPEC-DOMAIN-NUM
  tagCount: number // Total tags in plan.md
  completedTags: number // Completed tags
  status: 'draft' | 'active' | 'complete' | 'archived'
  createdAt?: string
  updatedAt?: string
}

/**
 * Scan for MoAI SPEC directories in .moai/specs/
 *
 * Returns array of SPEC metadata extracted from spec.md headers and plan.md TAG items
 */
export async function scanMoaiSpecs(projectPath: string): Promise<MoaiSpec[]> {
  const specsDir = join(projectPath, '.moai', 'specs')
  const specs: MoaiSpec[] = []

  try {
    await access(specsDir)
  } catch {
    // .moai/specs/ does not exist, return empty array
    return specs
  }

  let entries
  try {
    entries = await readdir(specsDir, { withFileTypes: true })
  } catch {
    return specs
  }

  // Filter for SPEC-{DOMAIN}-{NUM} pattern directories
  const specDirs = entries.filter(
    (entry) =>
      entry.isDirectory() &&
      entry.name.match(/^SPEC-[A-Z]+-\d+$/) &&
      entry.name !== '.archived'
  )

  const specPromises = specDirs.map(async (entry) => {
    const specId = entry.name
    const specPath = join(specsDir, specId)

    // Extract title from spec.md
    let title = specId
    let status: MoaiSpec['status'] = 'draft'

    try {
      const specContent = await readFile(join(specPath, 'spec.md'), 'utf-8')
      const titleMatch = specContent.match(/^#\s+(.+)$/m)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }

      // Extract status from frontmatter
      const statusMatch = specContent.match(/^status:\s*(\w+)/m)
      if (statusMatch && ['draft', 'active', 'complete', 'archived'].includes(statusMatch[1])) {
        status = statusMatch[1] as MoaiSpec['status']
      }
    } catch {
      // spec.md not found or parse error, use defaults
    }

    // Count TAG items in plan.md
    let tagCount = 0
    let completedTags = 0

    try {
      const planContent = await readFile(join(specPath, 'plan.md'), 'utf-8')
      // Match TAG-{ID} items (completed and incomplete)
      const allTags = planContent.match(/^[-*]\s+\[.*?\]\s+TAG-/gm) || []
      tagCount = allTags.length

      // Count completed tags (marked with [x])
      const completedTagMatches = planContent.match(/^[-*]\s+\[x\]\s+TAG-/gim) || []
      completedTags = completedTagMatches.length
    } catch {
      // plan.md not found or parse error, use defaults
    }

    return {
      id: specId,
      title,
      path: specPath,
      status,
      tagCount,
      completedTags,
    }
  })

  const results = await Promise.all(specPromises)
  return results.filter((spec) => spec !== null) as MoaiSpec[]
}

/**
 * Get single SPEC metadata by ID
 */
export async function getMoaiSpec(projectPath: string, specId: string): Promise<MoaiSpec | null> {
  const specsDir = join(projectPath, '.moai', 'specs')
  const specPath = join(specsDir, specId)

  try {
    await access(specPath)
  } catch {
    return null
  }

  let title = specId
  let status: MoaiSpec['status'] = 'draft'

  try {
    const specContent = await readFile(join(specPath, 'spec.md'), 'utf-8')
    const titleMatch = specContent.match(/^#\s+(.+)$/m)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }

    const statusMatch = specContent.match(/^status:\s*(\w+)/m)
    if (statusMatch && ['draft', 'active', 'complete', 'archived'].includes(statusMatch[1])) {
      status = statusMatch[1] as MoaiSpec['status']
    }
  } catch {
    // spec.md not found
  }

  let tagCount = 0
  let completedTags = 0

  try {
    const planContent = await readFile(join(specPath, 'plan.md'), 'utf-8')
    const allTags = planContent.match(/^[-*]\s+\[.*?\]\s+TAG-/gm) || []
    tagCount = allTags.length

    const completedTagMatches = planContent.match(/^[-*]\s+\[x\]\s+TAG-/gim) || []
    completedTags = completedTagMatches.length
  } catch {
    // plan.md not found
  }

  return {
    id: specId,
    title,
    path: specPath,
    status,
    tagCount,
    completedTags,
  }
}

/**
 * Count total and completed tags across all SPECs in a project
 */
export async function countMoaiTags(projectPath: string): Promise<{ total: number; completed: number }> {
  const specs = await scanMoaiSpecs(projectPath)
  let total = 0
  let completed = 0

  for (const spec of specs) {
    total += spec.tagCount
    completed += spec.completedTags
  }

  return { total, completed }
}

/**
 * Check if a SPEC ID is valid (matches SPEC-{DOMAIN}-{NUM} format)
 */
export function isValidSpecId(specId: string): boolean {
  return /^SPEC-[A-Z]+-\d+$/.test(specId)
}
