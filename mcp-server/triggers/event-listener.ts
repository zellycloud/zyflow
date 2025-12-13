/**
 * Event Listener Trigger
 *
 * GitHub CI, Sentry 등 외부 이벤트 폴링 및 트리거
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TriggerConfig, EventTriggerType, TaskType } from '../post-task-types.js';
import { loadTriggerConfig, parseInterval } from '../trigger-config.js';
import { getPostTaskRunner } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 이벤트 리스너 상태
 */
interface ListenerState {
  isRunning: boolean;
  intervals: Map<string, NodeJS.Timeout>;
  lastCheck: Map<string, Date>;
  lastKnownState: Map<string, string>;
}

/**
 * 전역 리스너 상태
 */
const listenerState: ListenerState = {
  isRunning: false,
  intervals: new Map(),
  lastCheck: new Map(),
  lastKnownState: new Map(),
};

/**
 * GitHub CI 상태 폴링
 */
async function pollGitHubCI(projectPath: string): Promise<{
  hasNewFailure: boolean;
  details?: string;
}> {
  try {
    // 최근 워크플로우 실행 상태 조회
    const { stdout } = await execAsync(
      'gh run list --limit 1 --json databaseId,status,conclusion',
      { cwd: projectPath, maxBuffer: 1024 * 1024 }
    );

    const runs = JSON.parse(stdout);
    if (runs.length === 0) {
      return { hasNewFailure: false };
    }

    const latestRun = runs[0];
    const runKey = `github-ci-${latestRun.databaseId}`;
    const previousState = listenerState.lastKnownState.get('github-ci');

    // 상태 업데이트
    listenerState.lastKnownState.set('github-ci', latestRun.databaseId + '-' + latestRun.conclusion);

    // 새로운 실패 감지
    if (
      latestRun.conclusion === 'failure' &&
      previousState !== latestRun.databaseId + '-failure'
    ) {
      return {
        hasNewFailure: true,
        details: `Run ${latestRun.databaseId} failed`,
      };
    }

    return { hasNewFailure: false };
  } catch {
    return { hasNewFailure: false };
  }
}

/**
 * Sentry 이슈 폴링
 */
async function pollSentry(projectPath: string): Promise<{
  hasNewIssue: boolean;
  details?: string;
}> {
  try {
    // Sentry API로 최근 이슈 조회
    const token = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG;
    const project = process.env.SENTRY_PROJECT;

    if (!token || !org || !project) {
      return { hasNewIssue: false };
    }

    const response = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return { hasNewIssue: false };
    }

    const issues = await response.json() as { id: string; shortId: string; title: string }[];

    if (issues.length === 0) {
      return { hasNewIssue: false };
    }

    const latestIssue = issues[0];
    const previousState = listenerState.lastKnownState.get('sentry');

    // 상태 업데이트
    listenerState.lastKnownState.set('sentry', latestIssue.id);

    // 새로운 이슈 감지
    if (previousState !== latestIssue.id && previousState !== undefined) {
      return {
        hasNewIssue: true,
        details: `New issue: ${latestIssue.shortId} - ${latestIssue.title}`,
      };
    }

    return { hasNewIssue: false };
  } catch {
    return { hasNewIssue: false };
  }
}

/**
 * 이벤트에 따른 작업 실행
 */
async function triggerTasksForEvent(
  projectPath: string,
  eventType: EventTriggerType,
  details?: string
): Promise<void> {
  const config = await loadTriggerConfig(projectPath);
  const tasks = config.events?.[eventType];

  if (!tasks || tasks.length === 0) {
    console.log(`[EventListener] No tasks configured for event: ${eventType}`);
    return;
  }

  console.log(`[EventListener] Triggering tasks for ${eventType}: ${tasks.join(', ')}`);
  if (details) {
    console.log(`[EventListener] Details: ${details}`);
  }

  const runner = getPostTaskRunner(projectPath);

  try {
    const result = await runner.run({
      tasks,
      projectPath,
    });

    console.log(`[EventListener] Completed: ${result.tasksSucceeded}/${result.tasksRun} tasks succeeded`);
  } catch (error) {
    console.error('[EventListener] Failed to run tasks:', error);
  }
}

/**
 * GitHub CI 폴링 시작
 */
function startGitHubCIPolling(projectPath: string, interval: number): void {
  const poll = async () => {
    listenerState.lastCheck.set('github-ci', new Date());
    const result = await pollGitHubCI(projectPath);

    if (result.hasNewFailure) {
      await triggerTasksForEvent(projectPath, 'ci-failure', result.details);
    }
  };

  // 즉시 실행
  poll();

  // 주기적 폴링
  const intervalId = setInterval(poll, interval);
  listenerState.intervals.set('github-ci', intervalId);
}

/**
 * Sentry 폴링 시작
 */
function startSentryPolling(projectPath: string, interval: number): void {
  const poll = async () => {
    listenerState.lastCheck.set('sentry', new Date());
    const result = await pollSentry(projectPath);

    if (result.hasNewIssue) {
      await triggerTasksForEvent(projectPath, 'sentry-issue', result.details);
    }
  };

  // 즉시 실행
  poll();

  // 주기적 폴링
  const intervalId = setInterval(poll, interval);
  listenerState.intervals.set('sentry', intervalId);
}

/**
 * 이벤트 리스너 시작
 */
export async function startEventListener(projectPath: string): Promise<{
  success: boolean;
  message: string;
  listeners: string[];
}> {
  if (listenerState.isRunning) {
    return {
      success: false,
      message: 'Event listener is already running',
      listeners: Array.from(listenerState.intervals.keys()),
    };
  }

  const config = await loadTriggerConfig(projectPath);
  const listeners: string[] = [];

  listenerState.isRunning = true;

  // GitHub CI 폴링
  if (config.polling?.['github-ci']?.enabled) {
    const interval = parseInterval(config.polling['github-ci'].interval);
    startGitHubCIPolling(projectPath, interval);
    listeners.push('github-ci');
  }

  // Sentry 폴링
  if (config.polling?.sentry?.enabled) {
    const interval = parseInterval(config.polling.sentry.interval);
    startSentryPolling(projectPath, interval);
    listeners.push('sentry');
  }

  if (listeners.length === 0) {
    listenerState.isRunning = false;
    return {
      success: false,
      message: 'No event listeners configured or enabled',
      listeners: [],
    };
  }

  return {
    success: true,
    message: `Started ${listeners.length} event listener(s)`,
    listeners,
  };
}

/**
 * 이벤트 리스너 중지
 */
export function stopEventListener(): { success: boolean; message: string } {
  if (!listenerState.isRunning) {
    return {
      success: false,
      message: 'Event listener is not running',
    };
  }

  // 모든 인터벌 취소
  for (const intervalId of listenerState.intervals.values()) {
    clearInterval(intervalId);
  }

  listenerState.intervals.clear();
  listenerState.isRunning = false;

  return {
    success: true,
    message: 'Event listener stopped',
  };
}

/**
 * 이벤트 리스너 상태 조회
 */
export function getEventListenerStatus(): {
  isRunning: boolean;
  listeners: {
    source: string;
    lastCheck?: string;
    lastKnownState?: string;
  }[];
} {
  const listeners: {
    source: string;
    lastCheck?: string;
    lastKnownState?: string;
  }[] = [];

  for (const source of listenerState.intervals.keys()) {
    listeners.push({
      source,
      lastCheck: listenerState.lastCheck.get(source)?.toISOString(),
      lastKnownState: listenerState.lastKnownState.get(source),
    });
  }

  return {
    isRunning: listenerState.isRunning,
    listeners,
  };
}

/**
 * 수동 이벤트 트리거 (테스트용)
 */
export async function triggerEvent(
  projectPath: string,
  eventType: EventTriggerType
): Promise<{ success: boolean; message: string }> {
  await triggerTasksForEvent(projectPath, eventType, 'Manual trigger');

  return {
    success: true,
    message: `Triggered event: ${eventType}`,
  };
}
