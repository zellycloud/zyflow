import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { Task, TaskContext, TasksFile } from './types.js'

/**
 * Read proposal.md content for a change
 */
export async function readProposal(projectPath: string, changeId: string): Promise<string> {
  const proposalPath = join(projectPath, 'openspec', 'changes', changeId, 'proposal.md')
  try {
    return await readFile(proposalPath, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Find and read related spec files for a change
 */
export async function readRelatedSpecs(projectPath: string, changeId: string): Promise<string> {
  const specsDir = join(projectPath, 'openspec', 'changes', changeId, 'specs')

  try {
    const specs: string[] = []
    const entries = await readdir(specsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const specPath = join(specsDir, entry.name, 'spec.md')
        try {
          const content = await readFile(specPath, 'utf-8')
          specs.push(`## ${entry.name}\n\n${content}`)
        } catch {
          // Spec file doesn't exist
        }
      }
    }

    return specs.join('\n\n---\n\n')
  } catch {
    return ''
  }
}

/**
 * Extract suggested files from proposal.md
 * Looks for file paths mentioned in the proposal
 */
export function extractSuggestedFiles(proposal: string): string[] {
  const files: string[] = []

  // Match common file path patterns
  const patterns = [
    /`([^`]+\.(ts|tsx|js|jsx|md|json|sql))`/g,
    /\b(src\/[a-zA-Z0-9_\-/]+\.(ts|tsx|js|jsx))\b/g,
    /\b(server\/[a-zA-Z0-9_\-/]+\.(ts|js))\b/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(proposal)) !== null) {
      const file = match[1]
      if (!files.includes(file)) {
        files.push(file)
      }
    }
  }

  return files.slice(0, 10) // Limit to 10 suggestions
}

/**
 * Build task context for a specific task
 */
export async function buildTaskContext(
  projectPath: string,
  changeId: string,
  tasksFile: TasksFile,
  _task: Task
): Promise<TaskContext> {
  const proposal = await readProposal(projectPath, changeId)
  const relatedSpec = await readRelatedSpecs(projectPath, changeId)
  const suggestedFiles = extractSuggestedFiles(proposal)

  // Calculate completed tasks
  const allTasks = tasksFile.groups.flatMap(g => g.tasks)
  const completedTasks = allTasks.filter(t => t.completed).map(t => t.id)
  const remainingTasks = allTasks.filter(t => !t.completed).length

  return {
    changeId,
    proposal,
    relatedSpec: relatedSpec || undefined,
    suggestedFiles,
    completedTasks,
    remainingTasks,
  }
}

/**
 * Get design.md content if exists
 */
export async function readDesign(projectPath: string, changeId: string): Promise<string | null> {
  const designPath = join(projectPath, 'openspec', 'changes', changeId, 'design.md')
  try {
    return await readFile(designPath, 'utf-8')
  } catch {
    return null
  }
}
