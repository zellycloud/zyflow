/**
 * ADK GitHub Tools
 *
 * 에이전트가 GitHub API와 상호작용하기 위한 도구들
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import { Octokit } from '@octokit/rest'

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN 환경변수가 설정되지 않았습니다')
  }
  return new Octokit({ auth: token })
}

function parseRepo(repoPath: string): { owner: string; repo: string } {
  const parts = repoPath.split('/')
  if (parts.length !== 2) {
    throw new Error('저장소 형식: owner/repo')
  }
  return { owner: parts[0], repo: parts[1] }
}

export const createPRTool = new FunctionTool({
  name: 'createPR',
  description: 'GitHub에 Pull Request를 생성합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    title: z.string().describe('PR 제목'),
    body: z.string().describe('PR 본문'),
    head: z.string().describe('소스 브랜치'),
    base: z.string().optional().describe('타겟 브랜치 (기본: main)'),
    labels: z.array(z.string()).optional().describe('라벨'),
    draft: z.boolean().optional().describe('드래프트 PR 여부'),
  }),
  execute: async ({ repository, title, body, head, base = 'main', labels, draft = false }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      const { data: pr } = await octokit.pulls.create({
        owner, repo, title, body, head, base, draft,
      })

      if (labels && labels.length > 0) {
        await octokit.issues.addLabels({
          owner, repo, issue_number: pr.number, labels,
        })
      }

      return { success: true, prNumber: pr.number, prUrl: pr.html_url, state: pr.state }
    } catch (err) {
      const error = err as { message?: string; status?: number }
      return { success: false, error: error.message || String(err), status: error.status }
    }
  },
})

export const getPRStatusTool = new FunctionTool({
  name: 'getPRStatus',
  description: 'PR의 상태와 CI 체크 결과를 확인합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    prNumber: z.number().describe('PR 번호'),
  }),
  execute: async ({ repository, prNumber }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
      const { data: checks } = await octokit.checks.listForRef({ owner, repo, ref: pr.head.sha })

      const allChecksPassed = checks.check_runs.every(
        check => check.conclusion === 'success' || check.conclusion === 'skipped'
      )

      return {
        success: true,
        state: pr.state,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
        checksCompleted: checks.check_runs.every(c => c.status === 'completed'),
        allChecksPassed,
        headSha: pr.head.sha,
      }
    } catch (err) {
      const error = err as { message?: string }
      return { success: false, error: error.message || String(err) }
    }
  },
})

export const mergePRTool = new FunctionTool({
  name: 'mergePR',
  description: 'PR을 머지합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    prNumber: z.number().describe('PR 번호'),
    method: z.enum(['merge', 'squash', 'rebase']).optional().describe('머지 방법'),
    commitTitle: z.string().optional().describe('커밋 제목'),
    commitMessage: z.string().optional().describe('커밋 메시지'),
  }),
  execute: async ({ repository, prNumber, method = 'squash', commitTitle, commitMessage }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      const { data } = await octokit.pulls.merge({
        owner, repo, pull_number: prNumber, merge_method: method,
        commit_title: commitTitle, commit_message: commitMessage,
      })

      return { success: true, merged: data.merged, sha: data.sha, message: data.message }
    } catch (err) {
      const error = err as { message?: string }
      return { success: false, error: error.message || String(err) }
    }
  },
})

export const waitForCITool = new FunctionTool({
  name: 'waitForCI',
  description: 'CI 체크가 완료될 때까지 대기합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    ref: z.string().describe('체크할 커밋 SHA 또는 브랜치'),
    timeout: z.number().optional().describe('최대 대기 시간 (초, 기본: 600)'),
    interval: z.number().optional().describe('폴링 간격 (초, 기본: 30)'),
  }),
  execute: async ({ repository, ref, timeout = 600, interval = 30 }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      const startTime = Date.now()
      const timeoutMs = timeout * 1000
      const intervalMs = interval * 1000

      while (Date.now() - startTime < timeoutMs) {
        const { data: checks } = await octokit.checks.listForRef({ owner, repo, ref })
        const allCompleted = checks.check_runs.every(c => c.status === 'completed')

        if (allCompleted) {
          const allPassed = checks.check_runs.every(
            c => c.conclusion === 'success' || c.conclusion === 'skipped'
          )
          return { success: true, completed: true, passed: allPassed }
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }

      return { success: true, completed: false, passed: false, error: '타임아웃' }
    } catch (err) {
      const error = err as { message?: string }
      return { success: false, error: error.message || String(err) }
    }
  },
})

export const addCommentTool = new FunctionTool({
  name: 'addComment',
  description: 'PR 또는 이슈에 댓글을 추가합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    issueNumber: z.number().describe('이슈/PR 번호'),
    body: z.string().describe('댓글 내용'),
  }),
  execute: async ({ repository, issueNumber, body }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      const { data } = await octokit.issues.createComment({
        owner, repo, issue_number: issueNumber, body,
      })

      return { success: true, commentId: data.id, commentUrl: data.html_url }
    } catch (err) {
      const error = err as { message?: string }
      return { success: false, error: error.message || String(err) }
    }
  },
})

export const getWorkflowRunTool = new FunctionTool({
  name: 'getWorkflowRun',
  description: 'GitHub Actions 워크플로우 실행 상태를 조회합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    runId: z.number().describe('워크플로우 실행 ID'),
  }),
  execute: async ({ repository, runId }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      const { data: run } = await octokit.actions.getWorkflowRun({ owner, repo, run_id: runId })

      return {
        success: true,
        status: run.status,
        conclusion: run.conclusion,
        workflowName: run.name,
        branch: run.head_branch,
        commit: run.head_sha,
        url: run.html_url,
      }
    } catch (err) {
      const error = err as { message?: string }
      return { success: false, error: error.message || String(err) }
    }
  },
})

export const deleteBranchTool = new FunctionTool({
  name: 'deleteBranch',
  description: '원격 브랜치를 삭제합니다.',
  parameters: z.object({
    repository: z.string().describe('저장소 (owner/repo 형식)'),
    branch: z.string().describe('삭제할 브랜치'),
  }),
  execute: async ({ repository, branch }) => {
    try {
      const octokit = getOctokit()
      const { owner, repo } = parseRepo(repository)

      await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` })
      return { success: true, deleted: branch }
    } catch (err) {
      const error = err as { message?: string }
      return { success: false, error: error.message || String(err) }
    }
  },
})

export const githubTools = [
  createPRTool,
  getPRStatusTool,
  mergePRTool,
  waitForCITool,
  addCommentTool,
  getWorkflowRunTool,
  deleteBranchTool,
]
