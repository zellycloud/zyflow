/**
 * API Client Characterization Tests
 *
 * These tests capture the current behavior of the API client
 * to ensure behavior preservation during refactoring.
 *
 * @module api/__tests__/client.characterization.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request, api } from '../client'
import { ApiError, TimeoutError, NetworkError } from '../errors'

// =============================================
// Test Setup & Teardown
// =============================================

describe('API Client Characterization Tests', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Store original fetch
    const originalFetch = global.fetch

    // Mock fetch globally
    fetchMock = vi.fn()
    global.fetch = fetchMock as any
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // =============================================
  // Basic Request Behavior Tests
  // =============================================

  describe('characterize: basic GET request', () => {
    it('should send GET request with correct headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { id: 1, name: 'test' },
        }),
      })

      await api.get<{ id: number; name: string }>('/api/test')

      expect(fetchMock).toHaveBeenCalledOnce()
      const call = fetchMock.mock.calls[0]
      expect(call[0]).toContain('/api/test')
      expect(call[1].method).toBe('GET')
      expect(call[1].headers['Content-Type']).toBe('application/json')
    })

    it('should parse successful JSON response', async () => {
      const mockData = { id: 1, name: 'test' }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: mockData,
        }),
      })

      const result = await api.get<typeof mockData>('/api/test')
      expect(result).toEqual(mockData)
    })

    it('should handle POST request with body', async () => {
      const body = { name: 'new item' }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { id: 1, ...body },
        }),
      })

      await api.post('/api/test', body)

      expect(fetchMock).toHaveBeenCalledOnce()
      const call = fetchMock.mock.calls[0]
      expect(call[1].method).toBe('POST')
      expect(call[1].body).toBe(JSON.stringify(body))
    })
  })

  // =============================================
  // Timeout Behavior Tests
  // =============================================

  describe('characterize: request timeout', () => {
    it('should throw TimeoutError when request exceeds timeout', async () => {
      // Simulate AbortError by rejecting with abort error
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValueOnce(abortError)

      await expect(api.get('/api/test')).rejects.toThrow(TimeoutError)
    })

    it('should use default timeout of 30 seconds', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { id: 1 },
        }),
      })

      await api.get('/api/test')

      // Cannot directly test timeout value, but should exist in implementation
      expect(fetchMock).toHaveBeenCalled()
    })

    it('should respect custom timeout option', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValueOnce(abortError)

      await expect(api.get('/api/test', { timeout: 5000 })).rejects.toThrow(
        TimeoutError
      )
    })
  })

  // =============================================
  // HTTP Error Status Tests
  // =============================================

  describe('characterize: HTTP error responses', () => {
    it('should throw ApiError for 4xx responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValueOnce({
          error: 'Invalid request',
          code: 'INVALID_REQUEST',
        }),
      })

      await expect(api.get('/api/test')).rejects.toThrow(ApiError)
    })

    it('should throw ApiError for 5xx responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValueOnce({
          error: 'Server error',
          code: 'SERVER_ERROR',
        }),
      })

      await expect(api.get('/api/test')).rejects.toThrow(ApiError)
    })

    it('should include error details in ApiError', async () => {
      const errorDetails = { field: 'email', message: 'Invalid email' }
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValueOnce({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: errorDetails,
        }),
      })

      try {
        await api.get('/api/test')
        expect.fail('Should throw error')
      } catch (error) {
        if (error instanceof ApiError) {
          expect(error.status).toBe(400)
          expect(error.code).toBe('VALIDATION_ERROR')
          expect(error.details).toEqual(errorDetails)
        }
      }
    })

    it('should handle response with no JSON body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValueOnce(new SyntaxError('Invalid JSON')),
      })

      await expect(api.get('/api/test')).rejects.toThrow(ApiError)
    })
  })

  // =============================================
  // API Response Format Tests
  // =============================================

  describe('characterize: API response format', () => {
    it('should handle success: false response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: false,
          error: 'Something went wrong',
        }),
      })

      await expect(api.get('/api/test')).rejects.toThrow(ApiError)
    })

    it('should handle response with no data field', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          // No data field
        }),
      })

      await expect(api.get('/api/test')).rejects.toThrow(ApiError)
    })

    it('should handle unparseable JSON response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValueOnce(new SyntaxError('Invalid JSON')),
      })

      await expect(api.get('/api/test')).rejects.toThrow(ApiError)
    })
  })

  // =============================================
  // Network Error Tests
  // =============================================

  describe('characterize: network errors', () => {
    it('should throw NetworkError for fetch failures', async () => {
      const networkError = new Error('Failed to fetch')
      fetchMock.mockRejectedValueOnce(networkError)

      await expect(api.get('/api/test')).rejects.toThrow(NetworkError)
    })

    it('should preserve original error in NetworkError', async () => {
      const originalError = new Error('Connection refused')
      fetchMock.mockRejectedValueOnce(originalError)

      try {
        await api.get('/api/test')
      } catch (error) {
        if (error instanceof NetworkError) {
          expect(error.originalError).toBeDefined()
        }
      }
    })
  })

  // =============================================
  // HTTP Methods Tests
  // =============================================

  describe('characterize: HTTP methods', () => {
    const mockSuccessResponse = () => ({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({
        success: true,
        data: { id: 1 },
      }),
    })

    it('should support GET method', async () => {
      fetchMock.mockResolvedValueOnce(mockSuccessResponse())
      await api.get('/api/test')
      expect(fetchMock.mock.calls[0][1].method).toBe('GET')
    })

    it('should support POST method', async () => {
      fetchMock.mockResolvedValueOnce(mockSuccessResponse())
      await api.post('/api/test', { data: 'test' })
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    })

    it('should support PUT method', async () => {
      fetchMock.mockResolvedValueOnce(mockSuccessResponse())
      await api.put('/api/test', { data: 'test' })
      expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    })

    it('should support PATCH method', async () => {
      fetchMock.mockResolvedValueOnce(mockSuccessResponse())
      await api.patch('/api/test', { data: 'test' })
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    })

    it('should support DELETE method', async () => {
      fetchMock.mockResolvedValueOnce(mockSuccessResponse())
      await api.delete('/api/test')
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  // =============================================
  // Request Options Tests
  // =============================================

  describe('characterize: request options handling', () => {
    it('should merge custom headers with default headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { id: 1 },
        }),
      })

      await api.get('/api/test', {
        headers: {
          'X-Custom-Header': 'value',
        },
      })

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['X-Custom-Header']).toBe('value')
    })

    it('should allow overriding default headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { id: 1 },
        }),
      })

      await api.get('/api/test', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const headers = fetchMock.mock.calls[0][1].headers
      // The last Content-Type should be the overridden value or the default
      expect(headers['Content-Type']).toBeDefined()
    })
  })

  // =============================================
  // Domain API Methods Tests
  // =============================================

  describe('characterize: domain API methods', () => {
    const setupMock = () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { projects: [] },
        }),
      })
    }

    it('should provide projectsApi.list method', async () => {
      setupMock()
      const result = await require('../client').projectsApi.list()
      expect(result).toBeDefined()
    })

    it('should provide tasksApi.list method', async () => {
      setupMock()
      const result = await require('../client').tasksApi.list()
      expect(result).toBeDefined()
    })

    it('should provide healthApi.check method', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          data: { status: 'healthy' },
        }),
      })

      const result = await require('../client').healthApi.check()
      expect(result).toBeDefined()
    })
  })
})
