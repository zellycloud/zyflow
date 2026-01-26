/**
 * OpenSpec CLI Adapter
 * Wraps OpenSpec CLI commands for programmatic use in zyflow server
 *
 * OpenSpec 1.0 commands:
 * - list: List changes or specs
 * - show: Show change or spec details
 * - status: Display artifact completion status
 * - instructions: Output enriched instructions
 * - validate: Validate changes and specs
 * - archive: Archive completed changes
 */

import { exec, ExecException } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * OpenSpec command result interface
 */
export interface OpenSpecResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  exitCode?: number
}

/**
 * OpenSpec change item from list command
 */
export interface OpenSpecChange {
  id: string
  name: string
  title: string
  status: string
  phase?: string
  artifacts?: string[]
  path?: string
}

/**
 * OpenSpec status result
 */
export interface OpenSpecStatus {
  change: string
  artifacts: {
    name: string
    status: 'complete' | 'incomplete' | 'missing'
    path?: string
  }[]
  progress: {
    completed: number
    total: number
    percentage: number
  }
}

/**
 * OpenSpec instructions result
 */
export interface OpenSpecInstructions {
  artifact: string
  content: string
  context?: Record<string, unknown>
}

/**
 * OpenSpec validation result
 */
export interface OpenSpecValidation {
  valid: boolean
  errors: {
    file: string
    message: string
    line?: number
  }[]
  warnings: {
    file: string
    message: string
    line?: number
  }[]
}

/**
 * Command execution options
 */
export interface OpenSpecOptions {
  cwd?: string
  json?: boolean
  timeout?: number
  change?: string
}

/**
 * Run an OpenSpec CLI command
 */
export async function runOpenSpecCommand(
  command: string,
  args: string[] = [],
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult> {
  const { cwd, json = true, timeout = 30000 } = options

  // Build command
  const fullArgs = [...args]
  if (json) {
    fullArgs.push('--json')
  }

  const fullCommand = `openspec ${command} ${fullArgs.join(' ')}`.trim()

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    })

    // Parse JSON output if json mode
    if (json && stdout) {
      try {
        const data = JSON.parse(stdout)
        return { success: true, data }
      } catch {
        // If JSON parsing fails, return raw output
        return { success: true, data: stdout }
      }
    }

    return { success: true, data: stdout }
  } catch (error) {
    const execError = error as ExecException & { stdout?: string; stderr?: string }
    return {
      success: false,
      error: execError.stderr || execError.message,
      exitCode: execError.code ?? 1,
      data: execError.stdout,
    }
  }
}

/**
 * List OpenSpec changes
 */
export async function listChanges(
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult<OpenSpecChange[]>> {
  const result = await runOpenSpecCommand('list', [], options)

  if (!result.success) {
    return result as OpenSpecResult<OpenSpecChange[]>
  }

  // Normalize data to array
  const data = result.data
  if (Array.isArray(data)) {
    return { success: true, data }
  }

  // Handle object response with changes array
  if (data && typeof data === 'object' && 'changes' in data) {
    return { success: true, data: (data as { changes: OpenSpecChange[] }).changes }
  }

  return { success: true, data: [] }
}

/**
 * List OpenSpec specs
 */
export async function listSpecs(
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult<unknown[]>> {
  const result = await runOpenSpecCommand('list', ['--specs'], options)

  if (!result.success) {
    return result as OpenSpecResult<unknown[]>
  }

  const data = result.data
  if (Array.isArray(data)) {
    return { success: true, data }
  }

  if (data && typeof data === 'object' && 'specs' in data) {
    return { success: true, data: (data as { specs: unknown[] }).specs }
  }

  return { success: true, data: [] }
}

/**
 * Show change details
 */
export async function showChange(
  changeName: string,
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult> {
  return runOpenSpecCommand('show', [changeName], options)
}

/**
 * Get change status (artifact completion)
 */
export async function getChangeStatus(
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult<OpenSpecStatus>> {
  const args: string[] = []
  if (options.change) {
    args.push('--change', options.change)
  }

  return runOpenSpecCommand('status', args, options) as Promise<OpenSpecResult<OpenSpecStatus>>
}

/**
 * Get instructions for an artifact
 */
export async function getInstructions(
  artifact: string,
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult<OpenSpecInstructions>> {
  const args = [artifact]
  if (options.change) {
    args.push('--change', options.change)
  }

  return runOpenSpecCommand('instructions', args, options) as Promise<OpenSpecResult<OpenSpecInstructions>>
}

/**
 * Validate a change or spec
 */
export async function validateChange(
  itemName?: string,
  options: OpenSpecOptions & { strict?: boolean } = {}
): Promise<OpenSpecResult<OpenSpecValidation>> {
  const args: string[] = []
  if (itemName) {
    args.push(itemName)
  }
  if (options.strict) {
    args.push('--strict')
  }

  return runOpenSpecCommand('validate', args, options) as Promise<OpenSpecResult<OpenSpecValidation>>
}

/**
 * Archive a completed change
 */
export async function archiveChange(
  changeName: string,
  options: OpenSpecOptions & { syncSpecs?: boolean } = {}
): Promise<OpenSpecResult> {
  const args = [changeName]
  if (options.syncSpecs !== false) {
    args.push('--sync-specs')
  }

  return runOpenSpecCommand('archive', args, options)
}

/**
 * Get available workflow schemas
 */
export async function listSchemas(
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult<unknown[]>> {
  const result = await runOpenSpecCommand('schemas', [], options)

  if (!result.success) {
    return result as OpenSpecResult<unknown[]>
  }

  const data = result.data
  if (Array.isArray(data)) {
    return { success: true, data }
  }

  return { success: true, data: [] }
}

/**
 * Check if OpenSpec CLI is available
 */
export async function isOpenSpecAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('openspec --version', { timeout: 5000 })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Get OpenSpec CLI version
 */
export async function getOpenSpecVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('openspec --version', { timeout: 5000 })
    return stdout.trim()
  } catch {
    return null
  }
}
