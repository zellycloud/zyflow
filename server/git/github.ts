/**
 * GitHub API 연동 모듈
 * OpenSpec Change: integrate-git-workflow (Phase 3)
 *
 * gh CLI를 사용하여 PR 생성 및 관리를 지원합니다.
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface PullRequestInfo {
  number: number
  url: string
  title: string
  state: string
  headBranch: string
  baseBranch: string
}

export interface CreatePROptions {
  title: string
  body?: string
  baseBranch?: string
  draft?: boolean
  labels?: string[]
}

export interface CreatePRResult {
  success: boolean
  pr?: PullRequestInfo
  error?: string
  url?: string
}

/**
 * gh CLI가 설치되어 있고 인증되어 있는지 확인
 */
export async function checkGhCliAuth(cwd: string): Promise<{ authenticated: boolean; user?: string; error?: string }> {
  try {
    const { stdout } = await execAsync('gh auth status', { cwd })
    // "Logged in to github.com account xxx" 형식에서 사용자명 추출
    const match = stdout.match(/Logged in to github\.com account (\S+)/)
    return {
      authenticated: true,
      user: match?.[1] || 'unknown',
    }
  } catch {
    return {
      authenticated: false,
      error: 'gh CLI가 설치되지 않았거나 인증되지 않았습니다. `gh auth login`을 실행하세요.',
    }
  }
}

/**
 * 현재 리포지토리의 GitHub 원격 정보 확인
 */
export async function getRepoInfo(cwd: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execAsync('gh repo view --json owner,name', { cwd })
    const data = JSON.parse(stdout)
    return {
      owner: data.owner?.login || data.owner,
      repo: data.name,
    }
  } catch {
    return null
  }
}

/**
 * PR 생성
 */
export async function createPullRequest(
  cwd: string,
  options: CreatePROptions
): Promise<CreatePRResult> {
  try {
    // gh CLI 인증 확인
    const authCheck = await checkGhCliAuth(cwd)
    if (!authCheck.authenticated) {
      return { success: false, error: authCheck.error }
    }

    // PR 생성 명령어 구성
    const args = ['gh', 'pr', 'create']
    args.push('--title', `"${options.title.replace(/"/g, '\\"')}"`)

    if (options.body) {
      args.push('--body', `"${options.body.replace(/"/g, '\\"')}"`)
    } else {
      args.push('--body', '""')
    }

    if (options.baseBranch) {
      args.push('--base', options.baseBranch)
    }

    if (options.draft) {
      args.push('--draft')
    }

    if (options.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','))
    }

    const cmd = args.join(' ')
    const { stdout, stderr } = await execAsync(cmd, { cwd })

    // PR URL 추출 (gh pr create는 URL을 출력)
    const url = stdout.trim()

    if (!url.includes('github.com')) {
      return {
        success: false,
        error: stderr || 'PR 생성에 실패했습니다.',
      }
    }

    // PR 번호 추출
    const prNumberMatch = url.match(/\/pull\/(\d+)/)
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : 0

    return {
      success: true,
      url,
      pr: {
        number: prNumber,
        url,
        title: options.title,
        state: options.draft ? 'draft' : 'open',
        headBranch: '', // 현재 브랜치
        baseBranch: options.baseBranch || 'main',
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 이미 PR이 존재하는 경우
    if (errorMessage.includes('already exists')) {
      return {
        success: false,
        error: '이 브랜치에서 이미 PR이 생성되어 있습니다.',
      }
    }

    // 푸시되지 않은 경우
    if (errorMessage.includes('has no commits') || errorMessage.includes('not pushed')) {
      return {
        success: false,
        error: '먼저 브랜치를 원격에 푸시해주세요.',
      }
    }

    return {
      success: false,
      error: `PR 생성 실패: ${errorMessage}`,
    }
  }
}

/**
 * 현재 브랜치의 PR 정보 조회
 */
export async function getCurrentPR(cwd: string): Promise<PullRequestInfo | null> {
  try {
    const { stdout } = await execAsync(
      'gh pr view --json number,url,title,state,headRefName,baseRefName',
      { cwd }
    )
    const data = JSON.parse(stdout)

    return {
      number: data.number,
      url: data.url,
      title: data.title,
      state: data.state,
      headBranch: data.headRefName,
      baseBranch: data.baseRefName,
    }
  } catch {
    return null
  }
}

/**
 * PR 목록 조회
 */
export async function listPullRequests(
  cwd: string,
  options?: { state?: 'open' | 'closed' | 'all'; limit?: number }
): Promise<{ success: boolean; prs?: PullRequestInfo[]; error?: string }> {
  try {
    const state = options?.state || 'open'
    const limit = options?.limit || 10

    const { stdout } = await execAsync(
      `gh pr list --state ${state} --limit ${limit} --json number,url,title,state,headRefName,baseRefName`,
      { cwd }
    )

    const data = JSON.parse(stdout)
    const prs: PullRequestInfo[] = data.map((pr: Record<string, unknown>) => ({
      number: pr.number,
      url: pr.url,
      title: pr.title,
      state: pr.state,
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
    }))

    return { success: true, prs }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Change 브랜치에서 PR 생성
 * Change 정보를 기반으로 PR 제목과 본문을 자동 생성
 */
export async function createPRForChange(
  cwd: string,
  changeId: string,
  changeTitle: string,
  options?: {
    baseBranch?: string
    draft?: boolean
    description?: string
  }
): Promise<CreatePRResult> {
  const title = `[${changeId}] ${changeTitle}`
  const body = options?.description || `## Change: ${changeId}\n\n${changeTitle}\n\n---\nCreated by ZyFlow`

  return createPullRequest(cwd, {
    title,
    body,
    baseBranch: options?.baseBranch || 'main',
    draft: options?.draft,
    labels: ['zyflow'],
  })
}
