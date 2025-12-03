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
} from './integration-tools.js'

// Change Log & Replay imports
import { getChangeLogManager } from '../server/change-log.js'
import { getReplayEngine } from '../server/replay-engine.js'
import type { EventFilter, ReplayOptions, EventType, EventSeverity, EventSource } from '../server/types/change-log.js'

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
async function listChanges(): Promise<Change[]> {
  const changesDir = join(PROJECT_PATH, 'openspec', 'changes')
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
async function getTasks(changeId: string): Promise<TasksFile> {
  const tasksPath = join(PROJECT_PATH, 'openspec', 'changes', changeId, 'tasks.md')
  const content = await readFile(tasksPath, 'utf-8')
  return parseTasksFile(changeId, content)
}

/**
 * Get the next incomplete task with context
 */
async function getNextTask(changeId: string): Promise<NextTaskResponse> {
  const tasksFile = await getTasks(changeId)

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
    PROJECT_PATH,
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
 */
async function getTaskContext(changeId: string, taskId: string) {
  const tasksFile = await getTasks(changeId)

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

  const context = await buildTaskContext(PROJECT_PATH, changeId, tasksFile, targetTask)
  const design = await readDesign(PROJECT_PATH, changeId)

  return {
    task: targetTask,
    context: {
      ...context,
      design,
    },
    group: taskGroup,
  }
}

/**
 * Mark a task as complete
 */
async function markComplete(changeId: string, taskId: string): Promise<Task> {
  const tasksPath = join(PROJECT_PATH, 'openspec', 'changes', changeId, 'tasks.md')
  const content = await readFile(tasksPath, 'utf-8')

  const { newContent, task } = setTaskStatus(content, taskId, true)
  await writeFile(tasksPath, newContent, 'utf-8')

  return task
}

/**
 * Mark a task as incomplete
 */
async function markIncomplete(changeId: string, taskId: string): Promise<Task> {
  const tasksPath = join(PROJECT_PATH, 'openspec', 'changes', changeId, 'tasks.md')
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
        name: 'zyflow_list_changes',
        description: '현재 프로젝트의 OpenSpec 변경 제안 목록을 조회합니다. 각 변경의 ID, 제목, 진행률, 완료/전체 태스크 수를 반환합니다.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
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
          },
          required: ['changeId', 'taskId'],
        },
      },
      // Task management tools (SQLite-based)
      ...taskToolDefinitions,

      // Integration Hub Tools
      ...integrationToolDefinitions,

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
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'zyflow_list_changes': {
        const changes = await listChanges()
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ changes, projectPath: PROJECT_PATH }, null, 2),
            },
          ],
        }
      }

      case 'zyflow_get_tasks': {
        const { changeId } = args as { changeId: string }
        const tasksFile = await getTasks(changeId)
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
        const { changeId } = args as { changeId: string }
        const result = await getNextTask(changeId)
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
        const { changeId, taskId } = args as { changeId: string; taskId: string }
        const result = await getTaskContext(changeId, taskId)
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
        const { changeId, taskId } = args as { changeId: string; taskId: string }
        const task = await markComplete(changeId, taskId)

        // Get updated progress
        const tasksFile = await getTasks(changeId)
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
        const { changeId, taskId } = args as { changeId: string; taskId: string }
        const task = await markIncomplete(changeId, taskId)

        // Get updated progress
        const tasksFile = await getTasks(changeId)
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

      // Task management tools (SQLite-based)
      case 'task_list': {
        initTaskDb(PROJECT_PATH)
        const result = handleTaskList(args as Parameters<typeof handleTaskList>[0])
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_create': {
        initTaskDb(PROJECT_PATH)
        const result = handleTaskCreate(args as Parameters<typeof handleTaskCreate>[0])
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_update': {
        initTaskDb(PROJECT_PATH)
        const result = handleTaskUpdate(args as Parameters<typeof handleTaskUpdate>[0])
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_search': {
        initTaskDb(PROJECT_PATH)
        const result = handleTaskSearch(args as Parameters<typeof handleTaskSearch>[0])
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_delete': {
        initTaskDb(PROJECT_PATH)
        const result = handleTaskDelete(args as { id: string })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        }
      }

      case 'task_view': {
        initTaskDb(PROJECT_PATH)
        const result = handleTaskView(args as { id: string })
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
}

main().catch(console.error)
