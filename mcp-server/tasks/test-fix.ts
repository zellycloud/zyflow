/**
 * test-fix Task
 *
 * 실패한 테스트를 분석하고 수정안을 제시합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { writeFile, readFile, unlink, access } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 테스트 실패 정보
 */
interface TestFailure {
  testName: string;
  testFile: string;
  error: string;
  expected?: string;
  received?: string;
  category: 'assertion' | 'type' | 'mock' | 'environment' | 'timeout' | 'unknown';
}

/**
 * 테스트 결과 (Jest/Vitest JSON 형식)
 */
interface TestResult {
  success: boolean;
  numFailedTests: number;
  numPassedTests: number;
  numTotalTests: number;
  testResults: {
    name: string;
    status: 'passed' | 'failed';
    assertionResults: {
      title: string;
      status: 'passed' | 'failed';
      failureMessages: string[];
    }[];
  }[];
}

/**
 * 테스트 프레임워크 감지
 */
async function detectTestFramework(
  projectPath: string
): Promise<'vitest' | 'jest' | 'unknown'> {
  try {
    const pkgJson = await readFile(join(projectPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgJson);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    if (allDeps.vitest) return 'vitest';
    if (allDeps.jest) return 'jest';
  } catch {
    // 무시
  }
  return 'unknown';
}

/**
 * 실패 원인 분류
 */
function categorizeFailure(errorMessage: string): TestFailure['category'] {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('expected') && lowerError.includes('received')) {
    return 'assertion';
  }
  if (lowerError.includes('type') || lowerError.includes('typescript')) {
    return 'type';
  }
  if (lowerError.includes('mock') || lowerError.includes('spy') || lowerError.includes('stub')) {
    return 'mock';
  }
  if (
    lowerError.includes('timeout') ||
    lowerError.includes('async') ||
    lowerError.includes('promise')
  ) {
    return 'timeout';
  }
  if (
    lowerError.includes('environment') ||
    lowerError.includes('config') ||
    lowerError.includes('setup')
  ) {
    return 'environment';
  }

  return 'unknown';
}

/**
 * assertion 실패에서 expected/received 추출
 */
function extractExpectedReceived(
  errorMessage: string
): { expected?: string; received?: string } {
  const expectedMatch = errorMessage.match(/Expected[:\s]+(.+?)(?:\n|Received|$)/i);
  const receivedMatch = errorMessage.match(/Received[:\s]+(.+?)(?:\n|$)/i);

  return {
    expected: expectedMatch?.[1]?.trim(),
    received: receivedMatch?.[1]?.trim(),
  };
}

/**
 * 테스트 결과 파싱
 */
function parseTestResults(jsonOutput: string): TestFailure[] {
  const failures: TestFailure[] = [];

  try {
    const result: TestResult = JSON.parse(jsonOutput);

    for (const testFile of result.testResults) {
      for (const assertion of testFile.assertionResults) {
        if (assertion.status === 'failed') {
          const errorMessage = assertion.failureMessages.join('\n');
          const category = categorizeFailure(errorMessage);
          const { expected, received } = extractExpectedReceived(errorMessage);

          failures.push({
            testName: assertion.title,
            testFile: testFile.name,
            error: errorMessage,
            expected,
            received,
            category,
          });
        }
      }
    }
  } catch {
    // JSON 파싱 실패
  }

  return failures;
}

/**
 * 카테고리별 수정 제안 생성
 */
function getSuggestionForFailure(failure: TestFailure): string {
  switch (failure.category) {
    case 'assertion':
      if (failure.expected && failure.received) {
        return `Expected: ${failure.expected}, but received: ${failure.received}. Check the test assertion or fix the implementation.`;
      }
      return 'Assertion failed. Review the expected vs actual values.';

    case 'type':
      return 'Type error in test. Check type definitions and ensure mock data matches expected types.';

    case 'mock':
      return 'Mock/spy issue. Verify mock setup, call expectations, and cleanup in afterEach.';

    case 'timeout':
      return 'Async/timeout issue. Add await, increase timeout, or fix async handling.';

    case 'environment':
      return 'Environment/setup issue. Check test configuration and setup files.';

    default:
      return 'Unknown error. Review the full error message for details.';
  }
}

/**
 * test-fix 실행기
 */
async function testFixExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const issuesFixed = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';
  const tempFile = join(projectPath, '.test-result-temp.json');

  try {
    // 1. 테스트 프레임워크 감지
    const framework = await detectTestFramework(projectPath);
    rawOutput += `Detected test framework: ${framework}\n\n`;

    // 2. 테스트 실행
    let testCommand = '';
    if (framework === 'vitest') {
      testCommand = `npx vitest run --reporter=json --outputFile=${tempFile}`;
    } else if (framework === 'jest') {
      testCommand = `npx jest --json --outputFile=${tempFile}`;
    } else {
      // 기본적으로 npm test 시도
      testCommand = `npm test -- --json --outputFile=${tempFile}`;
    }

    try {
      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      rawOutput += stdout + stderr;
    } catch (error: unknown) {
      // 테스트 실패 시 non-zero exit code
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as { stdout: string; stderr: string };
        rawOutput += execError.stdout + execError.stderr;
      }
    }

    // 3. 결과 파싱
    let failures: TestFailure[] = [];
    try {
      const resultContent = await readFile(tempFile, 'utf-8');
      failures = parseTestResults(resultContent);
    } catch {
      // JSON 파일 없음 - stdout에서 파싱 시도
      rawOutput += '\nNote: Could not parse JSON output, showing raw results\n';
    }

    issuesFound = failures.length;

    // 4. 각 실패에 대한 제안 생성
    for (const failure of failures) {
      suggestions.push({
        file: failure.testFile,
        issue: `[${failure.category.toUpperCase()}] ${failure.testName}`,
        suggestion: getSuggestionForFailure(failure),
        confidence: failure.category === 'assertion' ? 'high' : 'medium',
      });

      rawOutput += `\n--- ${failure.testName} ---\n`;
      rawOutput += `File: ${failure.testFile}\n`;
      rawOutput += `Category: ${failure.category}\n`;
      if (failure.expected) rawOutput += `Expected: ${failure.expected}\n`;
      if (failure.received) rawOutput += `Received: ${failure.received}\n`;
    }

    // 5. 임시 파일 정리
    try {
      await unlink(tempFile);
    } catch {
      // 무시
    }

    // 테스트가 모두 통과하면 성공
    const success = issuesFound === 0;

    return {
      task: 'test-fix',
      success,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      details: {
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
      task: 'test-fix',
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
registerTaskExecutor('test-fix', testFixExecutor);

export { testFixExecutor, detectTestFramework, categorizeFailure };
