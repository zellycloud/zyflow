/**
 * dead-code Task
 *
 * 미사용 코드를 감지하고 .quarantine/ 폴더로 격리합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 미사용 export 정보
 */
interface UnusedExport {
  file: string;
  line?: number;
  exportName: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 미사용 의존성 정보
 */
interface UnusedDependency {
  name: string;
  type: 'dependency' | 'devDependency';
}

/**
 * ts-prune 출력 파싱
 */
function parseTsPruneOutput(output: string): UnusedExport[] {
  const exports: UnusedExport[] = [];
  const lines = output.split('\n').filter((line) => line.trim());

  // 패턴: src/utils/helper.ts:10 - unusedFunction
  const pattern = /^(.+?):(\d+)?\s+-\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const exportName = match[3].trim();

      // default export는 신뢰도 낮음 (동적 import 가능성)
      // 테스트 파일은 신뢰도 낮음
      let confidence: 'high' | 'medium' | 'low' = 'high';
      if (exportName === 'default') {
        confidence = 'low';
      } else if (match[1].includes('.test.') || match[1].includes('.spec.')) {
        confidence = 'low';
      } else if (exportName.startsWith('_')) {
        confidence = 'medium';
      }

      exports.push({
        file: match[1],
        line: match[2] ? parseInt(match[2], 10) : undefined,
        exportName,
        confidence,
      });
    }
  }

  return exports;
}

/**
 * depcheck 출력 파싱
 */
function parseDepcheckOutput(output: string): { unused: UnusedDependency[]; missing: string[] } {
  const result: { unused: UnusedDependency[]; missing: string[] } = {
    unused: [],
    missing: [],
  };

  try {
    const json = JSON.parse(output);

    // 미사용 의존성
    if (json.dependencies) {
      for (const dep of json.dependencies) {
        result.unused.push({ name: dep, type: 'dependency' });
      }
    }

    if (json.devDependencies) {
      for (const dep of json.devDependencies) {
        result.unused.push({ name: dep, type: 'devDependency' });
      }
    }

    // 누락된 의존성
    if (json.missing) {
      result.missing = Object.keys(json.missing);
    }
  } catch {
    // JSON 파싱 실패 시 빈 결과
  }

  return result;
}

/**
 * dead-code 실행기
 */
async function deadCodeExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const issuesFixed = 0;
  const quarantinedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. ts-prune으로 미사용 export 감지
    let tsPruneOutput = '';
    try {
      const { stdout } = await execAsync(
        'npx ts-prune',
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
      );
      tsPruneOutput = stdout;
      rawOutput += '--- ts-prune output ---\n' + stdout;
    } catch (error: unknown) {
      // ts-prune이 설치되지 않았거나 실패
      if (error && typeof error === 'object' && 'stdout' in error) {
        tsPruneOutput = (error as { stdout: string }).stdout || '';
        rawOutput += '--- ts-prune output ---\n' + tsPruneOutput;
      }
    }

    const unusedExports = parseTsPruneOutput(tsPruneOutput);

    // 2. depcheck으로 미사용 의존성 감지
    let depcheckOutput = '';
    try {
      const { stdout } = await execAsync(
        'npx depcheck --json',
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
      );
      depcheckOutput = stdout;
      rawOutput += '\n--- depcheck output ---\n' + stdout;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'stdout' in error) {
        depcheckOutput = (error as { stdout: string }).stdout || '';
        rawOutput += '\n--- depcheck output ---\n' + depcheckOutput;
      }
    }

    const depcheckResult = parseDepcheckOutput(depcheckOutput);

    // 3. 문제 집계
    issuesFound = unusedExports.length + depcheckResult.unused.length;

    // 4. 미사용 export에 대한 제안 생성
    for (const exp of unusedExports) {
      suggestions.push({
        file: exp.file,
        line: exp.line,
        issue: `Unused export: ${exp.exportName}`,
        suggestion:
          exp.confidence === 'high'
            ? 'Consider removing this export or moving to .quarantine/'
            : 'Low confidence - verify before removing (might be dynamically imported)',
        confidence: exp.confidence,
      });
    }

    // 5. 미사용 의존성에 대한 제안 생성
    for (const dep of depcheckResult.unused) {
      suggestions.push({
        file: 'package.json',
        issue: `Unused ${dep.type}: ${dep.name}`,
        suggestion: `Run 'npm uninstall ${dep.name}' to remove`,
        confidence: 'medium',
      });
    }

    // 6. 누락된 의존성에 대한 제안
    for (const missing of depcheckResult.missing) {
      suggestions.push({
        file: 'package.json',
        issue: `Missing dependency: ${missing}`,
        suggestion: `Run 'npm install ${missing}' to add`,
        confidence: 'high',
      });
    }

    // 7. 자동 격리 (dry run이 아니고 high confidence인 경우)
    if (!options.dryRun) {
      // 실제 격리는 QuarantineManager를 통해 수행
      // 여기서는 결과만 준비
      const highConfidenceExports = unusedExports.filter((e) => e.confidence === 'high');

      // TODO: QuarantineManager 연동
      // 현재는 제안만 제공
      if (highConfidenceExports.length > 0) {
        rawOutput += `\n\n${highConfidenceExports.length} high-confidence unused exports found.`;
        rawOutput += '\nUse quarantine_move tool to move them to .quarantine/';
      }
    }

    return {
      task: 'dead-code',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      details: {
        quarantinedFiles: quarantinedFiles.length > 0 ? quarantinedFiles : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'dead-code',
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
registerTaskExecutor('dead-code', deadCodeExecutor);

export { deadCodeExecutor, parseTsPruneOutput, parseDepcheckOutput };
