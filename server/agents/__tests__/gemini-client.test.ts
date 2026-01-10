/**
 * Gemini Client Tests
 *
 * Note: These are unit tests for the client structure.
 * Integration tests with actual API require GEMINI_API_KEY.
 */

import { describe, it, expect, vi } from 'vitest'

describe('Gemini Client', () => {
  it('should throw error when API key is missing', async () => {
    // Clear env
    const originalKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY

    vi.resetModules()

    const { GeminiClient } = await import('../../ai/gemini-client')

    expect(() => new GeminiClient({ apiKey: '' })).toThrow('GEMINI_API_KEY is required')

    // Restore
    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey
    }
  })

  it('should export GeminiClient class', async () => {
    const module = await import('../../ai/gemini-client')
    expect(module.GeminiClient).toBeDefined()
    expect(typeof module.GeminiClient).toBe('function')
  })

  it('should export getGeminiClient function', async () => {
    const module = await import('../../ai/gemini-client')
    expect(module.getGeminiClient).toBeDefined()
    expect(typeof module.getGeminiClient).toBe('function')
  })
})
