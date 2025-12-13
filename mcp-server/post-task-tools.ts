/**
 * Post-Task MCP Tools
 *
 * Post-Task Agent를 위한 MCP 도구 정의 및 핸들러
 */

import type { TaskCategory, TaskType, CLIType, ModelTier } from './post-task-types.js';
import { TASK_CATEGORIES } from './post-task-types.js';
import { getPostTaskRunner, isValidTask, isValidCategory } from './post-task-runner.js';
import { getQuarantineManager } from './quarantine-manager.js';
import { loadTriggerConfig } from './trigger-config.js';
import { installAllHooks, uninstallAllHooks, listInstalledHooks } from './triggers/git-hooks.js';
import { startScheduler, stopScheduler, getSchedulerStatus } from './triggers/scheduler.js';
import { startEventListener, stopEventListener, getEventListenerStatus } from './triggers/event-listener.js';
import { getTriggerSummary } from './trigger-router.js';
import { saveReport, listReports, getReport } from './report-generator.js';

// Task executor imports (register on import)
import './tasks/lint-fix.js';
import './tasks/type-check.js';
import './tasks/dead-code.js';
import './tasks/todo-cleanup.js';
import './tasks/refactor-suggest.js';
import './tasks/test-fix.js';
import './tasks/test-gen.js';
import './tasks/e2e-expand.js';
import './tasks/coverage-fix.js';
import './tasks/snapshot-update.js';
import './tasks/flaky-detect.js';
import './tasks/ci-fix.js';
import './tasks/dep-audit.js';
import './tasks/bundle-check.js';
import './tasks/sentry-triage.js';
import './tasks/security-audit.js';
import './tasks/api-validate.js';

/**
 * MCP 도구 정의
 */
export const postTaskToolDefinitions = [
  // 메인 실행 도구
  {
    name: 'post_task_run',
    description:
      'Post-Task Agent 작업을 실행합니다. 카테고리별 또는 개별 작업을 지정하여 코드 품질 점검, 테스트 자동화, CI/CD 분석, 프로덕션 모니터링을 수행합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'code-quality', 'testing', 'ci-cd', 'production', 'maintenance'],
          description: '실행할 카테고리 (all: 전체, 또는 특정 카테고리)',
        },
        tasks: {
          type: 'array',
          items: { type: 'string' },
          description:
            '실행할 개별 작업 목록 (예: ["lint-fix", "type-check"]). category와 함께 사용 불가',
        },
        cli: {
          type: 'string',
          enum: ['claude', 'gemini', 'qwen', 'openai'],
          description: '사용할 CLI (기본값: claude)',
        },
        model: {
          type: 'string',
          enum: ['fast', 'balanced', 'powerful'],
          description: '모델 티어 오버라이드',
        },
        dryRun: {
          type: 'boolean',
          description: '드라이런 모드 (실제 변경 없이 분석만)',
        },
        noCommit: {
          type: 'boolean',
          description: '자동 커밋 비활성화',
        },
      },
    },
  },

  // Quarantine 도구들
  {
    name: 'quarantine_list',
    description: '.quarantine/ 폴더의 격리된 파일 목록을 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['quarantined', 'pending', 'expired'],
          description: '상태별 필터링',
        },
        date: {
          type: 'string',
          description: '날짜별 필터링 (예: 2024-12-13)',
        },
      },
    },
  },
  {
    name: 'quarantine_restore',
    description: '격리된 파일을 원래 위치로 복구합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        itemId: {
          type: 'string',
          description: '복구할 항목의 ID',
        },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'quarantine_delete',
    description: '격리된 파일을 영구 삭제합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        itemId: {
          type: 'string',
          description: '삭제할 항목의 ID',
        },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'quarantine_stats',
    description: '격리 시스템 통계를 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // Trigger 도구들
  {
    name: 'post_task_setup_hooks',
    description: 'Git hooks를 설치하여 커밋/푸시 시 자동으로 Post-Task를 실행합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['install', 'uninstall', 'list'],
          description: '수행할 작업 (install: 설치, uninstall: 제거, list: 목록)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'post_task_start_scheduler',
    description: '스케줄러를 시작하여 정해진 시간에 Post-Task를 실행합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop', 'status'],
          description: '수행할 작업',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'post_task_event_listener',
    description: '이벤트 리스너를 시작하여 CI 실패, Sentry 이슈 등에 반응합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop', 'status'],
          description: '수행할 작업',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'post_task_trigger_status',
    description: '전체 트리거 시스템 상태를 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // Report 도구들
  {
    name: 'post_task_reports',
    description: 'Post-Task 실행 리포트 목록을 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: '최대 조회 개수',
        },
        taskType: {
          type: 'string',
          description: '작업 타입별 필터링',
        },
      },
    },
  },
  {
    name: 'post_task_report_view',
    description: '특정 리포트의 상세 내용을 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        reportId: {
          type: 'string',
          description: '리포트 ID',
        },
      },
      required: ['reportId'],
    },
  },
];

/**
 * post_task_run 핸들러
 */
export async function handlePostTaskRun(
  args: {
    category?: string;
    tasks?: string[];
    cli?: string;
    model?: string;
    dryRun?: boolean;
    noCommit?: boolean;
  },
  projectPath: string
): Promise<{ success: boolean; message?: string; result?: unknown }> {
  try {
    // 유효성 검사
    if (args.category && args.tasks) {
      return {
        success: false,
        message: 'category와 tasks는 동시에 지정할 수 없습니다.',
      };
    }

    if (args.tasks) {
      for (const task of args.tasks) {
        if (!isValidTask(task)) {
          return {
            success: false,
            message: `유효하지 않은 작업: ${task}`,
          };
        }
      }
    }

    if (args.category && !isValidCategory(args.category)) {
      return {
        success: false,
        message: `유효하지 않은 카테고리: ${args.category}`,
      };
    }

    const runner = getPostTaskRunner(projectPath);
    const result = await runner.run({
      category: args.category as TaskCategory | 'all',
      tasks: args.tasks as TaskType[],
      cli: args.cli as CLIType,
      model: args.model as ModelTier,
      projectPath,
      dryRun: args.dryRun,
      noCommit: args.noCommit,
    });

    // 리포트 저장
    await saveReport(projectPath, result, 'markdown', 'manual');
    await saveReport(projectPath, result, 'json', 'manual');

    return {
      success: true,
      result: {
        runId: result.runId,
        success: result.success,
        tasksRun: result.tasksRun,
        tasksSucceeded: result.tasksSucceeded,
        tasksFailed: result.tasksFailed,
        totalDuration: result.totalDuration,
        summary: result.results.map((r) => ({
          task: r.task,
          success: r.success,
          issuesFound: r.issuesFound,
          issuesFixed: r.issuesFixed,
        })),
        reportPath: result.reportPath,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * quarantine_list 핸들러
 */
export async function handleQuarantineList(
  args: { status?: string; date?: string },
  projectPath: string
): Promise<{ success: boolean; items?: unknown[]; message?: string }> {
  try {
    const manager = getQuarantineManager(projectPath);
    const items = await manager.list({
      status: args.status as 'quarantined' | 'pending' | 'expired',
      date: args.date,
    });

    return {
      success: true,
      items,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * quarantine_restore 핸들러
 */
export async function handleQuarantineRestore(
  args: { itemId: string },
  projectPath: string
): Promise<{ success: boolean; message: string }> {
  const manager = getQuarantineManager(projectPath);
  return manager.restore(args.itemId);
}

/**
 * quarantine_delete 핸들러
 */
export async function handleQuarantineDelete(
  args: { itemId: string },
  projectPath: string
): Promise<{ success: boolean; message: string }> {
  const manager = getQuarantineManager(projectPath);
  return manager.delete(args.itemId);
}

/**
 * quarantine_stats 핸들러
 */
export async function handleQuarantineStats(
  projectPath: string
): Promise<{ success: boolean; stats?: unknown; message?: string }> {
  try {
    const manager = getQuarantineManager(projectPath);
    const stats = await manager.getStats();

    return {
      success: true,
      stats,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * post_task_setup_hooks 핸들러
 */
export async function handleSetupHooks(
  args: { action: string },
  projectPath: string
): Promise<{ success: boolean; message?: string; result?: unknown }> {
  try {
    switch (args.action) {
      case 'install': {
        const result = await installAllHooks(projectPath);
        return {
          success: result.failed.length === 0,
          message: result.messages.join('\n'),
          result: {
            installed: result.installed,
            failed: result.failed,
          },
        };
      }
      case 'uninstall': {
        const result = await uninstallAllHooks(projectPath);
        return {
          success: true,
          message: result.messages.join('\n'),
          result: {
            uninstalled: result.uninstalled,
          },
        };
      }
      case 'list': {
        const hooks = await listInstalledHooks(projectPath);
        return {
          success: true,
          result: hooks,
        };
      }
      default:
        return {
          success: false,
          message: `Unknown action: ${args.action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * post_task_start_scheduler 핸들러
 */
export async function handleScheduler(
  args: { action: string },
  projectPath: string
): Promise<{ success: boolean; message?: string; result?: unknown }> {
  try {
    switch (args.action) {
      case 'start': {
        const result = await startScheduler(projectPath);
        return result;
      }
      case 'stop': {
        const result = stopScheduler();
        return result;
      }
      case 'status': {
        const status = getSchedulerStatus();
        return {
          success: true,
          result: status,
        };
      }
      default:
        return {
          success: false,
          message: `Unknown action: ${args.action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * post_task_event_listener 핸들러
 */
export async function handleEventListener(
  args: { action: string },
  projectPath: string
): Promise<{ success: boolean; message?: string; result?: unknown }> {
  try {
    switch (args.action) {
      case 'start': {
        const result = await startEventListener(projectPath);
        return result;
      }
      case 'stop': {
        const result = stopEventListener();
        return result;
      }
      case 'status': {
        const status = getEventListenerStatus();
        return {
          success: true,
          result: status,
        };
      }
      default:
        return {
          success: false,
          message: `Unknown action: ${args.action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * post_task_trigger_status 핸들러
 */
export function handleTriggerStatus(): { success: boolean; result: unknown } {
  const summary = getTriggerSummary();
  const schedulerStatus = getSchedulerStatus();
  const listenerStatus = getEventListenerStatus();

  return {
    success: true,
    result: {
      queue: summary.queue,
      recentTriggers: summary.recentTriggers,
      scheduler: schedulerStatus,
      eventListener: listenerStatus,
    },
  };
}

/**
 * post_task_reports 핸들러
 */
export async function handleReportsList(
  args: { limit?: number; taskType?: string },
  projectPath: string
): Promise<{ success: boolean; reports?: unknown[]; message?: string }> {
  try {
    const reports = await listReports(projectPath, {
      limit: args.limit,
      taskType: args.taskType as TaskType,
    });

    return {
      success: true,
      reports,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * post_task_report_view 핸들러
 */
export async function handleReportView(
  args: { reportId: string },
  projectPath: string
): Promise<{ success: boolean; report?: unknown; message?: string }> {
  try {
    const report = await getReport(projectPath, args.reportId);

    if (!report) {
      return {
        success: false,
        message: `Report not found: ${args.reportId}`,
      };
    }

    return {
      success: true,
      report,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
