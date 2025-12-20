/**
 * Tests for CLIProcessManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CLIProcessManager } from './process-manager'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync } from 'fs'

let testDir: string

describe('CLIProcessManager', () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `zyflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('constructor', () => {
    it('should create a process manager instance', () => {
      const manager = new CLIProcessManager(testDir)
      expect(manager).toBeDefined()
    })
  })

  describe('getAllSessions', () => {
    it('should return empty array when no sessions', () => {
      const manager = new CLIProcessManager(testDir)
      const sessions = manager.getAllSessions()
      expect(sessions).toEqual([])
    })
  })

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      const manager = new CLIProcessManager(testDir)
      const session = manager.getSession('nonexistent')
      expect(session).toBeUndefined()
    })
  })

  describe('getOutput', () => {
    it('should return empty array for non-existent session', () => {
      const manager = new CLIProcessManager(testDir)
      const output = manager.getOutput('nonexistent')
      expect(output).toEqual([])
    })
  })

  describe('stop', () => {
    it('should return error for non-existent session', async () => {
      const manager = new CLIProcessManager(testDir)
      const result = await manager.stop('nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Session not found')
    })
  })

  describe('sendInput', () => {
    it('should return error for non-existent session', async () => {
      const manager = new CLIProcessManager(testDir)
      const result = await manager.sendInput('nonexistent', 'test input')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Session not found')
    })
  })

  describe('getActiveSessions', () => {
    it('should return empty array when no active sessions', () => {
      const manager = new CLIProcessManager(testDir)
      const sessions = manager.getActiveSessions()
      expect(sessions).toEqual([])
    })
  })

  describe('cleanup', () => {
    it('should not throw when no sessions exist', () => {
      const manager = new CLIProcessManager(testDir)
      expect(() => manager.cleanup()).not.toThrow()
    })
  })

  describe('stopAll', () => {
    it('should not throw when no active sessions', async () => {
      const manager = new CLIProcessManager(testDir)
      await expect(manager.stopAll()).resolves.not.toThrow()
    })
  })
})

/**
 * buildArgs Provider-specific Tests
 *
 * Tests for buildArgs method to verify correct argument generation
 * for each AI Provider (Claude, Gemini, Codex, Qwen, Kilo, OpenCode)
 */
import { vi } from 'vitest'
import { DEFAULT_CLI_PROFILES, CLIProfile } from './types'

describe('CLIProcessManager.buildArgs', () => {
  // We need to test the private buildArgs method
  // Create a test harness by extending the class or using reflection
  let testManager: CLIProcessManager

  beforeEach(() => {
    testDir = join(tmpdir(), `zyflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    testManager = new CLIProcessManager(testDir)
  })

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  // Helper to call private buildArgs
  function callBuildArgs(
    profile: CLIProfile,
    changeId: string,
    initialPrompt?: string,
    model?: string,
    extraArgs?: string[]
  ): string[] {
    // @ts-expect-error - accessing private method for testing
    return testManager.buildArgs(profile, changeId, initialPrompt, model, extraArgs)
  }

  describe('Claude CLI Arguments', () => {
    const claudeProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'claude')!

    it('should generate --model flag for Claude', () => {
      const args = callBuildArgs(claudeProfile, 'change-1', undefined, 'opus')
      expect(args).toContain('--model')
      expect(args).toContain('opus')
    })

    it('should generate -p flag for initial prompt', () => {
      const args = callBuildArgs(claudeProfile, 'change-1', 'Test prompt')
      expect(args).toContain('-p')
      expect(args).toContain('Test prompt')
    })

    it('should handle sonnet model', () => {
      const args = callBuildArgs(claudeProfile, 'change-1', undefined, 'sonnet')
      expect(args).toContain('--model')
      expect(args).toContain('sonnet')
    })

    it('should handle haiku model', () => {
      const args = callBuildArgs(claudeProfile, 'change-1', undefined, 'haiku')
      expect(args).toContain('--model')
      expect(args).toContain('haiku')
    })

    it('should not include model flag when model not specified', () => {
      const args = callBuildArgs(claudeProfile, 'change-1')
      expect(args).not.toContain('--model')
    })
  })

  describe('Gemini CLI Arguments', () => {
    const geminiProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'gemini')!

    it('should generate --model flag for Gemini', () => {
      const args = callBuildArgs(geminiProfile, 'change-1', undefined, 'gemini-2.5-pro')
      expect(args).toContain('--model')
      expect(args).toContain('gemini-2.5-pro')
    })

    it('should generate --prompt flag for initial prompt', () => {
      const args = callBuildArgs(geminiProfile, 'change-1', 'Test prompt')
      expect(args).toContain('--prompt')
      expect(args).toContain('Test prompt')
    })

    it('should handle gemini-2.5-flash model', () => {
      const args = callBuildArgs(geminiProfile, 'change-1', undefined, 'gemini-2.5-flash')
      expect(args).toContain('gemini-2.5-flash')
    })
  })

  describe('Codex CLI Arguments', () => {
    const codexProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'codex')!

    it('should generate --model flag for Codex', () => {
      const args = callBuildArgs(codexProfile, 'change-1', undefined, 'gpt-5.1-codex')
      expect(args).toContain('--model')
      expect(args).toContain('gpt-5.1-codex')
    })

    it('should use write --task for initial prompt', () => {
      const args = callBuildArgs(codexProfile, 'change-1', 'Test prompt')
      expect(args).toContain('write')
      expect(args).toContain('--task')
      expect(args).toContain('Test prompt')
    })
  })

  describe('Qwen CLI Arguments', () => {
    const qwenProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'qwen')!

    it('should generate --model flag for Qwen', () => {
      const args = callBuildArgs(qwenProfile, 'change-1', undefined, 'qwen-coder-plus')
      expect(args).toContain('--model')
      expect(args).toContain('qwen-coder-plus')
    })

    it('should generate --prompt flag for initial prompt', () => {
      const args = callBuildArgs(qwenProfile, 'change-1', 'Test prompt')
      expect(args).toContain('--prompt')
      expect(args).toContain('Test prompt')
    })
  })

  describe('Kilo CLI Arguments', () => {
    const kiloProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'kilo')!

    it('should generate --model flag for Kilo', () => {
      const args = callBuildArgs(kiloProfile, 'change-1', undefined, 'kilo-model')
      expect(args).toContain('--model')
      expect(args).toContain('kilo-model')
    })
  })

  describe('OpenCode CLI Arguments', () => {
    const opencodeProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'opencode')!

    it('should generate --model flag for OpenCode', () => {
      const args = callBuildArgs(opencodeProfile, 'change-1', undefined, 'opencode-model')
      expect(args).toContain('--model')
      expect(args).toContain('opencode-model')
    })
  })

  describe('Extra Arguments', () => {
    const claudeProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'claude')!

    it('should include extra arguments', () => {
      const args = callBuildArgs(
        claudeProfile,
        'change-1',
        undefined,
        undefined,
        ['--verbose', '--debug']
      )
      expect(args).toContain('--verbose')
      expect(args).toContain('--debug')
    })

    it('should include extra args after model', () => {
      const args = callBuildArgs(
        claudeProfile,
        'change-1',
        undefined,
        'sonnet',
        ['--extra']
      )
      const modelIndex = args.indexOf('sonnet')
      const extraIndex = args.indexOf('--extra')
      expect(modelIndex).toBeLessThan(extraIndex)
    })
  })

  describe('Edge Cases', () => {
    const claudeProfile = DEFAULT_CLI_PROFILES.find((p) => p.id === 'claude')!

    it('should handle empty string prompt', () => {
      const args = callBuildArgs(claudeProfile, 'change-1', '')
      // Empty prompt should not add -p flag
      const pFlagCount = args.filter(a => a === '-p').length
      expect(pFlagCount).toBe(0)
    })

    it('should preserve base profile args', () => {
      const customProfile: CLIProfile = {
        id: 'custom',
        name: 'Custom CLI',
        type: 'custom',
        command: 'custom-cli',
        args: ['--base-flag'],
      }
      const args = callBuildArgs(customProfile, 'change-1')
      expect(args).toContain('--base-flag')
    })

    it('should handle prompt with special characters', () => {
      const prompt = 'Fix "bug" in <file> & run tests'
      const args = callBuildArgs(claudeProfile, 'change-1', prompt)
      expect(args).toContain(prompt)
    })
  })
})
