/**
 * ZyFlow Remote Plugin
 * SSH 기반 원격 서버 연결 및 프로젝트 관리 플러그인
 */

// Types
export type {
  RemoteConnectionType,
  RemoteAuthType,
  ConnectionStatus,
  SSHAuthConfig,
  RemoteServer,
  RemoteProject,
  Project,
  RemoteConfig,
  RemoteFileEntry,
  RemoteDirectoryListing,
  RemoteGitStatus,
  RemoteCommandResult,
  AddRemoteServerRequest,
  AddRemoteProjectRequest,
  TestConnectionRequest,
  TestConnectionResponse,
  BrowseRemoteRequest,
  BrowseRemoteResponse,
  RemoteServersResponse,
  RemoteProjectsResponse,
} from './types.js'

// SSH Config Parser
export { parseSSHConfig, findSSHConfigHost } from './ssh-config-parser.js'
export type { SSHConfigHost } from './ssh-config-parser.js'

// SSH Manager
export {
  getConnection,
  getSFTP,
  closeConnection,
  getConnectionStatus,
  executeCommand,
  listDirectory,
  readRemoteFile,
  writeRemoteFile,
  exists,
  getGitStatus,
  gitPull,
  gitPush,
  testConnection,
  closeAllConnections,
  getActiveConnectionCount,
} from './ssh-manager.js'

// Remote Config
export {
  loadRemoteConfig,
  saveRemoteConfig,
  getRemoteServers,
  getRemoteServerById,
  addRemoteServer,
  updateRemoteServer,
  removeRemoteServer,
  updateLastConnected,
  loadIntegratedConfig,
  saveIntegratedConfig,
  addRemoteProject,
  isRemoteProject,
  getServerForProject,
} from './remote-config.js'

// Router
export { default as remoteRouter } from './router.js'
