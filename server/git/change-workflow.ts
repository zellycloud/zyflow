/**
 * Change-Git 연계 워크플로우 서비스
 * OpenSpec Change: integrate-git-workflow (Phase 2)
 *
 * Change와 Git 브랜치를 연계하여 자동화된 워크플로우를 제공합니다.
 */

import { gitCheckout, gitCreateBranch, gitBranches, gitCommit, gitAdd, gitPush, gitStash, type GitCommandResult } from './commands.js'
import { getGitStatus } from './status.js'

// Change 브랜치 네이밍 규칙
export const CHANGE_BRANCH_PREFIX = 'change/'

// 커밋 메시지 템플릿 타입
export type CommitMessageStage = 'spec' | 'task' | 'code' | 'test' | 'commit' | 'docs'

export interface ChangeGitConfig {
  autoCommit: boolean // 자동 커밋 활성화
  autoPush: boolean // 자동 푸시 활성화
  pushTiming: 'immediate' | 'on-stage-complete' | 'manual' // 푸시 타이밍
  commitMessageTemplate: string // 커밋 메시지 템플릿
}

export const DEFAULT_CHANGE_GIT_CONFIG: ChangeGitConfig = {
  autoCommit: false,
  autoPush: false,
  pushTiming: 'manual',
  commitMessageTemplate: '[{changeId}] {stage}: {description}',
}

/**
 * Change ID로 브랜치 이름 생성
 */
export function getChangeBranchName(changeId: string): string {
  return `${CHANGE_BRANCH_PREFIX}${changeId}`
}

/**
 * 브랜치 이름에서 Change ID 추출
 */
export function getChangeIdFromBranch(branchName: string): string | null {
  if (branchName.startsWith(CHANGE_BRANCH_PREFIX)) {
    return branchName.slice(CHANGE_BRANCH_PREFIX.length)
  }
  return null
}

/**
 * Change용 feature 브랜치 존재 여부 확인
 */
export async function hasChangeBranch(cwd: string, changeId: string): Promise<boolean> {
  const branchName = getChangeBranchName(changeId)
  const result = await gitBranches(cwd, { all: true })

  if (!result.success) {
    return false
  }

  const branches = result.stdout.split('\n').filter(Boolean)
  return branches.some((b) => b === branchName || b === `origin/${branchName}`)
}

/**
 * Change 시작 시 feature 브랜치 생성 및 전환
 */
export async function startChangeBranch(
  cwd: string,
  changeId: string,
  options: {
    baseBranch?: string // 기본 브랜치 (기본값: main 또는 master)
    stashChanges?: boolean // uncommitted changes가 있을 때 stash 처리
    force?: boolean // 이미 브랜치가 있어도 강제 전환
  } = {}
): Promise<{
  success: boolean
  branch: string
  created: boolean
  stashed: boolean
  error?: string
}> {
  const branchName = getChangeBranchName(changeId)
  const { baseBranch, stashChanges = false, force = false } = options

  // 1. 현재 Git 상태 확인
  const status = await getGitStatus(cwd)
  if (!status.isGitRepo) {
    return {
      success: false,
      branch: branchName,
      created: false,
      stashed: false,
      error: 'Not a git repository',
    }
  }

  // 2. 이미 해당 브랜치에 있는 경우
  if (status.branch === branchName) {
    return {
      success: true,
      branch: branchName,
      created: false,
      stashed: false,
    }
  }

  // 3. uncommitted changes 처리
  let stashed = false
  if (status.isDirty) {
    if (!stashChanges) {
      return {
        success: false,
        branch: branchName,
        created: false,
        stashed: false,
        error: 'You have uncommitted changes. Please commit or stash them first.',
      }
    }

    // Stash 처리
    const stashResult = await gitStash(cwd, { message: `Auto-stash before switching to ${branchName}` })
    if (!stashResult.success) {
      return {
        success: false,
        branch: branchName,
        created: false,
        stashed: false,
        error: `Failed to stash changes: ${stashResult.error || stashResult.stderr}`,
      }
    }
    stashed = true
  }

  // 4. 브랜치 존재 여부 확인
  const branchExists = await hasChangeBranch(cwd, changeId)

  if (branchExists) {
    // 이미 존재하는 브랜치로 전환
    if (!force && status.branch !== branchName) {
      const checkoutResult = await gitCheckout(cwd, branchName)
      if (!checkoutResult.success) {
        // Stash를 되돌림
        if (stashed) {
          await gitStash(cwd, { pop: true })
        }
        return {
          success: false,
          branch: branchName,
          created: false,
          stashed,
          error: `Failed to checkout branch: ${checkoutResult.error || checkoutResult.stderr}`,
        }
      }
    }

    return {
      success: true,
      branch: branchName,
      created: false,
      stashed,
    }
  }

  // 5. 새 브랜치 생성
  const base = baseBranch || 'main'
  const createResult = await gitCreateBranch(cwd, branchName, base)

  if (!createResult.success) {
    // main이 없으면 master로 재시도
    if (createResult.stderr?.includes('not a valid object name')) {
      const masterResult = await gitCreateBranch(cwd, branchName, 'master')
      if (!masterResult.success) {
        // Stash를 되돌림
        if (stashed) {
          await gitStash(cwd, { pop: true })
        }
        return {
          success: false,
          branch: branchName,
          created: false,
          stashed,
          error: `Failed to create branch: ${masterResult.error || masterResult.stderr}`,
        }
      }
    } else {
      // Stash를 되돌림
      if (stashed) {
        await gitStash(cwd, { pop: true })
      }
      return {
        success: false,
        branch: branchName,
        created: false,
        stashed,
        error: `Failed to create branch: ${createResult.error || createResult.stderr}`,
      }
    }
  }

  // 6. 새 브랜치로 전환
  const checkoutResult = await gitCheckout(cwd, branchName)
  if (!checkoutResult.success) {
    // Stash를 되돌림
    if (stashed) {
      await gitStash(cwd, { pop: true })
    }
    return {
      success: false,
      branch: branchName,
      created: true,
      stashed,
      error: `Failed to checkout new branch: ${checkoutResult.error || checkoutResult.stderr}`,
    }
  }

  return {
    success: true,
    branch: branchName,
    created: true,
    stashed,
  }
}

/**
 * Change 작업 중 커밋 (템플릿 적용)
 */
export async function commitForChange(
  cwd: string,
  changeId: string,
  options: {
    stage: CommitMessageStage
    description: string
    files?: string[] // 특정 파일만 커밋
    all?: boolean // 모든 변경사항 커밋 (-a)
    template?: string // 커스텀 템플릿
  }
): Promise<GitCommandResult & { formattedMessage?: string }> {
  const { stage, description, files, all = false, template } = options

  // 커밋 메시지 템플릿 적용
  const messageTemplate = template || DEFAULT_CHANGE_GIT_CONFIG.commitMessageTemplate
  const formattedMessage = formatCommitMessage(messageTemplate, {
    changeId,
    stage,
    description,
  })

  // 파일 지정 시 먼저 add
  if (files && files.length > 0) {
    const addResult = await gitAdd(cwd, files)
    if (!addResult.success) {
      return {
        ...addResult,
        formattedMessage,
      }
    }
  }

  // 커밋 실행
  const result = await gitCommit(cwd, formattedMessage, { all })

  return {
    ...result,
    formattedMessage,
  }
}

/**
 * 커밋 메시지 템플릿 포맷팅
 */
export function formatCommitMessage(
  template: string,
  params: {
    changeId: string
    stage: CommitMessageStage
    description: string
  }
): string {
  return template
    .replace('{changeId}', params.changeId)
    .replace('{stage}', params.stage)
    .replace('{description}', params.description)
}

/**
 * Change 브랜치 푸시
 */
export async function pushChangeBranch(
  cwd: string,
  changeId: string,
  options: {
    setUpstream?: boolean // -u 플래그
    force?: boolean // force-with-lease
  } = {}
): Promise<GitCommandResult> {
  const branchName = getChangeBranchName(changeId)
  const { setUpstream = true, force = false } = options

  // 현재 브랜치 확인
  const status = await getGitStatus(cwd)
  if (status.branch !== branchName) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: `Not on change branch. Current: ${status.branch}, Expected: ${branchName}`,
    }
  }

  // 푸시 실행
  const result = await gitPush(cwd, {
    remote: 'origin',
    branch: setUpstream ? branchName : undefined,
    force,
  })

  return result
}

/**
 * 현재 브랜치가 Change 브랜치인지 확인하고 Change ID 반환
 */
export async function getCurrentChangeBranch(cwd: string): Promise<{
  isChangeBranch: boolean
  changeId: string | null
  branch: string
}> {
  const status = await getGitStatus(cwd)

  if (!status.isGitRepo) {
    return {
      isChangeBranch: false,
      changeId: null,
      branch: '',
    }
  }

  const changeId = getChangeIdFromBranch(status.branch)

  return {
    isChangeBranch: changeId !== null,
    changeId,
    branch: status.branch,
  }
}

/**
 * Change 브랜치 목록 조회
 */
export async function listChangeBranches(cwd: string): Promise<{
  success: boolean
  branches: Array<{
    name: string
    changeId: string
    isRemote: boolean
    isCurrent: boolean
  }>
  error?: string
}> {
  const result = await gitBranches(cwd, { all: true })

  if (!result.success) {
    return {
      success: false,
      branches: [],
      error: result.error || result.stderr,
    }
  }

  const status = await getGitStatus(cwd)
  const currentBranch = status.branch

  const allBranches = result.stdout.split('\n').filter(Boolean)
  const changeBranches = allBranches
    .filter((b) => b.includes(CHANGE_BRANCH_PREFIX))
    .map((b) => {
      const isRemote = b.startsWith('origin/')
      const cleanName = isRemote ? b.replace('origin/', '') : b
      const changeId = getChangeIdFromBranch(cleanName)

      return {
        name: cleanName,
        changeId: changeId || '',
        isRemote,
        isCurrent: cleanName === currentBranch,
      }
    })
    .filter((b) => b.changeId) // changeId가 없는 것은 제외

  // 중복 제거 (로컬과 원격 모두 있는 경우)
  const uniqueBranches = changeBranches.reduce(
    (acc, branch) => {
      const existing = acc.find((b) => b.name === branch.name)
      if (existing) {
        // 로컬 브랜치 우선
        if (!branch.isRemote) {
          acc = acc.filter((b) => b.name !== branch.name)
          acc.push(branch)
        }
      } else {
        acc.push(branch)
      }
      return acc
    },
    [] as typeof changeBranches
  )

  return {
    success: true,
    branches: uniqueBranches,
  }
}

/**
 * 브랜치 전환 전 uncommitted changes 확인
 */
export async function checkUncommittedChanges(cwd: string): Promise<{
  hasChanges: boolean
  staged: string[]
  modified: string[]
  untracked: string[]
  deleted: string[]
  summary: string
}> {
  const status = await getGitStatus(cwd)

  const hasChanges = status.isDirty
  const summary = hasChanges
    ? [
        status.staged.length > 0 ? `${status.staged.length} staged` : '',
        status.modified.length > 0 ? `${status.modified.length} modified` : '',
        status.untracked.length > 0 ? `${status.untracked.length} untracked` : '',
        status.deleted.length > 0 ? `${status.deleted.length} deleted` : '',
      ]
        .filter(Boolean)
        .join(', ')
    : 'No uncommitted changes'

  return {
    hasChanges,
    staged: status.staged,
    modified: status.modified,
    untracked: status.untracked,
    deleted: status.deleted,
    summary,
  }
}
