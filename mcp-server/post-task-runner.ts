/**
 * Post-Task Runner Engine
 *
 * Post-Task 작업 실행을 관리하는 메인 엔진
 */

import { randomUUID } from 'crypto';
import type {
  TaskCategory,
  TaskType,
  PostTaskConfig,
  PostTaskResult,
  TaskResult,
  CLIType,
  ModelTier,
} from './post-task-types.js';
import { TASK_CATEGORIES } from './post-task-types.js';
import { selectModelForTask } from './cli-models.js';

// ============================================================================
// Task Registry
// ============================================================================

/**
 * 작업 실행 함수 타입
 */
export type TaskExecutor = (
  projectPath: string,
  options: TaskExecutorOptions
) => Promise<TaskResult>;

/**
 * 작업 실행 옵션
 */
export interface TaskExecutorOptions {
  cli: CLIType;
  model: string;
  tier: ModelTier;
  dryRun: boolean;
  noCommit: boolean;
}

/**
 * 등록된 작업 실행기
 */
const taskExecutors = new Map<TaskType, TaskExecutor>();

/**
 * 작업 실행기 등록
 */
export function registerTaskExecutor(taskType: TaskType, executor: TaskExecutor): void {
  taskExecutors.set(taskType, executor);
}

/**
 * 작업 실행기 가져오기
 */
export function getTaskExecutor(taskType: TaskType): TaskExecutor | undefined {
  return taskExecutors.get(taskType);
}

// ============================================================================
// Task Runner
// ============================================================================

/**
 * Post-Task Runner
 */
export class PostTaskRunner {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * 작업 실행
   */
  async run(config: PostTaskConfig): Promise<PostTaskResult> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const results: TaskResult[] = [];

    // 실행할 작업 목록 결정
    const tasksToRun = this.resolveTasks(config);

    // 각 작업 실행
    for (const task of tasksToRun) {
      const result = await this.executeTask(task, config);
      results.push(result);
    }

    const finishedAt = new Date().toISOString();
    const totalDuration = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

    const tasksSucceeded = results.filter((r) => r.success).length;
    const tasksFailed = results.filter((r) => !r.success).length;

    return {
      runId,
      startedAt,
      finishedAt,
      totalDuration,
      success: tasksFailed === 0,
      tasksRun: results.length,
      tasksSucceeded,
      tasksFailed,
      results,
    };
  }

  /**
   * 실행할 작업 목록 결정
   */
  private resolveTasks(config: PostTaskConfig): TaskType[] {
    // 개별 작업이 지정된 경우
    if (config.tasks && config.tasks.length > 0) {
      return config.tasks;
    }

    // 카테고리로 지정된 경우
    if (config.category) {
      if (config.category === 'all') {
        return Object.values(TASK_CATEGORIES).flat();
      }
      return TASK_CATEGORIES[config.category] || [];
    }

    // 기본값: 빈 배열
    return [];
  }

  /**
   * 개별 작업 실행
   */
  private async executeTask(task: TaskType, config: PostTaskConfig): Promise<TaskResult> {
    const startTime = Date.now();

    // 모델 선택
    const { cli, model, tier } = selectModelForTask(task, {
      cli: config.cli,
      modelOverride: config.model,
    });

    const options: TaskExecutorOptions = {
      cli,
      model,
      tier,
      dryRun: config.dryRun ?? false,
      noCommit: config.noCommit ?? false,
    };

    // 등록된 실행기 찾기
    const executor = getTaskExecutor(task);

    if (!executor) {
      return {
        task,
        success: false,
        duration: Date.now() - startTime,
        issuesFound: 0,
        issuesFixed: 0,
        model,
        cli,
        error: `Task executor not registered: ${task}`,
      };
    }

    try {
      const result = await executor(this.projectPath, options);
      return {
        ...result,
        duration: Date.now() - startTime,
        model,
        cli,
      };
    } catch (error) {
      return {
        task,
        success: false,
        duration: Date.now() - startTime,
        issuesFound: 0,
        issuesFixed: 0,
        model,
        cli,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 카테고리명으로 작업 목록 가져오기
 */
export function getTasksByCategory(category: TaskCategory | 'all'): TaskType[] {
  if (category === 'all') {
    return Object.values(TASK_CATEGORIES).flat();
  }
  return TASK_CATEGORIES[category] || [];
}

/**
 * 작업이 속한 카테고리 찾기
 */
export function getCategoryForTask(task: TaskType): TaskCategory | null {
  for (const [category, tasks] of Object.entries(TASK_CATEGORIES)) {
    if (tasks.includes(task)) {
      return category as TaskCategory;
    }
  }
  return null;
}

/**
 * 유효한 작업인지 확인
 */
export function isValidTask(task: string): task is TaskType {
  return Object.values(TASK_CATEGORIES).flat().includes(task as TaskType);
}

/**
 * 유효한 카테고리인지 확인
 */
export function isValidCategory(category: string): category is TaskCategory | 'all' {
  return category === 'all' || Object.keys(TASK_CATEGORIES).includes(category);
}

// ============================================================================
// Default Runner Instance
// ============================================================================

let defaultRunner: PostTaskRunner | null = null;

/**
 * 기본 Runner 인스턴스 가져오기
 */
export function getPostTaskRunner(projectPath?: string): PostTaskRunner {
  if (!defaultRunner || projectPath) {
    defaultRunner = new PostTaskRunner(projectPath || process.cwd());
  }
  return defaultRunner;
}

/**
 * 기본 Runner 리셋
 */
export function resetPostTaskRunner(): void {
  defaultRunner = null;
}
