/**
 * OpenSpec CLI Adapter (DEPRECATED - TAG-006)
 *
 * IMPORTANT: This module is deprecated and maintained for backward compatibility only.
 * External openspec CLI dependency has been removed. All functions gracefully degrade.
 * Use MoAI SPEC system for SPEC management instead.
 *
 * Deprecated OpenSpec 1.0 commands:
 * - list: List changes or specs
 * - show: Show change or spec details
 * - status: Display artifact completion status
 * - instructions: Output enriched instructions
 * - validate: Validate changes and specs
 * - archive: Archive completed changes
 *
 * TAG-006: External openspec CLI dependency removed.
 * All functions now return failure/empty responses for graceful degradation.
 */

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
 *
 * DEPRECATED (TAG-006): External openspec CLI dependency removed.
 * This function no longer executes the external openspec binary.
 * Returns failure for graceful degradation.
 */
export async function runOpenSpecCommand(
  command: string,
  args: string[] = [],
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult> {
  // External openspec CLI is no longer available.
  // TAG-006: MoAI system handles SPEC management directly through file reading.
  const deprecationMessage =
    `OpenSpec CLI command '${command}' is deprecated. ` +
    `External openspec binary is no longer available. ` +
    `Use MoAI SPEC system for SPEC management.`

  console.warn(deprecationMessage)

  return {
    success: false,
    error: deprecationMessage,
    exitCode: 127, // Command not found
  }
}

/**
 * List OpenSpec changes
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns empty array for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns empty array for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns failure for graceful degradation.
 */
export async function showChange(
  changeName: string,
  options: OpenSpecOptions = {}
): Promise<OpenSpecResult> {
  return runOpenSpecCommand('show', [changeName], options)
}

/**
 * Get change status (artifact completion)
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns failure for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns empty content for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns failure for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns failure for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI no longer available.
 * Returns empty array for graceful degradation.
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
 *
 * DEPRECATED (TAG-006): External openspec CLI dependency removed.
 * MoAI system now handles SPEC management directly.
 * Returns false for graceful degradation.
 */
export async function isOpenSpecAvailable(): Promise<boolean> {
  // External openspec CLI is no longer available.
  // TAG-006: Direct file reading from .moai/specs/ handles SPEC data.
  return false
}

/**
 * Get OpenSpec CLI version
 *
 * DEPRECATED (TAG-006): External openspec CLI dependency removed.
 * Returns null for graceful degradation.
 */
export async function getOpenSpecVersion(): Promise<string | null> {
  // External openspec CLI is no longer available
  return null
}
