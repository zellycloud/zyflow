/**
 * api-validate Task
 *
 * API 응답 스키마를 검증하고 TypeScript 타입과의 불일치를 감지합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname, basename, extname } from 'path';
import { readFile, readdir, access } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * API 엔드포인트 정보
 */
interface APIEndpoint {
  path: string;
  method: string;
  file: string;
  responseType?: string;
  hasValidation: boolean;
}

/**
 * 스키마 불일치 정보
 */
interface SchemaMismatch {
  endpoint: string;
  field: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
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
 * API 라우트 파일 찾기
 */
async function findAPIRoutes(projectPath: string): Promise<APIEndpoint[]> {
  const endpoints: APIEndpoint[] = [];

  // Next.js API 라우트
  const apiDirs = [
    'pages/api',
    'src/pages/api',
    'app/api',
    'src/app/api',
    'server/routes',
    'server/api',
  ];

  for (const dir of apiDirs) {
    const fullDir = join(projectPath, dir);
    if (await fileExists(fullDir)) {
      await scanAPIDirectory(fullDir, endpoints, projectPath);
    }
  }

  return endpoints;
}

/**
 * API 디렉토리 스캔
 */
async function scanAPIDirectory(
  dir: string,
  endpoints: APIEndpoint[],
  projectPath: string
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanAPIDirectory(fullPath, endpoints, projectPath);
      } else if (
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.js')
      ) {
        const content = await readFile(fullPath, 'utf-8');
        const relativePath = fullPath.replace(projectPath + '/', '');

        // 엔드포인트 경로 추출
        let apiPath = relativePath
          .replace(/^(src\/)?pages\/api/, '/api')
          .replace(/^(src\/)?app\/api/, '/api')
          .replace(/\.(ts|tsx|js)$/, '')
          .replace(/\/route$/, '')
          .replace(/\/index$/, '');

        // 동적 라우트 변환
        apiPath = apiPath.replace(/\[([^\]]+)\]/g, ':$1');

        // HTTP 메서드 감지
        const methods: string[] = [];
        if (content.includes('GET') || content.includes('export async function GET')) {
          methods.push('GET');
        }
        if (content.includes('POST') || content.includes('export async function POST')) {
          methods.push('POST');
        }
        if (content.includes('PUT') || content.includes('export async function PUT')) {
          methods.push('PUT');
        }
        if (content.includes('DELETE') || content.includes('export async function DELETE')) {
          methods.push('DELETE');
        }
        if (content.includes('PATCH') || content.includes('export async function PATCH')) {
          methods.push('PATCH');
        }

        // 기본값
        if (methods.length === 0) {
          methods.push('ALL');
        }

        // 응답 타입 추출 시도
        const typeMatch = content.match(/NextResponse<([^>]+)>|Response<([^>]+)>|: Promise<([^>]+)>/);
        const responseType = typeMatch?.[1] || typeMatch?.[2] || typeMatch?.[3];

        // 유효성 검사 여부
        const hasValidation =
          content.includes('zod') ||
          content.includes('yup') ||
          content.includes('joi') ||
          content.includes('validate') ||
          content.includes('schema');

        for (const method of methods) {
          endpoints.push({
            path: apiPath,
            method,
            file: relativePath,
            responseType,
            hasValidation,
          });
        }
      }
    }
  } catch {
    // 디렉토리 읽기 실패
  }
}

/**
 * TypeScript 타입 파일에서 API 타입 추출
 */
async function extractAPITypes(
  projectPath: string
): Promise<Map<string, string[]>> {
  const types = new Map<string, string[]>();

  // 타입 파일 위치
  const typeDirs = ['types', 'src/types', 'lib/types', '@types'];

  for (const dir of typeDirs) {
    const fullDir = join(projectPath, dir);
    if (!(await fileExists(fullDir))) continue;

    try {
      const entries = await readdir(fullDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.ts')) {
          const content = await readFile(join(fullDir, entry.name), 'utf-8');

          // interface 추출
          const interfaceMatches = content.matchAll(
            /(?:export\s+)?interface\s+(\w+)\s*\{([^}]+)\}/g
          );

          for (const match of interfaceMatches) {
            const name = match[1];
            const body = match[2];

            // 필드 추출
            const fields = body
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line && !line.startsWith('//'))
              .map((line) => {
                const fieldMatch = line.match(/^(\w+)\??:\s*(.+?);?$/);
                return fieldMatch ? `${fieldMatch[1]}: ${fieldMatch[2]}` : line;
              });

            types.set(name, fields);
          }

          // type 추출
          const typeMatches = content.matchAll(
            /(?:export\s+)?type\s+(\w+)\s*=\s*\{([^}]+)\}/g
          );

          for (const match of typeMatches) {
            const name = match[1];
            const body = match[2];

            const fields = body
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line && !line.startsWith('//'));

            types.set(name, fields);
          }
        }
      }
    } catch {
      // 무시
    }
  }

  return types;
}

/**
 * API 응답 유효성 검사 (실제 호출 없이 정적 분석)
 */
async function analyzeAPIValidation(
  endpoints: APIEndpoint[],
  types: Map<string, string[]>,
  projectPath: string
): Promise<SchemaMismatch[]> {
  const mismatches: SchemaMismatch[] = [];

  for (const endpoint of endpoints) {
    // 1. 유효성 검사 누락 확인
    if (!endpoint.hasValidation) {
      mismatches.push({
        endpoint: `${endpoint.method} ${endpoint.path}`,
        field: 'request body',
        expected: 'schema validation',
        actual: 'no validation',
        severity: 'warning',
      });
    }

    // 2. 응답 타입 확인
    if (endpoint.responseType) {
      const typeName = endpoint.responseType.replace(/\[\]$/, '').trim();
      const typeFields = types.get(typeName);

      if (!typeFields) {
        mismatches.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          field: 'response type',
          expected: `type ${typeName} defined`,
          actual: 'type not found in type files',
          severity: 'warning',
        });
      }
    } else {
      mismatches.push({
        endpoint: `${endpoint.method} ${endpoint.path}`,
        field: 'response type',
        expected: 'typed response',
        actual: 'untyped response',
        severity: 'warning',
      });
    }
  }

  return mismatches;
}

/**
 * api-validate 실행기
 */
async function apiValidateExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. API 라우트 찾기
    rawOutput += '=== Scanning API routes ===\n\n';
    const endpoints = await findAPIRoutes(projectPath);

    if (endpoints.length === 0) {
      rawOutput += 'No API routes found.\n';
      rawOutput += 'Looked in: pages/api, src/pages/api, app/api, server/routes\n';

      return {
        task: 'api-validate',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: { rawOutput },
      };
    }

    rawOutput += `Found ${endpoints.length} API endpoints:\n\n`;

    for (const ep of endpoints) {
      rawOutput += `${ep.method.padEnd(7)} ${ep.path}\n`;
      rawOutput += `        File: ${ep.file}\n`;
      rawOutput += `        Response type: ${ep.responseType || 'unknown'}\n`;
      rawOutput += `        Has validation: ${ep.hasValidation ? 'Yes' : 'No'}\n`;
    }

    // 2. TypeScript 타입 추출
    rawOutput += '\n=== Extracting API types ===\n\n';
    const types = await extractAPITypes(projectPath);
    rawOutput += `Found ${types.size} type definitions\n`;

    // 3. 유효성 검사 분석
    rawOutput += '\n=== Analyzing API validation ===\n\n';
    const mismatches = await analyzeAPIValidation(endpoints, types, projectPath);
    issuesFound = mismatches.length;

    if (mismatches.length === 0) {
      rawOutput += 'No validation issues found!\n';
    } else {
      rawOutput += `Found ${mismatches.length} issues:\n\n`;

      for (const mismatch of mismatches) {
        rawOutput += `[${mismatch.severity.toUpperCase()}] ${mismatch.endpoint}\n`;
        rawOutput += `  Field: ${mismatch.field}\n`;
        rawOutput += `  Expected: ${mismatch.expected}\n`;
        rawOutput += `  Actual: ${mismatch.actual}\n\n`;

        // 제안 생성
        let suggestion = '';
        if (mismatch.field === 'request body') {
          suggestion = 'Add request body validation using Zod, Yup, or similar library.';
        } else if (mismatch.field === 'response type') {
          suggestion = mismatch.actual.includes('not found')
            ? 'Define the response type in your types folder.'
            : 'Add explicit return type to the API handler.';
        }

        const endpoint = endpoints.find(
          (e) => `${e.method} ${e.path}` === mismatch.endpoint
        );

        suggestions.push({
          file: endpoint?.file || 'unknown',
          issue: `[${mismatch.severity}] ${mismatch.field}: ${mismatch.actual}`,
          suggestion,
          confidence: mismatch.severity === 'error' ? 'high' : 'medium',
        });
      }
    }

    // 4. 요약
    rawOutput += '\n=== Summary ===\n\n';
    rawOutput += `Total endpoints: ${endpoints.length}\n`;
    rawOutput += `With validation: ${endpoints.filter((e) => e.hasValidation).length}\n`;
    rawOutput += `Without validation: ${endpoints.filter((e) => !e.hasValidation).length}\n`;
    rawOutput += `With typed response: ${endpoints.filter((e) => e.responseType).length}\n`;
    rawOutput += `Untyped response: ${endpoints.filter((e) => !e.responseType).length}\n`;
    rawOutput += `\nIssues found: ${issuesFound}\n`;

    // 경고
    const unvalidatedPosts = endpoints.filter(
      (e) => (e.method === 'POST' || e.method === 'PUT' || e.method === 'PATCH') && !e.hasValidation
    );
    if (unvalidatedPosts.length > 0) {
      rawOutput += `\n⚠️  WARNING: ${unvalidatedPosts.length} mutation endpoints without input validation!\n`;
    }

    return {
      task: 'api-validate',
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
      task: 'api-validate',
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
registerTaskExecutor('api-validate', apiValidateExecutor);

export { apiValidateExecutor, findAPIRoutes, extractAPITypes };
