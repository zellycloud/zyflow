/**
 * SSH Config Parser
 * ~/.ssh/config 파일을 파싱하여 서버 목록 추출
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export interface SSHConfigHost {
  name: string // Host alias (e.g., "e1", "j3")
  hostName: string // Actual hostname/IP
  user: string
  port: number
  identityFile?: string
}

/**
 * ~/.ssh/config 파일 파싱
 */
export async function parseSSHConfig(): Promise<SSHConfigHost[]> {
  const configPath = join(homedir(), '.ssh', 'config')

  try {
    const content = await readFile(configPath, 'utf-8')
    return parseConfigContent(content)
  } catch (err) {
    console.error('[SSH Config] Failed to read config:', err)
    return []
  }
}

/**
 * SSH config 내용 파싱
 */
function parseConfigContent(content: string): SSHConfigHost[] {
  const hosts: SSHConfigHost[] = []
  const lines = content.split('\n')

  let currentHost: Partial<SSHConfigHost> | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // 주석이나 빈 줄 스킵
    if (!line || line.startsWith('#')) {
      continue
    }

    // Include 지시문 스킵
    if (line.toLowerCase().startsWith('include')) {
      continue
    }

    // Host 블록 시작
    if (line.toLowerCase().startsWith('host ')) {
      // 이전 호스트 저장
      if (currentHost && currentHost.name && currentHost.hostName) {
        hosts.push({
          name: currentHost.name,
          hostName: currentHost.hostName,
          user: currentHost.user || 'root',
          port: currentHost.port || 22,
          identityFile: currentHost.identityFile,
        })
      }

      const hostName = line.substring(5).trim()

      // 와일드카드 호스트는 스킵 (*, ?)
      if (hostName.includes('*') || hostName.includes('?')) {
        currentHost = null
        continue
      }

      currentHost = { name: hostName }
      continue
    }

    // Host 블록 내의 속성
    if (currentHost) {
      const [key, ...valueParts] = line.split(/\s+/)
      const value = valueParts.join(' ')

      switch (key.toLowerCase()) {
        case 'hostname':
          currentHost.hostName = value
          break
        case 'user':
          currentHost.user = value
          break
        case 'port':
          currentHost.port = parseInt(value, 10) || 22
          break
        case 'identityfile':
          // ~ 를 홈 디렉토리로 치환
          currentHost.identityFile = value.replace(/^~/, homedir())
          break
      }
    }
  }

  // 마지막 호스트 저장
  if (currentHost && currentHost.name && currentHost.hostName) {
    hosts.push({
      name: currentHost.name,
      hostName: currentHost.hostName,
      user: currentHost.user || 'root',
      port: currentHost.port || 22,
      identityFile: currentHost.identityFile,
    })
  }

  return hosts
}

/**
 * SSH config에서 특정 호스트 찾기
 */
export async function findSSHConfigHost(alias: string): Promise<SSHConfigHost | null> {
  const hosts = await parseSSHConfig()
  return hosts.find((h) => h.name === alias) || null
}
