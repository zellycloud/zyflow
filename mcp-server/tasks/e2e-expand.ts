/**
 * e2e-expand Task
 *
 * E2E 테스트 커버리지를 분석하고 커버되지 않은 라우트/페이지에 대한 테스트를 생성합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join, basename, extname } from 'path';
import { readFile, writeFile, readdir, access, mkdir } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 라우트 정보
 */
interface RouteInfo {
  path: string;
  component: string;
  hasE2ETest: boolean;
}

/**
 * E2E 테스트 정보
 */
interface E2ETestInfo {
  file: string;
  routes: string[];
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
 * 디렉토리 탐색
 */
async function walkDir(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          await walkDir(fullPath, files);
        }
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // 무시
  }

  return files;
}

/**
 * React/Next.js 라우트 감지
 */
async function detectRoutes(projectPath: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  // Next.js pages 디렉토리
  const pagesDir = join(projectPath, 'src', 'pages');
  const appDir = join(projectPath, 'src', 'app');

  // pages 라우터 확인
  if (await fileExists(pagesDir)) {
    const pageFiles = await walkDir(pagesDir);

    for (const file of pageFiles) {
      if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
        const relativePath = file
          .replace(pagesDir, '')
          .replace(/\.(tsx|jsx)$/, '')
          .replace(/\/index$/, '')
          .replace(/\[([^\]]+)\]/g, ':$1');

        const routePath = relativePath || '/';

        routes.push({
          path: routePath,
          component: file.replace(projectPath + '/', ''),
          hasE2ETest: false,
        });
      }
    }
  }

  // app 라우터 확인 (Next.js 13+)
  if (await fileExists(appDir)) {
    const appFiles = await walkDir(appDir);

    for (const file of appFiles) {
      if (file.endsWith('page.tsx') || file.endsWith('page.jsx')) {
        const relativePath = file
          .replace(appDir, '')
          .replace(/\/page\.(tsx|jsx)$/, '')
          .replace(/\[([^\]]+)\]/g, ':$1');

        const routePath = relativePath || '/';

        routes.push({
          path: routePath,
          component: file.replace(projectPath + '/', ''),
          hasE2ETest: false,
        });
      }
    }
  }

  // React Router routes.tsx 분석
  const routesFile = join(projectPath, 'src', 'routes.tsx');
  if (await fileExists(routesFile)) {
    const content = await readFile(routesFile, 'utf-8');

    // path="..." 또는 path: "..." 패턴 찾기
    const pathMatches = content.matchAll(/path[=:]\s*["']([^"']+)["']/g);

    for (const match of pathMatches) {
      if (!routes.some((r) => r.path === match[1])) {
        routes.push({
          path: match[1],
          component: 'src/routes.tsx',
          hasE2ETest: false,
        });
      }
    }
  }

  return routes;
}

/**
 * 기존 E2E 테스트 분석
 */
async function analyzeE2ETests(projectPath: string): Promise<E2ETestInfo[]> {
  const tests: E2ETestInfo[] = [];

  // Playwright 테스트 디렉토리
  const e2eDirs = ['e2e', 'tests/e2e', 'tests', '__tests__/e2e'];

  for (const dir of e2eDirs) {
    const fullDir = join(projectPath, dir);
    if (await fileExists(fullDir)) {
      const files = await walkDir(fullDir);

      for (const file of files) {
        if (file.includes('.spec.') || file.includes('.test.')) {
          const content = await readFile(file, 'utf-8');

          // goto(...) 패턴에서 라우트 추출
          const gotoMatches = content.matchAll(/goto\s*\(\s*["'`]([^"'`]+)["'`]/g);
          const routesInTest: string[] = [];

          for (const match of gotoMatches) {
            const route = match[1]
              .replace(/https?:\/\/[^/]+/, '')
              .replace(/\${[^}]+}/g, ':param');

            if (!routesInTest.includes(route)) {
              routesInTest.push(route);
            }
          }

          tests.push({
            file: file.replace(projectPath + '/', ''),
            routes: routesInTest,
          });
        }
      }
    }
  }

  return tests;
}

/**
 * Playwright 테스트 템플릿 생성
 */
function generatePlaywrightTest(route: RouteInfo): string {
  const testName = route.path === '/' ? 'home' : route.path.replace(/[/:]/g, '-').replace(/^-/, '');

  return `import { test, expect } from '@playwright/test';

test.describe('${route.path} page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${route.path}');
  });

  test('should load successfully', async ({ page }) => {
    // Wait for page to be fully loaded
    await expect(page).toHaveURL(new RegExp('${route.path.replace(/:[^/]+/g, '[^/]+')}'));
  });

  test('should have correct title', async ({ page }) => {
    // TODO: Update with actual expected title
    await expect(page).toHaveTitle(/.+/);
  });

  test('should have main content', async ({ page }) => {
    // TODO: Add assertions for main content elements
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('should handle navigation', async ({ page }) => {
    // TODO: Add navigation tests
  });

  test('should handle user interactions', async ({ page }) => {
    // TODO: Add user interaction tests
  });
});
`;
}

/**
 * e2e-expand 실행기
 */
async function e2eExpandExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  let issuesFixed = 0;
  const generatedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. 라우트 감지
    const routes = await detectRoutes(projectPath);
    rawOutput += `Detected ${routes.length} routes\n\n`;

    // 2. 기존 E2E 테스트 분석
    const existingTests = await analyzeE2ETests(projectPath);
    const testedRoutes = new Set(existingTests.flatMap((t) => t.routes));

    rawOutput += `Found ${existingTests.length} existing E2E test files\n`;
    rawOutput += `Tested routes: ${testedRoutes.size}\n\n`;

    // 3. 커버되지 않은 라우트 식별
    for (const route of routes) {
      route.hasE2ETest = testedRoutes.has(route.path) ||
        Array.from(testedRoutes).some((tested) =>
          new RegExp('^' + tested.replace(/:param/g, '[^/]+') + '$').test(route.path)
        );
    }

    const uncoveredRoutes = routes.filter((r) => !r.hasE2ETest);
    issuesFound = uncoveredRoutes.length;

    rawOutput += `\n--- Route Coverage ---\n`;
    for (const route of routes) {
      rawOutput += `[${route.hasE2ETest ? 'COVERED' : 'MISSING'}] ${route.path}\n`;
    }

    // 4. 커버되지 않은 라우트에 대해 테스트 생성
    rawOutput += `\n--- Generating Tests ---\n`;

    const e2eDir = join(projectPath, 'e2e');

    for (const route of uncoveredRoutes) {
      const testFileName = route.path === '/'
        ? 'home.spec.ts'
        : route.path.replace(/[/:]/g, '-').replace(/^-/, '') + '.spec.ts';
      const testPath = join('e2e', testFileName);
      const fullTestPath = join(projectPath, testPath);

      suggestions.push({
        file: testPath,
        issue: `Missing E2E test for route: ${route.path}`,
        suggestion: `Add E2E test to cover ${route.path} (${route.component})`,
        confidence: 'high',
      });

      if (!options.dryRun) {
        // E2E 디렉토리 생성
        try {
          await mkdir(e2eDir, { recursive: true });
        } catch {
          // 이미 존재
        }

        // 테스트 파일 생성
        if (!await fileExists(fullTestPath)) {
          const testContent = generatePlaywrightTest(route);
          await writeFile(fullTestPath, testContent, 'utf-8');
          generatedFiles.push(testPath);
          issuesFixed++;
          rawOutput += `Generated: ${testPath}\n`;
        } else {
          rawOutput += `Skipped (exists): ${testPath}\n`;
        }
      } else {
        rawOutput += `Would generate: ${testPath}\n`;
      }
    }

    return {
      task: 'e2e-expand',
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
      task: 'e2e-expand',
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
registerTaskExecutor('e2e-expand', e2eExpandExecutor);

export { e2eExpandExecutor, detectRoutes, analyzeE2ETests };
