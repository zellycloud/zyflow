/**
 * MCP Tools for ZyFlow Agent execution
 *
 * These tools allow Claude Code (or other MCP clients) to:
 * - Execute OpenSpec changes using the Python agent server
 * - Monitor agent execution status
 * - Control running agents (stop, resume)
 */

const AGENT_SERVER_URL = process.env.ZYFLOW_AGENT_SERVER || 'http://localhost:3002'

// Types
interface ExecuteChangeArgs {
  changeId: string
  projectPath?: string
  model?: 'claude-sonnet' | 'claude-haiku' | 'claude-opus'
}

interface GetAgentStatusArgs {
  sessionId: string
}

interface StopAgentArgs {
  sessionId: string
}

interface ResumeAgentArgs {
  sessionId: string
}

interface ListAgentSessionsArgs {
  // No args, lists all sessions
}

interface AgentSession {
  session_id: string
  change_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped'
  created_at: string
  updated_at: string
  project_path: string
  current_task: string | null
  completed_tasks: number
  total_tasks: number
  error: string | null
}

interface ExecuteResponse {
  session_id: string
  status: string
  message: string
}

interface AgentLogs {
  session_id: string
  results: Array<{
    task_id: string
    task_title: string
    status: string
    output: string
    error: string | null
    started_at: string | null
    completed_at: string | null
  }>
  total_tasks: number
  completed_tasks: number
  status: string
}

// Tool definitions
export const agentToolDefinitions = [
  {
    name: 'zyflow_execute_change',
    description:
      'OpenSpec 변경을 에이전트로 실행합니다. 백그라운드에서 태스크를 순차적으로 실행하며, 세션 ID를 반환합니다. 진행 상황은 zyflow_get_agent_status로 확인하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        changeId: {
          type: 'string',
          description: '실행할 OpenSpec 변경 ID (예: add-payment-method)',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
        },
        model: {
          type: 'string',
          enum: ['claude-sonnet', 'claude-haiku', 'claude-opus'],
          description: '사용할 모델 (기본값: claude-sonnet)',
        },
      },
      required: ['changeId'],
    },
  },
  {
    name: 'zyflow_get_agent_status',
    description:
      '실행 중인 에이전트 세션의 상태를 조회합니다. 진행률, 현재 태스크, 에러 등을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: '에이전트 세션 ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'zyflow_stop_agent',
    description:
      '실행 중인 에이전트 세션을 중단합니다. 현재 태스크가 완료된 후 중단됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: '중단할 에이전트 세션 ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'zyflow_resume_agent',
    description:
      '중단된 에이전트 세션을 재개합니다. 중단 지점에서 다음 태스크부터 실행합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: '재개할 에이전트 세션 ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'zyflow_list_agent_sessions',
    description: '모든 에이전트 세션 목록을 조회합니다. 상태별 필터링이 가능합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed', 'stopped'],
          description: '상태로 필터링 (선택)',
        },
      },
    },
  },
  {
    name: 'zyflow_get_agent_logs',
    description:
      '에이전트 세션의 실행 로그를 조회합니다. 각 태스크의 실행 결과와 출력을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: '에이전트 세션 ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'zyflow_delete_agent_session',
    description:
      '에이전트 세션을 삭제합니다. 실행 중인 세션은 삭제할 수 없습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: '삭제할 에이전트 세션 ID',
        },
      },
      required: ['sessionId'],
    },
  },
]

// Helper function for fetch with error handling
async function agentFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${AGENT_SERVER_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string }
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const data = await response.json() as T
    return { success: true, data }
  } catch (error) {
    // Check if server is running
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error:
          'Agent 서버에 연결할 수 없습니다. "npm run py:server" 또는 "npm run dev:full"로 서버를 시작하세요.',
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Handler functions
export async function handleExecuteChange(
  args: ExecuteChangeArgs,
  projectPath: string
): Promise<{ success: boolean; data?: ExecuteResponse; error?: string; message?: string }> {
  const result = await agentFetch<ExecuteResponse>('/api/agents/execute', {
    method: 'POST',
    body: JSON.stringify({
      change_id: args.changeId,
      project_path: args.projectPath || projectPath,
      model: args.model || 'claude-sonnet',
    }),
  })

  if (result.success && result.data) {
    return {
      success: true,
      data: result.data,
      message: `에이전트 세션이 시작되었습니다. 세션 ID: ${result.data.session_id}\n진행 상황은 zyflow_get_agent_status로 확인하세요.`,
    }
  }

  return result
}

export async function handleGetAgentStatus(
  args: GetAgentStatusArgs
): Promise<{ success: boolean; data?: AgentSession; error?: string; message?: string }> {
  const result = await agentFetch<AgentSession>(`/api/agents/sessions/${args.sessionId}`)

  if (result.success && result.data) {
    const session = result.data
    const progress = session.total_tasks > 0
      ? Math.round((session.completed_tasks / session.total_tasks) * 100)
      : 0

    let statusMessage = `상태: ${session.status}\n`
    statusMessage += `진행률: ${session.completed_tasks}/${session.total_tasks} (${progress}%)\n`

    if (session.current_task) {
      statusMessage += `현재 태스크: ${session.current_task}\n`
    }

    if (session.error) {
      statusMessage += `에러: ${session.error}\n`
    }

    return {
      success: true,
      data: session,
      message: statusMessage,
    }
  }

  return result
}

export async function handleStopAgent(
  args: StopAgentArgs
): Promise<{ success: boolean; data?: { message: string; session_id: string }; error?: string }> {
  const result = await agentFetch<{ message: string; session_id: string }>(
    `/api/agents/sessions/${args.sessionId}/stop`,
    { method: 'POST' }
  )

  return result
}

export async function handleResumeAgent(
  args: ResumeAgentArgs
): Promise<{ success: boolean; data?: { message: string; session_id: string }; error?: string }> {
  const result = await agentFetch<{ message: string; session_id: string }>(
    `/api/agents/sessions/${args.sessionId}/resume`,
    { method: 'POST' }
  )

  return result
}

export async function handleListAgentSessions(
  args?: { status?: string }
): Promise<{ success: boolean; data?: AgentSession[]; error?: string; message?: string }> {
  const result = await agentFetch<AgentSession[]>('/api/agents/sessions')

  if (result.success && result.data) {
    let sessions = result.data

    // Filter by status if provided
    if (args?.status) {
      sessions = sessions.filter(s => s.status === args.status)
    }

    if (sessions.length === 0) {
      return {
        success: true,
        data: sessions,
        message: '실행 중인 에이전트 세션이 없습니다.',
      }
    }

    const summary = sessions.map(s => {
      const progress = s.total_tasks > 0
        ? Math.round((s.completed_tasks / s.total_tasks) * 100)
        : 0
      return `- ${s.session_id.substring(0, 8)}... | ${s.change_id} | ${s.status} | ${progress}%`
    }).join('\n')

    return {
      success: true,
      data: sessions,
      message: `${sessions.length}개의 세션:\n${summary}`,
    }
  }

  return result
}

export async function handleGetAgentLogs(
  args: GetAgentStatusArgs
): Promise<{ success: boolean; data?: AgentLogs; error?: string; message?: string }> {
  const result = await agentFetch<AgentLogs>(`/api/agents/sessions/${args.sessionId}/logs`)

  if (result.success && result.data) {
    const logs = result.data
    const taskResults = logs.results
      .map(r => {
        const status = r.status === 'completed' ? '✅' : r.status === 'failed' ? '❌' : '⏳'
        return `${status} ${r.task_title}${r.error ? ` (에러: ${r.error})` : ''}`
      })
      .join('\n')

    return {
      success: true,
      data: logs,
      message: `실행 로그 (${logs.completed_tasks}/${logs.total_tasks} 완료):\n${taskResults || '아직 완료된 태스크가 없습니다.'}`,
    }
  }

  return result
}

export async function handleDeleteAgentSession(
  args: StopAgentArgs
): Promise<{ success: boolean; data?: { message: string; session_id: string }; error?: string }> {
  const result = await agentFetch<{ message: string; session_id: string }>(
    `/api/agents/sessions/${args.sessionId}`,
    { method: 'DELETE' }
  )

  return result
}
