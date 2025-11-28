#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { readFile, writeFile, readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import matter from 'gray-matter'

import { parseTasksFile, setTaskStatus } from './parser.js'
import { buildTaskContext, readProposal, readDesign } from './context.js'
import type { Change, Task, TasksFile, NextTaskResponse } from './types.js'

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

// Start server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('ZyFlow MCP Server started')
  console.error(`Project path: ${PROJECT_PATH}`)
}

main().catch(console.error)
