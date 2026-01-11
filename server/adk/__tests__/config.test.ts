/**
 * ADK Config Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadConfig, validateConfig, defaultConfig } from '../config'

describe('ADK Config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('defaultConfig', () => {
    it('should have correct default values', () => {
      expect(defaultConfig.model).toBe('gemini-2.0-flash-exp')
      expect(defaultConfig.maxRetries).toBe(3)
      expect(defaultConfig.timeout).toBe(120000)
    })
  })

  describe('loadConfig', () => {
    it('should load default config when no env vars set', () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.GEMINI_MODEL

      const config = loadConfig()

      expect(config.model).toBe('gemini-2.0-flash-exp')
      expect(config.maxRetries).toBe(3)
    })

    it('should override model with env var when set', () => {
      process.env.GEMINI_MODEL = 'gemini-pro'

      const config = loadConfig()

      expect(config.model).toBe('gemini-pro')
    })

    it('should override retries with env var when set', () => {
      process.env.ADK_MAX_RETRIES = '5'

      const config = loadConfig()

      expect(config.maxRetries).toBe(5)
    })

    it('should override timeout with env var when set', () => {
      process.env.ADK_TIMEOUT = '60000'

      const config = loadConfig()

      expect(config.timeout).toBe(60000)
    })

    it('should load API key from env', () => {
      process.env.GEMINI_API_KEY = 'test-api-key'

      const config = loadConfig()

      expect(config.apiKey).toBe('test-api-key')
    })
  })

  describe('validateConfig', () => {
    it('should throw error when API key is missing', () => {
      const config = { ...defaultConfig, apiKey: '' }

      expect(() => validateConfig(config)).toThrow('GEMINI_API_KEY')
    })

    it('should not throw when API key is set', () => {
      const config = { ...defaultConfig, apiKey: 'test-key' }

      expect(() => validateConfig(config)).not.toThrow()
    })
  })
})
