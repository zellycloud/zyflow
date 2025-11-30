/**
 * Git 명령 래퍼 함수들
 * OpenSpec Change: integrate-git-workflow
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitCommandResult {
  success: boolean
  stdout: string
  stderr: string
  error?: string
}

/**
 * Git 명령 실행 헬퍼
 */
async function runGitCommand(
  command: string,
  cwd: string,
  options: { timeout?: number } = {}
): Promise<GitCommandResult> {
  const timeout = options.timeout || 30000 // 기본 30초 타임아웃

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB 버퍼
    })
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      success: false,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      error: err.message,
    }
  }
}

/**
 * Git pull 실행 (fast-forward only)
 */
export async function gitPull(cwd: string): Promise<GitCommandResult> {
  return runGitCommand('git pull --ff-only', cwd)
}

/**
 * Git push 실행
 */
export async function gitPush(
  cwd: string,
  options: { remote?: string; branch?: string; force?: boolean } = {}
): Promise<GitCommandResult> {
  const { remote = 'origin', branch, force = false } = options
  let command = `git push ${remote}`
  if (branch) command += ` ${branch}`
  if (force) command += ' --force-with-lease'
  return runGitCommand(command, cwd)
}

/**
 * Git fetch 실행
 */
export async function gitFetch(
  cwd: string,
  options: { remote?: string; all?: boolean } = {}
): Promise<GitCommandResult> {
  const { remote = 'origin', all = false } = options
  const command = all ? 'git fetch --all' : `git fetch ${remote}`
  return runGitCommand(command, cwd)
}

/**
 * Git commit 실행
 */
export async function gitCommit(
  cwd: string,
  message: string,
  options: { all?: boolean } = {}
): Promise<GitCommandResult> {
  const { all = false } = options
  // 메시지 내 특수문자 이스케이프
  const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$')
  let command = 'git commit'
  if (all) command += ' -a'
  command += ` -m "${escapedMessage}"`
  return runGitCommand(command, cwd)
}

/**
 * Git add 실행
 */
export async function gitAdd(
  cwd: string,
  files: string[] | '.' = '.'
): Promise<GitCommandResult> {
  const target = Array.isArray(files) ? files.join(' ') : files
  return runGitCommand(`git add ${target}`, cwd)
}

/**
 * Git branch 목록 조회
 */
export async function gitBranches(
  cwd: string,
  options: { all?: boolean; remote?: boolean } = {}
): Promise<GitCommandResult> {
  const { all = false, remote = false } = options
  let command = 'git branch'
  if (all) command += ' -a'
  else if (remote) command += ' -r'
  command += ' --format="%(refname:short)"'
  return runGitCommand(command, cwd)
}

/**
 * Git checkout 실행
 */
export async function gitCheckout(
  cwd: string,
  branch: string,
  options: { create?: boolean } = {}
): Promise<GitCommandResult> {
  const { create = false } = options
  const command = create ? `git checkout -b ${branch}` : `git checkout ${branch}`
  return runGitCommand(command, cwd)
}

/**
 * Git branch 생성
 */
export async function gitCreateBranch(
  cwd: string,
  branchName: string,
  baseBranch?: string
): Promise<GitCommandResult> {
  let command = `git branch ${branchName}`
  if (baseBranch) command += ` ${baseBranch}`
  return runGitCommand(command, cwd)
}

/**
 * Git branch 삭제
 */
export async function gitDeleteBranch(
  cwd: string,
  branchName: string,
  options: { force?: boolean } = {}
): Promise<GitCommandResult> {
  const { force = false } = options
  const flag = force ? '-D' : '-d'
  return runGitCommand(`git branch ${flag} ${branchName}`, cwd)
}

/**
 * Git stash 실행
 */
export async function gitStash(
  cwd: string,
  options: { pop?: boolean; message?: string } = {}
): Promise<GitCommandResult> {
  const { pop = false, message } = options
  if (pop) {
    return runGitCommand('git stash pop', cwd)
  }
  const command = message
    ? `git stash push -m "${message.replace(/"/g, '\\"')}"`
    : 'git stash push'
  return runGitCommand(command, cwd)
}

/**
 * Git reset 실행
 */
export async function gitReset(
  cwd: string,
  options: { hard?: boolean; ref?: string } = {}
): Promise<GitCommandResult> {
  const { hard = false, ref = 'HEAD' } = options
  const mode = hard ? '--hard' : '--mixed'
  return runGitCommand(`git reset ${mode} ${ref}`, cwd)
}

/**
 * Git log 조회
 */
export async function gitLog(
  cwd: string,
  options: { limit?: number; format?: string; oneline?: boolean } = {}
): Promise<GitCommandResult> {
  const { limit = 10, format, oneline = false } = options
  let command = `git log -n ${limit}`
  if (oneline) {
    command += ' --oneline'
  } else if (format) {
    command += ` --format="${format}"`
  }
  return runGitCommand(command, cwd)
}

/**
 * Git diff 조회
 */
export async function gitDiff(
  cwd: string,
  options: { staged?: boolean; files?: string[] } = {}
): Promise<GitCommandResult> {
  const { staged = false, files = [] } = options
  let command = 'git diff'
  if (staged) command += ' --staged'
  if (files.length > 0) command += ' -- ' + files.join(' ')
  return runGitCommand(command, cwd)
}

/**
 * Git remote 조회
 */
export async function gitRemotes(cwd: string): Promise<GitCommandResult> {
  return runGitCommand('git remote -v', cwd)
}

/**
 * Git config 조회/설정
 */
export async function gitConfig(
  cwd: string,
  key: string,
  value?: string,
  options: { global?: boolean } = {}
): Promise<GitCommandResult> {
  const { global = false } = options
  const scope = global ? '--global' : '--local'
  const command = value
    ? `git config ${scope} ${key} "${value.replace(/"/g, '\\"')}"`
    : `git config ${scope} ${key}`
  return runGitCommand(command, cwd)
}

/**
 * Git merge 실행
 */
export async function gitMerge(
  cwd: string,
  branch: string,
  options: { noCommit?: boolean; noFf?: boolean } = {}
): Promise<GitCommandResult> {
  const { noCommit = false, noFf = false } = options
  let command = `git merge ${branch}`
  if (noCommit) command += ' --no-commit'
  if (noFf) command += ' --no-ff'
  return runGitCommand(command, cwd)
}

/**
 * Git merge --abort 실행
 */
export async function gitMergeAbort(cwd: string): Promise<GitCommandResult> {
  return runGitCommand('git merge --abort', cwd)
}

/**
 * Git checkout 특정 버전으로 파일 복원
 * strategy: 'ours' = 현재 브랜치 버전, 'theirs' = 병합 대상 브랜치 버전
 */
export async function gitCheckoutConflict(
  cwd: string,
  file: string,
  strategy: 'ours' | 'theirs'
): Promise<GitCommandResult> {
  return runGitCommand(`git checkout --${strategy} "${file}"`, cwd)
}

/**
 * 충돌 파일 목록 조회
 */
export async function gitConflictFiles(cwd: string): Promise<GitCommandResult> {
  return runGitCommand('git diff --name-only --diff-filter=U', cwd)
}

/**
 * 충돌 파일 내용 조회 (충돌 마커 포함)
 */
export async function gitShowConflict(cwd: string, file: string): Promise<GitCommandResult> {
  return runGitCommand(`cat "${file}"`, cwd)
}

/**
 * Git merge --continue 실행 (충돌 해결 후)
 */
export async function gitMergeContinue(cwd: string): Promise<GitCommandResult> {
  return runGitCommand('git -c core.editor=true merge --continue', cwd)
}
