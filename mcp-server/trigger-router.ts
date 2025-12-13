/**
 * Trigger Router
 *
 * 트리거 → 작업 매핑 및 실행 관리
 */

import type { TriggerType, TaskType, GitHookType, EventTriggerType } from './post-task-types.js';
import { loadTriggerConfig } from './trigger-config.js';
import { getPostTaskRunner } from './post-task-runner.js';

/**
 * 실행 큐 항목
 */
interface QueueItem {
  id: string;
  triggerType: TriggerType;
  triggerSource: string;
  tasks: TaskType[];
  queuedAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
}

/**
 * 중복 실행 방지를 위한 키
 */
type DedupKey = string;

/**
 * 라우터 상태
 */
interface RouterState {
  queue: QueueItem[];
  recentDedup: Map<DedupKey, Date>;
  isProcessing: boolean;
  maxQueueSize: number;
  dedupWindow: number; // ms
}

/**
 * 전역 라우터 상태
 */
const routerState: RouterState = {
  queue: [],
  recentDedup: new Map(),
  isProcessing: false,
  maxQueueSize: 100,
  dedupWindow: 60000, // 1분 이내 중복 실행 방지
};

/**
 * 중복 실행 키 생성
 */
function createDedupKey(triggerType: TriggerType, triggerSource: string, tasks: TaskType[]): DedupKey {
  return `${triggerType}:${triggerSource}:${tasks.sort().join(',')}`;
}

/**
 * 중복 실행 확인
 */
function isDuplicate(dedupKey: DedupKey): boolean {
  const lastRun = routerState.recentDedup.get(dedupKey);
  if (!lastRun) return false;

  const elapsed = Date.now() - lastRun.getTime();
  return elapsed < routerState.dedupWindow;
}

/**
 * 중복 방지 기록 업데이트
 */
function updateDedup(dedupKey: DedupKey): void {
  routerState.recentDedup.set(dedupKey, new Date());

  // 오래된 기록 정리
  const now = Date.now();
  for (const [key, date] of routerState.recentDedup.entries()) {
    if (now - date.getTime() > routerState.dedupWindow * 2) {
      routerState.recentDedup.delete(key);
    }
  }
}

/**
 * 작업을 큐에 추가
 */
export function enqueue(
  triggerType: TriggerType,
  triggerSource: string,
  tasks: TaskType[],
  options?: { skipDedup?: boolean }
): { success: boolean; message: string; itemId?: string } {
  // 큐 크기 확인
  if (routerState.queue.length >= routerState.maxQueueSize) {
    return {
      success: false,
      message: 'Queue is full',
    };
  }

  // 중복 확인
  const dedupKey = createDedupKey(triggerType, triggerSource, tasks);
  if (!options?.skipDedup && isDuplicate(dedupKey)) {
    return {
      success: false,
      message: 'Duplicate execution prevented',
    };
  }

  // 큐에 추가
  const item: QueueItem = {
    id: crypto.randomUUID(),
    triggerType,
    triggerSource,
    tasks,
    queuedAt: new Date(),
    status: 'pending',
  };

  routerState.queue.push(item);
  updateDedup(dedupKey);

  // 큐 처리 시작
  processQueue();

  return {
    success: true,
    message: 'Task queued',
    itemId: item.id,
  };
}

/**
 * 큐 처리
 */
async function processQueue(): Promise<void> {
  if (routerState.isProcessing) return;

  routerState.isProcessing = true;

  while (true) {
    const pendingItem = routerState.queue.find((item) => item.status === 'pending');
    if (!pendingItem) break;

    pendingItem.status = 'running';

    try {
      const runner = getPostTaskRunner();
      const result = await runner.run({
        tasks: pendingItem.tasks,
      });

      pendingItem.status = 'completed';
      pendingItem.result = result;
    } catch (error) {
      pendingItem.status = 'failed';
      pendingItem.result = { error: error instanceof Error ? error.message : String(error) };
    }

    // 완료된 항목 정리 (최근 10개만 유지)
    const completed = routerState.queue.filter(
      (item) => item.status === 'completed' || item.status === 'failed'
    );
    if (completed.length > 10) {
      const toRemove = completed.slice(0, completed.length - 10);
      routerState.queue = routerState.queue.filter((item) => !toRemove.includes(item));
    }
  }

  routerState.isProcessing = false;
}

/**
 * Git Hook 트리거 라우팅
 */
export async function routeGitHook(
  projectPath: string,
  hookType: GitHookType
): Promise<{ success: boolean; message: string }> {
  const config = await loadTriggerConfig(projectPath);
  const tasks = config.hooks?.[hookType];

  if (!tasks || tasks.length === 0) {
    return {
      success: false,
      message: `No tasks configured for hook: ${hookType}`,
    };
  }

  return enqueue('git-hook', hookType, tasks);
}

/**
 * 이벤트 트리거 라우팅
 */
export async function routeEvent(
  projectPath: string,
  eventType: EventTriggerType
): Promise<{ success: boolean; message: string }> {
  const config = await loadTriggerConfig(projectPath);
  const tasks = config.events?.[eventType];

  if (!tasks || tasks.length === 0) {
    return {
      success: false,
      message: `No tasks configured for event: ${eventType}`,
    };
  }

  return enqueue('event', eventType, tasks);
}

/**
 * 수동 트리거 라우팅
 */
export function routeManual(tasks: TaskType[]): { success: boolean; message: string; itemId?: string } {
  return enqueue('manual', 'user', tasks, { skipDedup: true });
}

/**
 * 스케줄 트리거 라우팅
 */
export function routeScheduled(
  cronExpression: string,
  tasks: TaskType[]
): { success: boolean; message: string; itemId?: string } {
  return enqueue('scheduled', cronExpression, tasks);
}

/**
 * 큐 상태 조회
 */
export function getQueueStatus(): {
  isProcessing: boolean;
  queueLength: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  items: QueueItem[];
} {
  const pending = routerState.queue.filter((i) => i.status === 'pending').length;
  const running = routerState.queue.filter((i) => i.status === 'running').length;
  const completed = routerState.queue.filter((i) => i.status === 'completed').length;
  const failed = routerState.queue.filter((i) => i.status === 'failed').length;

  return {
    isProcessing: routerState.isProcessing,
    queueLength: routerState.queue.length,
    pending,
    running,
    completed,
    failed,
    items: routerState.queue.slice(-20), // 최근 20개만
  };
}

/**
 * 큐 항목 조회
 */
export function getQueueItem(itemId: string): QueueItem | undefined {
  return routerState.queue.find((item) => item.id === itemId);
}

/**
 * 큐 정리
 */
export function clearQueue(): { success: boolean; cleared: number } {
  const pendingCount = routerState.queue.filter((i) => i.status === 'pending').length;

  // 실행 중인 항목을 제외하고 모두 제거
  routerState.queue = routerState.queue.filter((item) => item.status === 'running');

  return {
    success: true,
    cleared: pendingCount,
  };
}

/**
 * 중복 방지 윈도우 설정
 */
export function setDedupWindow(windowMs: number): void {
  routerState.dedupWindow = windowMs;
}

/**
 * 전체 트리거 상태 요약
 */
export function getTriggerSummary(): {
  queue: ReturnType<typeof getQueueStatus>;
  recentTriggers: { key: string; lastRun: string }[];
} {
  const recentTriggers = Array.from(routerState.recentDedup.entries())
    .map(([key, date]) => ({
      key,
      lastRun: date.toISOString(),
    }))
    .slice(-10);

  return {
    queue: getQueueStatus(),
    recentTriggers,
  };
}
