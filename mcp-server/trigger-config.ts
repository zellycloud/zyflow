/**
 * Trigger Configuration
 *
 * .zyflow/triggers.json 스키마 정의 및 설정 로더
 */

import { join } from 'path';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import type { TriggerConfig, TaskType } from './post-task-types.js';
import { DEFAULT_TRIGGER_CONFIG } from './post-task-types.js';

/**
 * 트리거 설정 파일 경로
 */
const TRIGGER_CONFIG_FILE = '.zyflow/triggers.json';

/**
 * 파일 존재 확인
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 트리거 설정 로드
 */
export async function loadTriggerConfig(projectPath: string): Promise<TriggerConfig> {
  const configPath = join(projectPath, TRIGGER_CONFIG_FILE);

  try {
    if (await fileExists(configPath)) {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as Partial<TriggerConfig>;

      // 기본값과 병합
      return {
        hooks: { ...DEFAULT_TRIGGER_CONFIG.hooks, ...config.hooks },
        schedule: config.schedule || DEFAULT_TRIGGER_CONFIG.schedule,
        events: { ...DEFAULT_TRIGGER_CONFIG.events, ...config.events },
        polling: { ...DEFAULT_TRIGGER_CONFIG.polling, ...config.polling },
      };
    }
  } catch (error) {
    console.error('Failed to load trigger config:', error);
  }

  return { ...DEFAULT_TRIGGER_CONFIG };
}

/**
 * 트리거 설정 저장
 */
export async function saveTriggerConfig(
  projectPath: string,
  config: TriggerConfig
): Promise<void> {
  const configPath = join(projectPath, TRIGGER_CONFIG_FILE);
  const dir = join(projectPath, '.zyflow');

  await mkdir(dir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 기본 트리거 설정으로 초기화
 */
export async function initTriggerConfig(projectPath: string): Promise<TriggerConfig> {
  const config = { ...DEFAULT_TRIGGER_CONFIG };
  await saveTriggerConfig(projectPath, config);
  return config;
}

/**
 * Hook에 작업 추가
 */
export async function addTaskToHook(
  projectPath: string,
  hook: keyof NonNullable<TriggerConfig['hooks']>,
  task: TaskType
): Promise<TriggerConfig> {
  const config = await loadTriggerConfig(projectPath);

  if (!config.hooks) {
    config.hooks = {};
  }

  if (!config.hooks[hook]) {
    config.hooks[hook] = [];
  }

  if (!config.hooks[hook]!.includes(task)) {
    config.hooks[hook]!.push(task);
  }

  await saveTriggerConfig(projectPath, config);
  return config;
}

/**
 * Hook에서 작업 제거
 */
export async function removeTaskFromHook(
  projectPath: string,
  hook: keyof NonNullable<TriggerConfig['hooks']>,
  task: TaskType
): Promise<TriggerConfig> {
  const config = await loadTriggerConfig(projectPath);

  if (config.hooks && config.hooks[hook]) {
    config.hooks[hook] = config.hooks[hook]!.filter((t) => t !== task);
  }

  await saveTriggerConfig(projectPath, config);
  return config;
}

/**
 * 스케줄 추가
 */
export async function addSchedule(
  projectPath: string,
  cron: string,
  tasks: TaskType[],
  description?: string
): Promise<TriggerConfig> {
  const config = await loadTriggerConfig(projectPath);

  if (!config.schedule) {
    config.schedule = [];
  }

  // 중복 cron 확인
  const existing = config.schedule.find((s) => s.cron === cron);
  if (existing) {
    // 기존 스케줄에 작업 추가
    for (const task of tasks) {
      if (!existing.tasks.includes(task)) {
        existing.tasks.push(task);
      }
    }
    if (description) {
      existing.description = description;
    }
  } else {
    config.schedule.push({ cron, tasks, description });
  }

  await saveTriggerConfig(projectPath, config);
  return config;
}

/**
 * 스케줄 제거
 */
export async function removeSchedule(
  projectPath: string,
  cron: string
): Promise<TriggerConfig> {
  const config = await loadTriggerConfig(projectPath);

  if (config.schedule) {
    config.schedule = config.schedule.filter((s) => s.cron !== cron);
  }

  await saveTriggerConfig(projectPath, config);
  return config;
}

/**
 * 이벤트에 작업 추가
 */
export async function addTaskToEvent(
  projectPath: string,
  event: keyof NonNullable<TriggerConfig['events']>,
  task: TaskType
): Promise<TriggerConfig> {
  const config = await loadTriggerConfig(projectPath);

  if (!config.events) {
    config.events = {};
  }

  if (!config.events[event]) {
    config.events[event] = [];
  }

  if (!config.events[event]!.includes(task)) {
    config.events[event]!.push(task);
  }

  await saveTriggerConfig(projectPath, config);
  return config;
}

/**
 * 폴링 설정 업데이트
 */
export async function updatePollingConfig(
  projectPath: string,
  source: 'github-ci' | 'sentry',
  config: { interval: string; enabled: boolean }
): Promise<TriggerConfig> {
  const triggerConfig = await loadTriggerConfig(projectPath);

  if (!triggerConfig.polling) {
    triggerConfig.polling = {};
  }

  triggerConfig.polling[source] = config;

  await saveTriggerConfig(projectPath, triggerConfig);
  return triggerConfig;
}

/**
 * 설정 유효성 검사
 */
export function validateTriggerConfig(config: TriggerConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Cron 표현식 검증
  if (config.schedule) {
    for (const schedule of config.schedule) {
      if (!isValidCron(schedule.cron)) {
        errors.push(`Invalid cron expression: ${schedule.cron}`);
      }
    }
  }

  // 폴링 간격 검증
  if (config.polling) {
    for (const [source, settings] of Object.entries(config.polling)) {
      if (!isValidInterval(settings.interval)) {
        errors.push(`Invalid polling interval for ${source}: ${settings.interval}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Cron 표현식 유효성 검사 (간단한 검증)
 */
function isValidCron(cron: string): boolean {
  const parts = cron.split(' ');
  return parts.length === 5 || parts.length === 6;
}

/**
 * 폴링 간격 유효성 검사
 */
function isValidInterval(interval: string): boolean {
  return /^\d+[smh]$/.test(interval);
}

/**
 * 간격 문자열을 밀리초로 변환
 */
export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)([smh])$/);
  if (!match) return 60000; // 기본값 1분

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return 60000;
  }
}
