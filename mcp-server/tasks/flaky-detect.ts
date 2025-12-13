/**
 * flaky-detect Task
 *
 * 반복 실행으로 불안정한 테스트를 감지하고 수정안을 제시합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 테스트 실행 결과
 */
interface TestRun {
  runNumber: number;
  passed: string[];
  failed: string[];
  duration: number;
}

/**
 * 불안정 테스트 정보
 */
interface FlakyTest {
  testName: string;
  testFile: string;
  passRate: number;
  failedRuns: number[];
  category: 'timing' | 'state' | 'async' | 'random' | 'unknown';
  errorPattern?: string;
}

/**
 * 테스트 실행 횟수
 */
const REPEAT_COUNT = 5;

/**
 * 불안정 임계값 (한 번이라도 다른 결과면 불안정)
 */
const FLAKY_THRESHOLD = 0.8;

/**
 * 테스트 반복 실행
 */
async function runTestsMultipleTimes(
  projectPath: string,
  repeatCount: number
): Promise<{ runs: TestRun[]; rawOutput: string }> {
  const runs: TestRun[] = [];
  let rawOutput = '';

  for (let i = 1; i <= repeatCount; i++) {
    rawOutput += `\n=== Run ${i}/${repeatCount} ===\n`;

    const startTime = Date.now();
    let passed: string[] = [];
    let failed: string[] = [];

    try {
      const { stdout, stderr } = await execAsync(
        'npm run test -- --json 2>&1',
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024, timeout: 300000 }
      );

      const output = stdout + stderr;
      rawOutput += output.slice(0, 500) + '\n';

      // JSON 결과 파싱 시도
      const jsonMatch = output.match(/\{[\s\S]*"numFailedTests"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          for (const testFile of result.testResults || []) {
            for (const assertion of testFile.assertionResults || []) {
              const fullName = `${testFile.name}::${assertion.title}`;
              if (assertion.status === 'passed') {
                passed.push(fullName);
              } else if (assertion.status === 'failed') {
                failed.push(fullName);
              }
            }
          }
        } catch {
          // JSON 파싱 실패
        }
      }
    } catch (error: unknown) {
      // 테스트 실패 시
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as { stdout: string; stderr: string };
        const output = execError.stdout + execError.stderr;
        rawOutput += output.slice(0, 500) + '\n';

        // 실패한 테스트 추출
        const failedMatches = output.matchAll(/FAIL\s+(.+?\.test\.[tj]sx?)/g);
        for (const match of failedMatches) {
          failed.push(match[1]);
        }
      }
    }

    const duration = Date.now() - startTime;

    runs.push({
      runNumber: i,
      passed,
      failed,
      duration,
    });

    rawOutput += `  Passed: ${passed.length}, Failed: ${failed.length}, Duration: ${duration}ms\n`;
  }

  return { runs, rawOutput };
}

/**
 * 불안정 테스트 식별
 */
function identifyFlakyTests(runs: TestRun[]): FlakyTest[] {
  const flakyTests: FlakyTest[] = [];

  // 모든 테스트 이름 수집
  const allTests = new Set<string>();
  for (const run of runs) {
    for (const test of [...run.passed, ...run.failed]) {
      allTests.add(test);
    }
  }

  // 각 테스트의 불안정성 분석
  for (const testName of allTests) {
    const results = runs.map((run) => {
      if (run.passed.includes(testName)) return 'passed';
      if (run.failed.includes(testName)) return 'failed';
      return 'unknown';
    });

    const passCount = results.filter((r) => r === 'passed').length;
    const failCount = results.filter((r) => r === 'failed').length;
    const totalRuns = passCount + failCount;

    if (totalRuns === 0) continue;

    const passRate = passCount / totalRuns;

    // 불안정 판정: 100% 통과도 아니고 100% 실패도 아닌 경우
    if (passRate > 0 && passRate < 1) {
      const failedRuns = runs
        .filter((run) => run.failed.includes(testName))
        .map((run) => run.runNumber);

      const [testFile, testTitle] = testName.includes('::')
        ? testName.split('::')
        : [testName, ''];

      // 불안정 원인 분류
      const category = categorizeFlakiness(testName, failedRuns, runs);

      flakyTests.push({
        testName: testTitle || testName,
        testFile,
        passRate: Math.round(passRate * 100),
        failedRuns,
        category,
      });
    }
  }

  return flakyTests.sort((a, b) => a.passRate - b.passRate);
}

/**
 * 불안정 원인 분류
 */
function categorizeFlakiness(
  testName: string,
  failedRuns: number[],
  allRuns: TestRun[]
): FlakyTest['category'] {
  const nameLower = testName.toLowerCase();

  // 비동기 관련 키워드
  if (
    nameLower.includes('async') ||
    nameLower.includes('await') ||
    nameLower.includes('promise') ||
    nameLower.includes('timeout')
  ) {
    return 'async';
  }

  // 타이밍 관련 키워드
  if (
    nameLower.includes('animation') ||
    nameLower.includes('transition') ||
    nameLower.includes('delay') ||
    nameLower.includes('timer')
  ) {
    return 'timing';
  }

  // 랜덤/날짜 관련 키워드
  if (
    nameLower.includes('random') ||
    nameLower.includes('date') ||
    nameLower.includes('time') ||
    nameLower.includes('uuid')
  ) {
    return 'random';
  }

  // 첫 번째 실행만 실패하면 상태 문제 가능성
  if (failedRuns.length === 1 && failedRuns[0] === 1) {
    return 'state';
  }

  // 마지막 실행만 실패하면 상태 누적 문제 가능성
  if (failedRuns.length === 1 && failedRuns[0] === allRuns.length) {
    return 'state';
  }

  return 'unknown';
}

/**
 * 불안정 원인별 수정 제안
 */
function getSuggestionForFlaky(flaky: FlakyTest): string {
  switch (flaky.category) {
    case 'timing':
      return 'Add explicit waits (waitFor, waitForElementToBeRemoved) instead of fixed delays. Consider using fake timers.';
    case 'state':
      return 'Ensure proper test isolation. Use beforeEach/afterEach for setup/cleanup. Check for shared state between tests.';
    case 'async':
      return 'Ensure all async operations are properly awaited. Use waitFor for assertions on async state changes.';
    case 'random':
      return 'Mock random values, dates, or UUIDs. Use deterministic test data.';
    default:
      return 'Review test for race conditions, shared state, or external dependencies. Consider running tests in isolation.';
  }
}

/**
 * flaky-detect 실행기
 */
async function flakyDetectExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 테스트 반복 실행
    rawOutput += `=== Running tests ${REPEAT_COUNT} times to detect flaky tests ===\n`;

    const { runs, rawOutput: testOutput } = await runTestsMultipleTimes(
      projectPath,
      REPEAT_COUNT
    );
    rawOutput += testOutput;

    // 2. 불안정 테스트 식별
    rawOutput += '\n=== Analyzing results ===\n\n';
    const flakyTests = identifyFlakyTests(runs);
    issuesFound = flakyTests.length;

    if (flakyTests.length === 0) {
      rawOutput += 'No flaky tests detected. All tests are consistent.\n';
    } else {
      rawOutput += `Found ${flakyTests.length} flaky tests:\n\n`;

      for (const flaky of flakyTests) {
        rawOutput += `--- ${flaky.testName} ---\n`;
        rawOutput += `  File: ${flaky.testFile}\n`;
        rawOutput += `  Pass rate: ${flaky.passRate}%\n`;
        rawOutput += `  Failed on runs: ${flaky.failedRuns.join(', ')}\n`;
        rawOutput += `  Category: ${flaky.category}\n`;
        rawOutput += `  Suggestion: ${getSuggestionForFlaky(flaky)}\n\n`;

        suggestions.push({
          file: flaky.testFile,
          issue: `Flaky test (${flaky.passRate}% pass rate): ${flaky.testName}`,
          suggestion: getSuggestionForFlaky(flaky),
          confidence: flaky.passRate < 50 ? 'high' : 'medium',
        });
      }
    }

    // 3. 요약 통계
    rawOutput += '\n=== Summary ===\n';
    const avgDuration =
      runs.reduce((sum, r) => sum + r.duration, 0) / runs.length;
    rawOutput += `Average test duration: ${Math.round(avgDuration)}ms\n`;
    rawOutput += `Flaky tests found: ${flakyTests.length}\n`;

    if (flakyTests.length > 0) {
      const categories = flakyTests.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      rawOutput += 'By category:\n';
      for (const [cat, count] of Object.entries(categories)) {
        rawOutput += `  ${cat}: ${count}\n`;
      }
    }

    return {
      task: 'flaky-detect',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0, // flaky-detect는 분석만 수행
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'flaky-detect',
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
registerTaskExecutor('flaky-detect', flakyDetectExecutor);

export { flakyDetectExecutor, identifyFlakyTests, categorizeFlakiness };
