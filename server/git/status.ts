/**
 * Git 상태 파싱 유틸리티
 * OpenSpec Change: integrate-git-workflow
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitStatus {
  /** 현재 브랜치 이름 */
  branch: string
  /** 추적 중인 원격 브랜치 */
  upstream: string | null
  /** 원격보다 앞선 커밋 수 */
  ahead: number
  /** 원격보다 뒤처진 커밋 수 */
  behind: number
  /** staged 파일 목록 */
  staged: string[]
  /** modified 파일 목록 (unstaged) */
  modified: string[]
  /** untracked 파일 목록 */
  untracked: string[]
  /** deleted 파일 목록 */
  deleted: string[]
  /** 충돌 발생 여부 */
  hasConflicts: boolean
  /** 충돌 파일 목록 */
  conflictFiles: string[]
  /** 작업 중인 변경사항 존재 여부 */
  isDirty: boolean
  /** 마지막 커밋 해시 (short) */
  lastCommitHash: string | null
  /** 마지막 커밋 메시지 */
  lastCommitMessage: string | null
  /** Git 저장소 여부 */
  isGitRepo: boolean
}

/**
 * Git 상태 전체 조회
 */
export async function getGitStatus(cwd: string): Promise<GitStatus> {
  const defaultStatus: GitStatus = {
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked: [],
    deleted: [],
    hasConflicts: false,
    conflictFiles: [],
    isDirty: false,
    lastCommitHash: null,
    lastCommitMessage: null,
    isGitRepo: false,
  }

  try {
    // Git 저장소인지 확인
    await execAsync('git rev-parse --git-dir', { cwd })
    defaultStatus.isGitRepo = true
  } catch {
    return defaultStatus
  }

  try {
    // 브랜치 정보 조회
    const branchInfo = await getBranchInfo(cwd)
    defaultStatus.branch = branchInfo.branch
    defaultStatus.upstream = branchInfo.upstream
    defaultStatus.ahead = branchInfo.ahead
    defaultStatus.behind = branchInfo.behind

    // 파일 상태 조회
    const fileStatus = await getFileStatus(cwd)
    defaultStatus.staged = fileStatus.staged
    defaultStatus.modified = fileStatus.modified
    defaultStatus.untracked = fileStatus.untracked
    defaultStatus.deleted = fileStatus.deleted
    defaultStatus.hasConflicts = fileStatus.conflictFiles.length > 0
    defaultStatus.conflictFiles = fileStatus.conflictFiles
    defaultStatus.isDirty =
      fileStatus.staged.length > 0 ||
      fileStatus.modified.length > 0 ||
      fileStatus.untracked.length > 0 ||
      fileStatus.deleted.length > 0

    // 마지막 커밋 정보
    const lastCommit = await getLastCommit(cwd)
    defaultStatus.lastCommitHash = lastCommit.hash
    defaultStatus.lastCommitMessage = lastCommit.message

    return defaultStatus
  } catch (error) {
    console.error('Error getting git status:', error)
    return defaultStatus
  }
}

interface BranchInfo {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
}

async function getBranchInfo(cwd: string): Promise<BranchInfo> {
  const result: BranchInfo = {
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
  }

  try {
    // 현재 브랜치
    const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd })
    result.branch = branchOut.trim()

    // detached HEAD 상태 처리
    if (!result.branch) {
      const { stdout: headOut } = await execAsync('git rev-parse --short HEAD', { cwd })
      result.branch = `(HEAD detached at ${headOut.trim()})`
      return result
    }

    // 추적 브랜치 및 ahead/behind
    try {
      const { stdout: trackingOut } = await execAsync(
        `git rev-list --left-right --count ${result.branch}...@{upstream}`,
        { cwd }
      )
      const [ahead, behind] = trackingOut.trim().split(/\s+/).map(Number)
      result.ahead = ahead || 0
      result.behind = behind || 0

      // upstream 이름 조회
      const { stdout: upstreamOut } = await execAsync(
        `git rev-parse --abbrev-ref ${result.branch}@{upstream}`,
        { cwd }
      )
      result.upstream = upstreamOut.trim()
    } catch {
      // upstream이 설정되지 않은 경우
      result.upstream = null
    }
  } catch (error) {
    console.error('Error getting branch info:', error)
  }

  return result
}

interface FileStatus {
  staged: string[]
  modified: string[]
  untracked: string[]
  deleted: string[]
  conflictFiles: string[]
}

async function getFileStatus(cwd: string): Promise<FileStatus> {
  const status: FileStatus = {
    staged: [],
    modified: [],
    untracked: [],
    deleted: [],
    conflictFiles: [],
  }

  try {
    // git status --porcelain=v1 로 파일 상태 조회
    const { stdout } = await execAsync('git status --porcelain=v1', { cwd })
    const lines = stdout.split('\n').filter(Boolean)

    for (const line of lines) {
      const indexStatus = line[0] // 스테이징 영역 상태
      const workingStatus = line[1] // 워킹 디렉토리 상태
      const file = line.slice(3)

      // 충돌 파일 (UU, AA, DD 등)
      if (indexStatus === 'U' || workingStatus === 'U') {
        status.conflictFiles.push(file)
        continue
      }
      if (indexStatus === 'A' && workingStatus === 'A') {
        status.conflictFiles.push(file)
        continue
      }
      if (indexStatus === 'D' && workingStatus === 'D') {
        status.conflictFiles.push(file)
        continue
      }

      // Staged 파일
      if (indexStatus === 'M' || indexStatus === 'A' || indexStatus === 'R' || indexStatus === 'C') {
        status.staged.push(file)
      }
      if (indexStatus === 'D') {
        status.staged.push(file)
      }

      // Modified (unstaged)
      if (workingStatus === 'M') {
        status.modified.push(file)
      }

      // Deleted (unstaged)
      if (workingStatus === 'D') {
        status.deleted.push(file)
      }

      // Untracked
      if (indexStatus === '?' && workingStatus === '?') {
        status.untracked.push(file)
      }
    }
  } catch (error) {
    console.error('Error getting file status:', error)
  }

  return status
}

interface LastCommit {
  hash: string | null
  message: string | null
}

async function getLastCommit(cwd: string): Promise<LastCommit> {
  try {
    const { stdout: hashOut } = await execAsync('git rev-parse --short HEAD', { cwd })
    const { stdout: msgOut } = await execAsync('git log -1 --format=%s', { cwd })

    return {
      hash: hashOut.trim(),
      message: msgOut.trim(),
    }
  } catch {
    return { hash: null, message: null }
  }
}

/**
 * 원격 저장소 업데이트 상태 확인 (fetch 후)
 */
export async function checkRemoteUpdates(cwd: string): Promise<{
  hasUpdates: boolean
  behind: number
  remoteCommits: { hash: string; message: string }[]
}> {
  try {
    // 먼저 fetch 실행
    await execAsync('git fetch', { cwd, timeout: 30000 })

    // ahead/behind 확인
    const { stdout: countOut } = await execAsync(
      'git rev-list --left-right --count HEAD...@{upstream}',
      { cwd }
    )
    const [, behind] = countOut.trim().split(/\s+/).map(Number)

    if (!behind || behind === 0) {
      return { hasUpdates: false, behind: 0, remoteCommits: [] }
    }

    // 원격의 새 커밋 목록
    const { stdout: logOut } = await execAsync(
      `git log HEAD..@{upstream} --format="%h %s" -n 10`,
      { cwd }
    )
    const remoteCommits = logOut
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...msgParts] = line.split(' ')
        return { hash, message: msgParts.join(' ') }
      })

    return { hasUpdates: true, behind, remoteCommits }
  } catch {
    return { hasUpdates: false, behind: 0, remoteCommits: [] }
  }
}

/**
 * 충돌 가능성 사전 감지
 */
export async function detectPotentialConflicts(
  cwd: string
): Promise<{ hasPotentialConflicts: boolean; files: string[] }> {
  try {
    // dry-run merge로 충돌 파일 확인
    const { stderr } = await execAsync('git merge --no-commit --no-ff @{upstream} 2>&1', { cwd })

    // merge 취소
    await execAsync('git merge --abort', { cwd }).catch(() => {})

    if (stderr.includes('CONFLICT')) {
      const conflictFiles = stderr
        .split('\n')
        .filter((line) => line.includes('CONFLICT'))
        .map((line) => {
          const match = line.match(/CONFLICT.*?:\s*(.+)/)
          return match ? match[1].trim() : ''
        })
        .filter(Boolean)

      return { hasPotentialConflicts: true, files: conflictFiles }
    }

    return { hasPotentialConflicts: false, files: [] }
  } catch {
    return { hasPotentialConflicts: false, files: [] }
  }
}
