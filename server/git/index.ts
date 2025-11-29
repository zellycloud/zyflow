/**
 * Git 서비스 메인 모듈
 * OpenSpec Change: integrate-git-workflow
 *
 * ZyFlow에 Git 워크플로우를 통합하여 프로젝트 동기화,
 * 브랜치 관리, 커밋/푸시 자동화를 지원합니다.
 */

export * from './commands.js'
export * from './status.js'

import { Router } from 'express'
import {
  gitPull,
  gitPush,
  gitFetch,
  gitCommit,
  gitAdd,
  gitBranches,
  gitCheckout,
  gitCreateBranch,
  gitDeleteBranch,
  gitStash,
  gitLog,
  gitDiff,
} from './commands.js'
import { getGitStatus, checkRemoteUpdates, detectPotentialConflicts } from './status.js'
import { getActiveProject } from '../config.js'

export const gitRouter = Router()

// 헬퍼: 활성 프로젝트 경로 가져오기
async function getProjectPath(): Promise<string | null> {
  const project = await getActiveProject()
  return project?.path ?? null
}

// ==================== Git Status API ====================

// GET /api/git/status - 현재 Git 상태
gitRouter.get('/status', async (_req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const status = await getGitStatus(projectPath)
    res.json({ success: true, data: status })
  } catch (error) {
    console.error('Error getting git status:', error)
    res.status(500).json({ success: false, error: 'Failed to get git status' })
  }
})

// GET /api/git/remote-updates - 원격 업데이트 확인
gitRouter.get('/remote-updates', async (_req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const updates = await checkRemoteUpdates(projectPath)
    res.json({ success: true, data: updates })
  } catch (error) {
    console.error('Error checking remote updates:', error)
    res.status(500).json({ success: false, error: 'Failed to check remote updates' })
  }
})

// GET /api/git/potential-conflicts - 충돌 가능성 감지
gitRouter.get('/potential-conflicts', async (_req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const conflicts = await detectPotentialConflicts(projectPath)
    res.json({ success: true, data: conflicts })
  } catch (error) {
    console.error('Error detecting conflicts:', error)
    res.status(500).json({ success: false, error: 'Failed to detect conflicts' })
  }
})

// ==================== Git Commands API ====================

// POST /api/git/pull - Pull 실행
gitRouter.post('/pull', async (_req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const result = await gitPull(projectPath)
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
        stderr: result.stderr,
      })
    }

    res.json({ success: true, data: { message: result.stdout || 'Already up to date.' } })
  } catch (error) {
    console.error('Error pulling:', error)
    res.status(500).json({ success: false, error: 'Failed to pull' })
  }
})

// POST /api/git/push - Push 실행
gitRouter.post('/push', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { remote, branch, force } = req.body
    const result = await gitPush(projectPath, { remote, branch, force })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
        stderr: result.stderr,
      })
    }

    res.json({ success: true, data: { message: result.stdout || 'Push successful.' } })
  } catch (error) {
    console.error('Error pushing:', error)
    res.status(500).json({ success: false, error: 'Failed to push' })
  }
})

// POST /api/git/fetch - Fetch 실행
gitRouter.post('/fetch', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { remote, all } = req.body
    const result = await gitFetch(projectPath, { remote, all })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    res.json({ success: true, data: { message: 'Fetch successful.' } })
  } catch (error) {
    console.error('Error fetching:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch' })
  }
})

// POST /api/git/commit - Commit 실행
gitRouter.post('/commit', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { message, all, files } = req.body

    if (!message) {
      return res.status(400).json({ success: false, error: 'Commit message is required' })
    }

    // 파일 지정 시 먼저 add
    if (files && Array.isArray(files) && files.length > 0) {
      const addResult = await gitAdd(projectPath, files)
      if (!addResult.success) {
        return res.status(400).json({
          success: false,
          error: addResult.error || addResult.stderr,
        })
      }
    }

    const result = await gitCommit(projectPath, message, { all })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
        stderr: result.stderr,
      })
    }

    res.json({ success: true, data: { message: result.stdout } })
  } catch (error) {
    console.error('Error committing:', error)
    res.status(500).json({ success: false, error: 'Failed to commit' })
  }
})

// POST /api/git/add - Stage 파일
gitRouter.post('/add', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { files } = req.body
    const result = await gitAdd(projectPath, files || '.')

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    res.json({ success: true, data: { message: 'Files staged.' } })
  } catch (error) {
    console.error('Error staging:', error)
    res.status(500).json({ success: false, error: 'Failed to stage files' })
  }
})

// POST /api/git/stash - Stash 관리
gitRouter.post('/stash', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { pop, message } = req.body
    const result = await gitStash(projectPath, { pop, message })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    res.json({ success: true, data: { message: result.stdout || 'Stash operation successful.' } })
  } catch (error) {
    console.error('Error stashing:', error)
    res.status(500).json({ success: false, error: 'Failed to stash' })
  }
})

// ==================== Git Branch API ====================

// GET /api/git/branches - 브랜치 목록
gitRouter.get('/branches', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { all, remote } = req.query
    const result = await gitBranches(projectPath, {
      all: all === 'true',
      remote: remote === 'true',
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    const branches = result.stdout.split('\n').filter(Boolean)

    // 현재 브랜치 확인
    const status = await getGitStatus(projectPath)

    res.json({
      success: true,
      data: {
        branches,
        currentBranch: status.branch,
      },
    })
  } catch (error) {
    console.error('Error listing branches:', error)
    res.status(500).json({ success: false, error: 'Failed to list branches' })
  }
})

// POST /api/git/checkout - 브랜치 전환
gitRouter.post('/checkout', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { branch, create } = req.body

    if (!branch) {
      return res.status(400).json({ success: false, error: 'Branch name is required' })
    }

    // 변경사항 확인
    const status = await getGitStatus(projectPath)
    if (status.isDirty) {
      return res.status(400).json({
        success: false,
        error: 'You have uncommitted changes. Please commit or stash them first.',
        hasUncommittedChanges: true,
      })
    }

    const result = await gitCheckout(projectPath, branch, { create })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    res.json({
      success: true,
      data: { message: `Switched to branch '${branch}'`, branch },
    })
  } catch (error) {
    console.error('Error checking out:', error)
    res.status(500).json({ success: false, error: 'Failed to checkout branch' })
  }
})

// POST /api/git/branch - 브랜치 생성
gitRouter.post('/branch', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { name, baseBranch, checkout } = req.body

    if (!name) {
      return res.status(400).json({ success: false, error: 'Branch name is required' })
    }

    const result = await gitCreateBranch(projectPath, name, baseBranch)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    // checkout 옵션이 있으면 바로 전환
    if (checkout) {
      const checkoutResult = await gitCheckout(projectPath, name)
      if (!checkoutResult.success) {
        return res.status(400).json({
          success: false,
          error: checkoutResult.error || checkoutResult.stderr,
        })
      }
    }

    res.json({
      success: true,
      data: { message: `Branch '${name}' created.`, branch: name },
    })
  } catch (error) {
    console.error('Error creating branch:', error)
    res.status(500).json({ success: false, error: 'Failed to create branch' })
  }
})

// DELETE /api/git/branch/:name - 브랜치 삭제
gitRouter.delete('/branch/:name', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { name } = req.params
    const { force } = req.query

    const result = await gitDeleteBranch(projectPath, name, { force: force === 'true' })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    res.json({ success: true, data: { message: `Branch '${name}' deleted.` } })
  } catch (error) {
    console.error('Error deleting branch:', error)
    res.status(500).json({ success: false, error: 'Failed to delete branch' })
  }
})

// ==================== Git Log & Diff API ====================

// GET /api/git/log - 커밋 로그
gitRouter.get('/log', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { limit, oneline } = req.query
    const result = await gitLog(projectPath, {
      limit: limit ? parseInt(limit as string, 10) : 10,
      oneline: oneline === 'true',
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    const commits = result.stdout.split('\n').filter(Boolean)
    res.json({ success: true, data: { commits } })
  } catch (error) {
    console.error('Error getting log:', error)
    res.status(500).json({ success: false, error: 'Failed to get log' })
  }
})

// GET /api/git/diff - Diff 조회
gitRouter.get('/diff', async (req, res) => {
  try {
    const projectPath = await getProjectPath()
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'No active project' })
    }

    const { staged, files } = req.query
    const result = await gitDiff(projectPath, {
      staged: staged === 'true',
      files: files ? (files as string).split(',') : undefined,
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || result.stderr,
      })
    }

    res.json({ success: true, data: { diff: result.stdout } })
  } catch (error) {
    console.error('Error getting diff:', error)
    res.status(500).json({ success: false, error: 'Failed to get diff' })
  }
})
