/**
 * ci-fix Task
 *
 * GitHub Actions 실패를 분석하고 수정안을 제시합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * CI 실패 정보
 */
interface CIFailure {
  runId: string;
  workflowName: string;
  conclusion: string;
  startedAt: string;
  url: string;
  failedJobs: FailedJob[];
  category: 'dependency' | 'test' | 'build' | 'lint' | 'environment' | 'unknown';
}

/**
 * 실패한 Job 정보
 */
interface FailedJob {
  name: string;
  conclusion: string;
  logs: string;
  errorPattern?: string;
}

/**
 * 최근 실패한 워크플로우 조회
 */
async function getFailedRuns(
  projectPath: string,
  limit: number = 5
): Promise<{ runs: CIFailure[]; rawOutput: string }> {
  const failures: CIFailure[] = [];
  let rawOutput = '';

  try {
    // 실패한 워크플로우 목록 조회
    const { stdout } = await execAsync(
      `gh run list --status failure --limit ${limit} --json databaseId,displayTitle,conclusion,createdAt,url`,
      { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
    );

    rawOutput += '=== Failed Runs ===\n' + stdout + '\n';

    const runs = JSON.parse(stdout);

    for (const run of runs) {
      const failure: CIFailure = {
        runId: String(run.databaseId),
        workflowName: run.displayTitle,
        conclusion: run.conclusion,
        startedAt: run.createdAt,
        url: run.url,
        failedJobs: [],
        category: 'unknown',
      };

      // 실패한 Job 로그 조회
      try {
        const { stdout: logOutput } = await execAsync(
          `gh run view ${run.databaseId} --log-failed 2>&1 | head -200`,
          { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
        );

        rawOutput += `\n=== Run ${run.databaseId} Logs ===\n` + logOutput + '\n';

        // Job 이름과 에러 추출
        const jobMatches = logOutput.matchAll(
          /^(\w[\w-]+)\s+[\s\S]*?(?:error|Error|ERROR|failed|Failed|FAILED)[\s\S]*?$/gm
        );

        for (const match of jobMatches) {
          failure.failedJobs.push({
            name: match[1],
            conclusion: 'failure',
            logs: logOutput.slice(0, 1000),
          });
        }

        // 카테고리 분류
        failure.category = categorizeFailure(logOutput);
      } catch {
        // 로그 조회 실패
      }

      failures.push(failure);
    }
  } catch (error: unknown) {
    // gh 명령 실패
    if (error && typeof error === 'object' && 'message' in error) {
      rawOutput += `Error: ${(error as Error).message}\n`;
    }
  }

  return { runs: failures, rawOutput };
}

/**
 * CI 실패 원인 분류
 */
function categorizeFailure(logs: string): CIFailure['category'] {
  const lowerLogs = logs.toLowerCase();

  // 의존성 문제
  if (
    lowerLogs.includes('npm err!') ||
    lowerLogs.includes('npm error') ||
    lowerLogs.includes('yarn error') ||
    lowerLogs.includes('pnpm err') ||
    lowerLogs.includes('could not resolve') ||
    lowerLogs.includes('enoent') ||
    lowerLogs.includes('package-lock.json') ||
    lowerLogs.includes('peer dep')
  ) {
    return 'dependency';
  }

  // 테스트 실패
  if (
    lowerLogs.includes('test failed') ||
    lowerLogs.includes('tests failed') ||
    lowerLogs.includes('jest') ||
    lowerLogs.includes('vitest') ||
    lowerLogs.includes('assertion') ||
    lowerLogs.includes('expect(')
  ) {
    return 'test';
  }

  // 빌드 실패
  if (
    lowerLogs.includes('build failed') ||
    lowerLogs.includes('compilation failed') ||
    lowerLogs.includes('tsc') ||
    lowerLogs.includes('typescript') ||
    lowerLogs.includes('webpack') ||
    lowerLogs.includes('vite')
  ) {
    return 'build';
  }

  // 린트 실패
  if (
    lowerLogs.includes('eslint') ||
    lowerLogs.includes('prettier') ||
    lowerLogs.includes('lint') ||
    lowerLogs.includes('warning:') && lowerLogs.includes('error:')
  ) {
    return 'lint';
  }

  // 환경 문제
  if (
    lowerLogs.includes('env') ||
    lowerLogs.includes('secret') ||
    lowerLogs.includes('token') ||
    lowerLogs.includes('permission') ||
    lowerLogs.includes('authentication')
  ) {
    return 'environment';
  }

  return 'unknown';
}

/**
 * 카테고리별 수정 제안 생성
 */
function getSuggestionForCategory(
  category: CIFailure['category'],
  logs: string
): string {
  switch (category) {
    case 'dependency':
      if (logs.includes('peer dep')) {
        return 'Peer dependency conflict detected. Try: npm install --legacy-peer-deps or update conflicting packages.';
      }
      if (logs.includes('package-lock.json')) {
        return 'Lock file issue. Try: rm package-lock.json && npm install';
      }
      return 'Dependency installation failed. Check package.json and try npm ci or npm install.';

    case 'test':
      return 'Test failures detected. Run tests locally with npm test to see detailed errors.';

    case 'build':
      if (logs.includes('typescript') || logs.includes('tsc')) {
        return 'TypeScript compilation failed. Run npx tsc --noEmit locally to see type errors.';
      }
      return 'Build failed. Check build configuration and run npm run build locally.';

    case 'lint':
      return 'Linting errors. Run npm run lint -- --fix to auto-fix issues.';

    case 'environment':
      return 'Environment/secrets issue. Check GitHub repository secrets and environment variables.';

    default:
      return 'Unknown failure. Review the full CI logs for details.';
  }
}

/**
 * ci-fix 실행기
 */
async function ciFixExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 실패한 워크플로우 조회
    rawOutput += '=== Checking for failed CI runs ===\n\n';
    const { runs, rawOutput: runOutput } = await getFailedRuns(projectPath, 5);
    rawOutput += runOutput;

    issuesFound = runs.length;

    if (runs.length === 0) {
      rawOutput += '\nNo failed CI runs found. All workflows are passing!\n';
    } else {
      rawOutput += `\n\nFound ${runs.length} failed runs:\n\n`;

      // 2. 각 실패 분석
      for (const run of runs) {
        rawOutput += `--- ${run.workflowName} ---\n`;
        rawOutput += `  Run ID: ${run.runId}\n`;
        rawOutput += `  Started: ${run.startedAt}\n`;
        rawOutput += `  Category: ${run.category}\n`;
        rawOutput += `  URL: ${run.url}\n`;

        if (run.failedJobs.length > 0) {
          rawOutput += `  Failed Jobs: ${run.failedJobs.map((j) => j.name).join(', ')}\n`;
        }
        rawOutput += '\n';

        // 제안 생성
        const suggestion = getSuggestionForCategory(
          run.category,
          run.failedJobs.map((j) => j.logs).join('\n')
        );

        suggestions.push({
          file: '.github/workflows',
          issue: `[${run.category.toUpperCase()}] ${run.workflowName}`,
          suggestion,
          confidence: run.category !== 'unknown' ? 'high' : 'medium',
        });
      }

      // 3. 카테고리별 요약
      rawOutput += '\n=== Summary by Category ===\n';
      const byCategory = runs.reduce(
        (acc, run) => {
          acc[run.category] = (acc[run.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      for (const [cat, count] of Object.entries(byCategory)) {
        rawOutput += `  ${cat}: ${count} failure(s)\n`;
      }
    }

    return {
      task: 'ci-fix',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0, // ci-fix는 분석만 수행
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'ci-fix',
      success: false,
      duration: 0,
      issuesFound,
      issuesFixed: 0,
      model: options.model,
      cli: options.cli,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 실행기 등록
registerTaskExecutor('ci-fix', ciFixExecutor);

export { ciFixExecutor, categorizeFailure };
