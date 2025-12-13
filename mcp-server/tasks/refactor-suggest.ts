/**
 * refactor-suggest Task
 *
 * 코드 복잡도 분석 및 중복 코드 감지하여 리팩토링 제안을 생성합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 파일 복잡도 정보
 */
interface FileComplexity {
  file: string;
  lines: number;
  functions: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
  complexity: 'low' | 'medium' | 'high';
}

/**
 * 중복 코드 정보
 */
interface DuplicateCode {
  files: string[];
  lines: { file: string; start: number; end: number }[];
  similarity: number;
  content: string;
}

/**
 * 파일 확장자 필터
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * 디렉토리 재귀 탐색
 */
async function walkDirectory(
  dir: string,
  callback: (file: string) => Promise<void>,
  exclude: string[] = ['node_modules', '.git', 'dist', 'build', '.quarantine']
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!exclude.includes(entry.name)) {
        await walkDirectory(fullPath, callback, exclude);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (CODE_EXTENSIONS.includes(ext)) {
        await callback(fullPath);
      }
    }
  }
}

/**
 * 파일 복잡도 분석
 */
async function analyzeFileComplexity(filePath: string): Promise<FileComplexity> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // 함수 정의 찾기
  const functionPatterns = [
    /function\s+\w+/g,
    /const\s+\w+\s*=\s*(?:async\s*)?\(/g,
    /\w+\s*:\s*(?:async\s*)?\(/g,
    /(?:async\s+)?(?:function\s*)?\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*(?:=>|{)/g,
  ];

  let functionCount = 0;
  const functionLengths: number[] = [];

  // 간단한 함수 길이 추정 (중괄호 매칭)
  let braceDepth = 0;
  let currentFunctionStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 함수 시작 감지
    for (const pattern of functionPatterns) {
      if (pattern.test(line)) {
        functionCount++;
        if (currentFunctionStart === -1) {
          currentFunctionStart = i;
        }
        break;
      }
      pattern.lastIndex = 0;
    }

    // 중괄호 카운트
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    braceDepth += opens - closes;

    if (braceDepth === 0 && currentFunctionStart !== -1) {
      functionLengths.push(i - currentFunctionStart + 1);
      currentFunctionStart = -1;
    }
  }

  const avgFunctionLength =
    functionLengths.length > 0
      ? functionLengths.reduce((a, b) => a + b, 0) / functionLengths.length
      : 0;

  const maxFunctionLength = functionLengths.length > 0 ? Math.max(...functionLengths) : 0;

  // 복잡도 판단
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (lines.length > 500 || maxFunctionLength > 100 || avgFunctionLength > 50) {
    complexity = 'high';
  } else if (lines.length > 200 || maxFunctionLength > 50 || avgFunctionLength > 25) {
    complexity = 'medium';
  }

  return {
    file: filePath,
    lines: lines.length,
    functions: functionCount,
    avgFunctionLength: Math.round(avgFunctionLength),
    maxFunctionLength,
    complexity,
  };
}

/**
 * 간단한 중복 코드 감지 (해시 기반)
 */
async function detectDuplicates(
  projectPath: string
): Promise<DuplicateCode[]> {
  const duplicates: DuplicateCode[] = [];
  const codeBlocks = new Map<string, { file: string; start: number; end: number; content: string }[]>();

  // 모든 파일의 코드 블록 수집
  await walkDirectory(projectPath, async (file) => {
    const content = await readFile(file, 'utf-8');
    const lines = content.split('\n');

    // 5줄 이상의 코드 블록 추출
    const windowSize = 5;
    for (let i = 0; i <= lines.length - windowSize; i++) {
      const block = lines.slice(i, i + windowSize).join('\n').trim();

      // 빈 줄이나 주석만 있는 블록 제외
      if (block.length < 50) continue;
      if (block.match(/^[\s/\*]*$/)) continue;

      // 정규화 (공백, 변수명 등)
      const normalized = block
        .replace(/\s+/g, ' ')
        .replace(/['"`][^'"`]*['"`]/g, '""')
        .trim();

      const hash = simpleHash(normalized);

      if (!codeBlocks.has(hash)) {
        codeBlocks.set(hash, []);
      }
      codeBlocks.get(hash)!.push({
        file: file.replace(projectPath + '/', ''),
        start: i + 1,
        end: i + windowSize,
        content: block,
      });
    }
  });

  // 중복된 블록 찾기
  for (const [, blocks] of codeBlocks) {
    if (blocks.length >= 2) {
      // 같은 파일 내 중복 제외
      const uniqueFiles = new Set(blocks.map((b) => b.file));
      if (uniqueFiles.size >= 2) {
        duplicates.push({
          files: Array.from(uniqueFiles),
          lines: blocks.slice(0, 2),
          similarity: 100,
          content: blocks[0].content,
        });
      }
    }
  }

  return duplicates.slice(0, 10); // 상위 10개만
}

/**
 * 간단한 해시 함수
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * refactor-suggest 실행기
 */
async function refactorSuggestExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 파일 복잡도 분석
    const complexityResults: FileComplexity[] = [];

    await walkDirectory(projectPath, async (file) => {
      const complexity = await analyzeFileComplexity(file);
      complexityResults.push(complexity);
    });

    // 복잡도 높은 파일 정렬
    const highComplexityFiles = complexityResults
      .filter((c) => c.complexity !== 'low')
      .sort((a, b) => b.maxFunctionLength - a.maxFunctionLength);

    rawOutput += '=== File Complexity Analysis ===\n\n';

    for (const file of highComplexityFiles.slice(0, 20)) {
      issuesFound++;
      rawOutput += `${file.file}\n`;
      rawOutput += `  Lines: ${file.lines}, Functions: ${file.functions}\n`;
      rawOutput += `  Avg function length: ${file.avgFunctionLength}, Max: ${file.maxFunctionLength}\n`;
      rawOutput += `  Complexity: ${file.complexity.toUpperCase()}\n\n`;

      suggestions.push({
        file: file.file.replace(projectPath + '/', ''),
        issue: `High complexity: ${file.lines} lines, max function ${file.maxFunctionLength} lines`,
        suggestion: file.maxFunctionLength > 50
          ? 'Consider breaking down large functions into smaller ones'
          : 'Consider splitting this file into smaller modules',
        confidence: file.complexity === 'high' ? 'high' : 'medium',
      });
    }

    // 2. 중복 코드 감지
    rawOutput += '\n=== Duplicate Code Detection ===\n\n';
    const duplicates = await detectDuplicates(projectPath);

    for (const dup of duplicates) {
      issuesFound++;
      rawOutput += `Duplicate found in: ${dup.files.join(', ')}\n`;
      rawOutput += `  Locations: ${dup.lines.map((l) => `${l.file}:${l.start}-${l.end}`).join(', ')}\n`;
      rawOutput += `  Preview: ${dup.content.slice(0, 100)}...\n\n`;

      suggestions.push({
        file: dup.files[0],
        line: dup.lines[0]?.start,
        issue: `Duplicate code found in ${dup.files.length} files`,
        suggestion: 'Consider extracting to a shared utility function',
        confidence: 'medium',
      });
    }

    // 3. 대용량 파일 경고
    rawOutput += '\n=== Large Files ===\n\n';
    const largeFiles = complexityResults.filter((c) => c.lines > 300);

    for (const file of largeFiles) {
      if (!suggestions.some((s) => s.file === file.file.replace(projectPath + '/', ''))) {
        issuesFound++;
        rawOutput += `${file.file}: ${file.lines} lines\n`;

        suggestions.push({
          file: file.file.replace(projectPath + '/', ''),
          issue: `Large file with ${file.lines} lines`,
          suggestion: 'Consider splitting into multiple modules based on responsibility',
          confidence: 'low',
        });
      }
    }

    return {
      task: 'refactor-suggest',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0, // refactor-suggest는 보고만 함
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'refactor-suggest',
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
registerTaskExecutor('refactor-suggest', refactorSuggestExecutor);

export { refactorSuggestExecutor, analyzeFileComplexity, detectDuplicates };
