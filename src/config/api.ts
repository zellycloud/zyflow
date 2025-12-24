/**
 * API Configuration
 *
 * 환경변수 기반 API 엔드포인트 중앙 관리
 * - 개발: http://localhost:3001
 * - 프로덕션: 환경변수로 설정
 */

// API Base URL (환경변수 우선, 없으면 개발 서버 기본값)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// API 엔드포인트
export const API_ENDPOINTS = {
  // Base
  base: `${API_BASE_URL}/api`,
  health: `${API_BASE_URL}/api/health`,

  // Projects
  projects: `${API_BASE_URL}/api/projects`,
  projectsAllData: `${API_BASE_URL}/api/projects/all-data`,

  // Changes
  changes: `${API_BASE_URL}/api/changes`,

  // Flow
  flow: `${API_BASE_URL}/api/flow`,
  flowChanges: `${API_BASE_URL}/api/flow/changes`,

  // Tasks
  tasks: `${API_BASE_URL}/api/tasks`,

  // Agents
  agents: `${API_BASE_URL}/api/agents`,

  // CLI
  cli: `${API_BASE_URL}/api/cli`,
  cliSessions: `${API_BASE_URL}/api/cli/sessions`,
  cliSettings: `${API_BASE_URL}/api/cli/settings`,
  cliProfiles: `${API_BASE_URL}/api/cli/profiles`,

  // Integrations
  integrations: `${API_BASE_URL}/api/integrations`,

  // Post-Task
  postTask: `${API_BASE_URL}/api/post-task`,

  // Docs
  docs: `${API_BASE_URL}/api/docs`,

  // Claude Flow
  claudeFlow: `${API_BASE_URL}/api/claude-flow`,

  // AI
  ai: `${API_BASE_URL}/api/ai`,

  // Git
  git: `${API_BASE_URL}/api/git`,
} as const

// WebSocket URL
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3001'
export const WS_ENDPOINT = `${WS_BASE_URL}/ws`

// Helper: 동적 URL 생성
export const buildApiUrl = (path: string): string => {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

// Helper: 프로젝트 관련 URL
export const projectApiUrl = {
  changes: (projectId: string) => `${API_ENDPOINTS.projects}/${projectId}/changes`,
  activate: (projectId: string) => `${API_ENDPOINTS.projects}/${projectId}/activate`,
  path: (projectId: string) => `${API_ENDPOINTS.projects}/${projectId}/path`,
  name: (projectId: string) => `${API_ENDPOINTS.projects}/${projectId}/name`,
}

// Helper: Change 관련 URL
export const changeApiUrl = {
  tasks: (changeId: string) => `${API_ENDPOINTS.changes}/${changeId}/tasks`,
  detail: (changeId: string) => `${API_ENDPOINTS.flowChanges}/${changeId}`,
  archive: (changeId: string) => `${API_ENDPOINTS.flowChanges}/${changeId}/archive`,
}

// Helper: CLI 세션 관련 URL
export const cliApiUrl = {
  session: (sessionId: string) => `${API_ENDPOINTS.cliSessions}/${sessionId}`,
  availableProfiles: () => `${API_ENDPOINTS.cliProfiles}/available`,
}
