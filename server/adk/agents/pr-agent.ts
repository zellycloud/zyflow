/**
 * PR Agent
 *
 * 수정 사항을 커밋하고 PR을 생성하는 에이전트
 */

import { LlmAgent } from '@google/adk'
import { gitTools, gitCreateBranchTool, gitAddTool, gitCommitTool, gitPushTool } from '../tools/git-tools'
import { githubTools, createPRTool, getPRStatusTool, mergePRTool, waitForCITool, deleteBranchTool } from '../tools/github-tools'
import { loadConfig } from '../config'
import type { CodeFix } from './fix-generator'
import type { ErrorAnalysisResult } from './error-analyzer'

const config = loadConfig()

export interface PRCreationResult {
  success: boolean
  prNumber?: number
  prUrl?: string
  branch?: string
  error?: string
}

export const prAgent = new LlmAgent({
  name: 'pr-agent',
  description: 'PR을 생성하고 관리합니다.',
  model: config.model,
  instruction: `당신은 Git과 GitHub 작업 전문가입니다.

코드 수정 후:
1. 새 브랜치를 생성합니다
2. 변경사항을 커밋합니다
3. 원격에 푸시합니다
4. PR을 생성합니다

PR 제목과 본문을 명확하게 작성하세요.`,
  tools: [...gitTools, ...githubTools],
})

export async function createAutoFixPR(
  analysis: ErrorAnalysisResult,
  fixes: CodeFix[],
  options?: {
    repository?: string
    baseBranch?: string
    alertId?: string
    dryRun?: boolean
  }
): Promise<PRCreationResult> {
  const repository = options?.repository || process.env.GITHUB_REPOSITORY
  if (!repository) {
    return { success: false, error: 'Repository not specified' }
  }

  const alertId = options?.alertId || Date.now().toString()
  const branchName = 'auto-fix/' + alertId

  try {
    // 1. 브랜치 생성
    const branchResult = await gitCreateBranchTool.execute({
      branchName,
      baseBranch: options?.baseBranch || 'main',
      checkout: true,
    })

    if (!branchResult.success) {
      return { success: false, error: 'Branch creation failed: ' + branchResult.error }
    }

    // 2. 파일 스테이징
    const filePaths = fixes.map(f => f.filePath)
    const addResult = await gitAddTool.execute({
      files: filePaths,
    })

    if (!addResult.success) {
      return { success: false, error: 'Git add failed: ' + addResult.error }
    }

    // 3. 커밋
    const commitMessage = generateCommitMessage(analysis)
    const commitResult = await gitCommitTool.execute({
      message: commitMessage,
      body: generateCommitBody(analysis, fixes),
    })

    if (!commitResult.success) {
      return { success: false, error: 'Commit failed: ' + commitResult.error }
    }

    if (options?.dryRun) {
      return {
        success: true,
        branch: branchName,
        prUrl: 'dry-run',
      }
    }

    // 4. 푸시
    const pushResult = await gitPushTool.execute({
      branch: branchName,
      setUpstream: true,
    })

    if (!pushResult.success) {
      return { success: false, error: 'Push failed: ' + pushResult.error }
    }

    // 5. PR 생성
    const prResult = await createPRTool.execute({
      repository,
      title: generatePRTitle(analysis),
      body: generatePRBody(analysis, fixes),
      head: branchName,
      base: options?.baseBranch || 'main',
      labels: ['auto-fix', 'gemini'],
      draft: false,
    })

    if (!prResult.success) {
      return { success: false, error: 'PR creation failed: ' + prResult.error }
    }

    return {
      success: true,
      prNumber: prResult.prNumber,
      prUrl: prResult.prUrl,
      branch: branchName,
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function waitForCIAndMerge(
  repository: string,
  prNumber: number,
  options?: {
    timeout?: number
    autoMerge?: boolean
  }
): Promise<{
  ciPassed: boolean
  merged: boolean
  error?: string
}> {
  try {
    // PR 상태 확인
    const statusResult = await getPRStatusTool.execute({
      repository,
      prNumber,
    })

    if (!statusResult.success) {
      return { ciPassed: false, merged: false, error: statusResult.error }
    }

    // CI 대기
    const ciResult = await waitForCITool.execute({
      repository,
      ref: statusResult.headSha,
      timeout: options?.timeout || 600,
    })

    if (!ciResult.completed) {
      return { ciPassed: false, merged: false, error: 'CI timeout' }
    }

    if (!ciResult.passed) {
      return { ciPassed: false, merged: false, error: 'CI failed' }
    }

    if (!options?.autoMerge) {
      return { ciPassed: true, merged: false }
    }

    // 머지
    const mergeResult = await mergePRTool.execute({
      repository,
      prNumber,
      method: 'squash',
    })

    if (!mergeResult.success) {
      return { ciPassed: true, merged: false, error: mergeResult.error }
    }

    // 브랜치 삭제
    await deleteBranchTool.execute({
      repository,
      branch: 'auto-fix/' + prNumber,
    })

    return { ciPassed: true, merged: true }
  } catch (err) {
    return { ciPassed: false, merged: false, error: String(err) }
  }
}

function generateCommitMessage(analysis: ErrorAnalysisResult): string {
  const typePrefix = getCommitPrefix(analysis.errorType)
  return typePrefix + ': ' + analysis.summary
}

function generateCommitBody(analysis: ErrorAnalysisResult, fixes: CodeFix[]): string {
  const lines = [
    'Auto-fix generated by Gemini ADK',
    '',
    'Root cause: ' + analysis.rootCause,
    '',
    'Modified files:',
  ]

  for (const fix of fixes) {
    lines.push('- ' + fix.filePath + ': ' + fix.description)
  }

  return lines.join('\n')
}

function generatePRTitle(analysis: ErrorAnalysisResult): string {
  return '[Auto-Fix] ' + analysis.summary
}

function generatePRBody(analysis: ErrorAnalysisResult, fixes: CodeFix[]): string {
  const lines = [
    '## Summary',
    analysis.summary,
    '',
    '## Root Cause',
    analysis.rootCause,
    '',
    '## Changes',
  ]

  for (const fix of fixes) {
    lines.push('### ' + fix.filePath)
    lines.push(fix.description)
    lines.push('')
  }

  lines.push('---')
  lines.push('*This PR was auto-generated by Gemini ADK.*')
  lines.push('*Confidence: ' + (analysis.confidence * 100).toFixed(0) + '%*')

  return lines.join('\n')
}

function getCommitPrefix(errorType: string): string {
  switch (errorType) {
    case 'type':
      return 'fix(types)'
    case 'lint':
      return 'style'
    case 'test':
      return 'test'
    case 'build':
      return 'build'
    case 'runtime':
      return 'fix'
    default:
      return 'fix'
  }
}
