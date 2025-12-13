/**
 * snapshot-update Task
 *
 * 깨진 스냅샷 테스트를 분석하고 의도된 변경인지 버그인지 판단하여 업데이트합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 스냅샷 실패 정보
 */
interface SnapshotFailure {
  testName: string;
  testFile: string;
  snapshotFile: string;
  expected: string;
  received: string;
  diffLines: string[];
  isLikelyIntentional: boolean;
  reason: string;
}

/**
 * 스냅샷 테스트 실행 및 실패 수집
 */
async function runSnapshotTests(
  projectPath: string
): Promise<{ failures: SnapshotFailure[]; rawOutput: string }> {
  const failures: SnapshotFailure[] = [];
  let rawOutput = '';

  try {
    // 스냅샷 테스트만 실행
    const { stdout, stderr } = await execAsync(
      'npm run test -- --testNamePattern="snapshot" --verbose 2>&1',
      { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
    );
    rawOutput = stdout + stderr;
  } catch (error: unknown) {
    // 테스트 실패 시 output 추출
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const execError = error as { stdout: string; stderr: string };
      rawOutput = execError.stdout + execError.stderr;
    }
  }

  // 스냅샷 실패 파싱
  const snapshotFailureRegex = /Snapshot name: `([^`]+)`[\s\S]*?Snapshot: "([^"]*)"[\s\S]*?Received: "([^"]*)"/g;

  let match;
  while ((match = snapshotFailureRegex.exec(rawOutput)) !== null) {
    const testName = match[1];
    const expected = match[2];
    const received = match[3];

    // diff 계산
    const diffLines = calculateDiff(expected, received);

    // 의도된 변경인지 분석
    const analysis = analyzeChange(expected, received, diffLines);

    failures.push({
      testName,
      testFile: '', // 로그에서 추출 필요
      snapshotFile: '',
      expected,
      received,
      diffLines,
      isLikelyIntentional: analysis.isIntentional,
      reason: analysis.reason,
    });
  }

  // 대안 파싱: Jest 스타일
  const jestSnapshotRegex = /› (.+?)\.test\.(tsx?|jsx?)[\s\S]*?- Snapshot[\s\S]*?\+ Received[\s\S]*?(-\s+.+[\s\S]*?\+\s+.+)/g;

  while ((match = jestSnapshotRegex.exec(rawOutput)) !== null) {
    const testFile = match[1] + '.test.' + match[2];
    const diffBlock = match[3];

    const diffLines = diffBlock.split('\n').filter((line: string) =>
      line.startsWith('-') || line.startsWith('+')
    );

    // 이미 추가된 실패인지 확인
    if (!failures.some((f) => f.testFile === testFile)) {
      const analysis = analyzeChange('', '', diffLines);

      failures.push({
        testName: testFile,
        testFile,
        snapshotFile: '',
        expected: '',
        received: '',
        diffLines,
        isLikelyIntentional: analysis.isIntentional,
        reason: analysis.reason,
      });
    }
  }

  return { failures, rawOutput };
}

/**
 * 두 스냅샷의 diff 계산
 */
function calculateDiff(expected: string, received: string): string[] {
  const expectedLines = expected.split('\n');
  const receivedLines = received.split('\n');
  const diff: string[] = [];

  const maxLen = Math.max(expectedLines.length, receivedLines.length);

  for (let i = 0; i < maxLen; i++) {
    const exp = expectedLines[i] || '';
    const rec = receivedLines[i] || '';

    if (exp !== rec) {
      if (exp) diff.push(`- ${exp}`);
      if (rec) diff.push(`+ ${rec}`);
    }
  }

  return diff;
}

/**
 * 변경이 의도적인지 분석
 */
function analyzeChange(
  expected: string,
  received: string,
  diffLines: string[]
): { isIntentional: boolean; reason: string } {
  // 변경 패턴 분석
  const addedLines = diffLines.filter((l) => l.startsWith('+'));
  const removedLines = diffLines.filter((l) => l.startsWith('-'));

  // 단순 텍스트 변경 (레이블, 제목 등)
  if (addedLines.length === removedLines.length && addedLines.length <= 3) {
    // 구조적 변경이 없는 경우
    const structuralPatterns = ['className', 'style', '<div', '</div', 'key='];
    const hasStructuralChange = diffLines.some((line) =>
      structuralPatterns.some((pattern) => line.includes(pattern))
    );

    if (!hasStructuralChange) {
      return {
        isIntentional: true,
        reason: 'Minor text change detected - likely intentional copy update',
      };
    }
  }

  // 스타일 변경만 있는 경우
  if (diffLines.every((line) =>
    line.includes('className') ||
    line.includes('style') ||
    line.includes('css')
  )) {
    return {
      isIntentional: true,
      reason: 'Style-only change detected - likely intentional design update',
    };
  }

  // 구조적 변경 (태그 추가/제거)
  const tagChanges = diffLines.filter((line) =>
    line.match(/<\/?[a-zA-Z][^>]*>/)
  );

  if (tagChanges.length > 2) {
    return {
      isIntentional: false,
      reason: 'Significant structural change detected - review carefully',
    };
  }

  // 데이터 변경 (숫자, 날짜 등)
  if (diffLines.some((line) =>
    line.match(/\d{4}-\d{2}-\d{2}/) || // 날짜
    line.match(/\d+\.\d+/) // 숫자
  )) {
    return {
      isIntentional: false,
      reason: 'Data change detected - may be a bug or test data issue',
    };
  }

  return {
    isIntentional: false,
    reason: 'Unable to determine intent - manual review recommended',
  };
}

/**
 * snapshot-update 실행기
 */
async function snapshotUpdateExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  let issuesFixed = 0;
  const modifiedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 스냅샷 테스트 실행 및 실패 수집
    rawOutput += '=== Running snapshot tests ===\n\n';
    const { failures, rawOutput: testOutput } = await runSnapshotTests(projectPath);
    rawOutput += testOutput;

    issuesFound = failures.length;

    // 2. 각 실패 분석
    rawOutput += '\n\n=== Snapshot Analysis ===\n\n';

    const intentionalUpdates: SnapshotFailure[] = [];
    const reviewNeeded: SnapshotFailure[] = [];

    for (const failure of failures) {
      rawOutput += `--- ${failure.testName} ---\n`;
      rawOutput += `Likely intentional: ${failure.isLikelyIntentional ? 'Yes' : 'No'}\n`;
      rawOutput += `Reason: ${failure.reason}\n`;

      if (failure.diffLines.length > 0) {
        rawOutput += 'Diff:\n';
        for (const line of failure.diffLines.slice(0, 10)) {
          rawOutput += `  ${line}\n`;
        }
        if (failure.diffLines.length > 10) {
          rawOutput += `  ... and ${failure.diffLines.length - 10} more lines\n`;
        }
      }
      rawOutput += '\n';

      if (failure.isLikelyIntentional) {
        intentionalUpdates.push(failure);
        suggestions.push({
          file: failure.testFile || failure.testName,
          issue: `Snapshot mismatch: ${failure.testName}`,
          suggestion: `Auto-update recommended: ${failure.reason}`,
          confidence: 'high',
        });
      } else {
        reviewNeeded.push(failure);
        suggestions.push({
          file: failure.testFile || failure.testName,
          issue: `Snapshot mismatch: ${failure.testName}`,
          suggestion: `Manual review needed: ${failure.reason}`,
          confidence: 'low',
        });
      }
    }

    // 3. 의도된 변경 자동 업데이트 (dry run이 아닌 경우)
    if (!options.dryRun && intentionalUpdates.length > 0) {
      rawOutput += '\n=== Updating snapshots ===\n\n';

      try {
        const { stdout, stderr } = await execAsync(
          'npm run test -- -u --testNamePattern="snapshot"',
          { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
        );
        rawOutput += stdout + stderr;
        issuesFixed = intentionalUpdates.length;

        for (const update of intentionalUpdates) {
          if (update.snapshotFile && !modifiedFiles.includes(update.snapshotFile)) {
            modifiedFiles.push(update.snapshotFile);
          }
        }
      } catch (error: unknown) {
        rawOutput += 'Failed to update snapshots\n';
        if (error && typeof error === 'object' && 'message' in error) {
          rawOutput += (error as Error).message + '\n';
        }
      }
    }

    // 4. 요약
    rawOutput += '\n=== Summary ===\n';
    rawOutput += `Total failures: ${issuesFound}\n`;
    rawOutput += `Likely intentional: ${intentionalUpdates.length}\n`;
    rawOutput += `Need review: ${reviewNeeded.length}\n`;
    rawOutput += `Updated: ${issuesFixed}\n`;

    return {
      task: 'snapshot-update',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      details: {
        modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'snapshot-update',
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
registerTaskExecutor('snapshot-update', snapshotUpdateExecutor);

export { snapshotUpdateExecutor, analyzeChange };
