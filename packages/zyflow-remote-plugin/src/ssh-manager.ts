/**
 * SSH Connection Manager
 * SSH 연결 풀 관리 및 SFTP/명령어 실행 프록시
 */

import { Client, SFTPWrapper, ConnectConfig } from 'ssh2'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
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

// SFTP 핸드셰이크 타임아웃 (15초)
const SFTP_HANDSHAKE_TIMEOUT = 15 * 1000

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

// SSH 재시도 설정
const SSH_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 2000,
  backoffMultiplier: 2,
  retryableErrors: new Set(['ENETUNREACH', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH']),
}

/**
 * NetBird CGNAT 범위 IP 여부 확인 (100.64.0.0/10)
 */
function isNetBirdIP(host: string): boolean {
  const match = host.match(/^100\.(\d+)\./)
  if (!match) return false
  const secondOctet = parseInt(match[1], 10)
  return secondOctet >= 64 && secondOctet <= 127
}

/**
 * 로컬 NetBird IP 주소 감지
 */
async function getNetBirdLocalIP(): Promise<string | null> {
  try {
    // Method 1: netbird status 명령어로 IP 추출
    try {
      const output = execSync('netbird status', { encoding: 'utf-8', timeout: 5000 })
      // NetBird status 출력에서 IP 패턴 찾기
      // 예: "NetBird IP: 100.79.73.53/16"
      const match = output.match(/(?:NetBird IP|IP):\s+(\d+\.\d+\.\d+\.\d+)/)
      if (match) {
        const ip = match[1]
        if (isNetBirdIP(ip)) {
          console.log(`[SSH] Detected NetBird IP from status: ${ip}`)
          return ip
        }
      }
    } catch {
      // NetBird CLI 실패, 다음 방법 시도
    }

    // Method 2: 네트워크 인터페이스에서 100.64/10 범위 IP 검색
    try {
      const output = execSync('ifconfig', { encoding: 'utf-8', timeout: 5000 })
      // NetBird는 보통 wt0, utun 등의 인터페이스 사용
      // 모든 inet 주소 추출
      const matches = output.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g)
      for (const match of matches) {
        const ip = match[1]
        if (isNetBirdIP(ip)) {
          console.log(`[SSH] Detected NetBird IP from ifconfig: ${ip}`)
          return ip
        }
      }
    } catch {
      // ifconfig 실패
    }

    console.warn('[SSH] Could not detect local NetBird IP')
    return null
  } catch (err) {
    console.error('[SSH] Error detecting NetBird IP:', err)
    return null
  }
}

/**
 * SSH 연결 설정 생성
 */
async function buildConnectConfig(server: RemoteServer): Promise<ConnectConfig> {
  const config: ConnectConfig = {
    host: server.host,
    port: server.port,
    username: server.auth.username,
    readyTimeout: 30000, // Increased from 10s for NetBird latency
    keepaliveInterval: 30000,
    debug: (msg: string) => {
      console.log(`[SSH Debug] ${server.name}: ${msg}`)
    },
  }

  // NetBird 네트워크 바인딩 처리
  if (isNetBirdIP(server.host)) {
    const localIP = await getNetBirdLocalIP()
    if (localIP) {
      config.localAddress = localIP
      console.log(`[SSH] Binding to NetBird interface: ${localIP} → ${server.host}`)
    } else {
      console.warn(`[SSH] Target is NetBird IP (${server.host}) but local NetBird IP not found`)
      console.warn(`[SSH] Connection may fail with ENETUNREACH. Ensure NetBird is running.`)
    }
  }

  // 연결 정보 로깅
  console.log(`[SSH] Connecting to ${server.name} (${server.host}:${server.port})`)
  console.log(`[SSH] Auth: ${server.auth.type}, User: ${server.auth.username}`)

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
        console.log(`[SSH] Using private key: ${keyPath}`)
      } catch (err) {
        throw new Error(`Failed to read private key: ${keyPath}`)
      }
      break
    }

    case 'agent':
      // SSH agent 사용 (macOS/Linux)
      config.agent = process.env.SSH_AUTH_SOCK
      console.log(`[SSH] Using SSH agent`)
      break
  }

  return config
}

/**
 * SSH 연결 획득 (풀에서 가져오거나 새로 생성, 재시도 로직 포함)
 */
export async function getConnection(server: RemoteServer, attempt = 1): Promise<Client> {
  const existing = connections.get(server.id)

  if (existing && existing.status === 'connected') {
    existing.lastUsed = Date.now()
    return existing.client
  }

  try {
    return await attemptConnection(server)
  } catch (err) {
    const isRetryable = SSH_RETRY_CONFIG.retryableErrors.has((err as any).code)

    if (isRetryable && attempt < SSH_RETRY_CONFIG.maxAttempts) {
      const delay = SSH_RETRY_CONFIG.initialDelay *
                    Math.pow(SSH_RETRY_CONFIG.backoffMultiplier, attempt - 1)

      console.log(
        `[SSH] Connection failed (${(err as any).code}): ${(err as any).message}`
      )
      console.log(
        `[SSH] Retrying in ${delay}ms (attempt ${attempt + 1}/${SSH_RETRY_CONFIG.maxAttempts})`
      )

      await new Promise(resolve => setTimeout(resolve, delay))
      return getConnection(server, attempt + 1)
    }

    // Max retries exceeded or non-retryable error
    console.error(
      `[SSH] Connection failed after ${attempt} attempt(s): ${(err as any).code} - ${(err as any).message}`
    )
    throw err
  }
}

/**
 * 단일 SSH 연결 시도
 */
async function attemptConnection(server: RemoteServer): Promise<Client> {
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

    const connectTimeout = setTimeout(() => {
      client.end()
      const err = new Error('SSH connection timeout')
      ;(err as any).code = 'ETIMEDOUT'
      reject(err)
    }, (config.readyTimeout || 30000) + 5000)

    client.on('ready', () => {
      clearTimeout(connectTimeout)
      entry.status = 'connected'
      entry.lastUsed = Date.now()
      console.log(`[SSH] ✓ Connected to ${server.name} (${server.host})`)
      resolve(client)
    })

    client.on('error', (err) => {
      clearTimeout(connectTimeout)
      console.error(`[SSH] ✗ Error connecting to ${server.name}:`, {
        code: (err as any).code,
        level: (err as any).level,
        message: err.message,
      })
      entry.status = 'error'
      entry.error = `${(err as any).code || 'UNKNOWN'}: ${err.message}`
      connections.delete(server.id)
      reject(err)
    })

    client.on('close', () => {
      clearTimeout(connectTimeout)
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
    const timeoutId = setTimeout(() => {
      const err = new Error('SFTP handshake timeout')
      ;(err as NodeJS.ErrnoException).code = 'ESFTP_TIMEOUT'
      reject(err)
    }, SFTP_HANDSHAKE_TIMEOUT)

    client.sftp((err, sftp) => {
      clearTimeout(timeoutId)

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
