/**
 * Remote Server Configuration
 * 원격 서버 목록 및 프로젝트 설정 관리
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { nanoid } from 'nanoid'
import type { RemoteServer, RemoteProject, RemoteConfig, Project } from './types.js'

const CONFIG_DIR = join(homedir(), '.zyflow')
const REMOTE_CONFIG_FILE = join(CONFIG_DIR, 'remote-servers.json')

const DEFAULT_CONFIG: RemoteConfig = {
  servers: [],
}

/**
 * 설정 디렉토리 확인/생성
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true })
  } catch {
    // Directory exists
  }
}

/**
 * 원격 서버 설정 로드
 */
export async function loadRemoteConfig(): Promise<RemoteConfig> {
  try {
    await ensureConfigDir()
    const content = await readFile(REMOTE_CONFIG_FILE, 'utf-8')
    return JSON.parse(content) as RemoteConfig
  } catch {
    return DEFAULT_CONFIG
  }
}

/**
 * 원격 서버 설정 저장
 */
export async function saveRemoteConfig(config: RemoteConfig): Promise<void> {
  await ensureConfigDir()
  await writeFile(REMOTE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * 모든 원격 서버 조회
 */
export async function getRemoteServers(): Promise<RemoteServer[]> {
  const config = await loadRemoteConfig()
  return config.servers
}

/**
 * ID로 원격 서버 조회
 */
export async function getRemoteServerById(serverId: string): Promise<RemoteServer | null> {
  const config = await loadRemoteConfig()
  return config.servers.find((s) => s.id === serverId) || null
}

/**
 * 원격 서버 추가
 */
export async function addRemoteServer(server: Omit<RemoteServer, 'id' | 'createdAt'>): Promise<RemoteServer> {
  const config = await loadRemoteConfig()

  // 중복 체크 (같은 호스트+포트+사용자)
  const existing = config.servers.find(
    (s) => s.host === server.host && s.port === server.port && s.auth.username === server.auth.username
  )
  if (existing) {
    throw new Error(`Server already exists: ${existing.name}`)
  }

  const newServer: RemoteServer = {
    ...server,
    id: `server-${nanoid(8)}`,
    createdAt: new Date().toISOString(),
  }

  config.servers.push(newServer)
  await saveRemoteConfig(config)

  return newServer
}

/**
 * 원격 서버 수정
 */
export async function updateRemoteServer(
  serverId: string,
  updates: Partial<Omit<RemoteServer, 'id' | 'createdAt'>>
): Promise<RemoteServer> {
  const config = await loadRemoteConfig()
  const index = config.servers.findIndex((s) => s.id === serverId)

  if (index === -1) {
    throw new Error(`Server not found: ${serverId}`)
  }

  config.servers[index] = {
    ...config.servers[index],
    ...updates,
  }

  await saveRemoteConfig(config)
  return config.servers[index]
}

/**
 * 원격 서버 삭제
 */
export async function removeRemoteServer(serverId: string): Promise<void> {
  const config = await loadRemoteConfig()
  config.servers = config.servers.filter((s) => s.id !== serverId)
  await saveRemoteConfig(config)
}

/**
 * 마지막 연결 시간 업데이트
 */
export async function updateLastConnected(serverId: string): Promise<void> {
  const config = await loadRemoteConfig()
  const server = config.servers.find((s) => s.id === serverId)

  if (server) {
    server.lastConnectedAt = new Date().toISOString()
    await saveRemoteConfig(config)
  }
}

// ============================================
// 통합 프로젝트 관리 (로컬 + 원격)
// ============================================

// 기존 config.ts의 인터페이스와 통합
interface IntegratedConfig {
  projects: Project[]
  activeProjectId: string | null
}

const MAIN_CONFIG_FILE = join(CONFIG_DIR, 'config.json')

/**
 * 통합 설정 로드
 */
export async function loadIntegratedConfig(): Promise<IntegratedConfig> {
  try {
    await ensureConfigDir()
    const content = await readFile(MAIN_CONFIG_FILE, 'utf-8')
    return JSON.parse(content) as IntegratedConfig
  } catch {
    return { projects: [], activeProjectId: null }
  }
}

/**
 * 통합 설정 저장
 */
export async function saveIntegratedConfig(config: IntegratedConfig): Promise<void> {
  await ensureConfigDir()
  await writeFile(MAIN_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * 원격 프로젝트 추가
 */
export async function addRemoteProject(
  serverId: string,
  name: string,
  path: string
): Promise<Project> {
  const server = await getRemoteServerById(serverId)
  if (!server) {
    throw new Error(`Server not found: ${serverId}`)
  }

  const config = await loadIntegratedConfig()

  // ID 생성 (서버ID + 경로 기반)
  const id = `${serverId}-${path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`

  // 중복 체크
  const existing = config.projects.find((p) => p.id === id)
  if (existing) {
    return existing
  }

  const project: Project = {
    id,
    name,
    path,
    addedAt: new Date().toISOString(),
    remote: {
      type: 'ssh',
      serverId,
      host: server.host,
      user: server.auth.username,
    },
  }

  config.projects.push(project)

  // 첫 프로젝트면 활성화
  if (!config.activeProjectId) {
    config.activeProjectId = project.id
  }

  await saveIntegratedConfig(config)
  return project
}

/**
 * 프로젝트가 원격인지 확인
 */
export function isRemoteProject(project: Project): boolean {
  return !!project.remote
}

/**
 * 원격 프로젝트의 서버 정보 조회
 */
export async function getServerForProject(project: Project): Promise<RemoteServer | null> {
  if (!project.remote) return null
  return getRemoteServerById(project.remote.serverId)
}
