/**
 * Scheduler Trigger
 *
 * Cron 기반 스케줄러로 Post-Task 작업 트리거
 */

import type { TaskType, ScheduleConfig } from '../post-task-types.js';
import { loadTriggerConfig, parseInterval } from '../trigger-config.js';
import { getPostTaskRunner } from '../post-task-runner.js';

/**
 * 스케줄러 상태
 */
interface SchedulerState {
  isRunning: boolean;
  jobs: Map<string, NodeJS.Timeout>;
  lastRun: Map<string, Date>;
}

/**
 * 전역 스케줄러 상태
 */
const schedulerState: SchedulerState = {
  isRunning: false,
  jobs: new Map(),
  lastRun: new Map(),
};

/**
 * Cron 표현식 파싱 (간단한 구현)
 */
interface CronSchedule {
  minute: number | '*';
  hour: number | '*';
  dayOfMonth: number | '*';
  month: number | '*';
  dayOfWeek: number | '*';
}

function parseCron(expression: string): CronSchedule | null {
  const parts = expression.split(' ');
  if (parts.length !== 5) return null;

  return {
    minute: parts[0] === '*' ? '*' : parseInt(parts[0], 10),
    hour: parts[1] === '*' ? '*' : parseInt(parts[1], 10),
    dayOfMonth: parts[2] === '*' ? '*' : parseInt(parts[2], 10),
    month: parts[3] === '*' ? '*' : parseInt(parts[3], 10),
    dayOfWeek: parts[4] === '*' ? '*' : parseInt(parts[4], 10),
  };
}

/**
 * 다음 실행 시간 계산 (간단한 구현)
 */
function getNextRunTime(cron: CronSchedule): Date {
  const now = new Date();
  const next = new Date(now);

  // 분 설정
  if (cron.minute !== '*') {
    next.setMinutes(cron.minute);
    if (next <= now) {
      next.setHours(next.getHours() + 1);
    }
  } else {
    next.setMinutes(next.getMinutes() + 1);
  }

  // 시 설정
  if (cron.hour !== '*') {
    next.setHours(cron.hour);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  }

  // 요일 설정
  if (cron.dayOfWeek !== '*') {
    while (next.getDay() !== cron.dayOfWeek) {
      next.setDate(next.getDate() + 1);
    }
  }

  // 일 설정
  if (cron.dayOfMonth !== '*') {
    next.setDate(cron.dayOfMonth);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  // 월 설정
  if (cron.month !== '*') {
    next.setMonth(cron.month - 1); // 0-indexed
    if (next <= now) {
      next.setFullYear(next.getFullYear() + 1);
    }
  }

  next.setSeconds(0);
  next.setMilliseconds(0);

  return next;
}

/**
 * 밀리초 단위로 다음 실행까지의 시간 계산
 */
function getMillisecondsUntilNextRun(cron: CronSchedule): number {
  const next = getNextRunTime(cron);
  return Math.max(0, next.getTime() - Date.now());
}

/**
 * 스케줄 작업 실행
 */
async function executeScheduledTasks(
  projectPath: string,
  schedule: ScheduleConfig
): Promise<void> {
  console.log(`[Scheduler] Running scheduled tasks: ${schedule.tasks.join(', ')}`);

  const runner = getPostTaskRunner(projectPath);

  try {
    const result = await runner.run({
      tasks: schedule.tasks,
      projectPath,
    });

    console.log(`[Scheduler] Completed: ${result.tasksSucceeded}/${result.tasksRun} tasks succeeded`);
  } catch (error) {
    console.error('[Scheduler] Failed to run scheduled tasks:', error);
  }

  // 마지막 실행 시간 업데이트
  schedulerState.lastRun.set(schedule.cron, new Date());
}

/**
 * 스케줄 작업 등록
 */
function scheduleJob(projectPath: string, schedule: ScheduleConfig): void {
  const cron = parseCron(schedule.cron);
  if (!cron) {
    console.error(`[Scheduler] Invalid cron expression: ${schedule.cron}`);
    return;
  }

  // 기존 작업 취소
  if (schedulerState.jobs.has(schedule.cron)) {
    clearTimeout(schedulerState.jobs.get(schedule.cron)!);
  }

  const scheduleNext = () => {
    const delay = getMillisecondsUntilNextRun(cron);
    console.log(`[Scheduler] Next run for "${schedule.description || schedule.cron}" in ${Math.round(delay / 60000)} minutes`);

    const timeout = setTimeout(async () => {
      await executeScheduledTasks(projectPath, schedule);

      // 다음 실행 스케줄
      if (schedulerState.isRunning) {
        scheduleNext();
      }
    }, delay);

    schedulerState.jobs.set(schedule.cron, timeout);
  };

  scheduleNext();
}

/**
 * 스케줄러 시작
 */
export async function startScheduler(projectPath: string): Promise<{
  success: boolean;
  message: string;
  schedules: string[];
}> {
  if (schedulerState.isRunning) {
    return {
      success: false,
      message: 'Scheduler is already running',
      schedules: Array.from(schedulerState.jobs.keys()),
    };
  }

  const config = await loadTriggerConfig(projectPath);
  const schedules: string[] = [];

  if (!config.schedule || config.schedule.length === 0) {
    return {
      success: false,
      message: 'No schedules configured',
      schedules: [],
    };
  }

  schedulerState.isRunning = true;

  for (const schedule of config.schedule) {
    scheduleJob(projectPath, schedule);
    schedules.push(schedule.description || schedule.cron);
  }

  return {
    success: true,
    message: `Scheduler started with ${schedules.length} schedules`,
    schedules,
  };
}

/**
 * 스케줄러 중지
 */
export function stopScheduler(): { success: boolean; message: string } {
  if (!schedulerState.isRunning) {
    return {
      success: false,
      message: 'Scheduler is not running',
    };
  }

  // 모든 작업 취소
  for (const timeout of schedulerState.jobs.values()) {
    clearTimeout(timeout);
  }

  schedulerState.jobs.clear();
  schedulerState.isRunning = false;

  return {
    success: true,
    message: 'Scheduler stopped',
  };
}

/**
 * 스케줄러 상태 조회
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  activeSchedules: number;
  schedules: { cron: string; lastRun?: string; description?: string }[];
} {
  const schedules: { cron: string; lastRun?: string; description?: string }[] = [];

  for (const cron of schedulerState.jobs.keys()) {
    const lastRun = schedulerState.lastRun.get(cron);
    schedules.push({
      cron,
      lastRun: lastRun?.toISOString(),
    });
  }

  return {
    isRunning: schedulerState.isRunning,
    activeSchedules: schedulerState.jobs.size,
    schedules,
  };
}

/**
 * 스케줄 즉시 실행 (테스트용)
 */
export async function runScheduleNow(
  projectPath: string,
  cronExpression: string
): Promise<{ success: boolean; message: string }> {
  const config = await loadTriggerConfig(projectPath);
  const schedule = config.schedule?.find((s) => s.cron === cronExpression);

  if (!schedule) {
    return {
      success: false,
      message: `Schedule not found: ${cronExpression}`,
    };
  }

  await executeScheduledTasks(projectPath, schedule);

  return {
    success: true,
    message: `Executed tasks: ${schedule.tasks.join(', ')}`,
  };
}
