/**
 * Tests for CLIProcessManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CLIProcessManager } from './process-manager'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'

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
