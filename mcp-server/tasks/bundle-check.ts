/**
 * bundle-check Task
 *
 * 빌드 후 번들 크기를 분석하고 이상 증가를 감지합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { readdir, stat, readFile, writeFile, access } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 번들 파일 정보
 */
interface BundleFile {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  gzipSize?: number;
  gzipFormatted?: string;
}

/**
 * 번들 분석 결과
 */
interface BundleAnalysis {
  totalSize: number;
  totalFormatted: string;
  files: BundleFile[];
  largestFiles: BundleFile[];
  previousSize?: number;
  sizeDiff?: number;
  sizeDiffPercent?: number;
}

/**
 * 번들 히스토리 파일 경로
 */
const BUNDLE_HISTORY_FILE = '.zyflow/bundle-history.json';

/**
 * 크기 경고 임계값 (10% 증가)
 */
const SIZE_WARNING_THRESHOLD = 0.1;

/**
 * 바이트를 읽기 쉬운 형식으로 변환
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
 * 디렉토리 재귀 탐색하여 JS/CSS 파일 찾기
 */
async function findBundleFiles(
  dir: string,
  files: BundleFile[] = []
): Promise<BundleFile[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await findBundleFiles(fullPath, files);
      } else if (
        entry.name.endsWith('.js') ||
        entry.name.endsWith('.css') ||
        entry.name.endsWith('.mjs')
      ) {
        const stats = await stat(fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          sizeFormatted: formatSize(stats.size),
        });
      }
    }
  } catch {
    // 디렉토리 읽기 실패
  }

  return files;
}

/**
 * 빌드 실행
 */
async function runBuild(
  projectPath: string
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: projectPath,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000, // 5분 타임아웃
    });
    return { success: true, output: stdout + stderr };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const execError = error as { stdout: string; stderr: string };
      return { success: false, output: execError.stdout + execError.stderr };
    }
    return { success: false, output: String(error) };
  }
}

/**
 * 번들 히스토리 로드
 */
async function loadBundleHistory(
  projectPath: string
): Promise<{ timestamp: string; totalSize: number }[]> {
  const historyPath = join(projectPath, BUNDLE_HISTORY_FILE);

  try {
    const content = await readFile(historyPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * 번들 히스토리 저장
 */
async function saveBundleHistory(
  projectPath: string,
  history: { timestamp: string; totalSize: number }[]
): Promise<void> {
  const historyPath = join(projectPath, BUNDLE_HISTORY_FILE);
  const dir = join(projectPath, '.zyflow');

  try {
    const { mkdir } = await import('fs/promises');
    await mkdir(dir, { recursive: true });
    await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  } catch {
    // 저장 실패 무시
  }
}

/**
 * bundle-check 실행기
 */
async function bundleCheckExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 빌드 실행
    rawOutput += '=== Running build ===\n\n';
    const buildResult = await runBuild(projectPath);
    rawOutput += buildResult.output.slice(0, 2000) + '\n';

    if (!buildResult.success) {
      return {
        task: 'bundle-check',
        success: false,
        duration: 0,
        issuesFound: 1,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        error: 'Build failed',
        details: { rawOutput },
      };
    }

    // 2. 빌드 출력 디렉토리 찾기
    const possibleDirs = ['dist', 'build', '.next', 'out'];
    let buildDir: string | null = null;

    for (const dir of possibleDirs) {
      const fullPath = join(projectPath, dir);
      if (await fileExists(fullPath)) {
        buildDir = fullPath;
        break;
      }
    }

    if (!buildDir) {
      rawOutput += '\nBuild directory not found.\n';
      return {
        task: 'bundle-check',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: { rawOutput },
      };
    }

    // 3. 번들 파일 분석
    rawOutput += '\n=== Analyzing bundle ===\n\n';
    const bundleFiles = await findBundleFiles(buildDir);

    const totalSize = bundleFiles.reduce((sum, f) => sum + f.size, 0);

    const analysis: BundleAnalysis = {
      totalSize,
      totalFormatted: formatSize(totalSize),
      files: bundleFiles,
      largestFiles: [...bundleFiles].sort((a, b) => b.size - a.size).slice(0, 10),
    };

    rawOutput += `Total bundle size: ${analysis.totalFormatted}\n`;
    rawOutput += `Number of files: ${bundleFiles.length}\n\n`;

    // 4. 이전 빌드와 비교
    const history = await loadBundleHistory(projectPath);

    if (history.length > 0) {
      const lastBuild = history[history.length - 1];
      analysis.previousSize = lastBuild.totalSize;
      analysis.sizeDiff = totalSize - lastBuild.totalSize;
      analysis.sizeDiffPercent = (analysis.sizeDiff / lastBuild.totalSize) * 100;

      rawOutput += '=== Comparison with previous build ===\n\n';
      rawOutput += `Previous size: ${formatSize(lastBuild.totalSize)}\n`;
      rawOutput += `Current size: ${analysis.totalFormatted}\n`;
      rawOutput += `Difference: ${analysis.sizeDiff >= 0 ? '+' : ''}${formatSize(analysis.sizeDiff)} (${analysis.sizeDiffPercent.toFixed(2)}%)\n\n`;

      // 크기 증가 경고
      if (analysis.sizeDiffPercent > SIZE_WARNING_THRESHOLD * 100) {
        issuesFound++;
        suggestions.push({
          file: buildDir,
          issue: `Bundle size increased by ${analysis.sizeDiffPercent.toFixed(2)}%`,
          suggestion: 'Analyze the build output for large dependencies. Consider code splitting or lazy loading.',
          confidence: 'high',
        });
      }
    }

    // 5. 가장 큰 파일 목록
    rawOutput += '=== Largest files ===\n\n';
    for (const file of analysis.largestFiles) {
      const relativePath = file.path.replace(projectPath + '/', '');
      rawOutput += `${file.sizeFormatted.padStart(12)}  ${relativePath}\n`;

      // 1MB 이상 파일 경고
      if (file.size > 1024 * 1024) {
        issuesFound++;
        suggestions.push({
          file: relativePath,
          issue: `Large file: ${file.sizeFormatted}`,
          suggestion: 'Consider code splitting this chunk or lazy loading large dependencies.',
          confidence: 'medium',
        });
      }
    }

    // 6. 히스토리 업데이트
    if (!options.dryRun) {
      history.push({
        timestamp: new Date().toISOString(),
        totalSize,
      });
      // 최근 30개만 유지
      const trimmedHistory = history.slice(-30);
      await saveBundleHistory(projectPath, trimmedHistory);
    }

    // 7. 요약
    rawOutput += '\n=== Summary ===\n\n';
    rawOutput += `Total size: ${analysis.totalFormatted}\n`;
    rawOutput += `Files over 1MB: ${bundleFiles.filter((f) => f.size > 1024 * 1024).length}\n`;
    rawOutput += `Files over 500KB: ${bundleFiles.filter((f) => f.size > 500 * 1024).length}\n`;

    if (analysis.sizeDiffPercent !== undefined) {
      if (analysis.sizeDiffPercent > 10) {
        rawOutput += `\n⚠️  WARNING: Bundle size increased significantly (+${analysis.sizeDiffPercent.toFixed(2)}%)\n`;
      } else if (analysis.sizeDiffPercent < -10) {
        rawOutput += `\n✅ Great! Bundle size decreased by ${Math.abs(analysis.sizeDiffPercent).toFixed(2)}%\n`;
      }
    }

    return {
      task: 'bundle-check',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0,
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'bundle-check',
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
registerTaskExecutor('bundle-check', bundleCheckExecutor);

export { bundleCheckExecutor, formatSize, findBundleFiles };
