#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { readFile, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'

import { parseTasksFile, setTaskStatus } from './parser.js'
import { buildTaskContext, readDesign } from './context.js'
import {
  validateChange,
  archiveChange,
  getInstructions,
  getChangeStatus,
  isOpenSpecAvailable,
} from '../server/cli-adapter/openspec.js'
import type { Change, Task, TasksFile, NextTaskResponse } from './types.js'
import {
  taskToolDefinitions,
  initTaskDb,
  handleTaskList,
  handleTaskCreate,
  handleTaskUpdate,
  handleTaskSearch,
  handleTaskDelete,
  handleTaskView,
  handleTaskArchive,
  handleTaskUnarchive,
} from './task-tools.js'

// Integration Hub imports
import {
  integrationToolDefinitions,
  handleIntegrationContext,
  handleListAccounts,
  handleGetEnv,
  handleApplyGit,
  handleGetTestAccount,
  handleScanEnv,
  handleImportEnv,
  // 새로운 로컬 설정 도구
  handleInitLocal,
  handleExportToLocal,
} from './integration-tools.js'

// Agent Tools imports
import {
  agentToolDefinitions,
  handleExecuteChange,
  handleGetAgentStatus,
  handleStopAgent,
  handleResumeAgent,
  handleListAgentSessions,
  handleGetAgentLogs,
  handleDeleteAgentSession,
} from './agent-tools.js'


// Change Log & Replay imports
import { getChangeLogManager } from '../server/change-log.js'
import { getReplayEngine } from '../server/replay-engine.js'
import type { EventFilter, ReplayOptions, EventType, EventSeverity, EventSource } from '../server/types/change-log.js'

// RAG 기능 삭제됨 - LEANN 외부 MCP 서버로 대체 (leann-server)

// MCP Handler Argument Types
interface GetEventsArgs {
  event_types?: EventType[];
  severities?: EventSeverity[];
  sources?: EventSource[];
  project_ids?: string[];
  change_ids?: string[];
  time_range?: { start: string; end: string };
  limit?: number;
  offset?: number;
  sort_by?: { field: string; direction: 'ASC' | 'DESC' };
}

interface GetEventStatisticsArgs {
  event_types?: EventType[];
  time_range?: { start: string; end: string };
}

interface SearchEventsArgs {
  query: string;
  event_types?: EventType[];
  time_range?: { start: string; end: string };
}

interface ExportEventsArgs {
  filter?: EventFilter;
  format?: 'JSON' | 'CSV' | 'SQL';
}

interface CreateReplaySessionArgs {
  name: string;
  description?: string;
  filter?: EventFilter;
  mode?: 'SAFE' | 'FAST' | 'VERBOSE' | 'DRY_RUN';
  strategy?: 'SEQUENTIAL' | 'PARALLEL' | 'DEPENDENCY_AWARE' | 'SELECTIVE';
  stop_on_error?: boolean;
  enable_validation?: boolean;
  enable_rollback?: boolean;
  max_concurrency?: number;
  skip_events?: string[];
  include_events?: string[];
}

interface StartReplayArgs {
  session_id: string;
}

interface GetReplayProgressArgs {
  session_id: string;
}

// Get project path from environment or use current directory
const PROJECT_PATH = process.env.ZYFLOW_PROJECT || process.cwd()

/**
 * List all changes in the openspec/changes directory
 */
async function listChanges(projectPath?: string): Promise<Change[]> {
  const basePath = projectPath || PROJECT_PATH
  const changesDir = join(basePath, 'openspec', 'changes')
  const changes: Change[] = []

  try {
    const entries = await readdir(changesDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue

      const changeId = entry.name
      const tasksPath = join(changesDir, changeId, 'tasks.md')
      const proposalPath = join(changesDir, changeId, 'proposal.md')

      try {
        // Read tasks.md
        const tasksContent = await readFile(tasksPath, 'utf-8')
        const tasksFile = parseTasksFile(changeId, tasksContent)

        // Calculate progress
        const allTasks = tasksFile.groups.flatMap(g => g.tasks)
        const completedTasks = allTasks.filter(t => t.completed).length
        const totalTasks = allTasks.length
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

        // Read proposal for title
        let title = changeId
        let description = ''
        try {
          const proposalContent = await readFile(proposalPath, 'utf-8')
          const { data, content } = matter(proposalContent)
          title = data.title || changeId
          // Extract first paragraph as description
          const firstPara = content.split('\n\n')[0]?.replace(/^#.*\n/, '').trim()
          description = firstPara || ''
        } catch {
          // Use changeId as title
        }

        changes.push({
          id: changeId,
          title,
          description,
          progress,
          totalTasks,
          completedTasks,
        })
      } catch {
        // Skip changes without valid tasks.md
      }
    }
  } catch {
    // openspec/changes directory doesn't exist
  }

  return changes.sort((a, b) => b.progress - a.progress)
}

/**
 * Get tasks for a specific change
 */
async function getTasks(changeId: string, projectPath?: string): Promise<TasksFile> {
  const basePath = projectPath || PROJECT_PATH
  const tasksPath = join(basePath, 'openspec', 'changes', changeId, 'tasks.md')
  const content = await readFile(tasksPath, 'utf-8')
  return parseTasksFile(changeId, content)
}

/**
 * Get the next incomplete task with context
 */
async function getNextTask(changeId: string, projectPath?: string): Promise<NextTaskResponse> {
  const basePath = projectPath || PROJECT_PATH
  const tasksFile = await getTasks(changeId, basePath)

  // Find first incomplete task
  let nextTask: Task | null = null
  let taskGroup = ''

  for (const group of tasksFile.groups) {
    for (const task of group.tasks) {
      if (!task.completed) {
        nextTask = task
        taskGroup = group.title
        break
      }
    }
    if (nextTask) break
  }

  // Build context even if no task found
  const context = await buildTaskContext(
    basePath,
    changeId,
    tasksFile,
    nextTask || { id: '', title: '', completed: false, groupId: '', lineNumber: 0 }
  )

  return {
    task: nextTask,
    context,
    group: taskGroup,
  }
}

/**
 * Get detailed context for a specific task
 * Includes dynamic instructions from OpenSpec CLI when available
 */
async function getTaskContext(changeId: string, taskId: string, projectPath?: string) {
  const basePath = projectPath || PROJECT_PATH
  const tasksFile = await getTasks(changeId, basePath)

  // Find the task
  let targetTask: Task | null = null
  let taskGroup = ''

  for (const group of tasksFile.groups) {
    const task = group.tasks.find(t => t.id === taskId)
    if (task) {
      targetTask = task
      taskGroup = group.title
      break
    }
  }

  if (!targetTask) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const context = await buildTaskContext(basePath, changeId, tasksFile, targetTask)
  const design = await readDesign(basePath, changeId)

  // OpenSpec 1.0: 동적 인스트럭션 조회 (CLI가 있는 경우)
  let instructions: unknown = null
  let artifactStatus: unknown = null
  try {
    if (await isOpenSpecAvailable()) {
      // apply 아티팩트의 인스트럭션 조회 (태스크 실행 시 필요)
      const instructionsResult = await getInstructions('apply', { cwd: basePath, change: changeId })
      if (instructionsResult.success) {
        instructions = instructionsResult.data
      }

      // 아티팩트 상태 조회
      const statusResult = await getChangeStatus({ cwd: basePath, change: changeId })
      if (statusResult.success) {
        artifactStatus = statusResult.data
      }
    }
  } catch (err) {
    // 인스트럭션 조회 실패는 무시 (선택적 기능)
    console.warn('Failed to get dynamic instructions:', err)
  }

  return {
    task: targetTask,
    context: {
      ...context,
      design,
      instructions,
      artifactStatus,
    },
    group: taskGroup,
  }
}

/**
 * Mark a task as complete
 */
async function markComplete(changeId: string, taskId: string, projectPath?: string): Promise<Task> {
  const basePath = projectPath || PROJECT_PATH
  const tasksPath = join(basePath, 'openspec', 'changes', changeId, 'tasks.md')
  const content = await readFile(tasksPath, 'utf-8')

  const { newContent, task } = setTaskStatus(content, taskId, true)
  await writeFile(tasksPath, newContent, 'utf-8')

  return task
}

/**
 * Mark a task as incomplete
 */
async function markIncomplete(changeId: string, taskId: string, projectPath?: string): Promise<Task> {
  const basePath = projectPath || PROJECT_PATH
  const tasksPath = join(basePath, 'openspec', 'changes', changeId, 'tasks.md')
  const content = await readFile(tasksPath, 'utf-8')

  const { newContent, task } = setTaskStatus(content, taskId, false)
  await writeFile(tasksPath, newContent, 'utf-8')

  return task
}

// Create server
const server = new Server(
  {
    name: 'zyflow',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'zyflow_global_search',
        description: '모든 프로젝트에서 Changes를 검색합니다. 제목, ID, 프로젝트명으로 검색합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: '검색어 (제목, ID, 프로젝트명에서 검색)',
            },
            limit: {
              type: 'number',
              description: '반환할 최대 결과 수 (기본: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'zyflow_list_changes',
        description: '현재 프로젝트의 OpenSpec 변경 제안 목록을 조회합니다. 각 변경의 ID, 제목, 진행률, 완료/전체 태스크 수를 반환합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: [],
        },
      },
      {
        name: 'zyflow_get_tasks',
        description: '특정 변경 제안의 전체 태스크 목록을 그룹별로 조회합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '변경 제안 ID (예: add-payment-method-registry)',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['changeId'],
        },
      },
      {
        name: 'zyflow_get_next_task',
        description: '다음 미완료 태스크와 실행에 필요한 컨텍스트(proposal, spec, 관련 파일)를 조회합니다. 연속 태스크 실행에 최적화되어 있습니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '변경 제안 ID',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['changeId'],
        },
      },
      {
        name: 'zyflow_get_task_context',
        description: '특정 태스크의 상세 컨텍스트를 조회합니다. proposal, spec, design 문서와 관련 파일 목록을 포함합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '변경 제안 ID',
            },
            taskId: {
              type: 'string',
              description: '태스크 ID (예: task-1-1)',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['changeId', 'taskId'],
        },
      },
      {
        name: 'zyflow_mark_complete',
        description: '태스크를 완료로 표시합니다. tasks.md 파일이 자동으로 업데이트됩니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '변경 제안 ID',
            },
            taskId: {
              type: 'string',
              description: '태스크 ID',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['changeId', 'taskId'],
        },
      },
      {
        name: 'zyflow_mark_incomplete',
        description: '태스크를 미완료로 되돌립니다. 잘못 완료 표시한 경우 사용합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '변경 제안 ID',
            },
            taskId: {
              type: 'string',
              description: '태스크 ID',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['changeId', 'taskId'],
        },
      },
      {
        name: 'zyflow_unified_context',
        description: '통합 컨텍스트 검색입니다. OpenSpec의 Changes/Tasks 정보와 claude-mem의 Memory(이전 작업 기록, 결정사항)를 함께 검색합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: '검색어',
            },
            includeChanges: {
              type: 'boolean',
              description: 'OpenSpec Changes 포함 여부 (기본: true)',
            },
            includeMemory: {
              type: 'boolean',
              description: 'claude-mem Memory 포함 여부 (기본: true)',
            },
            limit: {
              type: 'number',
              description: '각 카테고리별 최대 결과 수 (기본: 5)',
            },
          },
          required: ['query'],
        },
      },
      // OpenSpec 1.0 CLI Integration Tools
      {
        name: 'zyflow_validate_change',
        description: 'OpenSpec 변경을 검증합니다. 아티팩트의 무결성과 스키마 준수 여부를 확인합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '검증할 변경 제안 ID (선택, 없으면 현재 활성 변경)',
            },
            strict: {
              type: 'boolean',
              description: '엄격 모드 활성화 (경고도 오류로 처리)',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: [],
        },
      },
      {
        name: 'zyflow_archive_change',
        description: '완료된 변경을 아카이브합니다. 메인 스펙으로 동기화하고 변경 디렉토리를 archive로 이동합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '아카이브할 변경 제안 ID',
            },
            syncSpecs: {
              type: 'boolean',
              description: '메인 스펙으로 동기화 여부 (기본: true)',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['changeId'],
        },
      },
      {
        name: 'zyflow_get_instructions',
        description: 'OpenSpec 동적 인스트럭션을 조회합니다. 아티팩트 생성 또는 태스크 적용을 위한 컨텍스트 기반 지침을 제공합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            artifact: {
              type: 'string',
              description: '아티팩트 유형 (proposal, design, tasks, apply 등)',
            },
            changeId: {
              type: 'string',
              description: '변경 제안 ID (선택)',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: ['artifact'],
        },
      },
      {
        name: 'zyflow_get_status',
        description: 'OpenSpec 변경의 아티팩트 완료 상태를 조회합니다. 전체 진행률과 각 아티팩트 상태를 반환합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            changeId: {
              type: 'string',
              description: '변경 제안 ID (선택)',
            },
            projectPath: {
              type: 'string',
              description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
            },
          },
          required: [],
        },
      },
      // Task management tools (SQLite-based)
      ...taskToolDefinitions,

      // Integration Hub Tools
      ...integrationToolDefinitions,

      // Agent Tools
      ...agentToolDefinitions,

      // Change Log Tools
      {
        name: 'get_events',
        description: 'Get change events with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            event_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by event types (optional)',
            },
            severities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by severity levels (optional)',
            },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by event sources (optional)',
            },
            project_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by project IDs (optional)',
            },
            change_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by change IDs (optional)',
            },
            time_range: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (ISO format)' },
                end: { type: 'string', description: 'End date (ISO format)' },
              },
              description: 'Filter by time range (optional)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of events to return (optional)',
            },
            offset: {
              type: 'number',
              description: 'Number of events to skip (optional)',
            },
            sort_by: {
              type: 'object',
              properties: {
                field: { type: 'string', description: 'Field to sort by' },
                direction: { type: 'string', enum: ['ASC', 'DESC'], description: 'Sort direction' },
              },
              description: 'Sort options (optional)',
            },
          },
        },
      },
      {
        name: 'get_event_statistics',
        description: 'Get event statistics',
        inputSchema: {
          type: 'object',
          properties: {
            event_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by event types (optional)',
            },
            time_range: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (ISO format)' },
                end: { type: 'string', description: 'End date (ISO format)' },
              },
              description: 'Filter by time range (optional)',
            },
          },
        },
      },
      {
        name: 'search_events',
        description: 'Search events by text query',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            event_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by event types (optional)',
            },
            time_range: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (ISO format)' },
                end: { type: 'string', description: 'End date (ISO format)' },
              },
              description: 'Filter by time range (optional)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'export_events',
        description: 'Export events in various formats',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              description: 'Event filter (same as get_events)',
            },
            format: {
              type: 'string',
              enum: ['JSON', 'CSV', 'SQL'],
              description: 'Export format',
              default: 'JSON',
            },
          },
        },
      },
      
      // Replay Tools
      {
        name: 'create_replay_session',
        description: 'Create a replay session',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Session name',
            },
            description: {
              type: 'string',
              description: 'Session description (optional)',
            },
            filter: {
              type: 'object',
              description: 'Event filter for replay',
            },
            mode: {
              type: 'string',
              enum: ['SAFE', 'FAST', 'VERBOSE', 'DRY_RUN'],
              description: 'Replay mode',
              default: 'SAFE',
            },
            strategy: {
              type: 'string',
              enum: ['SEQUENTIAL', 'PARALLEL', 'DEPENDENCY_AWARE', 'SELECTIVE'],
              description: 'Replay strategy',
              default: 'SEQUENTIAL',
            },
            stop_on_error: {
              type: 'boolean',
              description: 'Stop on error',
              default: true,
            },
            enable_validation: {
              type: 'boolean',
              description: 'Enable validation',
              default: true,
            },
            enable_rollback: {
              type: 'boolean',
              description: 'Enable rollback',
              default: false,
            },
            max_concurrency: {
              type: 'number',
              description: 'Maximum concurrency for parallel replay',
            },
            skip_events: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event IDs to skip',
            },
            include_events: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event IDs to include',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'start_replay',
        description: 'Start a replay session',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Replay session ID',
            },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'get_replay_progress',
        description: 'Get replay session progress',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Replay session ID',
            },
          },
          required: ['session_id'],
        },
      },

      // RAG 기능 삭제됨 - LEANN 외부 MCP 서버(leann-server) 사용
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'zyflow_global_search': {
        const { query, limit = 10 } = args as { query: string; limit?: number }

        // Fetch all projects data from the API
        const API_BASE = process.env.ZYFLOW_API_BASE || 'http://localhost:3200'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allProjects: Record<string, unknown>[] = []

        try {
          const response = await fetch(`${API_BASE}/api/projects/all-data`)
          if (response.ok) {
            const json = await response.json() as { data?: { projects?: Record<string, unknown>[] } }
            allProjects = json.data?.projects || []
          }
        } catch (_err) {
          // API not available, fall back to local project only
          const localChanges = await listChanges()
          allProjects = [{
            id: 'local',
            name: 'Current Project',
            path: PROJECT_PATH,
            changes: localChanges,
          }]
        }

        // Collect all changes with project info
        const allChanges: Record<string, unknown>[] = []
        for (const project of allProjects) {
          if (project.changes) {
            for (const change of project.changes) {
              allChanges.push({
                id: change.id,
                title: change.title,
                progress: change.progress || 0,
                totalTasks: change.totalTasks || 0,
                completedTasks: change.completedTasks || 0,
                projectId: project.id,
                projectName: project.name,
                projectPath: project.path,
              })
            }
          }
        }

        // Search
        const queryLower = query.toLowerCase()
        const results = allChanges.filter(c =>
          c.title.toLowerCase().includes(queryLower) ||
          c.id.toLowerCase().includes(queryLower) ||
          c.projectName.toLowerCase().includes(queryLower)
        ).slice(0, limit)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                query,
                totalResults: results.length,
                results,
              }, null, 2),
            },
          ],
        }
      }

      case 'zyflow_list_changes': {
        const { projectPath } = args as { projectPath?: string }
        const changes = await listChanges(projectPath)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ changes, projectPath: projectPath || PROJECT_PATH }, null, 2),
            },
          ],
        }
      }

      case 'zyflow_get_tasks': {
        const { changeId, projectPath } = args as { changeId: string; projectPath?: string }
        const tasksFile = await getTasks(changeId, projectPath)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(tasksFile, null, 2),
            },
          ],
        }
      }

      case 'zyflow_get_next_task': {
        const { changeId, projectPath } = args as { changeId: string; projectPath?: string }
        const result = await getNextTask(changeId, projectPath)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'zyflow_get_task_context': {
        const { changeId, taskId, projectPath } = args as { changeId: string; taskId: string; projectPath?: string }
        const result = await getTaskContext(changeId, taskId, projectPath)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'zyflow_mark_complete': {
        const { changeId, taskId, projectPath } = args as { changeId: string; taskId: string; projectPath?: string }
        const task = await markComplete(changeId, taskId, projectPath)

        // Get updated progress
        const tasksFile = await getTasks(changeId, projectPath)
        const allTasks = tasksFile.groups.flatMap(g => g.tasks)
        const completed = allTasks.filter(t => t.completed).length
        const total = allTasks.length

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task,
                progress: `${completed}/${total}`,
                message: `태스크 "${task.title}"를 완료로 표시했습니다.`,
              }, null, 2),
            },
          ],
        }
      }

      case 'zyflow_mark_incomplete': {
        const { changeId, taskId, projectPath } = args as { changeId: string; taskId: string; projectPath?: string }
        const task = await markIncomplete(changeId, taskId, projectPath)

        // Get updated progress
        const tasksFile = await getTasks(changeId, projectPath)
        const allTasks = tasksFile.groups.flatMap(g => g.tasks)
        const completed = allTasks.filter(t => t.completed).length
        const total = allTasks.length

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task,
                progress: `${completed}/${total}`,
                message: `태스크 "${task.title}"를 미완료로 되돌렸습니다.`,
              }, null, 2),
            },
          ],
        }
      }

      case 'zyflow_unified_context': {
        const { query, includeChanges = true, includeMemory = true, limit = 5 } = args as {
          query: string
          includeChanges?: boolean
          includeMemory?: boolean
          limit?: number
        }

        const results: {
          changes?: Record<string, unknown>[]
          memory?: Record<string, unknown>[]
        } = {}

        // 1. Changes/Tasks 검색
        if (includeChanges) {
          const API_BASE = process.env.ZYFLOW_API_BASE || 'http://localhost:3200'
          try {
            const response = await fetch(`${API_BASE}/api/projects/all-data`)
            if (response.ok) {
              const json = await response.json() as { data?: { projects?: Record<string, unknown>[] } }
              const allProjects = json.data?.projects || []
              const allChanges: Record<string, unknown>[] = []

              for (const project of allProjects) {
                if (project.changes) {
                  for (const change of project.changes) {
                    allChanges.push({
                      id: change.id,
                      title: change.title,
                      progress: change.progress || 0,
                      projectId: project.id,
                      projectName: project.name,
                    })
                  }
                }
              }

              const queryLower = query.toLowerCase()
              results.changes = allChanges.filter(c =>
                c.title.toLowerCase().includes(queryLower) ||
                c.id.toLowerCase().includes(queryLower)
              ).slice(0, limit)
            }
          } catch {
            // API not available
            results.changes = []
          }
        }

        // 2. claude-mem Memory 검색
        if (includeMemory) {
          const homedir = process.env.HOME || process.env.USERPROFILE || ''
          const memDbPath = `${homedir}/.claude-mem/memory.db`

          try {
            const fs = await import('fs')
            if (fs.existsSync(memDbPath)) {
              const Database = (await import('better-sqlite3')).default
              const db = new Database(memDbPath, { readonly: true })

              const searchPattern = `%${query}%`
              const stmt = db.prepare(`
                SELECT id, type, title, subtitle
                FROM observations
                WHERE title LIKE ? OR subtitle LIKE ? OR facts LIKE ? OR narrative LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
              `)
              const rows = stmt.all(searchPattern, searchPattern, searchPattern, searchPattern, limit) as Array<{
                id: number
                type: string
                title: string
                subtitle: string | null
              }>

              results.memory = rows.map(row => ({
                id: row.id,
                type: row.type || 'unknown',
                title: row.title || 'Untitled',
                subtitle: row.subtitle || undefined,
              }))

              db.close()
            } else {
              results.memory = []
            }
          } catch {
            results.memory = []
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                query,
                results,
                message: `통합 검색 결과: Changes ${results.changes?.length || 0}개, Memory ${results.memory?.length || 0}개`,
              }, null, 2),
            },
          ],
        }
      }

      // OpenSpec 1.0 CLI Integration Tools
      case 'zyflow_validate_change': {
        const { changeId, strict, projectPath } = args as {
          changeId?: string
          strict?: boolean
          projectPath?: string
        }
        const cwd = projectPath || PROJECT_PATH

        // Check if OpenSpec CLI is available
        const available = await isOpenSpecAvailable()
        if (!available) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'OpenSpec CLI가 설치되어 있지 않습니다. npm install -g openspec 으로 설치해주세요.',
              }, null, 2),
            }],
            isError: true,
          }
        }

        const result = await validateChange(changeId, { cwd, strict })
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: result.success,
              validation: result.data,
              error: result.error,
              message: result.success
                ? '변경 검증이 완료되었습니다.'
                : `검증 실패: ${result.error}`,
            }, null, 2),
          }],
          isError: !result.success,
        }
      }

      case 'zyflow_archive_change': {
        const { changeId, syncSpecs = true, projectPath } = args as {
          changeId: string
          syncSpecs?: boolean
          projectPath?: string
        }
        const cwd = projectPath || PROJECT_PATH

        const available = await isOpenSpecAvailable()
        if (!available) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'OpenSpec CLI가 설치되어 있지 않습니다.',
              }, null, 2),
            }],
            isError: true,
          }
        }

        const result = await archiveChange(changeId, { cwd, syncSpecs })
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: result.success,
              data: result.data,
              error: result.error,
              message: result.success
                ? `변경 "${changeId}"가 성공적으로 아카이브되었습니다.`
                : `아카이브 실패: ${result.error}`,
            }, null, 2),
          }],
          isError: !result.success,
        }
      }

      case 'zyflow_get_instructions': {
        const { artifact, changeId, projectPath } = args as {
          artifact: string
          changeId?: string
          projectPath?: string
        }
        const cwd = projectPath || PROJECT_PATH

        const available = await isOpenSpecAvailable()
        if (!available) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'OpenSpec CLI가 설치되어 있지 않습니다.',
              }, null, 2),
            }],
            isError: true,
          }
        }

        const result = await getInstructions(artifact, { cwd, change: changeId })
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: result.success,
              instructions: result.data,
              error: result.error,
              message: result.success
                ? `${artifact} 아티팩트 인스트럭션을 조회했습니다.`
                : `인스트럭션 조회 실패: ${result.error}`,
            }, null, 2),
          }],
          isError: !result.success,
        }
      }

      case 'zyflow_get_status': {
        const { changeId, projectPath } = args as {
          changeId?: string
          projectPath?: string
        }
        const cwd = projectPath || PROJECT_PATH

        const available = await isOpenSpecAvailable()
        if (!available) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'OpenSpec CLI가 설치되어 있지 않습니다.',
              }, null, 2),
            }],
            isError: true,
          }
        }

        const result = await getChangeStatus({ cwd, change: changeId })
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: result.success,
              status: result.data,
              error: result.error,
              message: result.success
                ? '변경 상태를 조회했습니다.'
                : `상태 조회 실패: ${result.error}`,
            }, null, 2),
          }],
          isError: !result.success,
        }
      }

      // Task management tools (SQLite-based)
      case 'task_list': {
        const { projectPath, ...restArgs } = args as { projectPath?: string } & Parameters<typeof handleTaskList>[0]
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskList(restArgs, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_create': {
        const { projectPath, ...restArgs } = args as { projectPath?: string } & Parameters<typeof handleTaskCreate>[0]
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskCreate(restArgs, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_update': {
        const { projectPath, ...restArgs } = args as { projectPath?: string } & Parameters<typeof handleTaskUpdate>[0]
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskUpdate(restArgs, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_search': {
        const { projectPath, ...restArgs } = args as { projectPath?: string } & Parameters<typeof handleTaskSearch>[0]
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskSearch(restArgs, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_delete': {
        const { projectPath, id } = args as { projectPath?: string; id: string }
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskDelete({ id }, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_view': {
        const { projectPath, id } = args as { projectPath?: string; id: string }
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskView({ id }, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_archive': {
        const { projectPath, id } = args as { projectPath?: string; id: string }
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskArchive({ id }, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_unarchive': {
        const { projectPath, id } = args as { projectPath?: string; id: string }
        const effectivePath = projectPath || PROJECT_PATH
        initTaskDb(effectivePath)
        const result = handleTaskUnarchive({ id }, effectivePath)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      // Integration Hub Tools
      case 'integration_context': {
        const result = await handleIntegrationContext(args as { projectId: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_list_accounts': {
        const result = await handleListAccounts(args as { type?: 'github' | 'supabase' | 'vercel' | 'sentry' | 'custom' })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_get_env': {
        const result = await handleGetEnv(args as { projectId: string; envId?: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_apply_git': {
        const result = await handleApplyGit(args as { projectId: string; scope?: 'local' | 'global' }, PROJECT_PATH)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_get_test_account': {
        const result = await handleGetTestAccount(args as { projectId: string; role?: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_scan_env': {
        const result = await handleScanEnv(args as { projectPath: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_import_env': {
        const result = await handleImportEnv(args as { projectPath: string; services: Array<{ type: string; name: string }> })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      // 새로운 로컬 설정 도구
      case 'integration_init_local': {
        const result = await handleInitLocal(args as { projectPath: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'integration_export_to_local': {
        const result = await handleExportToLocal(args as {
          projectPath: string
          projectId: string
          includeEnvironments?: boolean
          includeTestAccounts?: boolean
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      // Agent Tools
      case 'zyflow_execute_change': {
        const result = await handleExecuteChange(
          args as { changeId: string; projectPath?: string; model?: 'claude-sonnet' | 'claude-haiku' | 'claude-opus' },
          PROJECT_PATH
        )
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'zyflow_get_agent_status': {
        const result = await handleGetAgentStatus(args as { sessionId: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'zyflow_stop_agent': {
        const result = await handleStopAgent(args as { sessionId: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'zyflow_resume_agent': {
        const result = await handleResumeAgent(args as { sessionId: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'zyflow_list_agent_sessions': {
        const result = await handleListAgentSessions(args as { status?: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'zyflow_get_agent_logs': {
        const result = await handleGetAgentLogs(args as { sessionId: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'zyflow_delete_agent_session': {
        const result = await handleDeleteAgentSession(args as { sessionId: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      // Change Log Tools
      case 'get_events':
        return await handleGetEvents((args || {}) as GetEventsArgs);
      case 'get_event_statistics':
        return await handleGetEventStatistics((args || {}) as GetEventStatisticsArgs);
      case 'search_events':
        return await handleSearchEvents(args as unknown as SearchEventsArgs);
      case 'export_events':
        return await handleExportEvents((args || {}) as ExportEventsArgs);

      // Replay Tools
      case 'create_replay_session':
        return await handleCreateReplaySession(args as unknown as CreateReplaySessionArgs);
      case 'start_replay':
        return await handleStartReplay(args as unknown as StartReplayArgs);
      case 'get_replay_progress':
        return await handleGetReplayProgress(args as unknown as GetReplayProgressArgs);

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    }
  }
})

// =============================================
// Change Log & Replay Tool Handlers
// =============================================

async function handleGetEvents(args: GetEventsArgs) {
  const changeLogManager = getChangeLogManager();
  
  try {
    const filter: EventFilter = {};
    
    if (args.event_types) {
      filter.eventTypes = args.event_types;
    }
    
    if (args.severities) {
      filter.severities = args.severities;
    }
    
    if (args.sources) {
      filter.sources = args.sources;
    }
    
    if (args.project_ids) {
      filter.projectIds = args.project_ids;
    }
    
    if (args.change_ids) {
      filter.changeIds = args.change_ids;
    }
    
    if (args.time_range) {
      filter.timeRange = {
        start: new Date(args.time_range.start).getTime(),
        end: new Date(args.time_range.end).getTime()
      };
    }
    
    if (args.limit) {
      filter.pagination = {
        offset: args.offset || 0,
        limit: args.limit
      };
    }
    
    if (args.sort_by) {
      filter.sortBy = {
        field: args.sort_by.field || 'timestamp',
        direction: args.sort_by.direction || 'DESC'
      };
    }
    
    const events = await changeLogManager.getEvents(filter);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Found ${events.length} events matching the filter criteria.`,
        },
        {
          type: 'text' as const,
          text: JSON.stringify(events, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get events: ${(error as Error).message}`
    );
  }
}

async function handleGetEventStatistics(args: GetEventStatisticsArgs) {
  const changeLogManager = getChangeLogManager();
  
  try {
    const filter: EventFilter = {};
    
    if (args.event_types) {
      filter.eventTypes = args.event_types;
    }
    
    if (args.time_range) {
      filter.timeRange = {
        start: new Date(args.time_range.start).getTime(),
        end: new Date(args.time_range.end).getTime()
      };
    }
    
    const statistics = await changeLogManager.getStatistics(filter);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Event Statistics:',
        },
        {
          type: 'text' as const,
          text: JSON.stringify(statistics, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get event statistics: ${(error as Error).message}`
    );
  }
}

async function handleSearchEvents(args: SearchEventsArgs) {
  const changeLogManager = getChangeLogManager();
  
  try {
    const { query, ...filterArgs } = args;
    
    const filter: EventFilter = {};
    
    if (filterArgs.event_types) {
      filter.eventTypes = filterArgs.event_types;
    }
    
    if (filterArgs.time_range) {
      filter.timeRange = {
        start: new Date(filterArgs.time_range.start).getTime(),
        end: new Date(filterArgs.time_range.end).getTime()
      };
    }
    
    const events = await changeLogManager.searchEvents(query, filter);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Found ${events.length} events matching query: "${query}"`,
        },
        {
          type: 'text' as const,
          text: JSON.stringify(events, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to search events: ${(error as Error).message}`
    );
  }
}

async function handleExportEvents(args: ExportEventsArgs) {
  const changeLogManager = getChangeLogManager();
  
  try {
    const filter: EventFilter = args.filter || {};
    const format = args.format || 'JSON';
    
    const exportedData = await changeLogManager.exportData(filter, format);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Exported events in ${format} format:`,
        },
        {
          type: 'text' as const,
          text: exportedData,
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to export events: ${(error as Error).message}`
    );
  }
}

async function handleCreateReplaySession(args: CreateReplaySessionArgs) {
  try {
    const replayEngine = getReplayEngine();
    
    const filter: EventFilter = args.filter || {};
    const options: ReplayOptions = {
      mode: args.mode || 'SAFE',
      strategy: args.strategy || 'SEQUENTIAL',
      stopOnError: args.stop_on_error !== undefined ? args.stop_on_error : true,
      enableValidation: args.enable_validation !== undefined ? args.enable_validation : true,
      enableRollback: args.enable_rollback !== undefined ? args.enable_rollback : false
    };
    
    if (args.max_concurrency) {
      options.maxConcurrency = args.max_concurrency;
    }
    
    if (args.skip_events) {
      options.skipEvents = args.skip_events;
    }
    
    if (args.include_events) {
      options.includeEvents = args.include_events;
    }
    
    const sessionId = await replayEngine.createSession(
      args.name,
      filter,
      options,
      args.description
    );
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Created replay session: ${sessionId}`,
        },
        {
          type: 'text' as const,
          text: JSON.stringify({ sessionId }, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to create replay session: ${(error as Error).message}`
    );
  }
}

async function handleStartReplay(args: StartReplayArgs) {
  try {
    const replayEngine = getReplayEngine();
    await replayEngine.startReplay(args.session_id);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Started replay session: ${args.session_id}`,
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to start replay: ${(error as Error).message}`
    );
  }
}

async function handleGetReplayProgress(args: GetReplayProgressArgs) {
  try {
    const replayEngine = getReplayEngine();
    const progress = await replayEngine.getReplayProgress(args.session_id);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Replay progress for session: ${args.session_id}`,
        },
        {
          type: 'text' as const,
          text: JSON.stringify(progress, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get replay progress: ${(error as Error).message}`
    );
  }
}

// Start server
async function main() {
  const transport = new StdioServerTransport()

  await server.connect(transport)
  console.error('ZyFlow MCP Server started')
  console.error(`Project path: ${PROJECT_PATH}`)

  // Handle process termination signals
  process.on('SIGINT', () => {
    console.error('Received SIGINT, shutting down...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down...')
    process.exit(0)
  })

  // Handle stdin close - MCP client disconnection
  process.stdin.on('end', () => {
    console.error('stdin ended, shutting down...')
    process.exit(0)
  })

  // Keep the process alive
  process.stdin.resume()
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error)
  process.exit(1)
})
