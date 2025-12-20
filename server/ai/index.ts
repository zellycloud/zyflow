/**
 * AI Execution API Router
 * @module server/ai
 *
 * 단일 AI Provider 실행을 위한 API 엔드포인트
 * - POST /api/ai/execute - 실행 시작 (SSE 스트리밍)
 * - POST /api/ai/stop/:runId - 실행 중지
 * - GET /api/ai/providers - Provider 목록 조회
 */

import { Router, type Request, type Response } from 'express'
import { getProcessManager, initProcessManager } from '../cli-adapter/process-manager.js'
import { getProfileManager, initProfileManager } from '../cli-adapter/profile-manager.js'
import { readFile, access } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { OpenSpecPromptBuilder } from '../claude-flow/prompt-builder.js'
import type {
  AIExecuteRequest,
  AIMessage,
  AIProviderConfig,
  AIProvidersResponse,
} from './types.js'

export const aiRouter = Router()

// Middleware to ensure managers are initialized
aiRouter.use((req: Request, res: Response, next) => {
  const projectPath = (req.query.projectPath as string) || (req.body?.projectPath as string) || process.cwd()
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
 * GET /api/ai/providers
 * Provider 목록 조회 (설정 및 설치 상태 포함)
 */
aiRouter.get('/providers', async (req: Request, res: Response) => {
  try {
    const projectPath = (req.query.projectPath as string) || process.cwd()
    const profileManager = getProfileManager(projectPath)

    // Get all profiles
    const profiles = await profileManager.getAll()

    // Load settings from file
    const settingsPath = join(projectPath, '.zyflow', 'cli-settings.json')
    let settings: Record<string, { enabled: boolean; selectedModel?: string; order?: number }> = {}

    if (existsSync(settingsPath)) {
      try {
        const content = await readFile(settingsPath, 'utf-8')
        settings = JSON.parse(content)
      } catch {
        // Use defaults if file is invalid
      }
    }

    // Build provider list with availability check
    const providers: AIProviderConfig[] = await Promise.all(
      profiles.map(async (profile, index) => {
        const availability = await profileManager.checkAvailability(profile.id)
        const setting = settings[profile.id]

        return {
          id: profile.type,
          name: profile.name,
          icon: profile.icon || '🤖',
          enabled: setting?.enabled ?? true,
          available: availability.available,
          selectedModel: setting?.selectedModel || profile.defaultModel,
          availableModels: profile.availableModels || [],
          order: setting?.order ?? index,
        }
      })
    )

    // Sort by order
    providers.sort((a, b) => a.order - b.order)

    const response: AIProvidersResponse = { providers }
    res.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/ai/execute
 * AI 실행 시작 (SSE 스트리밍)
 */
aiRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<AIExecuteRequest>

    // Validate required fields
    if (!body.provider) {
      res.status(400).json({ error: 'provider is required' })
      return
    }
    if (!body.changeId) {
      res.status(400).json({ error: 'changeId is required' })
      return
    }
    if (!body.taskId) {
      res.status(400).json({ error: 'taskId is required' })
      return
    }
    if (!body.taskTitle) {
      res.status(400).json({ error: 'taskTitle is required' })
      return
    }

    const projectPath = body.projectPath || process.cwd()
    const processManager = getProcessManager(projectPath)
    const profileManager = getProfileManager(projectPath)

    // Get profile for provider
    const profile = await profileManager.get(body.provider)
    if (!profile) {
      res.status(400).json({ error: `Unknown provider: ${body.provider}` })
      return
    }

    // Check availability
    const availability = await profileManager.checkAvailability(body.provider)
    if (!availability.available) {
      res.status(400).json({
        error: `Provider not available: ${body.provider}. ${availability.error || 'CLI not installed'}`
      })
      return
    }

    // Build prompt using OpenSpecPromptBuilder
    let prompt: string
    try {
      const builder = new OpenSpecPromptBuilder(projectPath)
      prompt = await builder.buildForExecution(body.changeId, body.taskId)
    } catch (error) {
      // Fallback to simple prompt
      prompt = `Change: ${body.changeId}\nTask: [${body.taskId}] ${body.taskTitle}`
      if (body.context) {
        prompt += `\n\nContext:\n${body.context}`
      }
    }

    // Build extra args for model
    const extraArgs: string[] = []
    const model = body.model || profile.defaultModel

    if (model) {
      switch (profile.type) {
        case 'claude':
          extraArgs.push('--model', model)
          break
        case 'gemini':
          extraArgs.push('--model', model)
          break
        case 'codex':
          extraArgs.push('--model', model)
          break
        case 'qwen':
          extraArgs.push('--model', model)
          break
        // Add more providers as needed
      }
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Start CLI session
    const result = await processManager.start({
      profileId: body.provider,
      changeId: body.changeId,
      projectPath,
      initialPrompt: prompt,
      model: model,
      extraArgs,
    })

    if (!result.success || !result.sessionId) {
      const errorMessage: AIMessage = {
        type: 'error',
        message: result.error || 'Failed to start execution',
        timestamp: new Date().toISOString(),
      }
      res.write(`data: ${JSON.stringify(errorMessage)}\n\n`)
      res.end()
      return
    }

    const sessionId = result.sessionId

    // Send start message
    const startMessage: AIMessage = {
      type: 'start',
      runId: sessionId,
      provider: body.provider,
      model: model || undefined,
      taskId: body.taskId,
      changeId: body.changeId,
      timestamp: new Date().toISOString(),
    }
    res.write(`data: ${JSON.stringify(startMessage)}\n\n`)

    // Handle output events
    const onOutput = (output: { sessionId: string; type: string; content: string; timestamp: string }) => {
      if (output.sessionId === sessionId) {
        const message: AIMessage = {
          type: output.type === 'stderr' ? 'stderr' : 'output',
          runId: sessionId,
          content: output.content,
          data: {
            type: output.type,
            content: output.content,
          },
          timestamp: output.timestamp,
        }
        res.write(`data: ${JSON.stringify(message)}\n\n`)
      }
    }

    // Handle session end
    const onSessionEnd = (session: { id: string; status: string; exitCode?: number; error?: string }) => {
      if (session.id === sessionId) {
        const completeMessage: AIMessage = {
          type: 'complete',
          runId: sessionId,
          status: session.status === 'completed' ? 'completed' : 'error',
          exitCode: session.exitCode,
          message: session.error,
          timestamp: new Date().toISOString(),
        }
        res.write(`data: ${JSON.stringify(completeMessage)}\n\n`)
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
    req.on('close', () => {
      // Stop the process if client disconnects
      processManager.stop(sessionId, false).catch(() => {})
      cleanup()
    })

    // Keep-alive ping
    const keepAlive = setInterval(() => {
      res.write(`: keep-alive\n\n`)
    }, 30000)

    req.on('close', () => clearInterval(keepAlive))

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // If headers already sent, send as SSE
    if (res.headersSent) {
      const errorMessage: AIMessage = {
        type: 'error',
        message,
        timestamp: new Date().toISOString(),
      }
      res.write(`data: ${JSON.stringify(errorMessage)}\n\n`)
      res.end()
    } else {
      res.status(500).json({ error: message })
    }
  }
})

/**
 * POST /api/ai/stop/:runId
 * AI 실행 중지
 */
aiRouter.post('/stop/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params
    const force = req.body?.force === true
    const projectPath = (req.query.projectPath as string) || process.cwd()

    const processManager = getProcessManager(projectPath)
    const result = await processManager.stop(runId, force)

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error || 'Session not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ success: false, error: message })
  }
})

// Export types
export * from './types.js'
