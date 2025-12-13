/**
 * lint-fix Task
 *
 * ESLint 오류를 자동으로 감지하고 수정합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * ESLint 결과 타입
 */
interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
  fix?: {
    range: [number, number];
    text: string;
  };
}

/**
 * lint-fix 실행기
 */
async function lintFixExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  const tempFile = join(projectPath, '.lint-result-temp.json');
  let issuesFound = 0;
  let issuesFixed = 0;
  const modifiedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. ESLint 실행 (JSON 출력)
    try {
      const { stdout } = await execAsync(
        `npm run lint -- --format json --output-file ${tempFile}`,
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
      );
      rawOutput += stdout;
    } catch {
      // ESLint는 오류가 있으면 non-zero exit code를 반환하므로 무시
    }

    // 2. 결과 파싱
    let lintResults: ESLintResult[] = [];
    try {
      const resultContent = await readFile(tempFile, 'utf-8');
      lintResults = JSON.parse(resultContent);
    } catch {
      // JSON 파일이 없거나 파싱 실패 시 빈 배열
    }

    // 3. 문제 수 집계
    for (const result of lintResults) {
      issuesFound += result.errorCount + result.warningCount;

      // 수정 불가능한 오류는 suggestion으로 추가
      for (const msg of result.messages) {
        if (!msg.fix && msg.severity === 2) {
          suggestions.push({
            file: result.filePath,
            line: msg.line,
            issue: `[${msg.ruleId || 'unknown'}] ${msg.message}`,
            suggestion: `ESLint rule ${msg.ruleId || 'unknown'} violation - manual fix required`,
            confidence: 'high',
          });
        }
      }
    }

    // 4. Dry run이 아닌 경우 자동 수정 실행
    if (!options.dryRun && issuesFound > 0) {
      try {
        const { stdout: fixOutput } = await execAsync(
          `npm run lint -- --fix`,
          { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
        );
        rawOutput += '\n--- Fix Output ---\n' + fixOutput;

        // 5. 수정 후 다시 검사하여 수정된 수 계산
        try {
          await execAsync(
            `npm run lint -- --format json --output-file ${tempFile}`,
            { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
          );
        } catch {
          // 무시
        }

        let afterResults: ESLintResult[] = [];
        try {
          const afterContent = await readFile(tempFile, 'utf-8');
          afterResults = JSON.parse(afterContent);
        } catch {
          // 무시
        }

        let remainingIssues = 0;
        for (const result of afterResults) {
          remainingIssues += result.errorCount + result.warningCount;
        }

        issuesFixed = issuesFound - remainingIssues;

        // 수정된 파일 목록 추출
        const beforeFiles = new Set(lintResults.map((r) => r.filePath));
        for (const result of afterResults) {
          if (beforeFiles.has(result.filePath)) {
            const before = lintResults.find((r) => r.filePath === result.filePath);
            if (before && (before.errorCount + before.warningCount) > (result.errorCount + result.warningCount)) {
              modifiedFiles.push(result.filePath);
            }
          }
        }
      } catch (error) {
        rawOutput += '\n--- Fix Error ---\n' + (error instanceof Error ? error.message : String(error));
      }
    }

    // 임시 파일 정리
    try {
      await unlink(tempFile);
    } catch {
      // 무시
    }

    return {
      task: 'lint-fix',
      success: true,
      duration: 0, // Runner에서 설정
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      details: {
        modifiedFiles,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    // 임시 파일 정리
    try {
      await unlink(tempFile);
    } catch {
      // 무시
    }

    return {
      task: 'lint-fix',
      success: false,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 실행기 등록
registerTaskExecutor('lint-fix', lintFixExecutor);

export { lintFixExecutor };
