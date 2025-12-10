/**
 * CLI Process Manager
 *
 * Manages CLI process lifecycle:
 * - Spawning CLI processes
 * - Streaming stdin/stdout/stderr
 * - Process termination
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  CLISession,
  CLIOutput,
  CLIProfile,
  StartCLIRequest,
  StartCLIResponse,
  StopCLIResponse,
  SendInputResponse,
} from './types.js'
import { getProfileManager } from './profile-manager.js'

interface ProcessEntry {
  session: CLISession
  profile: CLIProfile
  process: ChildProcess
  outputBuffer: CLIOutput[]
}

export class CLIProcessManager extends EventEmitter {
  private projectPath: string
  private processes: Map<string, ProcessEntry> = new Map()
  private maxOutputBuffer = 1000 // Max output lines to keep

  constructor(projectPath: string) {
    super()
    this.projectPath = projectPath
  }

  /**
   * Build the command arguments for a CLI
   */
  private buildArgs(
    profile: CLIProfile,
    changeId: string,
    initialPrompt?: string,
    extraArgs?: string[]
  ): string[] {
    const args = [...profile.args]

    // Add MCP config if supported
    if (profile.mcpFlag) {
      const mcpConfigPath = join(this.projectPath, '.zyflow', 'mcp-config.json')
      if (existsSync(mcpConfigPath)) {
        args.push(profile.mcpFlag, mcpConfigPath)
      }
    }

    // Add extra args
    if (extraArgs) {
      args.push(...extraArgs)
    }

    // Add initial prompt for some CLIs
    if (initialPrompt) {
      // Different CLIs handle initial prompts differently
      switch (profile.type) {
        case 'claude':
          args.push('-p', initialPrompt)
          break
        case 'gemini':
          args.push('--prompt', initialPrompt)
          break
        default:
          // For others, we'll send via stdin
          break
      }
    }

    return args
  }

  /**
   * Start a CLI session
   */
  async start(request: StartCLIRequest): Promise<StartCLIResponse> {
    const profileManager = getProfileManager(this.projectPath)
    const profile = await profileManager.get(request.profileId)

    if (!profile) {
      return { success: false, error: `Profile not found: ${request.profileId}` }
    }

    // Check if CLI is available
    const availability = await profileManager.checkAvailability(request.profileId)
    if (!availability.available) {
      return {
        success: false,
        error: availability.error || `CLI not available: ${profile.command}`,
      }
    }

    const sessionId = randomUUID()
    const projectPath = request.projectPath || this.projectPath

    // Build arguments
    const args = this.buildArgs(
      profile,
      request.changeId,
      request.initialPrompt,
      request.extraArgs
    )

    // Build environment
    const env = {
      ...process.env,
      ...profile.env,
      ZYFLOW_PROJECT: projectPath,
      ZYFLOW_CHANGE_ID: request.changeId,
    }

    // Spawn process
    const proc = spawn(profile.command, args, {
      cwd: profile.cwd || projectPath,
      env: {
        ...env,
        FORCE_COLOR: '1',
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!proc.pid) {
      return { success: false, error: 'Failed to start process' }
    }

    // Create session
    const session: CLISession = {
      id: sessionId,
      profileId: profile.id,
      changeId: request.changeId,
      projectPath,
      pid: proc.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
    }

    const entry: ProcessEntry = {
      session,
      profile,
      process: proc,
      outputBuffer: [],
    }

    this.processes.set(sessionId, entry)

    // Setup event handlers
    this.setupProcessHandlers(entry)

    // Send initial prompt via stdin if needed
    if (request.initialPrompt && !['claude', 'gemini'].includes(profile.type)) {
      proc.stdin?.write(request.initialPrompt + '\n')
    }

    // Mark as running
    session.status = 'running'
    this.emit('session:start', session)

    return { success: true, sessionId }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(entry: ProcessEntry): void {
    const { session, process: proc } = entry

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const output: CLIOutput = {
        sessionId: session.id,
        type: 'stdout',
        content: data.toString(),
        timestamp: new Date().toISOString(),
      }
      this.addOutput(entry, output)
      this.emit('output', output)
    })

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const output: CLIOutput = {
        sessionId: session.id,
        type: 'stderr',
        content: data.toString(),
        timestamp: new Date().toISOString(),
      }
      this.addOutput(entry, output)
      this.emit('output', output)
    })

    // Handle close
    proc.on('close', (code: number | null, signal: string | null) => {
      session.status = code === 0 ? 'completed' : 'failed'
      session.exitCode = code ?? undefined
      session.endedAt = new Date().toISOString()

      if (signal) {
        session.error = `Process killed by signal: ${signal}`
      } else if (code !== 0) {
        session.error = `Process exited with code: ${code}`
      }

      this.emit('session:end', session)
    })

    // Handle error
    proc.on('error', (error: Error) => {
      session.status = 'failed'
      session.error = error.message
      session.endedAt = new Date().toISOString()

      const output: CLIOutput = {
        sessionId: session.id,
        type: 'system',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      }
      this.addOutput(entry, output)
      this.emit('output', output)
      this.emit('session:end', session)
    })
  }

  /**
   * Add output to buffer
   */
  private addOutput(entry: ProcessEntry, output: CLIOutput): void {
    entry.outputBuffer.push(output)
    // Trim buffer if too large
    if (entry.outputBuffer.length > this.maxOutputBuffer) {
      entry.outputBuffer = entry.outputBuffer.slice(-this.maxOutputBuffer)
    }
  }

  /**
   * Stop a CLI session
   */
  async stop(sessionId: string, force = false): Promise<StopCLIResponse> {
    const entry = this.processes.get(sessionId)
    if (!entry) {
      return { success: false, error: 'Session not found' }
    }

    const { session, process: proc } = entry

    if (session.status !== 'running' && session.status !== 'starting') {
      return { success: false, error: `Session not running: ${session.status}` }
    }

    // Try graceful termination first
    if (force) {
      proc.kill('SIGKILL')
    } else {
      proc.kill('SIGTERM')

      // Force kill after timeout
      setTimeout(() => {
        if (session.status === 'running') {
          proc.kill('SIGKILL')
        }
      }, 5000)
    }

    session.status = 'stopped'
    return { success: true }
  }

  /**
   * Send input to a CLI session
   */
  async sendInput(sessionId: string, input: string): Promise<SendInputResponse> {
    const entry = this.processes.get(sessionId)
    if (!entry) {
      return { success: false, error: 'Session not found' }
    }

    const { session, process: proc } = entry

    if (session.status !== 'running') {
      return { success: false, error: `Session not running: ${session.status}` }
    }

    if (!proc.stdin?.writable) {
      return { success: false, error: 'stdin not available' }
    }

    proc.stdin.write(input + '\n')
    return { success: true }
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): CLISession | undefined {
    return this.processes.get(sessionId)?.session
  }

  /**
   * Get all sessions
   */
  getAllSessions(): CLISession[] {
    return Array.from(this.processes.values()).map(e => e.session)
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): CLISession[] {
    return this.getAllSessions().filter(
      s => s.status === 'running' || s.status === 'starting'
    )
  }

  /**
   * Get session output buffer
   */
  getOutput(sessionId: string, since?: string): CLIOutput[] {
    const entry = this.processes.get(sessionId)
    if (!entry) {
      return []
    }

    if (since) {
      return entry.outputBuffer.filter(o => o.timestamp > since)
    }

    return [...entry.outputBuffer]
  }

  /**
   * Cleanup finished sessions
   */
  cleanup(maxAge = 3600000): void {
    const now = Date.now()
    for (const [id, entry] of this.processes.entries()) {
      const { session } = entry
      if (
        session.endedAt &&
        now - new Date(session.endedAt).getTime() > maxAge
      ) {
        this.processes.delete(id)
      }
    }
  }

  /**
   * Stop all sessions
   */
  async stopAll(): Promise<void> {
    const promises = this.getActiveSessions().map(s => this.stop(s.id, true))
    await Promise.all(promises)
  }
}

// Singleton instance
// Use global to ensure singleton persists across module reloads or dual-package hazards
const GLOBAL_KEY = '__ZYFLOW_CLI_PROCESS_MANAGER__'
const globalScope = global as any

if (!globalScope[GLOBAL_KEY]) {
  globalScope[GLOBAL_KEY] = null
}

export function getProcessManager(projectPath?: string): CLIProcessManager {
  let instance = globalScope[GLOBAL_KEY] as CLIProcessManager | null

  if (!instance && projectPath) {
    instance = new CLIProcessManager(projectPath)
    globalScope[GLOBAL_KEY] = instance
    console.log('[ProcessManager] Initialized global instance with path:', projectPath)
  }

  if (!instance) {
    // Try to recover if we have a default path or active sessions in a "lost" instance? 
    // No, just throw but with better message
    throw new Error('Process manager not initialized. Provide projectPath first.')
  }
  
  return instance
}

export function initProcessManager(projectPath: string): CLIProcessManager {
  const instance = new CLIProcessManager(projectPath)
  globalScope[GLOBAL_KEY] = instance
  console.log('[ProcessManager] Re-initialized global instance with path:', projectPath)
  return instance
}
