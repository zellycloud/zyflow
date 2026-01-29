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

      // Support multiple TAG formats:
      // 1. Checklist format: "- [x] TAG-001: Title" or "- [ ] TAG-001: Title"
      // 2. Heading format: "### TAG-001: Title (✓ COMPLETE)" or "### TAG-001: Title"

      // Match checklist format
      const checklistTags = planContent.match(/^[-*]\s+\[.*?\]\s+TAG-\d+/gm) || []
      const completedChecklistTags = planContent.match(/^[-*]\s+\[x\]\s+TAG-\d+/gim) || []

      // Match heading format (### TAG-XXX or ## TAG-XXX)
      const headingTags = planContent.match(/^#{2,3}\s+TAG-\d+[^#\n]*/gm) || []
      const completedHeadingTags = headingTags.filter(
        (tag) => tag.includes('✓') || tag.includes('COMPLETE') || tag.includes('완료')
      )

      // Combine both formats (avoid double counting if same TAG appears in both)
      const allTagIds = new Set<string>()
      const completedTagIds = new Set<string>()

      // Extract IDs from checklist format
      for (const tag of checklistTags) {
        const match = tag.match(/TAG-(\d+)/)
        if (match) allTagIds.add(match[1])
      }
      for (const tag of completedChecklistTags) {
        const match = tag.match(/TAG-(\d+)/)
        if (match) completedTagIds.add(match[1])
      }

      // Extract IDs from heading format
      for (const tag of headingTags) {
        const match = tag.match(/TAG-(\d+)/)
        if (match) allTagIds.add(match[1])
      }
      for (const tag of completedHeadingTags) {
        const match = tag.match(/TAG-(\d+)/)
        if (match) completedTagIds.add(match[1])
      }

      tagCount = allTagIds.size
      completedTags = completedTagIds.size
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

    // Support multiple TAG formats (same logic as scanMoaiSpecs)
    const checklistTags = planContent.match(/^[-*]\s+\[.*?\]\s+TAG-\d+/gm) || []
    const completedChecklistTags = planContent.match(/^[-*]\s+\[x\]\s+TAG-\d+/gim) || []
    const headingTags = planContent.match(/^#{2,3}\s+TAG-\d+[^#\n]*/gm) || []
    const completedHeadingTags = headingTags.filter(
      (tag) => tag.includes('✓') || tag.includes('COMPLETE') || tag.includes('완료')
    )

    const allTagIds = new Set<string>()
    const completedTagIds = new Set<string>()

    for (const tag of checklistTags) {
      const match = tag.match(/TAG-(\d+)/)
      if (match) allTagIds.add(match[1])
    }
    for (const tag of completedChecklistTags) {
      const match = tag.match(/TAG-(\d+)/)
      if (match) completedTagIds.add(match[1])
    }
    for (const tag of headingTags) {
      const match = tag.match(/TAG-(\d+)/)
      if (match) allTagIds.add(match[1])
    }
    for (const tag of completedHeadingTags) {
      const match = tag.match(/TAG-(\d+)/)
      if (match) completedTagIds.add(match[1])
    }

    tagCount = allTagIds.size
    completedTags = completedTagIds.size
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
