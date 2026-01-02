import {
  initDb,
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  searchTasks,
  getTasksByStatus,
  archiveTask,
  unarchiveTask,
  Task,
  TaskStatus,
  TaskPriority,
  TaskOrigin,
} from '../server/tasks/index.js';

export interface TaskToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// 현재 프로젝트 ID (MCP가 실행되는 프로젝트)
let currentProjectId: string = '';

/**
 * DB 초기화 및 프로젝트 ID 설정
 * 중앙 DB (~/.zyflow/tasks.db)를 사용하므로 projectPath는 projectId 계산에만 사용
 */
export function initTaskDb(projectPath: string): void {
  initDb(); // 중앙 DB 초기화 (projectPath 무시)
  // Extract project ID from path (config.ts의 addProject와 동일한 로직 사용)
  currentProjectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

// Tool handlers
export function handleTaskList(args: {
  status?: string;
  priority?: string;
  tags?: string[];
  limit?: number;
  kanban?: boolean;
  includeArchived?: boolean;
  origin?: string; // 'inbox' | 'openspec' | 'imported'
}, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId || undefined;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    if (args.kanban) {
      const tasksByStatus = getTasksByStatus(projectId, args.includeArchived);
      // origin 필터 적용
      if (args.origin) {
        for (const status of Object.keys(tasksByStatus) as TaskStatus[]) {
          tasksByStatus[status] = tasksByStatus[status].filter(
            (t) => t.origin === args.origin
          );
        }
      }
      const data: Record<string, Task[]> = {
        todo: tasksByStatus['todo'],
        'in-progress': tasksByStatus['in-progress'],
        review: tasksByStatus['review'],
        done: tasksByStatus['done'],
      };
      if (args.includeArchived) {
        data.archived = tasksByStatus['archived'];
      }
      return {
        success: true,
        data,
      };
    }

    const tasks = listTasks({
      projectId, // 현재 프로젝트로 필터링
      status: args.status as TaskStatus | undefined,
      priority: args.priority as TaskPriority | undefined,
      tags: args.tags,
      limit: args.limit,
      includeArchived: args.includeArchived,
      origin: args.origin as TaskOrigin | undefined, // origin 필터 추가
    });

    return {
      success: true,
      data: { tasks, count: tasks.length },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskCreate(args: {
  title: string;
  description?: string;
  priority?: string;
  tags?: string[];
  assignee?: string;
}, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId || 'default';
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }
    const task = createTask({
      projectId,
      title: args.title,
      description: args.description,
      priority: args.priority as TaskPriority | undefined,
      tags: args.tags,
      assignee: args.assignee,
    });

    return {
      success: true,
      data: { task, message: `Created task ${task.id}` },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskUpdate(args: {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  tags?: string[];
  assignee?: string;
}, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    // 먼저 태스크가 현재 프로젝트에 속하는지 확인
    const existing = getTask(args.id);
    if (!existing) {
      return {
        success: false,
        error: `Task not found: ${args.id}`,
      };
    }

    // 현재 프로젝트의 태스크만 수정 가능
    if (projectId && existing.projectId !== projectId) {
      return {
        success: false,
        error: `Task ${args.id} belongs to a different project`,
      };
    }

    const task = updateTask(args.id, {
      title: args.title,
      description: args.description,
      status: args.status as TaskStatus | undefined,
      priority: args.priority as TaskPriority | undefined,
      tags: args.tags,
      assignee: args.assignee,
    });

    return {
      success: true,
      data: { task, message: `Updated task ${task!.id}` },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskSearch(args: {
  query: string;
  status?: string;
  priority?: string;
  limit?: number;
  includeArchived?: boolean;
}, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId || undefined;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    const tasks = searchTasks(args.query, {
      projectId, // 현재 프로젝트로 필터링
      status: args.status,
      priority: args.priority,
      limit: args.limit,
      includeArchived: args.includeArchived,
    });

    return {
      success: true,
      data: { tasks, count: tasks.length, query: args.query },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskDelete(args: { id: string }, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    const task = getTask(args.id);
    if (!task) {
      return {
        success: false,
        error: `Task not found: ${args.id}`,
      };
    }

    // 현재 프로젝트의 태스크만 삭제 가능
    if (projectId && task.projectId !== projectId) {
      return {
        success: false,
        error: `Task ${args.id} belongs to a different project`,
      };
    }

    deleteTask(args.id);

    return {
      success: true,
      data: { id: args.id, message: `Deleted task ${args.id}` },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskView(args: { id: string }, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    const task = getTask(args.id);
    if (!task) {
      return {
        success: false,
        error: `Task not found: ${args.id}`,
      };
    }

    // 현재 프로젝트의 태스크만 조회 가능
    if (projectId && task.projectId !== projectId) {
      return {
        success: false,
        error: `Task ${args.id} belongs to a different project`,
      };
    }

    return {
      success: true,
      data: { task },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskArchive(args: { id: string }, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    // 먼저 태스크가 현재 프로젝트에 속하는지 확인
    const existing = getTask(args.id);
    if (!existing) {
      return {
        success: false,
        error: `Task not found: ${args.id}`,
      };
    }

    // 현재 프로젝트의 태스크만 아카이브 가능
    if (projectId && existing.projectId !== projectId) {
      return {
        success: false,
        error: `Task ${args.id} belongs to a different project`,
      };
    }

    const task = archiveTask(args.id);

    return {
      success: true,
      data: { task, message: `Archived task ${task!.id}` },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleTaskUnarchive(args: { id: string }, overrideProjectPath?: string): TaskToolResult {
  try {
    // overrideProjectPath가 주어지면 그 경로 기준으로 projectId 계산
    let projectId = currentProjectId;
    if (overrideProjectPath) {
      projectId = overrideProjectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    // 먼저 태스크가 현재 프로젝트에 속하는지 확인
    const existing = getTask(args.id);
    if (!existing) {
      return {
        success: false,
        error: `Task not found: ${args.id}`,
      };
    }

    // 현재 프로젝트의 태스크만 복원 가능
    if (projectId && existing.projectId !== projectId) {
      return {
        success: false,
        error: `Task ${args.id} belongs to a different project`,
      };
    }

    if (existing.status !== 'archived') {
      return {
        success: false,
        error: `Task ${args.id} is not archived`,
      };
    }

    const task = unarchiveTask(args.id);

    return {
      success: true,
      data: { task, message: `Unarchived task ${task!.id}` },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Tool definitions for MCP
export const taskToolDefinitions = [
  {
    name: 'task_list',
    description: '태스크 목록을 조회합니다. 상태, 우선순위, 태그, 출처(origin)로 필터링할 수 있습니다. inbox만 보려면 origin: "inbox" 사용.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'review', 'done', 'archived'],
          description: '태스크 상태로 필터링',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '우선순위로 필터링',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '태그로 필터링',
        },
        limit: {
          type: 'number',
          description: '반환할 최대 태스크 수',
        },
        kanban: {
          type: 'boolean',
          description: '칸반 형태로 상태별 그룹화하여 반환',
        },
        includeArchived: {
          type: 'boolean',
          description: '아카이브된 태스크 포함 여부 (기본: false)',
        },
        origin: {
          type: 'string',
          enum: ['inbox', 'openspec', 'imported'],
          description: '태스크 출처로 필터링. inbox: 수동 생성, openspec: tasks.md에서 동기화, imported: 외부에서 가져옴',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리). MCP를 통해 특정 프로젝트의 태스크만 조회할 때 사용',
        },
      },
      required: [],
    },
  },
  {
    name: 'task_create',
    description: '새 태스크를 생성합니다. 작은 버그 수정, 리팩토링, 단순 작업에 사용합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: '태스크 제목',
        },
        description: {
          type: 'string',
          description: '태스크 설명',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '우선순위 (기본: medium)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '태그 목록 (예: bug, refactor, feature)',
        },
        assignee: {
          type: 'string',
          description: '담당자',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'task_update',
    description: '태스크를 수정합니다. 상태, 우선순위, 제목 등을 변경할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: '태스크 ID (예: TASK-1)',
        },
        title: {
          type: 'string',
          description: '새 제목',
        },
        description: {
          type: 'string',
          description: '새 설명',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'review', 'done'],
          description: '새 상태 (archived는 task_archive 사용)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '새 우선순위',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '새 태그 목록',
        },
        assignee: {
          type: 'string',
          description: '새 담당자',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_search',
    description: '태스크를 검색합니다. 제목과 설명에서 키워드를 찾습니다. 기본적으로 archived 제외.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '검색어',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'review', 'done', 'archived'],
          description: '상태로 필터링',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '우선순위로 필터링',
        },
        limit: {
          type: 'number',
          description: '반환할 최대 결과 수',
        },
        includeArchived: {
          type: 'boolean',
          description: '아카이브된 태스크 포함 여부 (기본: false)',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'task_delete',
    description: '태스크를 삭제합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: '삭제할 태스크 ID',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_view',
    description: '태스크 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: '태스크 ID',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_archive',
    description: '태스크를 아카이브합니다. 완료된 작업을 정리할 때 사용합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: '아카이브할 태스크 ID',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_unarchive',
    description: '아카이브된 태스크를 복원합니다. done 상태로 되돌립니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: '복원할 태스크 ID',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 현재 작업 디렉토리)',
        },
      },
      required: ['id'],
    },
  },
];
