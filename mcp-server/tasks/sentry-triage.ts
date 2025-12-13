/**
 * sentry-triage Task
 *
 * Sentry 이슈를 분석하고 수정안을 제시합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { readFile } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * Sentry 이슈 정보
 */
interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: 'error' | 'warning' | 'info';
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  type: string;
  metadata: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
  stacktrace?: StackFrame[];
}

/**
 * 스택트레이스 프레임
 */
interface StackFrame {
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  absPath: string;
  context?: string[];
  inApp: boolean;
}

/**
 * Sentry API 클라이언트
 */
class SentryClient {
  private token: string;
  private org: string;
  private project: string;

  constructor(token: string, org: string, project: string) {
    this.token = token;
    this.org = org;
    this.project = project;
  }

  /**
   * 최근 이슈 조회
   */
  async getIssues(limit: number = 10): Promise<SentryIssue[]> {
    const url = `https://sentry.io/api/0/projects/${this.org}/${this.project}/issues/?query=is:unresolved&limit=${limit}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Sentry API error: ${response.status}`);
      }

      return (await response.json()) as SentryIssue[];
    } catch {
      return [];
    }
  }

  /**
   * 이슈 상세 조회 (최신 이벤트 포함)
   */
  async getIssueDetails(issueId: string): Promise<SentryIssue | null> {
    const url = `https://sentry.io/api/0/issues/${issueId}/`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) return null;

      return (await response.json()) as SentryIssue;
    } catch {
      return null;
    }
  }

  /**
   * 이슈의 최신 이벤트 조회
   */
  async getLatestEvent(issueId: string): Promise<{ stacktrace?: StackFrame[] } | null> {
    const url = `https://sentry.io/api/0/issues/${issueId}/events/latest/`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) return null;

      const event = (await response.json()) as {
        entries?: Array<{
          type: string;
          data?: {
            values?: Array<{
              stacktrace?: {
                frames?: Array<{
                  filename?: string;
                  function?: string;
                  lineno?: number;
                  colno?: number;
                  absPath?: string;
                  context?: unknown;
                  inApp?: boolean;
                }>;
              };
            }>;
          };
        }>;
      };

      // 스택트레이스 추출
      const stacktrace: StackFrame[] = [];
      const entries = event.entries || [];

      for (const entry of entries) {
        if (entry.type === 'exception') {
          for (const exc of entry.data?.values || []) {
            for (const frame of exc.stacktrace?.frames || []) {
              stacktrace.push({
                filename: frame.filename || '',
                function: frame.function || '',
                lineno: frame.lineno || 0,
                colno: frame.colno || 0,
                absPath: frame.absPath || '',
                context: (Array.isArray(frame.context) ? frame.context : []) as string[],
                inApp: frame.inApp || false,
              });
            }
          }
        }
      }

      return { stacktrace: stacktrace.reverse() }; // 최신 프레임 먼저
    } catch {
      return null;
    }
  }
}

/**
 * 환경 변수에서 Sentry 설정 로드
 */
async function loadSentryConfig(projectPath: string): Promise<{
  token?: string;
  org?: string;
  project?: string;
}> {
  // 환경 변수 확인
  if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
    return {
      token: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    };
  }

  // .env 파일에서 로드 시도
  try {
    const envPath = join(projectPath, '.env');
    const content = await readFile(envPath, 'utf-8');

    const config: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^(SENTRY_[A-Z_]+)=(.+)$/);
      if (match) {
        config[match[1]] = match[2].replace(/["']/g, '');
      }
    }

    return {
      token: config.SENTRY_AUTH_TOKEN,
      org: config.SENTRY_ORG,
      project: config.SENTRY_PROJECT,
    };
  } catch {
    return {};
  }
}

/**
 * 에러 타입별 수정 제안
 */
function getSuggestionForError(issue: SentryIssue, stacktrace?: StackFrame[]): string {
  const errorType = issue.metadata?.type?.toLowerCase() || issue.type.toLowerCase();

  // TypeError
  if (errorType.includes('typeerror')) {
    if (issue.title.includes('undefined') || issue.title.includes('null')) {
      return 'Add null/undefined checks before accessing properties. Consider using optional chaining (?.) or nullish coalescing (??).';
    }
    return 'Type mismatch detected. Review the data types being passed to functions.';
  }

  // ReferenceError
  if (errorType.includes('referenceerror')) {
    return 'Variable or function not defined. Check for typos, missing imports, or scope issues.';
  }

  // NetworkError / FetchError
  if (errorType.includes('network') || errorType.includes('fetch')) {
    return 'Network request failed. Add error handling for failed requests and implement retry logic if needed.';
  }

  // SyntaxError
  if (errorType.includes('syntaxerror')) {
    return 'Invalid JSON or code syntax. Validate JSON before parsing and check for syntax errors in code.';
  }

  // ChunkLoadError (React lazy loading)
  if (errorType.includes('chunkload')) {
    return 'Dynamic import failed. Implement retry logic for lazy-loaded components or add error boundaries.';
  }

  // 스택트레이스 기반 제안
  if (stacktrace && stacktrace.length > 0) {
    const topFrame = stacktrace.find((f) => f.inApp) || stacktrace[0];
    return `Error originated in ${topFrame.filename}:${topFrame.lineno} (${topFrame.function}). Review this code path for the root cause.`;
  }

  return 'Review the error details and stack trace to identify the root cause.';
}

/**
 * sentry-triage 실행기
 */
async function sentryTriageExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. Sentry 설정 로드
    rawOutput += '=== Loading Sentry configuration ===\n\n';
    const config = await loadSentryConfig(projectPath);

    if (!config.token || !config.org || !config.project) {
      rawOutput += 'Sentry configuration not found.\n';
      rawOutput += 'Required environment variables:\n';
      rawOutput += '  - SENTRY_AUTH_TOKEN\n';
      rawOutput += '  - SENTRY_ORG\n';
      rawOutput += '  - SENTRY_PROJECT\n';

      return {
        task: 'sentry-triage',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: {
          suggestions: [
            {
              file: '.env',
              issue: 'Sentry configuration missing',
              suggestion: 'Add SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT to environment variables',
              confidence: 'high',
            },
          ],
          rawOutput,
        },
      };
    }

    rawOutput += `Organization: ${config.org}\n`;
    rawOutput += `Project: ${config.project}\n\n`;

    // 2. Sentry 이슈 조회
    const client = new SentryClient(config.token, config.org, config.project);
    rawOutput += '=== Fetching unresolved issues ===\n\n';

    const issues = await client.getIssues(10);
    issuesFound = issues.length;

    if (issues.length === 0) {
      rawOutput += 'No unresolved issues found!\n';
      return {
        task: 'sentry-triage',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: { rawOutput },
      };
    }

    rawOutput += `Found ${issues.length} unresolved issues:\n\n`;

    // 3. 각 이슈 분석
    for (const issue of issues) {
      rawOutput += `--- ${issue.shortId} ---\n`;
      rawOutput += `Title: ${issue.title}\n`;
      rawOutput += `Level: ${issue.level}\n`;
      rawOutput += `Occurrences: ${issue.count}\n`;
      rawOutput += `Users affected: ${issue.userCount}\n`;
      rawOutput += `First seen: ${issue.firstSeen}\n`;
      rawOutput += `Last seen: ${issue.lastSeen}\n`;

      if (issue.metadata?.filename) {
        rawOutput += `File: ${issue.metadata.filename}\n`;
      }
      if (issue.metadata?.function) {
        rawOutput += `Function: ${issue.metadata.function}\n`;
      }

      // 스택트레이스 조회
      const event = await client.getLatestEvent(issue.id);
      let stacktrace: StackFrame[] | undefined;

      if (event?.stacktrace && event.stacktrace.length > 0) {
        stacktrace = event.stacktrace;
        rawOutput += '\nStack trace (app frames):\n';

        const appFrames = stacktrace.filter((f) => f.inApp).slice(0, 5);
        for (const frame of appFrames) {
          rawOutput += `  at ${frame.function} (${frame.filename}:${frame.lineno})\n`;
        }
      }

      rawOutput += '\n';

      // 제안 생성
      const suggestion = getSuggestionForError(issue, stacktrace);
      const sourceFile = stacktrace?.find((f) => f.inApp)?.filename || issue.metadata?.filename;

      suggestions.push({
        file: sourceFile || 'unknown',
        line: stacktrace?.find((f) => f.inApp)?.lineno,
        issue: `[${issue.level.toUpperCase()}] ${issue.shortId}: ${issue.title}`,
        suggestion,
        confidence: issue.count > 100 ? 'high' : issue.count > 10 ? 'medium' : 'low',
      });
    }

    // 4. 요약
    rawOutput += '\n=== Summary ===\n\n';

    const byLevel = issues.reduce(
      (acc, i) => {
        acc[i.level] = (acc[i.level] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    for (const [level, count] of Object.entries(byLevel)) {
      rawOutput += `${level}: ${count}\n`;
    }

    const totalAffected = issues.reduce((sum, i) => sum + i.userCount, 0);
    rawOutput += `\nTotal users affected: ${totalAffected}\n`;

    // 긴급 경고
    const criticalIssues = issues.filter((i) => i.level === 'error' && i.userCount > 100);
    if (criticalIssues.length > 0) {
      rawOutput += `\n⚠️  ${criticalIssues.length} critical issue(s) affecting 100+ users!\n`;
    }

    return {
      task: 'sentry-triage',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0, // sentry-triage는 분석만 수행
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'sentry-triage',
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
registerTaskExecutor('sentry-triage', sentryTriageExecutor);

export { sentryTriageExecutor, SentryClient };
