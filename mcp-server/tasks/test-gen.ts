/**
 * test-gen Task
 *
 * 새로 추가되거나 변경된 파일에 대한 테스트를 자동 생성합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname, basename, extname } from 'path';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 파일 변경 정보
 */
interface FileChange {
  file: string;
  status: 'added' | 'modified';
  hasTest: boolean;
  testPath: string;
}

/**
 * 함수 시그니처 정보
 */
interface FunctionSignature {
  name: string;
  params: string[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
}

/**
 * git diff로 변경된 파일 감지
 */
async function getChangedFiles(projectPath: string): Promise<FileChange[]> {
  const changes: FileChange[] = [];

  try {
    // 새로 추가된 파일
    const { stdout: added } = await execAsync(
      'git diff HEAD~1 --name-only --diff-filter=A',
      { cwd: projectPath }
    );

    // 수정된 파일
    const { stdout: modified } = await execAsync(
      'git diff HEAD~1 --name-only --diff-filter=M',
      { cwd: projectPath }
    );

    const addedFiles = added.split('\n').filter((f) => f.trim());
    const modifiedFiles = modified.split('\n').filter((f) => f.trim());

    for (const file of addedFiles) {
      if (isSourceFile(file)) {
        const testPath = getTestPath(file);
        const hasTest = await fileExists(join(projectPath, testPath));
        changes.push({ file, status: 'added', hasTest, testPath });
      }
    }

    for (const file of modifiedFiles) {
      if (isSourceFile(file)) {
        const testPath = getTestPath(file);
        const hasTest = await fileExists(join(projectPath, testPath));
        changes.push({ file, status: 'modified', hasTest, testPath });
      }
    }
  } catch {
    // git 명령 실패 시 빈 배열
  }

  return changes;
}

/**
 * 소스 파일인지 확인
 */
function isSourceFile(file: string): boolean {
  const ext = extname(file);
  const isSource = ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  const isTest =
    file.includes('.test.') ||
    file.includes('.spec.') ||
    file.includes('__tests__') ||
    file.includes('__mocks__');

  return isSource && !isTest;
}

/**
 * 테스트 파일 경로 생성
 */
function getTestPath(sourcePath: string): string {
  const dir = dirname(sourcePath);
  const name = basename(sourcePath, extname(sourcePath));
  const ext = extname(sourcePath);

  // src/utils/helper.ts -> src/utils/__tests__/helper.test.ts
  return join(dir, '__tests__', `${name}.test${ext}`);
}

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
 * 소스 파일에서 함수 시그니처 추출
 */
async function extractFunctions(
  projectPath: string,
  file: string
): Promise<FunctionSignature[]> {
  const functions: FunctionSignature[] = [];

  try {
    const content = await readFile(join(projectPath, file), 'utf-8');
    const lines = content.split('\n');

    // 패턴들
    const patterns = [
      // export function foo(a: string, b: number): boolean
      /^export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/,
      // export const foo = (a: string) => { ... }
      /^export\s+const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+))?\s*=>/,
      // function foo(a: string): boolean
      /^(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/,
      // const foo = (a: string) => { ... }
      /^const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+))?\s*=>/,
    ];

    for (const line of lines) {
      const trimmed = line.trim();

      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const isExported = trimmed.startsWith('export');

          // 패턴에 따라 그룹 매핑이 다름
          let name: string;
          let isAsync: boolean;
          let params: string;
          let returnType: string | undefined;

          if (pattern.source.includes('function')) {
            // function 패턴
            const asyncGroup = match[1];
            name = match[2];
            isAsync = !!asyncGroup;
            params = match[3] || '';
            returnType = match[4]?.trim();
          } else {
            // arrow function 패턴
            name = match[1];
            const asyncGroup = match[2];
            isAsync = !!asyncGroup;
            params = match[3] || '';
            returnType = match[4]?.trim();
          }

          const paramList = params
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p);

          functions.push({
            name,
            params: paramList,
            returnType,
            isAsync,
            isExported,
          });
          break;
        }
      }
    }
  } catch {
    // 파일 읽기 실패
  }

  return functions.filter((f) => f.isExported);
}

/**
 * 테스트 템플릿 생성 (vitest/jest 호환)
 */
function generateTestTemplate(
  sourcePath: string,
  functions: FunctionSignature[]
): string {
  const name = basename(sourcePath, extname(sourcePath));
  const relativePath = sourcePath.replace('__tests__/', '').replace('.test', '');

  let template = `import { describe, it, expect } from 'vitest';
import { ${functions.map((f) => f.name).join(', ')} } from '../${name}';

describe('${name}', () => {
`;

  for (const fn of functions) {
    const asyncPrefix = fn.isAsync ? 'async ' : '';
    const awaitPrefix = fn.isAsync ? 'await ' : '';

    template += `  describe('${fn.name}', () => {
    it('should work correctly', ${asyncPrefix}() => {
      // Arrange
      ${fn.params.length > 0 ? `// const ${fn.params.map((p) => p.split(':')[0].trim()).join(', ')} = ...;` : ''}

      // Act
      ${fn.returnType && fn.returnType !== 'void' ? 'const result = ' : ''}${awaitPrefix}${fn.name}(${fn.params.map((p) => `/* ${p.split(':')[0].trim()} */`).join(', ')});

      // Assert
      ${fn.returnType && fn.returnType !== 'void' ? 'expect(result).toBeDefined();' : '// Add assertions here'}
    });

    it('should handle edge cases', ${asyncPrefix}() => {
      // TODO: Add edge case tests
    });
  });

`;
  }

  template += '});\n';

  return template;
}

/**
 * test-gen 실행기
 */
async function testGenExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  let issuesFixed = 0;
  const generatedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 변경된 파일 감지
    const changedFiles = await getChangedFiles(projectPath);

    rawOutput += `Found ${changedFiles.length} changed source files\n\n`;

    // 2. 테스트 없는 파일 필터링
    const filesWithoutTests = changedFiles.filter((f) => !f.hasTest);

    rawOutput += `Files without tests: ${filesWithoutTests.length}\n\n`;

    issuesFound = filesWithoutTests.length;

    // 3. 각 파일에 대해 테스트 생성
    for (const fileChange of filesWithoutTests) {
      rawOutput += `--- ${fileChange.file} ---\n`;

      // 함수 시그니처 추출
      const functions = await extractFunctions(projectPath, fileChange.file);
      rawOutput += `  Found ${functions.length} exported functions\n`;

      if (functions.length === 0) {
        suggestions.push({
          file: fileChange.file,
          issue: 'No exported functions found',
          suggestion: 'File may contain only types or internal code. Manual test creation may be needed.',
          confidence: 'low',
        });
        continue;
      }

      // 테스트 템플릿 생성
      const testContent = generateTestTemplate(fileChange.file, functions);

      if (!options.dryRun) {
        // 테스트 디렉토리 생성
        const testDir = dirname(join(projectPath, fileChange.testPath));
        try {
          await mkdir(testDir, { recursive: true });
        } catch {
          // 이미 존재
        }

        // 테스트 파일 작성
        await writeFile(join(projectPath, fileChange.testPath), testContent, 'utf-8');
        generatedFiles.push(fileChange.testPath);
        issuesFixed++;

        rawOutput += `  Generated: ${fileChange.testPath}\n`;
      } else {
        rawOutput += `  Would generate: ${fileChange.testPath}\n`;
      }

      suggestions.push({
        file: fileChange.testPath,
        issue: `Test file generated for ${fileChange.file}`,
        suggestion: `Review and complete the generated test at ${fileChange.testPath}`,
        confidence: 'high',
      });
    }

    return {
      task: 'test-gen',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      details: {
        generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'test-gen',
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
registerTaskExecutor('test-gen', testGenExecutor);

export { testGenExecutor, getChangedFiles, extractFunctions, generateTestTemplate };
