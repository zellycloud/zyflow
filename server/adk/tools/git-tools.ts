/**
 * ADK Git Tools
 *
 * 에이전트가 Git 작업을 수행하기 위한 도구들
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import { execFileSync } from 'child_process'
import * as path from 'path'

/**
 * Git 명령어 실행 헬퍼
 */
function runGit(args: string[], cwd?: string): { success: boolean; output?: string; error?: string } {
  try {
    const output = execFileSync('git', args, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return { success: true, output: output.trim() }
  } catch (err: unknown) {
    const error = err as { stderr?: string }
    if (error && error.stderr) {
      return { success: false, error: String(error.stderr) }
    }
    return { success: false, error: String(err) }
  }
}

/**
 * Git 상태 확인 도구
 */
export const gitStatusTool = new FunctionTool({
  name: 'gitStatus',
  description: '현재 Git 저장소의 상태를 확인합니다.',
  parameters: z.object({
    directory: z.string().optional().describe('Git 저장소 디렉토리'),
  }),
  execute: async ({ directory }) => {
    const cwd = directory ? path.resolve(process.cwd(), directory) : process.cwd()
    const result = runGit(['status', '--porcelain', '-b'], cwd)

    if (!result.success) {
      return result
    }

    const lines = (result.output || '').split('\n').filter(Boolean)
    const branchLine = lines.find(l => l.startsWith('##'))
    const branch = branchLine?.replace('## ', '').split('...')[0] || 'unknown'

    const changes: Array<{ status: string; file: string }> = []
    for (const line of lines) {
      if (line.startsWith('##')) continue
      const status = line.substring(0, 2).trim()
      const file = line.substring(3)
      changes.push({ status, file })
    }

    return {
      success: true,
      branch,
      changes,
      hasChanges: changes.length > 0,
    }
  },
})

/**
 * Git diff 도구
 */
export const gitDiffTool = new FunctionTool({
  name: 'gitDiff',
  description: '파일의 변경 내용을 확인합니다.',
  parameters: z.object({
    file: z.string().optional().describe('diff를 볼 파일'),
    staged: z.boolean().optional().describe('스테이지된 변경만'),
    commit: z.string().optional().describe('특정 커밋과 비교'),
  }),
  execute: async ({ file, staged, commit }) => {
    const args = ['diff']
    if (staged) args.push('--staged')
    if (commit) args.push(commit)
    if (file) args.push('--', file)
    return runGit(args)
  },
})

/**
 * Git 브랜치 생성 도구
 */
export const gitCreateBranchTool = new FunctionTool({
  name: 'gitCreateBranch',
  description: '새 브랜치를 생성합니다.',
  parameters: z.object({
    branchName: z.string().describe('브랜치 이름'),
    baseBranch: z.string().optional().describe('기준 브랜치'),
    checkout: z.boolean().optional().describe('생성 후 체크아웃'),
  }),
  execute: async ({ branchName, baseBranch, checkout = true }) => {
    if (!/^[a-zA-Z0-9\-_/]+$/.test(branchName)) {
      return { success: false, error: '유효하지 않은 브랜치 이름' }
    }

    if (baseBranch) {
      const checkoutResult = runGit(['checkout', baseBranch])
      if (!checkoutResult.success) return checkoutResult
      runGit(['pull', '--rebase'])
    }

    if (checkout) {
      return runGit(['checkout', '-b', branchName])
    }
    return runGit(['branch', branchName])
  },
})

/**
 * Git 파일 스테이징 도구
 */
export const gitAddTool = new FunctionTool({
  name: 'gitAdd',
  description: '파일을 스테이징합니다.',
  parameters: z.object({
    files: z.array(z.string()).describe('스테이징할 파일'),
    all: z.boolean().optional().describe('모든 파일 추가'),
  }),
  execute: async ({ files, all }) => {
    if (all) return runGit(['add', '-A'])
    if (files.length === 0) return { success: false, error: '파일 필요' }
    return runGit(['add', ...files])
  },
})

/**
 * Git 커밋 도구
 */
export const gitCommitTool = new FunctionTool({
  name: 'gitCommit',
  description: '변경사항을 커밋합니다.',
  parameters: z.object({
    message: z.string().describe('커밋 메시지'),
    body: z.string().optional().describe('커밋 본문'),
  }),
  execute: async ({ message, body }) => {
    const args = ['commit', '-m', message]
    if (body) args.push('-m', body)
    return runGit(args)
  },
})

/**
 * Git 푸시 도구
 */
export const gitPushTool = new FunctionTool({
  name: 'gitPush',
  description: '브랜치를 원격으로 푸시합니다.',
  parameters: z.object({
    branch: z.string().optional().describe('브랜치'),
    remote: z.string().optional().describe('원격 저장소'),
    setUpstream: z.boolean().optional().describe('업스트림 설정'),
    force: z.boolean().optional().describe('강제 푸시'),
  }),
  execute: async ({ branch, remote = 'origin', setUpstream = true, force = false }) => {
    const args = ['push']
    if (setUpstream) args.push('-u')
    if (force) args.push('--force-with-lease')
    args.push(remote)
    if (branch) args.push(branch)
    return runGit(args)
  },
})

/**
 * Git 로그 도구
 */
export const gitLogTool = new FunctionTool({
  name: 'gitLog',
  description: '커밋 이력을 확인합니다.',
  parameters: z.object({
    count: z.number().optional().describe('커밋 수'),
    file: z.string().optional().describe('파일'),
    oneline: z.boolean().optional().describe('한 줄 형식'),
  }),
  execute: async ({ count = 10, file, oneline = true }) => {
    const args = ['log', `-n${count}`]
    if (oneline) args.push('--oneline')
    else args.push('--format=%H|%an|%ae|%s|%ci')
    if (file) args.push('--', file)
    return runGit(args)
  },
})

/**
 * Git stash 도구
 */
export const gitStashTool = new FunctionTool({
  name: 'gitStash',
  description: '변경사항 임시 저장/복원',
  parameters: z.object({
    action: z.enum(['save', 'pop', 'list', 'drop']).describe('작업'),
    message: z.string().optional().describe('메시지'),
    index: z.number().optional().describe('인덱스'),
  }),
  execute: async ({ action, message, index }) => {
    const args = ['stash']
    switch (action) {
      case 'save':
        args.push('push')
        if (message) args.push('-m', message)
        break
      case 'pop':
        args.push('pop')
        if (index !== undefined) args.push(`stash@{${index}}`)
        break
      case 'list':
        args.push('list')
        break
      case 'drop':
        args.push('drop')
        if (index !== undefined) args.push(`stash@{${index}}`)
        break
    }
    return runGit(args)
  },
})

/**
 * Git 체크아웃 도구
 */
export const gitCheckoutTool = new FunctionTool({
  name: 'gitCheckout',
  description: '브랜치 체크아웃 또는 파일 복원',
  parameters: z.object({
    target: z.string().describe('브랜치 또는 커밋'),
    files: z.array(z.string()).optional().describe('파일'),
  }),
  execute: async ({ target, files }) => {
    const args = ['checkout', target]
    if (files && files.length > 0) args.push('--', ...files)
    return runGit(args)
  },
})

/**
 * Git reset 도구
 */
export const gitResetTool = new FunctionTool({
  name: 'gitReset',
  description: '스테이징 취소 또는 리셋',
  parameters: z.object({
    mode: z.enum(['soft', 'mixed', 'hard']).optional().describe('모드'),
    target: z.string().optional().describe('대상'),
    files: z.array(z.string()).optional().describe('파일'),
  }),
  execute: async ({ mode = 'mixed', target, files }) => {
    const args = ['reset']
    if (files && files.length > 0) {
      args.push('--', ...files)
    } else {
      args.push(`--${mode}`)
      if (target) args.push(target)
    }
    return runGit(args)
  },
})

export const gitTools = [
  gitStatusTool,
  gitDiffTool,
  gitCreateBranchTool,
  gitAddTool,
  gitCommitTool,
  gitPushTool,
  gitLogTool,
  gitStashTool,
  gitCheckoutTool,
  gitResetTool,
]
