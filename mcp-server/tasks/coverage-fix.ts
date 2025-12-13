/**
 * coverage-fix Task
 *
 * 커버리지 리포트를 분석하고 커버리지가 부족한 영역에 테스트를 추가합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { readFile, access } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 파일별 커버리지 정보
 */
interface FileCoverage {
  file: string;
  lines: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  uncoveredLines: number[];
  uncoveredBranches: number[];
}

/**
 * 커버리지 설정
 */
interface CoverageThresholds {
  lines: number;
  branches: number;
  functions: number;
}

const DEFAULT_THRESHOLDS: CoverageThresholds = {
  lines: 80,
  branches: 70,
  functions: 80,
};

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
 * Istanbul JSON 커버리지 리포트 파싱
 */
async function parseCoverageReport(projectPath: string): Promise<FileCoverage[]> {
  const coverageFiles = [
    'coverage/coverage-final.json',
    'coverage/coverage-summary.json',
    '.nyc_output/coverage.json',
  ];

  for (const coverageFile of coverageFiles) {
    const fullPath = join(projectPath, coverageFile);

    if (await fileExists(fullPath)) {
      try {
        const content = await readFile(fullPath, 'utf-8');
        const coverage = JSON.parse(content);

        return parseCoverageData(coverage, projectPath);
      } catch {
        // 파싱 실패 시 다음 파일 시도
      }
    }
  }

  return [];
}

/**
 * 커버리지 데이터 파싱
 */
function parseCoverageData(coverage: Record<string, unknown>, projectPath: string): FileCoverage[] {
  const results: FileCoverage[] = [];

  for (const [file, data] of Object.entries(coverage)) {
    if (typeof data !== 'object' || data === null) continue;

    const fileData = data as Record<string, unknown>;

    // Istanbul 형식
    if ('s' in fileData && 'f' in fileData && 'b' in fileData) {
      const statements = fileData.s as Record<string, number>;
      const functions = fileData.f as Record<string, number>;
      const branches = fileData.b as Record<string, number[]>;
      const statementMap = fileData.statementMap as Record<string, { start: { line: number } }>;
      const branchMap = fileData.branchMap as Record<string, { locations: { start: { line: number } }[] }>;

      const statementValues = Object.values(statements);
      const functionValues = Object.values(functions);
      const branchValues = Object.values(branches).flat();

      const lineCovered = statementValues.filter((v) => v > 0).length;
      const lineTotal = statementValues.length;

      const funcCovered = functionValues.filter((v) => v > 0).length;
      const funcTotal = functionValues.length;

      const branchCovered = branchValues.filter((v) => v > 0).length;
      const branchTotal = branchValues.length;

      // 커버되지 않은 라인 추출
      const uncoveredLines: number[] = [];
      for (const [key, count] of Object.entries(statements)) {
        if (count === 0 && statementMap[key]) {
          uncoveredLines.push(statementMap[key].start.line);
        }
      }

      // 커버되지 않은 브랜치 추출
      const uncoveredBranches: number[] = [];
      for (const [key, counts] of Object.entries(branches)) {
        if (counts.some((c) => c === 0) && branchMap[key]) {
          for (const loc of branchMap[key].locations) {
            uncoveredBranches.push(loc.start.line);
          }
        }
      }

      results.push({
        file: file.replace(projectPath + '/', ''),
        lines: {
          total: lineTotal,
          covered: lineCovered,
          percentage: lineTotal > 0 ? Math.round((lineCovered / lineTotal) * 100) : 100,
        },
        branches: {
          total: branchTotal,
          covered: branchCovered,
          percentage: branchTotal > 0 ? Math.round((branchCovered / branchTotal) * 100) : 100,
        },
        functions: {
          total: funcTotal,
          covered: funcCovered,
          percentage: funcTotal > 0 ? Math.round((funcCovered / funcTotal) * 100) : 100,
        },
        uncoveredLines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
        uncoveredBranches: [...new Set(uncoveredBranches)].sort((a, b) => a - b),
      });
    }
  }

  return results;
}

/**
 * 커버리지 부족 파일 식별
 */
function identifyLowCoverageFiles(
  coverages: FileCoverage[],
  thresholds: CoverageThresholds
): FileCoverage[] {
  return coverages.filter((c) =>
    c.lines.percentage < thresholds.lines ||
    c.branches.percentage < thresholds.branches ||
    c.functions.percentage < thresholds.functions
  );
}

/**
 * coverage-fix 실행기
 */
async function coverageFixExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 커버리지 테스트 실행
    rawOutput += '=== Running coverage tests ===\n\n';

    try {
      const { stdout, stderr } = await execAsync(
        'npm run test -- --coverage',
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
      );
      rawOutput += stdout + '\n' + stderr;
    } catch (error: unknown) {
      // 테스트 실패해도 커버리지 리포트는 생성될 수 있음
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as { stdout: string; stderr: string };
        rawOutput += execError.stdout + '\n' + execError.stderr;
      }
    }

    // 2. 커버리지 리포트 파싱
    rawOutput += '\n=== Analyzing coverage report ===\n\n';
    const coverages = await parseCoverageReport(projectPath);

    if (coverages.length === 0) {
      rawOutput += 'No coverage report found. Make sure to run tests with --coverage flag.\n';
      return {
        task: 'coverage-fix',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: {
          rawOutput,
        },
      };
    }

    // 3. 커버리지 부족 파일 식별
    const lowCoverageFiles = identifyLowCoverageFiles(coverages, DEFAULT_THRESHOLDS);
    issuesFound = lowCoverageFiles.length;

    // 4. 상세 리포트 생성
    rawOutput += `\nFiles with coverage below thresholds (L:${DEFAULT_THRESHOLDS.lines}% B:${DEFAULT_THRESHOLDS.branches}% F:${DEFAULT_THRESHOLDS.functions}%):\n\n`;

    for (const file of lowCoverageFiles) {
      rawOutput += `--- ${file.file} ---\n`;
      rawOutput += `  Lines: ${file.lines.percentage}% (${file.lines.covered}/${file.lines.total})\n`;
      rawOutput += `  Branches: ${file.branches.percentage}% (${file.branches.covered}/${file.branches.total})\n`;
      rawOutput += `  Functions: ${file.functions.percentage}% (${file.functions.covered}/${file.functions.total})\n`;

      if (file.uncoveredLines.length > 0) {
        rawOutput += `  Uncovered lines: ${file.uncoveredLines.slice(0, 10).join(', ')}`;
        if (file.uncoveredLines.length > 10) {
          rawOutput += ` ... and ${file.uncoveredLines.length - 10} more`;
        }
        rawOutput += '\n';
      }
      rawOutput += '\n';

      // 제안 생성
      const issues: string[] = [];
      if (file.lines.percentage < DEFAULT_THRESHOLDS.lines) {
        issues.push(`line coverage ${file.lines.percentage}%`);
      }
      if (file.branches.percentage < DEFAULT_THRESHOLDS.branches) {
        issues.push(`branch coverage ${file.branches.percentage}%`);
      }
      if (file.functions.percentage < DEFAULT_THRESHOLDS.functions) {
        issues.push(`function coverage ${file.functions.percentage}%`);
      }

      suggestions.push({
        file: file.file,
        issue: `Low coverage: ${issues.join(', ')}`,
        suggestion: file.uncoveredLines.length > 0
          ? `Add tests covering lines: ${file.uncoveredLines.slice(0, 5).join(', ')}`
          : 'Add more test cases to improve coverage',
        confidence: file.lines.percentage < 50 ? 'high' : 'medium',
      });
    }

    // 5. 전체 커버리지 요약
    const totalLines = coverages.reduce((sum, c) => sum + c.lines.total, 0);
    const coveredLines = coverages.reduce((sum, c) => sum + c.lines.covered, 0);
    const overallPercentage = totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0;

    rawOutput += `\n=== Overall Coverage: ${overallPercentage}% ===\n`;
    rawOutput += `Files with low coverage: ${lowCoverageFiles.length}/${coverages.length}\n`;

    return {
      task: 'coverage-fix',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0, // coverage-fix는 분석만 수행
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'coverage-fix',
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
registerTaskExecutor('coverage-fix', coverageFixExecutor);

export { coverageFixExecutor, parseCoverageReport, identifyLowCoverageFiles };
