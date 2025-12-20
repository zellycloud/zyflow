/**
 * CLI Adapter Integration Tests
 *
 * Integration tests for single execution and Swarm execution flows
 * Using real filesystem with temp directories
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CLIProcessManager } from './process-manager.js'
import { DEFAULT_CLI_PROFILES, type CLIProfile, type CLISession } from './types.js'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'

let testDir: string

describe('Integration Tests: CLI Profiles', () => {
  it('should have all expected default profiles', () => {
    expect(DEFAULT_CLI_PROFILES).toHaveLength(6)

    const profileIds = DEFAULT_CLI_PROFILES.map((p) => p.id)
    expect(profileIds).toContain('claude')
    expect(profileIds).toContain('gemini')
    expect(profileIds).toContain('qwen')
    expect(profileIds).toContain('kilo')
    expect(profileIds).toContain('opencode')
    expect(profileIds).toContain('codex')
  })

  it('should have correct Claude profile configuration', () => {
    const claude = DEFAULT_CLI_PROFILES.find((p) => p.id === 'claude')
    expect(claude).toBeDefined()
    expect(claude?.type).toBe('claude')
    expect(claude?.command).toBe('claude')
    expect(claude?.mcpFlag).toBe('--mcp-config')
    expect(claude?.availableModels).toContain('sonnet')
    expect(claude?.availableModels).toContain('opus')
    expect(claude?.availableModels).toContain('haiku')
  })

  it('should have correct Gemini profile configuration', () => {
    const gemini = DEFAULT_CLI_PROFILES.find((p) => p.id === 'gemini')
    expect(gemini).toBeDefined()
    expect(gemini?.type).toBe('gemini')
    expect(gemini?.command).toBe('gemini')
    expect(gemini?.availableModels).toContain('gemini-2.5-flash')
    expect(gemini?.availableModels).toContain('gemini-2.5-pro')
  })

  it('should have correct Codex profile configuration', () => {
    const codex = DEFAULT_CLI_PROFILES.find((p) => p.id === 'codex')
    expect(codex).toBeDefined()
    expect(codex?.type).toBe('codex')
    expect(codex?.command).toBe('codex')
    expect(codex?.availableModels).toContain('gpt-5-codex')
    expect(codex?.availableModels).toContain('gpt-5.1-codex')
  })
})

describe('Integration Tests: CLIProcessManager Initialization', () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `zyflow-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('should create manager instance with project path', () => {
    const manager = new CLIProcessManager(testDir)
    expect(manager).toBeDefined()
  })

  it('should initialize with empty sessions', () => {
    const manager = new CLIProcessManager(testDir)
    expect(manager.getAllSessions()).toEqual([])
    expect(manager.getActiveSessions()).toEqual([])
  })

  it('should persist and load sessions', () => {
    // Create .zyflow directory and sessions file
    const zyflowDir = join(testDir, '.zyflow')
    mkdirSync(zyflowDir, { recursive: true })

    const mockSessions: CLISession[] = [
      {
        id: 'test-session-1',
        profileId: 'claude',
        changeId: 'change-1',
        projectPath: testDir,
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T00:01:00Z',
      },
    ]

    writeFileSync(join(zyflowDir, 'sessions.json'), JSON.stringify(mockSessions))

    const manager = new CLIProcessManager(testDir)
    const sessions = manager.getAllSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('test-session-1')
  })

  it('should handle missing sessions file gracefully', () => {
    const manager = new CLIProcessManager(testDir)
    expect(manager.getAllSessions()).toEqual([])
  })

  it('should handle invalid sessions file gracefully', () => {
    const zyflowDir = join(testDir, '.zyflow')
    mkdirSync(zyflowDir, { recursive: true })
    writeFileSync(join(zyflowDir, 'sessions.json'), 'invalid json')

    // Should not throw
    const manager = new CLIProcessManager(testDir)
    expect(manager.getAllSessions()).toEqual([])
  })
})

describe('Integration Tests: Session Management', () => {
  let manager: CLIProcessManager

  beforeEach(() => {
    testDir = join(tmpdir(), `zyflow-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    manager = new CLIProcessManager(testDir)
  })

  afterEach(async () => {
    await manager.stopAll()
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('should return undefined for non-existent session', () => {
    expect(manager.getSession('non-existent')).toBeUndefined()
  })

  it('should return empty output for non-existent session', () => {
    expect(manager.getOutput('non-existent')).toEqual([])
  })

  it('should return error when stopping non-existent session', async () => {
    const result = await manager.stop('non-existent')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Session not found')
  })

  it('should return error when sending input to non-existent session', async () => {
    const result = await manager.sendInput('non-existent', 'test')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Session not found')
  })

  it('should delete session from history', () => {
    // Add a mock session to completedSessions
    const zyflowDir = join(testDir, '.zyflow')
    mkdirSync(zyflowDir, { recursive: true })

    const mockSessions: CLISession[] = [
      {
        id: 'session-to-delete',
        profileId: 'claude',
        changeId: 'change-1',
        projectPath: testDir,
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
      },
    ]

    writeFileSync(join(zyflowDir, 'sessions.json'), JSON.stringify(mockSessions))

    // Re-create manager to load sessions
    manager = new CLIProcessManager(testDir)

    expect(manager.getSession('session-to-delete')).toBeDefined()

    const deleted = manager.deleteSession('session-to-delete')
    expect(deleted).toBe(true)

    expect(manager.getSession('session-to-delete')).toBeUndefined()
  })

  it('should return false when deleting non-existent session', () => {
    const deleted = manager.deleteSession('non-existent')
    expect(deleted).toBe(false)
  })
})

describe('Integration Tests: Profile Availability', () => {
  it('should check CLI type constraints in profiles', () => {
    for (const profile of DEFAULT_CLI_PROFILES) {
      expect(['claude', 'gemini', 'qwen', 'kilo', 'opencode', 'codex', 'custom']).toContain(
        profile.type
      )
      expect(profile.command).toBeDefined()
      expect(profile.command.length).toBeGreaterThan(0)
    }
  })

  it('should have unique profile IDs', () => {
    const ids = DEFAULT_CLI_PROFILES.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have all required profile properties', () => {
    for (const profile of DEFAULT_CLI_PROFILES) {
      expect(profile.id).toBeDefined()
      expect(profile.name).toBeDefined()
      expect(profile.type).toBeDefined()
      expect(profile.command).toBeDefined()
      expect(profile.args).toBeDefined()
      expect(Array.isArray(profile.args)).toBe(true)
    }
  })
})

describe('Integration Tests: Swarm Multi-Provider Support', () => {
  it('should have different providers for swarm coordination', () => {
    const providers = ['claude', 'gemini', 'codex']
    const profiles = DEFAULT_CLI_PROFILES.filter((p) => providers.includes(p.id))

    expect(profiles).toHaveLength(3)

    // All should have different command names
    const commands = profiles.map((p) => p.command)
    expect(new Set(commands).size).toBe(3)

    // All should have models configured (except possibly new ones)
    for (const profile of profiles) {
      if (profile.availableModels) {
        expect(profile.availableModels.length).toBeGreaterThan(0)
      }
    }
  })

  it('should have profile display info for UI', () => {
    for (const profile of DEFAULT_CLI_PROFILES) {
      expect(profile.name).toBeDefined()
      expect(profile.icon).toBeDefined() // emoji for UI display
      expect(profile.description).toBeDefined()
    }
  })
})

describe('Integration Tests: Conversation History Structure', () => {
  it('should support CLISession with conversation history', () => {
    const session: CLISession = {
      id: 'test-session',
      profileId: 'claude',
      changeId: 'change-1',
      projectPath: '/test/project',
      status: 'running',
      startedAt: new Date().toISOString(),
      conversationHistory: [
        { role: 'user', content: 'First message' },
        {
          role: 'assistant',
          content: 'Response',
          cli: { id: 'claude', name: 'Claude Code', icon: '🤖' },
        },
        { role: 'user', content: 'Follow-up' },
      ],
    }

    expect(session.conversationHistory).toHaveLength(3)
    expect(session.conversationHistory?.[0].role).toBe('user')
    expect(session.conversationHistory?.[1].role).toBe('assistant')
    expect(session.conversationHistory?.[1].cli?.id).toBe('claude')
  })

  it('should support multi-CLI conversation tracking', () => {
    const session: CLISession = {
      id: 'multi-cli-session',
      profileId: 'claude',
      changeId: 'change-1',
      projectPath: '/test/project',
      status: 'completed',
      startedAt: new Date().toISOString(),
      conversationHistory: [
        { role: 'user', content: 'Analyze this code' },
        {
          role: 'assistant',
          content: 'Analysis result from Claude',
          cli: { id: 'claude', name: 'Claude Code', icon: '🤖' },
        },
        { role: 'user', content: 'Now generate tests' },
        {
          role: 'assistant',
          content: 'Tests generated by Gemini',
          cli: { id: 'gemini', name: 'Gemini CLI', icon: '💎' },
        },
      ],
    }

    const cliResponses = session.conversationHistory?.filter((m) => m.role === 'assistant') || []
    expect(cliResponses).toHaveLength(2)
    expect(cliResponses[0].cli?.id).toBe('claude')
    expect(cliResponses[1].cli?.id).toBe('gemini')
  })
})
