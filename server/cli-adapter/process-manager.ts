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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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
  /** Accumulated assistant response for current turn */
  currentAssistantResponse: string
}

export class CLIProcessManager extends EventEmitter {
  private projectPath: string
  private processes: Map<string, ProcessEntry> = new Map()
  private completedSessions: Map<string, CLISession> = new Map()
  private maxOutputBuffer = 1000 // Max output lines to keep
  private sessionsFilePath: string

  constructor(projectPath: string) {
    super()
    this.projectPath = projectPath
    this.sessionsFilePath = join(projectPath, '.zyflow', 'sessions.json')
    this.loadSessions()
  }

  /**
   * Load sessions from file
   */
  private loadSessions(): void {
    try {
      if (existsSync(this.sessionsFilePath)) {
        const data = readFileSync(this.sessionsFilePath, 'utf-8')
        const sessions: CLISession[] = JSON.parse(data)
        for (const session of sessions) {
          this.completedSessions.set(session.id, session)
        }
        console.log(`[ProcessManager] Loaded ${sessions.length} sessions from file`)
      }
    } catch (error) {
      console.error('[ProcessManager] Failed to load sessions:', error)
    }
  }

  /**
   * Save sessions to file
   */
  private saveSessions(): void {
    try {
      const dir = join(this.projectPath, '.zyflow')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      const sessions = Array.from(this.completedSessions.values())
      writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2))
    } catch (error) {
      console.error('[ProcessManager] Failed to save sessions:', error)
    }
  }

  /**
   * Build the command arguments for a CLI
   */
  private buildArgs(
    profile: CLIProfile,
    changeId: string,
    initialPrompt?: string,
    model?: string,
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

    // Add model specification (Provider-specific)
    if (model) {
      switch (profile.type) {
        case 'claude':
          args.push('--model', model)
          break
        case 'gemini':
          args.push('--model', model)
          break
        case 'codex':
          args.push('--model', model)
          break
        case 'qwen':
          args.push('--model', model)
          break
        case 'kilo':
          args.push('--model', model)
          break
        case 'opencode':
          args.push('--model', model)
          break
        // Custom CLIs may use different flags
      }
    }

    // Add extra args (may include additional model args from caller)
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
        case 'codex':
          // Codex CLI uses write --task for prompts
          args.push('write', '--task', initialPrompt)
          break
        case 'qwen':
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
      request.model,
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

    // Create CLI info for display
    const cliInfo = {
      id: profile.id,
      name: profile.name,
      icon: profile.icon,
    }

    // Create session
    const session: CLISession = {
      id: sessionId,
      profileId: profile.id,
      cliInfo,
      changeId: request.changeId,
      projectPath,
      pid: proc.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
      // Initialize conversation history with user's first message
      conversationHistory: request.initialPrompt
        ? [{ role: 'user', content: request.initialPrompt }]
        : [],
    }

    const entry: ProcessEntry = {
      session,
      profile,
      process: proc,
      outputBuffer: [],
      currentAssistantResponse: '',
    }

    this.processes.set(sessionId, entry)

    // Setup event handlers
    this.setupProcessHandlers(entry)

    // Send initial prompt via stdin if needed
    if (request.initialPrompt && !['claude', 'gemini'].includes(profile.type)) {
      proc.stdin?.write(request.initialPrompt + '\n')
    }

    // Close stdin for Claude CLI with -p flag (it expects no further input)
    if (profile.type === 'claude' && request.initialPrompt) {
      proc.stdin?.end()
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
      const content = data.toString()
      const output: CLIOutput = {
        sessionId: session.id,
        type: 'stdout',
        content,
        timestamp: new Date().toISOString(),
      }
      // Accumulate assistant response
      entry.currentAssistantResponse += content
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
      // Save assistant response to conversation history if successful
      if (code === 0 && entry.currentAssistantResponse.trim()) {
        if (!session.conversationHistory) {
          session.conversationHistory = []
        }
        session.conversationHistory.push({
          role: 'assistant',
          content: entry.currentAssistantResponse.trim(),
          cli: session.cliInfo,
        })
      }

      // For Claude CLI with -p flag, successful completion means ready for next turn
      // Mark as 'completed' but keep session available for continuation
      session.status = code === 0 ? 'completed' : 'failed'
      session.exitCode = code ?? undefined
      session.endedAt = new Date().toISOString()

      if (signal) {
        session.error = `Process killed by signal: ${signal}`
      } else if (code !== 0) {
        session.error = `Process exited with code: ${code}`
      }

      // Save to completed sessions and persist
      this.completedSessions.set(session.id, { ...session })
      this.saveSessions()

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

      // Save to completed sessions and persist
      this.completedSessions.set(session.id, { ...session })
      this.saveSessions()

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
   * Send input to a CLI session (supports multi-turn conversations)
   * For Claude CLI, this starts a new process with --continue flag
   */
  async sendInput(sessionId: string, input: string): Promise<SendInputResponse> {
    const entry = this.processes.get(sessionId)
    if (!entry) {
      return { success: false, error: 'Session not found' }
    }

    const { session, profile } = entry

    // For Claude CLI, we need to start a new process with --continue
    // because stdin was closed for the previous prompt
    if (profile.type === 'claude') {
      // Add user message to conversation history
      if (!session.conversationHistory) {
        session.conversationHistory = []
      }
      session.conversationHistory.push({ role: 'user', content: input })

      // Build args for continuation
      const args = [...profile.args]

      // Add MCP config if supported
      if (profile.mcpFlag) {
        const mcpConfigPath = join(this.projectPath, '.zyflow', 'mcp-config.json')
        if (existsSync(mcpConfigPath)) {
          args.push(profile.mcpFlag, mcpConfigPath)
        }
      }

      // Use --continue to resume the last conversation
      args.push('--continue', '-p', input)

      // Build environment
      const env = {
        ...process.env,
        ...profile.env,
        ZYFLOW_PROJECT: session.projectPath,
        ZYFLOW_CHANGE_ID: session.changeId,
      }

      // Spawn new process for continuation
      const proc = spawn(profile.command, args, {
        cwd: profile.cwd || session.projectPath,
        env: {
          ...env,
          FORCE_COLOR: '1',
        },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (!proc.pid) {
        return { success: false, error: 'Failed to start continuation process' }
      }

      // Update entry with new process
      entry.process = proc
      entry.currentAssistantResponse = ''
      session.pid = proc.pid
      session.status = 'running'
      session.endedAt = undefined
      session.error = undefined

      // Setup event handlers for new process
      this.setupProcessHandlers(entry)

      // Close stdin for Claude CLI with -p flag
      proc.stdin?.end()

      return { success: true }
    }

    // For other CLIs, try to write to stdin directly
    const { process: proc } = entry

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
    // Check active processes first
    const active = this.processes.get(sessionId)?.session
    if (active) return active

    // Check completed sessions
    return this.completedSessions.get(sessionId)
  }

  /**
   * Get all sessions (active + completed)
   */
  getAllSessions(): CLISession[] {
    const activeSessions = Array.from(this.processes.values()).map(e => e.session)
    const completedSessions = Array.from(this.completedSessions.values())

    // Merge, avoiding duplicates (active sessions take precedence)
    const activeIds = new Set(activeSessions.map(s => s.id))
    const uniqueCompleted = completedSessions.filter(s => !activeIds.has(s.id))

    return [...activeSessions, ...uniqueCompleted].sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  }

  /**
   * Delete a session from history
   */
  deleteSession(sessionId: string): boolean {
    const existed = this.completedSessions.has(sessionId)
    if (existed) {
      this.completedSessions.delete(sessionId)
      this.saveSessions()
    }
    return existed
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
