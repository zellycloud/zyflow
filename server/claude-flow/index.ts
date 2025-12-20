/**
 * claude-flow API 라우터
 * @module server/claude-flow
 */

import { Router, type Request, type Response } from 'express'
import { claudeFlowExecutor } from './executor.js'
import { getAvailableProviders } from './consensus.js'
import type {
  ExecutionRequest,
  ExecuteResponse,
  StatusResponse,
  StopResponse,
  HistoryResponse,
  ConsensusConfig,
  ConsensusResult,
  AIProvider,
} from './types.js'

export const claudeFlowRouter = Router()

/**
 * POST /api/claude-flow/execute
 * 실행 시작
 */
claudeFlowRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<ExecutionRequest>

    // 필수 필드 검증
    if (!body.projectPath) {
      res.status(400).json({ error: 'projectPath is required' })
      return
    }
    if (!body.changeId) {
      res.status(400).json({ error: 'changeId is required' })
      return
    }

    const request: ExecutionRequest = {
      projectPath: body.projectPath,
      changeId: body.changeId,
      taskId: body.taskId,
      mode: body.mode ?? 'full',
      strategy: body.strategy,
      maxAgents: body.maxAgents,
      timeout: body.timeout,
      provider: body.provider,
      model: body.model,
      consensus: body.consensus as ConsensusConfig | undefined,
    }

    const executionId = await claudeFlowExecutor.execute(request)

    const response: ExecuteResponse = {
      executionId,
      message: 'Execution started',
    }

    res.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/claude-flow/status/:id
 * 실행 상태 조회
 */
claudeFlowRouter.get('/status/:id', (req: Request, res: Response) => {
  const { id } = req.params

  const status = claudeFlowExecutor.getStatus(id)

  if (!status) {
    res.status(404).json({ error: 'Execution not found' })
    return
  }

  const response: StatusResponse = { execution: status }
  res.json(response)
})

/**
 * GET /api/claude-flow/stream/:id
 * SSE 스트림
 */
claudeFlowRouter.get('/stream/:id', (req: Request, res: Response) => {
  const { id } = req.params

  const emitter = claudeFlowExecutor.subscribe(id)

  if (!emitter) {
    res.status(404).json({ error: 'Execution not found' })
    return
  }

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nginx 버퍼링 비활성화

  // 초기 상태 전송
  const status = claudeFlowExecutor.getStatus(id)
  if (status) {
    res.write(`event: status\n`)
    res.write(`data: ${JSON.stringify(status)}\n\n`)
  }

  // 로그 이벤트
  const onLog = (log: unknown) => {
    res.write(`event: log\n`)
    res.write(`data: ${JSON.stringify(log)}\n\n`)
  }

  // 진행률 이벤트
  const onProgress = (progress: number) => {
    res.write(`event: progress\n`)
    res.write(`data: ${JSON.stringify({ progress })}\n\n`)
  }

  // 상태 변경 이벤트
  const onStatus = (status: unknown) => {
    res.write(`event: status\n`)
    res.write(`data: ${JSON.stringify(status)}\n\n`)

    // 완료/실패/중지 시 스트림 종료
    const statusObj = status as { status: string }
    if (['completed', 'failed', 'stopped'].includes(statusObj.status)) {
      res.write(`event: complete\n`)
      res.write(`data: ${JSON.stringify(status)}\n\n`)
      cleanup()
    }
  }

  emitter.on('log', onLog)
  emitter.on('progress', onProgress)
  emitter.on('status', onStatus)

  // 연결 종료 시 정리
  const cleanup = () => {
    emitter.off('log', onLog)
    emitter.off('progress', onProgress)
    emitter.off('status', onStatus)
    res.end()
  }

  req.on('close', cleanup)

  // Keep-alive
  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`)
  }, 30000)

  req.on('close', () => clearInterval(keepAlive))
})

/**
 * POST /api/claude-flow/stop/:id
 * 실행 중지
 */
claudeFlowRouter.post('/stop/:id', (req: Request, res: Response) => {
  const { id } = req.params

  const success = claudeFlowExecutor.stop(id)

  if (!success) {
    res.status(404).json({ error: 'Execution not found or already stopped' })
    return
  }

  const response: StopResponse = {
    success: true,
    message: 'Execution stopped',
  }

  res.json(response)
})

/**
 * GET /api/claude-flow/history
 * 실행 히스토리 조회
 */
claudeFlowRouter.get('/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20
  const changeId = req.query.changeId as string | undefined

  const history = claudeFlowExecutor.getHistory(limit, changeId)

  const response: HistoryResponse = { history }
  res.json(response)
})

/**
 * GET /api/claude-flow/consensus/:id
 * Consensus 결과 조회
 */
claudeFlowRouter.get('/consensus/:id', (req: Request, res: Response) => {
  const { id } = req.params

  const consensusResult = claudeFlowExecutor.getConsensusResult(id)

  if (!consensusResult) {
    // 실행은 있지만 consensus 결과가 없는 경우
    const status = claudeFlowExecutor.getStatus(id)
    if (!status) {
      res.status(404).json({ error: 'Execution not found' })
      return
    }

    // 일반 실행인 경우
    res.json({
      success: false,
      message: 'This execution is not a consensus execution',
      executionStatus: status.status
    })
    return
  }

  res.json({
    success: true,
    consensus: consensusResult
  })
})

/**
 * GET /api/claude-flow/providers
 * 사용 가능한 AI Provider 목록 조회
 */
claudeFlowRouter.get('/providers', async (_req: Request, res: Response) => {
  try {
    const availableProviders = await getAvailableProviders()

    // 전체 Provider 목록과 사용 가능 여부
    const allProviders: AIProvider[] = ['claude', 'gemini', 'codex', 'qwen', 'kilo', 'opencode', 'custom']

    const providers = allProviders.map(provider => ({
      id: provider,
      name: getProviderDisplayName(provider),
      available: availableProviders.includes(provider),
      icon: getProviderIcon(provider)
    }))

    res.json({
      success: true,
      providers,
      availableCount: availableProviders.length
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      success: false,
      error: message
    })
  }
})

/**
 * POST /api/claude-flow/providers/check
 * 특정 Provider 사용 가능 여부 확인
 */
claudeFlowRouter.post('/providers/check', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body

    if (!provider) {
      res.status(400).json({ error: 'provider is required' })
      return
    }

    const availableProviders = await getAvailableProviders()
    const available = availableProviders.includes(provider)

    res.json({
      success: true,
      provider,
      available
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      success: false,
      error: message
    })
  }
})

// Provider 표시 이름 헬퍼
function getProviderDisplayName(provider: AIProvider): string {
  const names: Record<AIProvider, string> = {
    claude: 'Claude (Anthropic)',
    gemini: 'Gemini (Google)',
    codex: 'Codex (OpenAI)',
    qwen: 'Qwen (Alibaba)',
    kilo: 'Kilo Code',
    opencode: 'OpenCode',
    custom: 'Custom CLI'
  }
  return names[provider]
}

// Provider 아이콘 헬퍼
function getProviderIcon(provider: AIProvider): string {
  const icons: Record<AIProvider, string> = {
    claude: '🤖',
    gemini: '💎',
    codex: '🧠',
    qwen: '🌟',
    kilo: '⚡',
    opencode: '🔓',
    custom: '🔧'
  }
  return icons[provider]
}

// 타입 및 유틸리티 re-export
export * from './types.js'
export { claudeFlowExecutor } from './executor.js'
export { OpenSpecPromptBuilder } from './prompt-builder.js'
export { ConsensusExecutor, createConsensusExecutor, getAvailableProviders } from './consensus.js'
