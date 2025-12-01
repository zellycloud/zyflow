import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from './app.js'

// Mock the config module to avoid file system operations
vi.mock('./config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    projects: [
      { id: 'test-project', name: 'Test Project', path: '/tmp/test-project' },
    ],
    activeProjectId: 'test-project',
  }),
  addProject: vi.fn().mockResolvedValue({
    id: 'new-project',
    name: 'New Project',
    path: '/tmp/new-project',
  }),
  removeProject: vi.fn().mockResolvedValue(undefined),
  setActiveProject: vi.fn().mockResolvedValue(undefined),
  getActiveProject: vi.fn().mockResolvedValue({
    id: 'test-project',
    name: 'Test Project',
    path: '/tmp/test-project',
  }),
}))

describe('API Endpoints', () => {
  describe('GET /api/projects', () => {
    it('returns project list', async () => {
      const res = await request(app).get('/api/projects')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.projects).toHaveLength(1)
      expect(res.body.data.projects[0].id).toBe('test-project')
    })
  })

  describe('GET /api/projects/all-data', () => {
    it('returns all projects data', async () => {
      const res = await request(app).get('/api/projects/all-data')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.projects).toBeDefined()
      expect(res.body.data.activeProjectId).toBe('test-project')
    })
  })

  describe('POST /api/projects', () => {
    it('returns 400 when path is missing', async () => {
      const res = await request(app).post('/api/projects').send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Path is required')
    })
  })

  describe('DELETE /api/projects/:id', () => {
    it('removes a project', async () => {
      const res = await request(app).delete('/api/projects/test-project')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('PUT /api/projects/:id/activate', () => {
    it('activates a project', async () => {
      const res = await request(app).put('/api/projects/test-project/activate')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.project).toBeDefined()
    })
  })

  describe('GET /api/changes', () => {
    it('returns empty changes when directory does not exist', async () => {
      const res = await request(app).get('/api/changes')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.changes).toEqual([])
    })
  })

  describe('GET /api/specs', () => {
    it('returns empty specs when directory does not exist', async () => {
      const res = await request(app).get('/api/specs')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.specs).toEqual([])
    })
  })

  describe('GET /api/claude/status/:runId', () => {
    it('returns not_found for non-existent run', async () => {
      const res = await request(app).get('/api/claude/status/non-existent')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('not_found')
    })
  })

  describe('POST /api/claude/stop/:runId', () => {
    it('returns error for non-running task', async () => {
      const res = await request(app).post('/api/claude/stop/non-existent')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Task not running')
    })
  })
})
