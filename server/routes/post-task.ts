/**
 * Post-Task API Routes
 *
 * Post-Task Agent 웹 UI를 위한 Express API 라우트
 */

import { Router } from 'express'
import type { Request, Response } from 'express'

// MCP 핸들러 직접 import (빌드된 파일에서)
// 런타임에 동적으로 로드하여 순환 의존성 방지
let postTaskHandlers: {
  handlePostTaskRun: typeof import('../../mcp-server/post-task-tools.js').handlePostTaskRun
  handleQuarantineList: typeof import('../../mcp-server/post-task-tools.js').handleQuarantineList
  handleQuarantineRestore: typeof import('../../mcp-server/post-task-tools.js').handleQuarantineRestore
  handleQuarantineDelete: typeof import('../../mcp-server/post-task-tools.js').handleQuarantineDelete
  handleQuarantineStats: typeof import('../../mcp-server/post-task-tools.js').handleQuarantineStats
  handleSetupHooks: typeof import('../../mcp-server/post-task-tools.js').handleSetupHooks
  handleScheduler: typeof import('../../mcp-server/post-task-tools.js').handleScheduler
  handleEventListener: typeof import('../../mcp-server/post-task-tools.js').handleEventListener
  handleTriggerStatus: typeof import('../../mcp-server/post-task-tools.js').handleTriggerStatus
  handleReportsList: typeof import('../../mcp-server/post-task-tools.js').handleReportsList
  handleReportView: typeof import('../../mcp-server/post-task-tools.js').handleReportView
} | null = null

async function getHandlers() {
  if (!postTaskHandlers) {
    const module = await import('../../mcp-server/post-task-tools.js')
    postTaskHandlers = {
      handlePostTaskRun: module.handlePostTaskRun,
      handleQuarantineList: module.handleQuarantineList,
      handleQuarantineRestore: module.handleQuarantineRestore,
      handleQuarantineDelete: module.handleQuarantineDelete,
      handleQuarantineStats: module.handleQuarantineStats,
      handleSetupHooks: module.handleSetupHooks,
      handleScheduler: module.handleScheduler,
      handleEventListener: module.handleEventListener,
      handleTriggerStatus: module.handleTriggerStatus,
      handleReportsList: module.handleReportsList,
      handleReportView: module.handleReportView,
    }
  }
  return postTaskHandlers
}

// 타입 가져오기
import type { TASK_CATEGORIES } from '../../mcp-server/post-task-types.js'

export const postTaskRouter = Router()

/**
 * POST /api/post-task/run
 * Post-Task 작업 실행
 */
postTaskRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const { projectPath, category, tasks, cli, model, dryRun, noCommit } = req.body

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handlePostTaskRun(
      { category, tasks, cli, model, dryRun, noCommit },
      projectPath
    )

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 카테고리 및 작업 정의
 * mcp-server/post-task-types.ts와 동기화 필요
 */
const TASK_CATEGORIES_DATA: Record<string, { label: string; tasks: string[] }> = {
  'code-quality': {
    label: 'Code Quality',
    tasks: ['lint-fix', 'type-check', 'dead-code', 'todo-cleanup', 'refactor-suggest'],
  },
  'testing': {
    label: 'Testing',
    tasks: ['test-fix', 'test-gen', 'e2e-expand', 'coverage-fix', 'snapshot-update', 'flaky-detect'],
  },
  'ci-cd': {
    label: 'CI/CD',
    tasks: ['ci-fix', 'dep-audit', 'bundle-check'],
  },
  'production': {
    label: 'Production',
    tasks: ['sentry-triage', 'security-audit', 'api-validate'],
  },
  'maintenance': {
    label: 'Maintenance',
    tasks: ['todo-remind', 'coverage-check'],
  },
}

/**
 * GET /api/post-task/categories
 * 사용 가능한 카테고리 및 작업 목록
 */
postTaskRouter.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = Object.entries(TASK_CATEGORIES_DATA).map(([key, value]) => ({
      id: key,
      label: value.label,
      tasks: value.tasks.map((task: string) => ({
        id: task,
        label: task
          .split('-')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      })),
    }))

    res.json({
      success: true,
      data: { categories },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

// ============================================================================
// Quarantine API
// ============================================================================

/**
 * GET /api/post-task/quarantine
 * 격리된 파일 목록 조회
 */
postTaskRouter.get('/quarantine', async (req: Request, res: Response) => {
  try {
    const { projectPath, status, date } = req.query

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleQuarantineList(
      {
        status: status as string | undefined,
        date: date as string | undefined,
      },
      projectPath
    )

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/post-task/quarantine/stats
 * 격리 시스템 통계
 */
postTaskRouter.get('/quarantine/stats', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.query

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleQuarantineStats(projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/post-task/quarantine/restore
 * 격리된 파일 복구
 */
postTaskRouter.post('/quarantine/restore', async (req: Request, res: Response) => {
  try {
    const { projectPath, itemId } = req.body

    if (!projectPath || !itemId) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and itemId are required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleQuarantineRestore({ itemId }, projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * DELETE /api/post-task/quarantine/:itemId
 * 격리된 파일 삭제
 */
postTaskRouter.delete('/quarantine/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params
    const { projectPath } = req.query

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleQuarantineDelete({ itemId }, projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

// ============================================================================
// Trigger API
// ============================================================================

/**
 * GET /api/post-task/triggers/status
 * 트리거 시스템 상태 조회
 */
postTaskRouter.get('/triggers/status', async (_req: Request, res: Response) => {
  try {
    const handlers = await getHandlers()
    const result = handlers.handleTriggerStatus()

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/post-task/triggers/hooks
 * Git hooks 설치/제거
 */
postTaskRouter.post('/triggers/hooks', async (req: Request, res: Response) => {
  try {
    const { projectPath, action } = req.body

    if (!projectPath || !action) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and action are required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleSetupHooks({ action }, projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/post-task/triggers/scheduler
 * 스케줄러 시작/중지
 */
postTaskRouter.post('/triggers/scheduler', async (req: Request, res: Response) => {
  try {
    const { projectPath, action } = req.body

    if (!projectPath || !action) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and action are required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleScheduler({ action }, projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/post-task/triggers/events
 * 이벤트 리스너 시작/중지
 */
postTaskRouter.post('/triggers/events', async (req: Request, res: Response) => {
  try {
    const { projectPath, action } = req.body

    if (!projectPath || !action) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and action are required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleEventListener({ action }, projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

// ============================================================================
// Reports API
// ============================================================================

/**
 * GET /api/post-task/reports
 * 리포트 목록 조회
 */
postTaskRouter.get('/reports', async (req: Request, res: Response) => {
  try {
    const { projectPath, limit, taskType } = req.query

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleReportsList(
      {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        taskType: taskType as string | undefined,
      },
      projectPath
    )

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/post-task/reports/:reportId
 * 특정 리포트 상세 조회
 */
postTaskRouter.get('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params
    const { projectPath } = req.query

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      })
    }

    const handlers = await getHandlers()
    const result = await handlers.handleReportView({ reportId }, projectPath)

    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
