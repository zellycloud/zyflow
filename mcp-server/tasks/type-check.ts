/**
 * type-check Task
 *
 * TypeScript 타입 오류를 감지하고 수정합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * TypeScript 오류 파싱 결과
 */
interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

/**
 * tsc 출력 파싱
 */
function parseTypeScriptErrors(output: string): TypeScriptError[] {
  const errors: TypeScriptError[] = [];
  const lines = output.split('\n');

  // 패턴: src/file.ts(10,5): error TS2304: Cannot find name 'foo'.
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(errorPattern);
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[4],
        message: match[5],
      });
    }
  }

  return errors;
}

/**
 * 오류 코드별 수정 제안 생성
 */
function getSuggestionForError(error: TypeScriptError): string {
  const suggestionMap: Record<string, string> = {
    TS2304: 'Cannot find name - Add missing import or declare the variable',
    TS2307: 'Cannot find module - Install the package or fix the import path',
    TS2322: 'Type mismatch - Check type compatibility and add type assertion if needed',
    TS2339: 'Property does not exist - Add property to interface or use type assertion',
    TS2345: 'Argument type mismatch - Convert the argument to the expected type',
    TS2531: 'Object is possibly null - Add null check or use optional chaining',
    TS2532: 'Object is possibly undefined - Add undefined check or use optional chaining',
    TS2554: 'Expected arguments count mismatch - Add or remove arguments',
    TS2555: 'Expected at least N arguments - Add missing required arguments',
    TS2571: 'Object is of type unknown - Add type assertion or type guard',
    TS2741: 'Property is missing - Add the required property',
    TS7006: 'Parameter has implicit any - Add explicit type annotation',
    TS7031: 'Binding element has implicit any - Add explicit type annotation',
    TS18046: 'Variable is of type unknown - Use type narrowing or assertion',
  };

  return suggestionMap[error.code] || `Fix TypeScript error ${error.code}`;
}

/**
 * type-check 실행기
 */
async function typeCheckExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  let issuesFixed = 0;
  const modifiedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. TypeScript 컴파일 체크
    let tscOutput = '';
    try {
      const { stdout, stderr } = await execAsync(
        'npx tsc --noEmit',
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
      );
      tscOutput = stdout + stderr;
      rawOutput = tscOutput;
    } catch (error: unknown) {
      // tsc는 오류가 있으면 non-zero exit code를 반환
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as { stdout: string; stderr: string };
        tscOutput = execError.stdout + execError.stderr;
        rawOutput = tscOutput;
      }
    }

    // 2. 오류 파싱
    const errors = parseTypeScriptErrors(tscOutput);
    issuesFound = errors.length;

    // 3. 각 오류에 대한 제안 생성
    for (const error of errors) {
      suggestions.push({
        file: error.file,
        line: error.line,
        issue: `[${error.code}] ${error.message}`,
        suggestion: getSuggestionForError(error),
        confidence: 'high',
      });
    }

    // 4. 자동 수정 시도 (특정 오류 타입에 대해서만)
    if (!options.dryRun && issuesFound > 0) {
      // 누락된 import 자동 추가 시도 (VSCode 스타일)
      // 현재는 제안만 제공하고 실제 수정은 AI가 수행하도록 함

      // TODO: AI 기반 자동 수정 구현
      // - TS2304 (Cannot find name): 적절한 import 찾아서 추가
      // - TS2531/TS2532 (null/undefined): optional chaining 추가
      // - TS7006 (implicit any): 타입 추론 기반 타입 추가
    }

    // 오류가 없으면 성공
    const success = issuesFound === 0;

    return {
      task: 'type-check',
      success,
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
      task: 'type-check',
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
registerTaskExecutor('type-check', typeCheckExecutor);

export { typeCheckExecutor, parseTypeScriptErrors };
