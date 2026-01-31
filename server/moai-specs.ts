/**
 * MoAI SPEC Utilities
 *
 * Helper functions for scanning and managing MoAI SPEC files (.moai/specs/ directory).
 * Provides a unified interface for MoAI SPEC operations alongside OpenSpec compatibility.
 */

import { readdir, readFile, access } from 'fs/promises'
import { join } from 'path'
import { parsePlanFile } from '@zyflow/parser'

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

      // Extract status from frontmatter (supports both English and Korean formats)
      // English: "status: active" or Korean: "- **상태**: In Progress"
      const englishStatusMatch = specContent.match(/^status:\s*(\w+)/mi)
      const koreanStatusMatch = specContent.match(/^[-*]\s*\*?\*?(?:상태|Status)\*?\*?:\s*(.+)$/mi)

      if (englishStatusMatch) {
        const englishStatus = englishStatusMatch[1].toLowerCase()
        // Map English status values (including implemented/planned variants)
        const englishStatusMap: Record<string, MoaiSpec['status']> = {
          'draft': 'draft',
          'planned': 'draft',
          'active': 'active',
          'in progress': 'active',
          'progress': 'active',
          'complete': 'complete',
          'completed': 'complete',
          'implemented': 'complete',
          'done': 'complete',
          'archived': 'archived',
        }
        status = englishStatusMap[englishStatus] || 'draft'
      } else if (koreanStatusMatch) {
        const koreanStatus = koreanStatusMatch[1].trim().toLowerCase()
        // Map Korean/English status values to standard status
        const statusMap: Record<string, MoaiSpec['status']> = {
          'in progress': 'active',
          '진행 중': 'active',
          '진행중': 'active',
          'active': 'active',
          'draft': 'draft',
          '초안': 'draft',
          '계획': 'draft',
          'planning': 'draft',
          'complete': 'complete',
          'completed': 'complete',
          '완료': 'complete',
          'done': 'complete',
          'archived': 'archived',
          '아카이브': 'archived',
        }
        status = statusMap[koreanStatus] || 'draft'
      }
    } catch {
      // spec.md not found or parse error, use defaults
    }

    // Count TAG items in plan.md using parsePlanFile for accurate completion status
    let tagCount = 0
    let completedTags = 0

    try {
      const planContent = await readFile(join(specPath, 'plan.md'), 'utf-8')
      const parsed = parsePlanFile(planContent)
      tagCount = parsed.tags.length
      completedTags = parsed.tags.filter((t) => t.completed).length
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

// =============================================
// Remote SSH Support
// =============================================

/**
 * Remote plugin interface for SSH operations
 */
export interface RemotePlugin {
  listDirectory: (server: unknown, path: string) => Promise<{ entries: Array<{ name: string; type: string }> }>
  readRemoteFile: (server: unknown, path: string) => Promise<string>
}

/**
 * Scan for MoAI SPEC directories on a remote server via SSH
 *
 * Returns array of SPEC metadata extracted from spec.md headers and plan.md TAG items
 */
export async function scanRemoteMoaiSpecs(
  projectPath: string,
  server: unknown,
  plugin: RemotePlugin
): Promise<MoaiSpec[]> {
  const specsDir = `${projectPath}/.moai/specs`
  const specs: MoaiSpec[] = []

  let listing: { entries: Array<{ name: string; type: string }> }
  try {
    listing = await plugin.listDirectory(server, specsDir)
  } catch {
    // .moai/specs/ does not exist on remote, return empty array
    return specs
  }

  // Filter for SPEC-{DOMAIN}-{NUM} pattern directories
  const specDirs = listing.entries.filter(
    (entry) =>
      (entry.type === 'directory' || entry.type === 'd' || entry.type === 'Directory') &&
      entry.name.match(/^SPEC-[A-Z]+-\d+$/) &&
      entry.name !== '.archived'
  )

  const specPromises = specDirs.map(async (entry) => {
    const specId = entry.name
    const specPath = `${specsDir}/${specId}`

    // Extract title from spec.md
    let title = specId
    let status: MoaiSpec['status'] = 'draft'

    try {
      const specContent = await plugin.readRemoteFile(server, `${specPath}/spec.md`)

      const titleMatch = specContent.match(/^#\s+(.+)$/m)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }

      // Extract status from frontmatter (supports both English and Korean formats)
      const englishStatusMatch = specContent.match(/^status:\s*(\w+)/mi)
      const koreanStatusMatch = specContent.match(/^[-*]\s*\*?\*?(?:상태|Status)\*?\*?:\s*(.+)$/mi)

      if (englishStatusMatch) {
        const englishStatus = englishStatusMatch[1].toLowerCase()
        // Map English status values (including implemented/planned variants)
        const englishStatusMap: Record<string, MoaiSpec['status']> = {
          'draft': 'draft',
          'planned': 'draft',
          'active': 'active',
          'in progress': 'active',
          'progress': 'active',
          'complete': 'complete',
          'completed': 'complete',
          'implemented': 'complete',
          'done': 'complete',
          'archived': 'archived',
        }
        status = englishStatusMap[englishStatus] || 'draft'
      } else if (koreanStatusMatch) {
        const koreanStatus = koreanStatusMatch[1].trim().toLowerCase()
        const statusMap: Record<string, MoaiSpec['status']> = {
          'in progress': 'active',
          '진행 중': 'active',
          '진행중': 'active',
          'active': 'active',
          'draft': 'draft',
          '초안': 'draft',
          '계획': 'draft',
          'planning': 'draft',
          'complete': 'complete',
          'completed': 'complete',
          '완료': 'complete',
          'done': 'complete',
          'archived': 'archived',
          '아카이브': 'archived',
        }
        status = statusMap[koreanStatus] || 'draft'
      }
    } catch {
      // spec.md not found or parse error, use defaults
    }

    // Count TAG items in plan.md using parsePlanFile for accurate completion status
    let tagCount = 0
    let completedTags = 0

    try {
      const planPath = `${specPath}/plan.md`
      const planContent = await plugin.readRemoteFile(server, planPath)

      // Try standard MoAI TAG Chain format first
      const parsed = parsePlanFile(planContent)
      if (parsed.tags.length > 0) {
        tagCount = parsed.tags.length
        completedTags = parsed.tags.filter((t) => t.completed).length
      } else {
        // Fallback: Parse Phase/Task format (#### Task N.N or ### Task N.N)
        // Also check for checkbox items as completion indicators
        const taskMatches = planContent.match(/^#{3,4}\s+Task\s+\d+\.\d+/gim) || []
        const checkboxItems = planContent.match(/^[-*]\s+\[[ xX]\]/gm) || []
        const completedCheckboxes = planContent.match(/^[-*]\s+\[[xX]\]/gm) || []

        if (taskMatches.length > 0) {
          // Use task count as progress indicator
          tagCount = taskMatches.length
          // If there are checkboxes, use them for completion tracking
          if (checkboxItems.length > 0) {
            // Scale checkbox completion to task count
            const checkboxCompletion = completedCheckboxes.length / checkboxItems.length
            completedTags = Math.round(tagCount * checkboxCompletion)
          }
        } else if (checkboxItems.length > 0) {
          // No tasks but has checkboxes - use checkbox count
          tagCount = checkboxItems.length
          completedTags = completedCheckboxes.length
        }
      }
    } catch (planErr) {
      console.warn(`[MoAI Specs] Failed to read/parse plan.md for ${specId}:`, planErr)
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
 * Count total and completed tags across all remote SPECs in a project
 */
export async function countRemoteMoaiTags(
  projectPath: string,
  server: unknown,
  plugin: RemotePlugin
): Promise<{ total: number; completed: number }> {
  const specs = await scanRemoteMoaiSpecs(projectPath, server, plugin)
  let total = 0
  let completed = 0

  for (const spec of specs) {
    total += spec.tagCount
    completed += spec.completedTags
  }

  return { total, completed }
}
