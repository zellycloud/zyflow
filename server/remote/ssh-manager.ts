/**
 * SSH Connection Manager
 * SSH 연결 풀 관리 및 SFTP/명령어 실행 프록시
 */

import { Client, SFTPWrapper, ConnectConfig } from 'ssh2'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type {
  RemoteServer,
  ConnectionStatus,
  RemoteFileEntry,
  RemoteDirectoryListing,
  RemoteCommandResult,
  RemoteGitStatus,
} from './types.js'

interface ConnectionEntry {
  client: Client
  sftp: SFTPWrapper | null
  status: ConnectionStatus
  lastUsed: number
  error?: string
}

// 연결 풀
const connections = new Map<string, ConnectionEntry>()

// 연결 타임아웃 (5분)
const CONNECTION_TIMEOUT = 5 * 60 * 1000

// 정기적으로 유휴 연결 정리
setInterval(() => {
  const now = Date.now()
  for (const [serverId, entry] of connections) {
    if (now - entry.lastUsed > CONNECTION_TIMEOUT) {
      console.log(`[SSH] Closing idle connection: ${serverId}`)
      entry.client.end()
      connections.delete(serverId)
    }
  }
}, 60 * 1000)

/**
 * SSH 연결 설정 생성
 */
async function buildConnectConfig(server: RemoteServer): Promise<ConnectConfig> {
  const config: ConnectConfig = {
    host: server.host,
    port: server.port,
    username: server.auth.username,
    readyTimeout: 10000,
    keepaliveInterval: 30000,
  }

  switch (server.auth.type) {
    case 'password':
      config.password = server.auth.password
      break

    case 'privateKey': {
      const keyPath = server.auth.privateKeyPath?.replace('~', homedir())
        || join(homedir(), '.ssh', 'id_rsa')
      try {
        config.privateKey = await readFile(keyPath, 'utf-8')
        if (server.auth.passphrase) {
          config.passphrase = server.auth.passphrase
        }
      } catch (err) {
        throw new Error(`Failed to read private key: ${keyPath}`)
      }
      break
    }

    case 'agent':
      // SSH agent 사용 (macOS/Linux)
      config.agent = process.env.SSH_AUTH_SOCK
      break
  }

  return config
}

/**
 * SSH 연결 획득 (풀에서 가져오거나 새로 생성)
 */
export async function getConnection(server: RemoteServer): Promise<Client> {
  const existing = connections.get(server.id)

  if (existing && existing.status === 'connected') {
    existing.lastUsed = Date.now()
    return existing.client
  }

  // 새 연결 생성
  const client = new Client()
  const config = await buildConnectConfig(server)

  return new Promise((resolve, reject) => {
    const entry: ConnectionEntry = {
      client,
      sftp: null,
      status: 'connecting',
      lastUsed: Date.now(),
    }
    connections.set(server.id, entry)

    client.on('ready', () => {
      entry.status = 'connected'
      entry.lastUsed = Date.now()
      console.log(`[SSH] Connected to ${server.name} (${server.host})`)
      resolve(client)
    })

    client.on('error', (err) => {
      entry.status = 'error'
      entry.error = err.message
      connections.delete(server.id)
      reject(err)
    })

    client.on('close', () => {
      entry.status = 'disconnected'
      connections.delete(server.id)
    })

    client.connect(config)
  })
}

/**
 * SFTP 세션 획득
 */
export async function getSFTP(server: RemoteServer): Promise<SFTPWrapper> {
  const entry = connections.get(server.id)

  if (entry?.sftp) {
    entry.lastUsed = Date.now()
    return entry.sftp
  }

  const client = await getConnection(server)

  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        reject(err)
        return
      }

      const entry = connections.get(server.id)
      if (entry) {
        entry.sftp = sftp
        entry.lastUsed = Date.now()
      }

      resolve(sftp)
    })
  })
}

/**
 * 연결 종료
 */
export function closeConnection(serverId: string): void {
  const entry = connections.get(serverId)
  if (entry) {
    entry.client.end()
    connections.delete(serverId)
  }
}

/**
 * 연결 상태 조회
 */
export function getConnectionStatus(serverId: string): ConnectionStatus {
  return connections.get(serverId)?.status || 'disconnected'
}

/**
 * 원격 명령어 실행
 */
export async function executeCommand(
  server: RemoteServer,
  command: string,
  options?: { cwd?: string; timeout?: number }
): Promise<RemoteCommandResult> {
  const client = await getConnection(server)

  return new Promise((resolve, reject) => {
    const fullCommand = options?.cwd
      ? `cd "${options.cwd}" && ${command}`
      : command

    client.exec(fullCommand, { pty: false }, (err, stream) => {
      if (err) {
        reject(err)
        return
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      stream.on('close', (exitCode: number) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 })
      })

      // 타임아웃 설정
      if (options?.timeout) {
        setTimeout(() => {
          stream.close()
          reject(new Error('Command timeout'))
        }, options.timeout)
      }
    })
  })
}

/**
 * 디렉토리 목록 조회
 */
export async function listDirectory(
  server: RemoteServer,
  path: string
): Promise<RemoteDirectoryListing> {
  const sftp = await getSFTP(server)

  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) {
        reject(err)
        return
      }

      const entries: RemoteFileEntry[] = list.map((item) => ({
        name: item.filename,
        path: `${path}/${item.filename}`.replace(/\/+/g, '/'),
        type: item.attrs.isDirectory()
          ? 'directory'
          : item.attrs.isSymbolicLink()
            ? 'symlink'
            : 'file',
        size: item.attrs.size,
        modifiedAt: new Date(item.attrs.mtime * 1000).toISOString(),
        permissions: item.attrs.mode?.toString(8).slice(-3) || '644',
      }))

      // 디렉토리 우선, 알파벳 순 정렬
      entries.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      })

      resolve({ path, entries })
    })
  })
}

/**
 * 파일 읽기
 */
export async function readRemoteFile(
  server: RemoteServer,
  path: string
): Promise<string> {
  const sftp = await getSFTP(server)

  return new Promise((resolve, reject) => {
    sftp.readFile(path, 'utf-8', (err, data) => {
      if (err) {
        reject(err)
        return
      }
      resolve(data.toString())
    })
  })
}

/**
 * 파일 쓰기
 */
export async function writeRemoteFile(
  server: RemoteServer,
  path: string,
  content: string
): Promise<void> {
  const sftp = await getSFTP(server)

  return new Promise((resolve, reject) => {
    sftp.writeFile(path, content, 'utf-8', (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

/**
 * 파일/디렉토리 존재 확인
 */
export async function exists(
  server: RemoteServer,
  path: string
): Promise<boolean> {
  const sftp = await getSFTP(server)

  return new Promise((resolve) => {
    sftp.stat(path, (err) => {
      resolve(!err)
    })
  })
}

/**
 * Git 상태 조회
 */
export async function getGitStatus(
  server: RemoteServer,
  projectPath: string
): Promise<RemoteGitStatus> {
  // 브랜치 정보
  const branchResult = await executeCommand(server, 'git rev-parse --abbrev-ref HEAD', { cwd: projectPath })
  const branch = branchResult.stdout.trim()

  // ahead/behind
  const trackResult = await executeCommand(
    server,
    'git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "0 0"',
    { cwd: projectPath }
  )
  const [ahead, behind] = trackResult.stdout.trim().split(/\s+/).map(Number)

  // staged files
  const stagedResult = await executeCommand(
    server,
    'git diff --cached --name-only',
    { cwd: projectPath }
  )
  const staged = stagedResult.stdout.trim().split('\n').filter(Boolean)

  // modified files
  const modifiedResult = await executeCommand(
    server,
    'git diff --name-only',
    { cwd: projectPath }
  )
  const modified = modifiedResult.stdout.trim().split('\n').filter(Boolean)

  // untracked files
  const untrackedResult = await executeCommand(
    server,
    'git ls-files --others --exclude-standard',
    { cwd: projectPath }
  )
  const untracked = untrackedResult.stdout.trim().split('\n').filter(Boolean)

  return {
    branch,
    ahead: ahead || 0,
    behind: behind || 0,
    staged,
    modified,
    untracked,
  }
}

/**
 * Git pull 실행
 */
export async function gitPull(
  server: RemoteServer,
  projectPath: string
): Promise<RemoteCommandResult> {
  return executeCommand(server, 'git pull', { cwd: projectPath })
}

/**
 * Git push 실행
 */
export async function gitPush(
  server: RemoteServer,
  projectPath: string
): Promise<RemoteCommandResult> {
  return executeCommand(server, 'git push', { cwd: projectPath })
}

/**
 * 연결 테스트
 */
export async function testConnection(server: RemoteServer): Promise<{
  success: boolean
  message: string
  serverInfo?: { os: string; hostname: string }
}> {
  try {
    await getConnection(server)

    // 서버 정보 조회
    const [osResult, hostnameResult] = await Promise.all([
      executeCommand(server, 'uname -s'),
      executeCommand(server, 'hostname'),
    ])

    return {
      success: true,
      message: 'Connection successful',
      serverInfo: {
        os: osResult.stdout.trim(),
        hostname: hostnameResult.stdout.trim(),
      },
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

/**
 * 모든 연결 종료
 */
export function closeAllConnections(): void {
  for (const [serverId, entry] of connections) {
    console.log(`[SSH] Closing connection: ${serverId}`)
    entry.client.end()
  }
  connections.clear()
}

/**
 * 활성 연결 수 조회
 */
export function getActiveConnectionCount(): number {
  return connections.size
}
