/**
 * GitHub Actions Poller Service
 *
 * GitHub REST API를 사용하여 GitHub Actions의 실패한 워크플로우를 폴링하고
 * Alert 시스템에 등록합니다.
 *
 * Webhook 방식이 아닌 폴링 방식으로 동작:
 * - localhost에서도 GitHub Actions 에러 수집 가능
 * - 수동 동기화 또는 주기적 폴링 지원
 * - gh CLI 또는 GitHub PAT 토큰 지원
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { getSqlite } from '../tasks/db/client.js'
import { processAlert } from './alertProcessor.js'

const execAsync = promisify(exec)

// =============================================
// Types
// =============================================

interface WorkflowRun {
  id: number
  name: string
  displayTitle: string
  status: string
  conclusion: string | null
  workflowId: number
  workflowName: string
  headBranch: string
  headSha: string
  event: string
  url: string
  createdAt: string
  updatedAt: string
  runStartedAt: string
  attempt: number
  repository: {
    nameWithOwner: string
  }
}

interface SyncResult {
  success: boolean
  newAlerts: number
  skipped: number
  errors: string[]
  repo?: string
}

interface PollerConfig {
  enabled: boolean
  intervalMs: number
  repos: string[]
  lastPolledAt?: number
}

interface GitHubApiWorkflowRun {
  id: number
  name: string
  display_title: string
  status: string
  conclusion: string | null
  workflow_id: number
  head_branch: string
  head_sha: string
  event: string
  html_url: string
  created_at: string
  updated_at: string
  run_started_at: string
  run_attempt: number
}

interface GitHubApiResponse {
  total_count: number
  workflow_runs: GitHubApiWorkflowRun[]
}

// =============================================
// GitHub Authentication Helpers
// =============================================

/**
 * 환경변수에서 GitHub PAT 가져오기
 */
function getGitHubToken(): string | null {
  return process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || null
}

/**
 * GitHub API 인증 상태 확인 (PAT 또는 gh CLI)
 */
export async function checkGhAuth(): Promise<{ authenticated: boolean; user?: string; method?: 'pat' | 'cli'; error?: string }> {
  // 1. 먼저 PAT 확인
  const token = getGitHubToken()
  if (token) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })

      if (response.ok) {
        const user = await response.json() as { login: string }
        return {
          authenticated: true,
          user: user.login,
          method: 'pat',
        }
      }
    } catch (error) {
      console.error('PAT authentication check failed:', error)
    }
  }

  // 2. gh CLI 확인
  try {
    const { stdout } = await execAsync('gh auth status 2>&1')
    const match = stdout.match(/Logged in to github\.com account (\S+)/)
    return {
      authenticated: true,
      user: match?.[1] || 'unknown',
      method: 'cli',
    }
  } catch {
    // gh CLI도 실패
  }

  return {
    authenticated: false,
    error: 'GitHub 인증이 필요합니다. GITHUB_PERSONAL_ACCESS_TOKEN 환경변수를 설정하거나 `gh auth login`을 실행하세요.',
  }
}

/**
 * GitHub API 호출 (PAT 우선, gh CLI 폴백)
 */
async function fetchGitHubApi<T>(endpoint: string): Promise<T> {
  const token = getGitHubToken()

  if (token) {
    // PAT 사용
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  // gh CLI 폴백
  const { stdout } = await execAsync(`gh api ${endpoint}`)
  return JSON.parse(stdout) as T
}

// =============================================
// Workflow Fetching
// =============================================

/**
 * 특정 리포지토리의 실패한 워크플로우 실행 목록 가져오기
 */
async function getFailedWorkflowRuns(
  repo: string,
  limit: number = 20,
  sinceTimestamp?: number
): Promise<WorkflowRun[]> {
  try {
    const token = getGitHubToken()

    if (token) {
      // GitHub REST API 사용
      const response = await fetchGitHubApi<GitHubApiResponse>(
        `/repos/${repo}/actions/runs?status=failure&per_page=${limit}`
      )

      const runs = response.workflow_runs || []

      // sinceTimestamp 이후의 워크플로우만 필터링
      const filteredRuns = sinceTimestamp
        ? runs.filter(run => new Date(run.created_at).getTime() > sinceTimestamp)
        : runs

      return filteredRuns.map(run => ({
        id: run.id,
        name: run.name,
        displayTitle: run.display_title,
        status: run.status,
        conclusion: run.conclusion,
        workflowId: run.workflow_id,
        workflowName: run.name, // API에서는 workflow name이 따로 없음
        headBranch: run.head_branch,
        headSha: run.head_sha,
        event: run.event,
        url: run.html_url,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        runStartedAt: run.run_started_at,
        attempt: run.run_attempt,
        repository: {
          nameWithOwner: repo,
        },
      }))
    }

    // gh CLI 폴백
    const fields = 'databaseId,name,displayTitle,status,conclusion,workflowDatabaseId,workflowName,headBranch,headSha,event,url,createdAt,updatedAt,startedAt,attempt'
    const cmd = `gh run list --repo ${repo} --status failure --limit ${limit} --json ${fields}`

    const { stdout } = await execAsync(cmd)
    const runs = JSON.parse(stdout) as Array<{
      databaseId: number
      name: string
      displayTitle: string
      status: string
      conclusion: string | null
      workflowDatabaseId: number
      workflowName: string
      headBranch: string
      headSha: string
      event: string
      url: string
      createdAt: string
      updatedAt: string
      startedAt: string
      attempt: number
    }>

    // sinceTimestamp 이후의 워크플로우만 필터링
    const filteredRuns = sinceTimestamp
      ? runs.filter(run => new Date(run.createdAt).getTime() > sinceTimestamp)
      : runs

    return filteredRuns.map(run => ({
      id: run.databaseId,
      name: run.name,
      displayTitle: run.displayTitle,
      status: run.status,
      conclusion: run.conclusion,
      workflowId: run.workflowDatabaseId,
      workflowName: run.workflowName,
      headBranch: run.headBranch,
      headSha: run.headSha,
      event: run.event,
      url: run.url,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      runStartedAt: run.startedAt,
      attempt: run.attempt,
      repository: {
        nameWithOwner: repo,
      },
    }))
  } catch (error) {
    console.error(`Failed to fetch workflow runs for ${repo}:`, error)
    return []
  }
}

/**
 * 워크플로우 실행의 상세 로그 가져오기 (실패 원인 분석용)
 */
async function getWorkflowRunLogs(repo: string, runId: number): Promise<string | null> {
  try {
    // 실패한 job 로그 가져오기 (gh CLI만 지원)
    const { stdout } = await execAsync(
      `gh run view ${runId} --repo ${repo} --log-failed 2>&1 | head -100`
    )
    return stdout
  } catch {
    return null
  }
}

// =============================================
// Alert Creation
// =============================================

/**
 * 워크플로우 실행을 Alert로 변환하여 DB에 저장
 */
async function createAlertFromWorkflowRun(
  run: WorkflowRun,
  options?: {
    projectId?: string
    broadcastAlert?: (alert: unknown) => void
  }
): Promise<string | null> {
  const sqlite = getSqlite()
  const projectId = options?.projectId || null

  // 이미 같은 워크플로우 실행에 대한 Alert가 있는지 확인 (중복 방지)
  // project_id가 있으면 해당 프로젝트 내에서만 중복 체크
  const existingAlert = projectId
    ? sqlite.prepare(`
        SELECT id FROM alerts
        WHERE source = 'github'
        AND external_url = ?
        AND project_id = ?
        LIMIT 1
      `).get(run.url, projectId) as { id: string } | undefined
    : sqlite.prepare(`
        SELECT id FROM alerts
        WHERE source = 'github'
        AND external_url = ?
        LIMIT 1
      `).get(run.url) as { id: string } | undefined

  if (existingAlert) {
    return null // 이미 존재하면 스킵
  }

  const now = Date.now()
  const alertId = randomUUID()
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

  // Alert 제목 생성
  const title = `${run.workflowName || run.name} - failure`

  // 메타데이터
  const metadata = {
    repo: run.repository.nameWithOwner,
    branch: run.headBranch,
    commit: run.headSha,
    event: run.event,
    runId: run.id,
    attempt: run.attempt,
  }

  // Payload (원본 데이터)
  const payload = {
    workflow_run: {
      id: run.id,
      name: run.workflowName || run.name,
      head_branch: run.headBranch,
      head_sha: run.headSha,
      conclusion: run.conclusion || 'failure',
      html_url: run.url,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
      run_started_at: run.runStartedAt,
      attempt: run.attempt,
      event: run.event,
    },
    repository: {
      full_name: run.repository.nameWithOwner,
    },
  }

  // Alert 생성
  sqlite.prepare(`
    INSERT INTO alerts (id, source, type, severity, status, title, external_url, payload, metadata, project_id, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    alertId,
    'github',
    'workflow.failure',
    'critical',
    title,
    run.url,
    JSON.stringify(payload),
    JSON.stringify(metadata),
    projectId,
    now,
    now,
    now + NINETY_DAYS_MS
  )

  // Activity log 생성
  sqlite.prepare(`
    INSERT INTO activity_logs (id, alert_id, actor, action, description, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    alertId,
    'system',
    'poller.synced',
    `GitHub Actions workflow failure synced: ${run.workflowName || run.name}`,
    JSON.stringify({ repo: run.repository.nameWithOwner, runId: run.id }),
    now
  )

  // WebSocket 브로드캐스트
  const newAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
  if (options?.broadcastAlert && newAlert) {
    options.broadcastAlert({ type: 'alert.created', alert: newAlert })
  }

  // 백그라운드에서 Alert 처리 (분석, 위험도 평가 등)
  processAlert(alertId).then(result => {
    const updatedAlert = sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
    if (options?.broadcastAlert && updatedAlert) {
      options.broadcastAlert({ type: 'alert.processed', alert: updatedAlert, result })
    }
  }).catch(err => {
    console.error('Error in background alert processing:', err)
  })

  return alertId
}

// =============================================
// Sync Functions
// =============================================

/**
 * 특정 리포지토리의 실패한 워크플로우를 동기화
 */
export async function syncRepoWorkflows(
  repo: string,
  options?: {
    limit?: number
    sinceTimestamp?: number
    projectId?: string
    broadcastAlert?: (alert: unknown) => void
  }
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    newAlerts: 0,
    skipped: 0,
    errors: [],
    repo,
  }

  try {
    // GitHub 인증 확인
    const authCheck = await checkGhAuth()
    if (!authCheck.authenticated) {
      return {
        success: false,
        newAlerts: 0,
        skipped: 0,
        errors: [authCheck.error || 'Not authenticated'],
        repo,
      }
    }

    // 실패한 워크플로우 가져오기
    const runs = await getFailedWorkflowRuns(
      repo,
      options?.limit || 20,
      options?.sinceTimestamp
    )

    // 각 워크플로우를 Alert로 변환
    for (const run of runs) {
      try {
        const alertId = await createAlertFromWorkflowRun(run, {
          projectId: options?.projectId,
          broadcastAlert: options?.broadcastAlert,
        })
        if (alertId) {
          result.newAlerts++
        } else {
          result.skipped++
        }
      } catch (error) {
        result.errors.push(
          `Failed to create alert for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  } catch (error) {
    result.success = false
    result.errors.push(error instanceof Error ? error.message : String(error))
  }

  return result
}

/**
 * 현재 디렉토리의 리포지토리 정보 가져오기
 */
export async function getCurrentRepo(cwd?: string): Promise<string | null> {
  try {
    // git remote에서 repo 정보 추출
    const { stdout } = await execAsync('git remote get-url origin', { cwd })
    const url = stdout.trim()

    // HTTPS URL: https://github.com/owner/repo.git
    // SSH URL: git@github.com:owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?/)
    const sshMatch = url.match(/github\.com:([^/]+\/[^/.]+)(?:\.git)?/)

    if (httpsMatch) {
      return httpsMatch[1]
    }
    if (sshMatch) {
      return sshMatch[1]
    }

    // gh CLI 폴백
    const { stdout: ghStdout } = await execAsync('gh repo view --json nameWithOwner', { cwd })
    const data = JSON.parse(ghStdout)
    return data.nameWithOwner
  } catch {
    return null
  }
}

/**
 * 여러 리포지토리의 워크플로우를 동기화
 */
export async function syncAllRepos(
  repos: string[],
  options?: {
    limit?: number
    sinceTimestamp?: number
    projectId?: string
    broadcastAlert?: (alert: unknown) => void
  }
): Promise<{ results: SyncResult[]; totalNew: number; totalSkipped: number }> {
  const results: SyncResult[] = []
  let totalNew = 0
  let totalSkipped = 0

  for (const repo of repos) {
    const result = await syncRepoWorkflows(repo, options)
    results.push(result)
    totalNew += result.newAlerts
    totalSkipped += result.skipped
  }

  return { results, totalNew, totalSkipped }
}

// =============================================
// Poller Configuration
// =============================================

/**
 * 폴러 설정 가져오기
 */
export function getPollerConfig(): PollerConfig {
  const sqlite = getSqlite()

  // notification_config 테이블에서 poller 설정 가져오기
  const config = sqlite.prepare(`
    SELECT poller_enabled, poller_interval_ms, poller_repos, poller_last_polled_at
    FROM notification_config WHERE id = 'default'
  `).get() as {
    poller_enabled?: number
    poller_interval_ms?: number
    poller_repos?: string
    poller_last_polled_at?: number
  } | undefined

  return {
    enabled: config?.poller_enabled === 1,
    intervalMs: config?.poller_interval_ms || 5 * 60 * 1000, // 기본 5분
    repos: config?.poller_repos ? JSON.parse(config.poller_repos) : [],
    lastPolledAt: config?.poller_last_polled_at,
  }
}

/**
 * 폴러 설정 업데이트
 */
export function updatePollerConfig(updates: Partial<PollerConfig>): void {
  const sqlite = getSqlite()
  const now = Date.now()

  // 기존 설정이 없으면 생성
  const existing = sqlite.prepare(`SELECT id FROM notification_config WHERE id = 'default'`).get()

  if (!existing) {
    sqlite.prepare(`
      INSERT INTO notification_config (id, poller_enabled, poller_interval_ms, poller_repos, updated_at)
      VALUES ('default', ?, ?, ?, ?)
    `).run(
      updates.enabled ? 1 : 0,
      updates.intervalMs || 300000,
      updates.repos ? JSON.stringify(updates.repos) : '[]',
      now
    )
  } else {
    const sets: string[] = []
    const params: unknown[] = []

    if (updates.enabled !== undefined) {
      sets.push('poller_enabled = ?')
      params.push(updates.enabled ? 1 : 0)
    }
    if (updates.intervalMs !== undefined) {
      sets.push('poller_interval_ms = ?')
      params.push(updates.intervalMs)
    }
    if (updates.repos !== undefined) {
      sets.push('poller_repos = ?')
      params.push(JSON.stringify(updates.repos))
    }
    if (updates.lastPolledAt !== undefined) {
      sets.push('poller_last_polled_at = ?')
      params.push(updates.lastPolledAt)
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?')
      params.push(now)
      params.push('default')

      sqlite.prepare(`
        UPDATE notification_config SET ${sets.join(', ')} WHERE id = ?
      `).run(...params)
    }
  }
}

// =============================================
// Background Poller (Optional)
// =============================================

let pollerInterval: ReturnType<typeof setInterval> | null = null

/**
 * 백그라운드 폴러 시작
 */
export function startBackgroundPoller(broadcastAlert?: (alert: unknown) => void): void {
  const config = getPollerConfig()

  if (!config.enabled || config.repos.length === 0) {
    console.log('GitHub Actions poller is disabled or no repos configured')
    return
  }

  if (pollerInterval) {
    clearInterval(pollerInterval)
  }

  console.log(`Starting GitHub Actions poller (interval: ${config.intervalMs}ms)`)

  pollerInterval = setInterval(async () => {
    const currentConfig = getPollerConfig()
    if (!currentConfig.enabled) {
      stopBackgroundPoller()
      return
    }

    console.log('Polling GitHub Actions for failures...')

    const { totalNew, totalSkipped } = await syncAllRepos(currentConfig.repos, {
      sinceTimestamp: currentConfig.lastPolledAt,
      broadcastAlert,
    })

    console.log(`Polled ${currentConfig.repos.length} repos: ${totalNew} new alerts, ${totalSkipped} skipped`)

    // 마지막 폴링 시간 업데이트
    updatePollerConfig({ lastPolledAt: Date.now() })
  }, config.intervalMs)
}

/**
 * 백그라운드 폴러 중지
 */
export function stopBackgroundPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval)
    pollerInterval = null
    console.log('GitHub Actions poller stopped')
  }
}

/**
 * 폴러 상태 확인
 */
export function isPollerRunning(): boolean {
  return pollerInterval !== null
}
