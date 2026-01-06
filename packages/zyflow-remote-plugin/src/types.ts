/**
 * Remote Connection Types
 * 원격 서버 연결 및 프로젝트 관리를 위한 타입 정의
 */

// 원격 연결 타입
export type RemoteConnectionType = 'ssh' | 'docker' | 'wsl'

// 인증 방식
export type RemoteAuthType = 'password' | 'privateKey' | 'agent'

// 연결 상태
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// SSH 인증 설정
export interface SSHAuthConfig {
  type: RemoteAuthType
  username: string
  password?: string // password auth
  privateKeyPath?: string // privateKey auth
  passphrase?: string // privateKey passphrase
}

// 원격 서버 설정
export interface RemoteServer {
  id: string
  name: string // 표시 이름 (예: "Production Server")
  host: string // 호스트명 또는 IP
  port: number // SSH 포트 (기본 22)
  auth: SSHAuthConfig
  // 메타데이터
  createdAt: string
  lastConnectedAt?: string
  // 상태 (런타임)
  status?: ConnectionStatus
  error?: string
}

// 원격 프로젝트 (로컬 프로젝트 확장)
export interface RemoteProject {
  id: string
  name: string
  path: string // 원격 서버 내 경로
  serverId: string // 연결된 서버 ID
  addedAt: string
  // 원격 전용 필드
  remote: {
    type: 'ssh'
    host: string
    user: string
  }
}

// 기존 Project와 통합된 타입
export interface Project {
  id: string
  name: string
  path: string
  addedAt: string
  // 원격 연결 정보 (optional - 로컬 프로젝트는 없음)
  remote?: {
    type: RemoteConnectionType
    serverId: string
    host: string
    user: string
  }
}

// 원격 서버 목록 설정
export interface RemoteConfig {
  servers: RemoteServer[]
}

// 파일 시스템 항목
export interface RemoteFileEntry {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modifiedAt: string
  permissions: string
}

// 디렉토리 목록 응답
export interface RemoteDirectoryListing {
  path: string
  entries: RemoteFileEntry[]
}

// Git 상태 응답
export interface RemoteGitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
}

// 명령어 실행 결과
export interface RemoteCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

// API 요청/응답 타입
export interface AddRemoteServerRequest {
  name: string
  host: string
  port?: number
  auth: SSHAuthConfig
}

export interface AddRemoteProjectRequest {
  serverId: string
  name: string
  path: string
}

export interface TestConnectionRequest {
  serverId: string
}

export interface TestConnectionResponse {
  success: boolean
  message: string
  serverInfo?: {
    os: string
    hostname: string
  }
}

export interface BrowseRemoteRequest {
  serverId: string
  path: string
}

export interface BrowseRemoteResponse {
  listing: RemoteDirectoryListing
}

export interface RemoteServersResponse {
  servers: RemoteServer[]
}

export interface RemoteProjectsResponse {
  projects: RemoteProject[]
}
