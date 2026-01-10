/**
 * PR Workflow Orchestration
 *
 * 자동 PR 생성 및 관리 워크플로우
 * - 브랜치 생성 (auto-fix/{alert-id})
 * - 변경사항 커밋
 * - PR 생성 (템플릿 적용)
 * - 라벨 할당
 * - CI 상태 모니터링
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { FileChange, FixResult } from './fix-generator'
import type { ValidationResult } from './fix-validator'
import type { MergeDecision } from './merge-policy'
import { generatePRDescriptionPrompt, type FixSuggestion } from './prompts/error-analysis'
import { getGeminiClient } from '../ai/gemini-client'
import type { ParsedError } from './error-analyzer'

const execFileAsync = promisify(execFile)

export interface PRConfig {
  owner: string
  repo: string
  baseBranch: string
  githubToken: string
}

export interface PRResult {
  success: boolean
  prNumber?: number
  prUrl?: string
  branchName?: string
  error?: string
}

export interface WorkflowResult {
  success: boolean
  phases: {
    branch: { success: boolean; branchName?: string; error?: string }
    commit: { success: boolean; sha?: string; error?: string }
    push: { success: boolean; error?: string }
    pr: PRResult
  }
  finalPR?: {
    number: number
    url: string
    title: string
  }
}

/**
 * 전체 PR 워크플로우 실행
 */
export async function executeWorkflow(
  alertId: string,
  fixResult: FixResult,
  validation: ValidationResult,
  mergeDecision: MergeDecision,
  errors: ParsedError[],
  config: PRConfig,
  projectRoot: string
): Promise<WorkflowResult> {
  const result: WorkflowResult = {
    success: false,
    phases: {
      branch: { success: false },
      commit: { success: false },
      push: { success: false },
      pr: { success: false },
    },
  }

  // 1. 브랜치 생성
  const branchName = `auto-fix/${alertId}`

  try {
    await createBranch(branchName, config.baseBranch, projectRoot)
    result.phases.branch = { success: true, branchName }
  } catch (err) {
    result.phases.branch = { success: false, error: `${err}` }
    return result
  }

  // 2. 변경사항 적용 및 커밋
  try {
    const commitMessage = generateCommitMessage(fixResult, errors)
    const sha = await commitChanges(fixResult.changes, commitMessage, projectRoot)
    result.phases.commit = { success: true, sha }
  } catch (err) {
    result.phases.commit = { success: false, error: `${err}` }
    await cleanupBranch(branchName, config.baseBranch, projectRoot)
    return result
  }

  // 3. 원격에 푸시
  try {
    await pushBranch(branchName, projectRoot)
    result.phases.push = { success: true }
  } catch (err) {
    result.phases.push = { success: false, error: `${err}` }
    await cleanupBranch(branchName, config.baseBranch, projectRoot)
    return result
  }

  // 4. PR 생성
  try {
    const prResult = await createPullRequest(
      branchName,
      fixResult,
      validation,
      mergeDecision,
      errors,
      config
    )
    result.phases.pr = prResult

    if (prResult.success && prResult.prNumber) {
      result.success = true
      result.finalPR = {
        number: prResult.prNumber,
        url: prResult.prUrl!,
        title: `fix: Auto-fix for ${alertId}`,
      }
    }
  } catch (err) {
    result.phases.pr = { success: false, error: `${err}` }
  }

  return result
}

/**
 * 브랜치 생성
 */
async function createBranch(
  branchName: string,
  baseBranch: string,
  projectRoot: string
): Promise<void> {
  // base 브랜치로 체크아웃
  await execFileAsync('git', ['checkout', baseBranch], { cwd: projectRoot })

  // 최신 변경사항 pull
  await execFileAsync('git', ['pull', 'origin', baseBranch], { cwd: projectRoot })

  // 새 브랜치 생성 및 체크아웃
  await execFileAsync('git', ['checkout', '-b', branchName], { cwd: projectRoot })
}

/**
 * 변경사항 커밋
 */
async function commitChanges(
  changes: FileChange[],
  message: string,
  projectRoot: string
): Promise<string> {
  // 파일 스테이징
  for (const change of changes) {
    await execFileAsync('git', ['add', change.file], { cwd: projectRoot })
  }

  // 커밋
  await execFileAsync('git', ['commit', '-m', message], { cwd: projectRoot })

  // SHA 얻기
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot })
  return stdout.trim()
}

/**
 * 브랜치 푸시
 */
async function pushBranch(branchName: string, projectRoot: string): Promise<void> {
  await execFileAsync('git', ['push', '-u', 'origin', branchName], { cwd: projectRoot })
}

/**
 * 브랜치 정리 (실패 시)
 */
async function cleanupBranch(
  branchName: string,
  baseBranch: string,
  projectRoot: string
): Promise<void> {
  try {
    await execFileAsync('git', ['checkout', baseBranch], { cwd: projectRoot })
    await execFileAsync('git', ['branch', '-D', branchName], { cwd: projectRoot })
  } catch {
    // 정리 실패는 무시
  }
}

/**
 * 커밋 메시지 생성
 */
function generateCommitMessage(fixResult: FixResult, errors: ParsedError[]): string {
  const errorTypes = [...new Set(errors.map((e) => e.type))].join(', ')
  const fileCount = fixResult.changes.length

  const lines = [
    `fix: Auto-fix ${errorTypes} errors`,
    '',
    `Fixed ${errors.length} error(s) in ${fileCount} file(s)`,
    '',
    'Changes:',
    ...fixResult.changes.map((c) => `- ${c.file}`),
    '',
    `Confidence: ${(fixResult.metadata.confidence * 100).toFixed(0)}%`,
    '',
    'Generated by ZyFlow Auto-Fix Agent',
  ]

  return lines.join('\n')
}

/**
 * PR 생성
 */
async function createPullRequest(
  branchName: string,
  fixResult: FixResult,
  validation: ValidationResult,
  mergeDecision: MergeDecision,
  errors: ParsedError[],
  config: PRConfig
): Promise<PRResult> {
  // PR 설명 생성
  const fixes: FixSuggestion[] = fixResult.changes.flatMap((c) => c.fixes)
  let prDescription: {
    title: string
    summary: string
    changes: string[]
    testingNotes: string
  }

  try {
    const gemini = getGeminiClient()
    const prompt = generatePRDescriptionPrompt(fixes, errors)
    prDescription = await gemini.generateJSON(prompt, { temperature: 0.3 })
  } catch {
    // AI 실패 시 기본 설명 사용
    prDescription = {
      title: `fix: Auto-fix ${errors.length} error(s)`,
      summary: `This PR fixes ${errors.length} error(s) detected by the monitoring system.`,
      changes: fixResult.changes.map((c) => `Updated ${c.file}`),
      testingNotes: 'Please verify the changes work as expected.',
    }
  }

  // PR 본문 생성
  const body = generatePRBody(prDescription, fixResult, validation, mergeDecision)

  // GitHub API로 PR 생성
  try {
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: prDescription.title,
          body,
          head: branchName,
          base: config.baseBranch,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json() as { message?: string }
      return {
        success: false,
        error: error.message || `Failed to create PR: ${response.status}`,
      }
    }

    const pr = await response.json() as { number: number; html_url: string }

    // 라벨 추가
    await addLabels(config.owner, config.repo, pr.number, config.githubToken)

    return {
      success: true,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branchName,
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to create PR: ${err}`,
    }
  }
}

/**
 * PR 본문 생성
 */
function generatePRBody(
  description: {
    title: string
    summary: string
    changes: string[]
    testingNotes: string
  },
  fixResult: FixResult,
  validation: ValidationResult,
  mergeDecision: MergeDecision
): string {
  const lines = [
    '## Summary',
    description.summary,
    '',
    '## Changes',
    ...description.changes.map((c) => `- ${c}`),
    '',
    '## Validation Results',
    `- Syntax: ${validation.checks.syntax.passed ? '✅' : '❌'}`,
    `- Type Check: ${validation.checks.typecheck.passed ? '✅' : validation.checks.typecheck.skipped ? '⏭️' : '❌'}`,
    `- Lint: ${validation.checks.lint.passed ? '✅' : validation.checks.lint.skipped ? '⏭️' : '❌'}`,
    `- Tests: ${validation.checks.test.passed ? '✅' : validation.checks.test.skipped ? '⏭️' : '❌'}`,
    '',
    `**Overall Score:** ${(validation.overallScore * 100).toFixed(0)}%`,
    '',
    '## Auto-Merge Status',
    `**Decision:** ${mergeDecision.shouldMerge ? '🟢 Auto-merge enabled' : '🔴 Manual review required'}`,
    `**Reason:** ${mergeDecision.reason}`,
    '',
    '## Testing Notes',
    description.testingNotes,
    '',
    '---',
    `> 🤖 Generated by [ZyFlow Auto-Fix Agent](https://github.com/zyflow)`,
    `> Confidence: ${(fixResult.metadata.confidence * 100).toFixed(0)}%`,
  ]

  return lines.join('\n')
}

/**
 * PR에 라벨 추가
 */
async function addLabels(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken: string
): Promise<void> {
  const labels = ['auto-fix', 'gemini']

  try {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labels }),
      }
    )
  } catch {
    // 라벨 추가 실패는 무시
  }
}

/**
 * PR 상태 조회
 */
export async function getPRStatus(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken: string
): Promise<{
  state: 'open' | 'closed' | 'merged'
  mergeable: boolean | null
  ciStatus: 'success' | 'failure' | 'pending' | 'unknown'
}> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      return { state: 'open', mergeable: null, ciStatus: 'unknown' }
    }

    const pr = await response.json() as {
      state: 'open' | 'closed'
      merged: boolean
      mergeable: boolean | null
    }

    // CI 상태 조회
    const checksResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/checks`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    let ciStatus: 'success' | 'failure' | 'pending' | 'unknown' = 'unknown'

    if (checksResponse.ok) {
      const checks = await checksResponse.json() as {
        check_runs: Array<{ conclusion: string | null; status: string }>
      }

      const allPassed = checks.check_runs.every(
        (c) => c.conclusion === 'success' || c.conclusion === 'skipped'
      )
      const anyPending = checks.check_runs.some(
        (c) => c.status === 'in_progress' || c.status === 'queued'
      )
      const anyFailed = checks.check_runs.some(
        (c) => c.conclusion === 'failure' || c.conclusion === 'cancelled'
      )

      if (anyFailed) ciStatus = 'failure'
      else if (anyPending) ciStatus = 'pending'
      else if (allPassed) ciStatus = 'success'
    }

    return {
      state: pr.merged ? 'merged' : pr.state,
      mergeable: pr.mergeable,
      ciStatus,
    }
  } catch {
    return { state: 'open', mergeable: null, ciStatus: 'unknown' }
  }
}

/**
 * 워크플로우 결과 요약
 */
export function summarizeWorkflow(result: WorkflowResult): string {
  const phases = [
    { name: 'Branch', result: result.phases.branch },
    { name: 'Commit', result: result.phases.commit },
    { name: 'Push', result: result.phases.push },
    { name: 'PR', result: result.phases.pr },
  ]

  const lines = phases.map((p) => {
    const status = p.result.success ? '✓' : '✗'
    const detail = p.result.error ? ` (${p.result.error})` : ''
    return `${status} ${p.name}${detail}`
  })

  if (result.finalPR) {
    lines.push('')
    lines.push(`PR: ${result.finalPR.url}`)
  }

  return lines.join('\n')
}
