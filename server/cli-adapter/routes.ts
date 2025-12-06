/**
 * CLI Adapter API Routes
 *
 * Express routes for CLI management
 */

import { Router, Request, Response } from 'express'
import { getProfileManager, initProfileManager } from './profile-manager.js'
import { getProcessManager, initProcessManager } from './process-manager.js'
import type {
  CLIProfile,
  StartCLIRequest,
  SendInputRequest,
} from './types.js'

const router = Router()

// Middleware to ensure managers are initialized
router.use((req: Request, res: Response, next) => {
  const projectPath = (req.query.projectPath as string) || process.cwd()
  try {
    getProfileManager(projectPath)
    getProcessManager(projectPath)
  } catch {
    initProfileManager(projectPath)
    initProcessManager(projectPath)
  }
  next()
})

/**
 * GET /api/cli/profiles
 * List all CLI profiles
 */
router.get('/profiles', async (req: Request, res: Response) => {
  try {
    const profileManager = getProfileManager()
    const profiles = await profileManager.getAll()
    res.json({ success: true, profiles })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/profiles/available
 * List available (installed) CLI profiles
 */
router.get('/profiles/available', async (req: Request, res: Response) => {
  try {
    const profileManager = getProfileManager()
    const profiles = await profileManager.getAvailable()
    res.json({ success: true, profiles })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/profiles/:id
 * Get a specific profile
 */
router.get('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const profileManager = getProfileManager()
    const profile = await profileManager.get(req.params.id)
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      })
    }
    res.json({ success: true, profile })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /api/cli/profiles
 * Create a custom profile
 */
router.post('/profiles', async (req: Request, res: Response) => {
  try {
    const profile = req.body as CLIProfile
    if (!profile.id || !profile.name || !profile.command) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, name, command',
      })
    }

    const profileManager = getProfileManager()
    await profileManager.upsert(profile)
    res.json({ success: true, profile })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PUT /api/cli/profiles/:id
 * Update a custom profile
 */
router.put('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const profile = { ...req.body, id: req.params.id } as CLIProfile
    const profileManager = getProfileManager()
    await profileManager.upsert(profile)
    res.json({ success: true, profile })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /api/cli/profiles/:id
 * Delete a custom profile
 */
router.delete('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const profileManager = getProfileManager()
    const deleted = await profileManager.delete(req.params.id)
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found or cannot be deleted',
      })
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/profiles/:id/check
 * Check if a CLI is available
 */
router.get('/profiles/:id/check', async (req: Request, res: Response) => {
  try {
    const profileManager = getProfileManager()
    const result = await profileManager.checkAvailability(req.params.id)
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /api/cli/sessions
 * Start a new CLI session
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const request = req.body as StartCLIRequest
    if (!request.profileId || !request.changeId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: profileId, changeId',
      })
    }

    const processManager = getProcessManager()
    const result = await processManager.start(request)
    if (!result.success) {
      return res.status(400).json(result)
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/sessions
 * List all CLI sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const processManager = getProcessManager()
    const status = req.query.status as string | undefined
    let sessions = processManager.getAllSessions()

    if (status) {
      sessions = sessions.filter(s => s.status === status)
    }

    res.json({ success: true, sessions })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/sessions/:id
 * Get a specific session
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const processManager = getProcessManager()
    const session = processManager.getSession(req.params.id)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      })
    }
    res.json({ success: true, session })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /api/cli/sessions/:id/stop
 * Stop a CLI session
 */
router.post('/sessions/:id/stop', async (req: Request, res: Response) => {
  try {
    const force = req.body.force === true
    const processManager = getProcessManager()
    const result = await processManager.stop(req.params.id, force)
    if (!result.success) {
      return res.status(400).json(result)
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /api/cli/sessions/:id/input
 * Send input to a CLI session
 */
router.post('/sessions/:id/input', async (req: Request, res: Response) => {
  try {
    const { input } = req.body as SendInputRequest
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: input',
      })
    }

    const processManager = getProcessManager()
    const result = await processManager.sendInput(req.params.id, input)
    if (!result.success) {
      return res.status(400).json(result)
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/sessions/:id/output
 * Get session output
 */
router.get('/sessions/:id/output', async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string | undefined
    const processManager = getProcessManager()
    const output = processManager.getOutput(req.params.id, since)
    res.json({ success: true, output })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/cli/sessions/:id/stream
 * Stream session output via SSE
 */
router.get('/sessions/:id/stream', async (req: Request, res: Response) => {
  const sessionId = req.params.id
  const processManager = getProcessManager()
  const session = processManager.getSession(sessionId)

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    })
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // Send existing output
  const existingOutput = processManager.getOutput(sessionId)
  for (const output of existingOutput) {
    res.write(`event: output\ndata: ${JSON.stringify(output)}\n\n`)
  }

  // Stream new output
  const onOutput = (output: { sessionId: string }) => {
    if (output.sessionId === sessionId) {
      res.write(`event: output\ndata: ${JSON.stringify(output)}\n\n`)
    }
  }

  const onSessionEnd = (endedSession: { id: string }) => {
    if (endedSession.id === sessionId) {
      res.write(`event: end\ndata: ${JSON.stringify(endedSession)}\n\n`)
      cleanup()
    }
  }

  const cleanup = () => {
    processManager.off('output', onOutput)
    processManager.off('session:end', onSessionEnd)
    res.end()
  }

  processManager.on('output', onOutput)
  processManager.on('session:end', onSessionEnd)

  // Handle client disconnect
  req.on('close', cleanup)
})

export default router
