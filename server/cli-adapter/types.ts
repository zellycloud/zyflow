/**
 * CLI Adapter Types for Multi-CLI support
 *
 * Supports various AI coding assistants:
 * - Claude Code (claude)
 * - Gemini CLI (gemini)
 * - Qwen Code (qwen)
 * - Kilo Code (kilo)
 * - OpenCode (opencode)
 * - Codex CLI (codex)
 * - Custom CLIs
 */

export type CLIType = 'claude' | 'gemini' | 'qwen' | 'kilo' | 'opencode' | 'codex' | 'custom'

export interface CLIProfile {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** CLI type */
  type: CLIType
  /** Command to execute */
  command: string
  /** Default arguments */
  args: string[]
  /** Flag for MCP config (e.g., --mcp-config) */
  mcpFlag?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Working directory (defaults to project path) */
  cwd?: string
  /** Description */
  description?: string
  /** Icon URL or emoji */
  icon?: string
  /** Whether this is a built-in profile */
  builtin?: boolean
  /** Default model to use */
  defaultModel?: string
  /** Available models */
  availableModels?: string[]
}

export interface CLISession {
  /** Session ID */
  id: string
  /** CLI profile used */
  profileId: string
  /** CLI profile info (for display) */
  cliInfo?: { id: string; name: string; icon?: string }
  /** Change ID being executed */
  changeId: string
  /** Project path */
  projectPath: string
  /** Process ID */
  pid?: number
  /** Session status */
  status: 'starting' | 'running' | 'stopped' | 'failed' | 'completed'
  /** Start time */
  startedAt: string
  /** End time */
  endedAt?: string
  /** Exit code */
  exitCode?: number
  /** Error message */
  error?: string
  /** Conversation history for multi-turn support */
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
    cli?: { id: string; name: string; icon?: string }
  }>
}

export interface CLIOutput {
  /** Session ID */
  sessionId: string
  /** Output type */
  type: 'stdout' | 'stderr' | 'system'
  /** Content */
  content: string
  /** Timestamp */
  timestamp: string
}

export interface CLIInput {
  /** Session ID */
  sessionId: string
  /** Input content */
  content: string
}

export interface StartCLIRequest {
  /** CLI profile ID (provider) */
  profileId: string
  /** Change ID to execute */
  changeId: string
  /** Project path */
  projectPath?: string
  /** Initial prompt */
  initialPrompt?: string
  /** Model override (e.g., 'sonnet', 'opus', 'gemini-2.5-pro') */
  model?: string
  /** Additional arguments */
  extraArgs?: string[]
  /** Task ID (optional, for tracking) */
  taskId?: string
}

export interface StartCLIResponse {
  success: boolean
  sessionId?: string
  error?: string
}

export interface StopCLIRequest {
  /** Session ID */
  sessionId: string
  /** Force kill */
  force?: boolean
}

export interface StopCLIResponse {
  success: boolean
  error?: string
}

export interface SendInputRequest {
  /** Session ID */
  sessionId: string
  /** Input content */
  input: string
}

export interface SendInputResponse {
  success: boolean
  error?: string
}

// Default CLI profiles
export const DEFAULT_CLI_PROFILES: CLIProfile[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    type: 'claude',
    command: 'claude',
    args: [],
    mcpFlag: '--mcp-config',
    description: 'Anthropic Claude Code CLI',
    icon: '🤖',
    builtin: true,
    defaultModel: 'sonnet',
    availableModels: [
      'sonnet',
      'opus',
      'haiku',
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    type: 'gemini',
    command: 'gemini',
    args: [],
    description: 'Google Gemini CLI',
    icon: '💎',
    builtin: true,
    defaultModel: 'gemini-2.5-flash',
    availableModels: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-pro-preview',
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    type: 'qwen',
    command: 'qwen',
    args: [],
    description: 'Alibaba Qwen Code CLI',
    icon: '🌟',
    builtin: true,
    defaultModel: 'qwen-coder-plus',
    availableModels: [
      'qwen-coder-plus',
      'qwen-coder',
    ],
  },
  {
    id: 'kilo',
    name: 'Kilo Code',
    type: 'kilo',
    command: 'kilo',
    args: [],
    description: 'Kilo Code CLI',
    icon: '⚡',
    builtin: true,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    type: 'opencode',
    command: 'opencode',
    args: [],
    description: 'OpenCode CLI',
    icon: '🔓',
    builtin: true,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    type: 'codex',
    command: 'codex',
    args: [],
    description: 'OpenAI Codex CLI',
    icon: '🧠',
    builtin: true,
    defaultModel: 'gpt-5.1-codex',
    availableModels: [
      'gpt-5-codex',
      'gpt-5.1-codex',
    ],
  },
]
