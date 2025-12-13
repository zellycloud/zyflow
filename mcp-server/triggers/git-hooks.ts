/**
 * Git Hooks Trigger
 *
 * Git hook을 통한 Post-Task 작업 트리거
 */

import { join } from 'path';
import { writeFile, readFile, chmod, mkdir, access, unlink } from 'fs/promises';
import type { TriggerConfig, GitHookType, TaskType } from '../post-task-types.js';
import { loadTriggerConfig } from '../trigger-config.js';

/**
 * Git hooks 디렉토리
 */
const GIT_HOOKS_DIR = '.git/hooks';

/**
 * 지원하는 Git hook 타입
 */
const SUPPORTED_HOOKS: GitHookType[] = [
  'pre-commit',
  'pre-push',
  'post-commit',
  'post-merge',
];

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
 * Hook 스크립트 생성
 */
function generateHookScript(hookType: GitHookType, tasks: TaskType[]): string {
  const taskList = tasks.map((t) => `"${t}"`).join(', ');

  return `#!/bin/sh
# ZyFlow Post-Task Hook: ${hookType}
# Generated automatically - do not edit manually
# To modify, use: post_task_setup_hooks MCP tool

# Run Post-Task Agent with specified tasks
if command -v npx &> /dev/null; then
  echo "[ZyFlow] Running ${hookType} tasks..."
  npx zyflow post-task run --tasks ${tasks.join(',')} --hook ${hookType}
else
  echo "[ZyFlow] Warning: npx not found, skipping post-task"
fi

# Exit with the original exit code
exit 0
`;
}

/**
 * Husky 스크립트 생성
 */
function generateHuskyScript(hookType: GitHookType, tasks: TaskType[]): string {
  return `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# ZyFlow Post-Task Hook: ${hookType}
echo "[ZyFlow] Running ${hookType} tasks..."
npx zyflow post-task run --tasks ${tasks.join(',')} --hook ${hookType}
`;
}

/**
 * Husky 사용 여부 확인
 */
async function isUsingHusky(projectPath: string): Promise<boolean> {
  const huskyDir = join(projectPath, '.husky');
  return fileExists(huskyDir);
}

/**
 * Git hook 설치
 */
export async function installHook(
  projectPath: string,
  hookType: GitHookType,
  tasks: TaskType[]
): Promise<{ success: boolean; message: string; path: string }> {
  try {
    // Husky 사용 여부 확인
    const useHusky = await isUsingHusky(projectPath);

    let hookPath: string;
    let script: string;

    if (useHusky) {
      // Husky 스크립트 생성
      hookPath = join(projectPath, '.husky', hookType);
      script = generateHuskyScript(hookType, tasks);
    } else {
      // 기본 Git hook 스크립트 생성
      const hooksDir = join(projectPath, GIT_HOOKS_DIR);

      // .git/hooks 디렉토리 확인
      if (!(await fileExists(hooksDir))) {
        await mkdir(hooksDir, { recursive: true });
      }

      hookPath = join(hooksDir, hookType);
      script = generateHookScript(hookType, tasks);
    }

    // 기존 hook 백업
    if (await fileExists(hookPath)) {
      const existing = await readFile(hookPath, 'utf-8');

      // ZyFlow가 생성한 hook이 아닌 경우 백업
      if (!existing.includes('ZyFlow Post-Task Hook')) {
        const backupPath = hookPath + '.zyflow-backup';
        await writeFile(backupPath, existing, 'utf-8');
      }
    }

    // Hook 스크립트 작성
    await writeFile(hookPath, script, 'utf-8');
    await chmod(hookPath, 0o755);

    return {
      success: true,
      message: `Installed ${hookType} hook with tasks: ${tasks.join(', ')}`,
      path: hookPath,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      path: '',
    };
  }
}

/**
 * Git hook 제거
 */
export async function uninstallHook(
  projectPath: string,
  hookType: GitHookType
): Promise<{ success: boolean; message: string }> {
  try {
    const useHusky = await isUsingHusky(projectPath);

    const hookPath = useHusky
      ? join(projectPath, '.husky', hookType)
      : join(projectPath, GIT_HOOKS_DIR, hookType);

    if (await fileExists(hookPath)) {
      const content = await readFile(hookPath, 'utf-8');

      // ZyFlow가 생성한 hook인지 확인
      if (content.includes('ZyFlow Post-Task Hook')) {
        await unlink(hookPath);

        // 백업 복구
        const backupPath = hookPath + '.zyflow-backup';
        if (await fileExists(backupPath)) {
          const backup = await readFile(backupPath, 'utf-8');
          await writeFile(hookPath, backup, 'utf-8');
          await chmod(hookPath, 0o755);
          await unlink(backupPath);
        }

        return {
          success: true,
          message: `Uninstalled ${hookType} hook`,
        };
      } else {
        return {
          success: false,
          message: `${hookType} hook was not installed by ZyFlow`,
        };
      }
    }

    return {
      success: true,
      message: `${hookType} hook not found`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 모든 설정된 hook 설치
 */
export async function installAllHooks(
  projectPath: string
): Promise<{ installed: string[]; failed: string[]; messages: string[] }> {
  const config = await loadTriggerConfig(projectPath);
  const installed: string[] = [];
  const failed: string[] = [];
  const messages: string[] = [];

  if (!config.hooks) {
    return { installed, failed, messages: ['No hooks configured'] };
  }

  for (const hookType of SUPPORTED_HOOKS) {
    const tasks = config.hooks[hookType];

    if (tasks && tasks.length > 0) {
      const result = await installHook(projectPath, hookType, tasks);

      if (result.success) {
        installed.push(hookType);
        messages.push(result.message);
      } else {
        failed.push(hookType);
        messages.push(`Failed to install ${hookType}: ${result.message}`);
      }
    }
  }

  return { installed, failed, messages };
}

/**
 * 모든 ZyFlow hook 제거
 */
export async function uninstallAllHooks(
  projectPath: string
): Promise<{ uninstalled: string[]; messages: string[] }> {
  const uninstalled: string[] = [];
  const messages: string[] = [];

  for (const hookType of SUPPORTED_HOOKS) {
    const result = await uninstallHook(projectPath, hookType);

    if (result.success && result.message.includes('Uninstalled')) {
      uninstalled.push(hookType);
    }
    messages.push(result.message);
  }

  return { uninstalled, messages };
}

/**
 * 설치된 hook 목록 조회
 */
export async function listInstalledHooks(
  projectPath: string
): Promise<{ hookType: GitHookType; tasks: TaskType[]; isZyflow: boolean }[]> {
  const hooks: { hookType: GitHookType; tasks: TaskType[]; isZyflow: boolean }[] = [];
  const useHusky = await isUsingHusky(projectPath);

  for (const hookType of SUPPORTED_HOOKS) {
    const hookPath = useHusky
      ? join(projectPath, '.husky', hookType)
      : join(projectPath, GIT_HOOKS_DIR, hookType);

    if (await fileExists(hookPath)) {
      const content = await readFile(hookPath, 'utf-8');
      const isZyflow = content.includes('ZyFlow Post-Task Hook');

      // tasks 추출
      const tasksMatch = content.match(/--tasks\s+([^\s]+)/);
      const tasks = tasksMatch
        ? (tasksMatch[1].split(',') as TaskType[])
        : [];

      hooks.push({ hookType, tasks, isZyflow });
    }
  }

  return hooks;
}
