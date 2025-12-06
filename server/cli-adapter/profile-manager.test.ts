/**
 * Tests for CLIProfileManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DEFAULT_CLI_PROFILES, CLIProfile, CLIType } from './types'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs'

// Create a test directory for each test
let testDir: string

describe('DEFAULT_CLI_PROFILES', () => {
  it('should have claude profile', () => {
    const claude = DEFAULT_CLI_PROFILES.find(p => p.type === 'claude')
    expect(claude).toBeDefined()
    expect(claude?.command).toBe('claude')
    expect(claude?.mcpFlag).toBe('--mcp-config')
  })

  it('should have gemini profile', () => {
    const gemini = DEFAULT_CLI_PROFILES.find(p => p.type === 'gemini')
    expect(gemini).toBeDefined()
    expect(gemini?.command).toBe('gemini')
  })

  it('should have all required profiles', () => {
    const types = DEFAULT_CLI_PROFILES.map(p => p.type)
    expect(types).toContain('claude')
    expect(types).toContain('gemini')
    expect(types).toContain('qwen')
    expect(types).toContain('kilo')
    expect(types).toContain('opencode')
  })

  it('should have unique ids for all profiles', () => {
    const ids = DEFAULT_CLI_PROFILES.map(p => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have required fields for all profiles', () => {
    for (const profile of DEFAULT_CLI_PROFILES) {
      expect(profile.id).toBeDefined()
      expect(profile.type).toBeDefined()
      expect(profile.name).toBeDefined()
      expect(profile.command).toBeDefined()
      expect(Array.isArray(profile.args)).toBe(true)
    }
  })
})

describe('CLIProfileManager', () => {
  beforeEach(() => {
    // Create unique temp directory for each test
    testDir = join(tmpdir(), `zyflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    // Cleanup temp directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  // Import module dynamically to test with fresh state
  async function createManager() {
    // Reset module state by reimporting
    const { CLIProfileManager } = await import('./profile-manager')
    return new CLIProfileManager(testDir)
  }

  describe('getAll', () => {
    it('should return default profiles when no custom profiles exist', async () => {
      const manager = await createManager()
      const profiles = await manager.getAll()

      expect(profiles.length).toBe(DEFAULT_CLI_PROFILES.length)
      expect(profiles.map(p => p.type)).toContain('claude')
      expect(profiles.map(p => p.type)).toContain('gemini')
    })

    it('should include custom profiles', async () => {
      const manager = await createManager()
      const customProfile: CLIProfile = {
        id: 'custom-my-cli',
        type: 'custom' as CLIType,
        name: 'My Custom CLI',
        command: 'my-cli',
        args: [],
        description: 'A custom CLI tool',
        icon: '🔧',
      }

      await manager.upsert(customProfile)
      const profiles = await manager.getAll()

      expect(profiles.find(p => p.name === 'My Custom CLI')).toBeDefined()
      expect(profiles.length).toBe(DEFAULT_CLI_PROFILES.length + 1)
    })
  })

  describe('get', () => {
    it('should return a default profile by id', async () => {
      const manager = await createManager()
      const profile = await manager.get('claude')

      expect(profile).toBeDefined()
      expect(profile?.type).toBe('claude')
      expect(profile?.command).toBe('claude')
    })

    it('should return undefined for non-existent profile', async () => {
      const manager = await createManager()
      const profile = await manager.get('nonexistent')

      expect(profile).toBeUndefined()
    })
  })

  describe('upsert', () => {
    it('should add a new custom profile', async () => {
      const manager = await createManager()
      const customProfile: CLIProfile = {
        id: 'test-cli',
        type: 'custom' as CLIType,
        name: 'Test CLI',
        command: 'test-cli',
        args: [],
        icon: '🧪',
      }

      await manager.upsert(customProfile)

      const profiles = await manager.getAll()
      const found = profiles.find(p => p.name === 'Test CLI')

      expect(found).toBeDefined()
      expect(found?.command).toBe('test-cli')
    })

    it('should update an existing custom profile', async () => {
      const manager = await createManager()
      const customProfile: CLIProfile = {
        id: 'test-cli',
        type: 'custom' as CLIType,
        name: 'Test CLI',
        command: 'test-cli',
        args: [],
        icon: '🧪',
      }

      await manager.upsert(customProfile)

      const updatedProfile: CLIProfile = {
        id: 'test-cli',
        type: 'custom' as CLIType,
        name: 'Test CLI Updated',
        command: 'test-cli-v2',
        args: ['--flag'],
        icon: '🔬',
      }

      await manager.upsert(updatedProfile)

      const profile = await manager.get('test-cli')

      expect(profile).toBeDefined()
      expect(profile?.command).toBe('test-cli-v2')
      expect(profile?.icon).toBe('🔬')
      expect(profile?.name).toBe('Test CLI Updated')
    })

    it('should persist custom profiles to disk', async () => {
      const manager = await createManager()
      const customProfile: CLIProfile = {
        id: 'persisted-cli',
        type: 'custom' as CLIType,
        name: 'Persisted CLI',
        command: 'persisted',
        args: [],
      }

      await manager.upsert(customProfile)

      // Check file exists
      const configPath = join(testDir, '.zyflow', 'cli-profiles.json')
      expect(existsSync(configPath)).toBe(true)

      // Check content
      const content = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(content.profiles).toBeDefined()
      expect(content.profiles.find((p: CLIProfile) => p.id === 'persisted-cli')).toBeDefined()
    })
  })

  describe('delete', () => {
    it('should delete a custom profile', async () => {
      const manager = await createManager()
      const customProfile: CLIProfile = {
        id: 'to-delete',
        type: 'custom' as CLIType,
        name: 'To Delete',
        command: 'delete-me',
        args: [],
        icon: '🗑️',
      }

      await manager.upsert(customProfile)
      expect((await manager.getAll()).find(p => p.id === 'to-delete')).toBeDefined()

      await manager.delete('to-delete')
      expect((await manager.getAll()).find(p => p.id === 'to-delete')).toBeUndefined()
    })

    it('should not delete default profiles', async () => {
      const manager = await createManager()

      // Should throw error when trying to delete built-in profile
      await expect(manager.delete('claude')).rejects.toThrow('Cannot delete built-in profile')

      // Default profile should still exist
      const profile = await manager.get('claude')
      expect(profile).toBeDefined()
    })
  })
})
