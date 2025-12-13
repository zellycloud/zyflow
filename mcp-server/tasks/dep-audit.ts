/**
 * dep-audit Task
 *
 * npm audit으로 보안 취약점을 감지하고 자동 패치합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 취약점 정보
 */
interface Vulnerability {
  name: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  title: string;
  url: string;
  fixAvailable: boolean;
  via: string[];
  isDirect: boolean;
  range: string;
}

/**
 * Audit 결과
 */
interface AuditResult {
  vulnerabilities: Vulnerability[];
  summary: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
    total: number;
  };
}

/**
 * npm audit JSON 파싱
 */
function parseAuditOutput(output: string): AuditResult {
  const result: AuditResult = {
    vulnerabilities: [],
    summary: {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
      total: 0,
    },
  };

  try {
    const json = JSON.parse(output);

    // npm audit JSON 형식 파싱
    if (json.vulnerabilities) {
      for (const [name, vuln] of Object.entries(json.vulnerabilities)) {
        const v = vuln as {
          severity: string;
          name: string;
          via: Array<string | { title: string; url: string }>;
          fixAvailable: boolean | { name: string };
          range: string;
          isDirect: boolean;
        };

        const title =
          Array.isArray(v.via) && v.via.length > 0
            ? typeof v.via[0] === 'string'
              ? v.via[0]
              : v.via[0].title
            : 'Unknown';

        const url =
          Array.isArray(v.via) && v.via.length > 0
            ? typeof v.via[0] === 'object' && v.via[0].url
              ? v.via[0].url
              : `https://www.npmjs.com/advisories`
            : '';

        result.vulnerabilities.push({
          name,
          severity: v.severity as Vulnerability['severity'],
          title,
          url,
          fixAvailable: !!v.fixAvailable,
          via: v.via.map((x) => (typeof x === 'string' ? x : x.title)),
          isDirect: v.isDirect,
          range: v.range,
        });
      }
    }

    // 요약 정보
    if (json.metadata?.vulnerabilities) {
      const meta = json.metadata.vulnerabilities;
      result.summary = {
        critical: meta.critical || 0,
        high: meta.high || 0,
        moderate: meta.moderate || 0,
        low: meta.low || 0,
        info: meta.info || 0,
        total: meta.total || result.vulnerabilities.length,
      };
    } else {
      // 수동 집계
      for (const v of result.vulnerabilities) {
        result.summary[v.severity]++;
        result.summary.total++;
      }
    }
  } catch {
    // JSON 파싱 실패
  }

  return result;
}

/**
 * 심각도별 우선순위
 */
const SEVERITY_PRIORITY: Record<Vulnerability['severity'], number> = {
  critical: 5,
  high: 4,
  moderate: 3,
  low: 2,
  info: 1,
};

/**
 * dep-audit 실행기
 */
async function depAuditExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  let issuesFixed = 0;
  const modifiedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. npm audit 실행
    rawOutput += '=== Running npm audit ===\n\n';

    let auditOutput = '';
    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      auditOutput = stdout;
    } catch (error: unknown) {
      // npm audit는 취약점이 있으면 non-zero exit code
      if (error && typeof error === 'object' && 'stdout' in error) {
        auditOutput = (error as { stdout: string }).stdout;
      }
    }

    // 2. 결과 파싱
    const auditResult = parseAuditOutput(auditOutput);
    issuesFound = auditResult.summary.total;

    rawOutput += `Total vulnerabilities: ${auditResult.summary.total}\n`;
    rawOutput += `  Critical: ${auditResult.summary.critical}\n`;
    rawOutput += `  High: ${auditResult.summary.high}\n`;
    rawOutput += `  Moderate: ${auditResult.summary.moderate}\n`;
    rawOutput += `  Low: ${auditResult.summary.low}\n`;
    rawOutput += `  Info: ${auditResult.summary.info}\n\n`;

    if (issuesFound === 0) {
      rawOutput += 'No vulnerabilities found!\n';
      return {
        task: 'dep-audit',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: { rawOutput },
      };
    }

    // 3. 취약점 상세 정보
    rawOutput += '=== Vulnerability Details ===\n\n';

    // 심각도 순으로 정렬
    const sortedVulns = auditResult.vulnerabilities.sort(
      (a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity]
    );

    for (const vuln of sortedVulns) {
      rawOutput += `[${vuln.severity.toUpperCase()}] ${vuln.name}\n`;
      rawOutput += `  Title: ${vuln.title}\n`;
      rawOutput += `  Range: ${vuln.range}\n`;
      rawOutput += `  Fix available: ${vuln.fixAvailable ? 'Yes' : 'No'}\n`;
      rawOutput += `  Direct: ${vuln.isDirect ? 'Yes' : 'No (transitive)'}\n`;
      if (vuln.url) {
        rawOutput += `  URL: ${vuln.url}\n`;
      }
      rawOutput += '\n';

      // 제안 생성
      const fixSuggestion = vuln.fixAvailable
        ? vuln.isDirect
          ? `Run: npm update ${vuln.name}`
          : 'Run: npm audit fix'
        : vuln.isDirect
          ? `Consider alternative package or check for security patches`
          : 'Transitive dependency - update parent package or use overrides';

      suggestions.push({
        file: 'package.json',
        issue: `[${vuln.severity.toUpperCase()}] ${vuln.name}: ${vuln.title}`,
        suggestion: fixSuggestion,
        confidence: vuln.fixAvailable ? 'high' : 'medium',
      });
    }

    // 4. 자동 수정 시도 (dry run이 아닌 경우)
    if (!options.dryRun) {
      // 자동 수정 가능한 취약점만 수정 (non-breaking)
      const fixableCount = auditResult.vulnerabilities.filter(
        (v) => v.fixAvailable
      ).length;

      if (fixableCount > 0) {
        rawOutput += '\n=== Attempting auto-fix ===\n\n';

        try {
          const { stdout: fixOutput } = await execAsync(
            'npm audit fix --audit-level=none',
            { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
          );
          rawOutput += fixOutput + '\n';

          // 수정 후 다시 감사
          let afterAudit = '';
          try {
            const { stdout } = await execAsync('npm audit --json', {
              cwd: projectPath,
              maxBuffer: 10 * 1024 * 1024,
            });
            afterAudit = stdout;
          } catch (error: unknown) {
            if (error && typeof error === 'object' && 'stdout' in error) {
              afterAudit = (error as { stdout: string }).stdout;
            }
          }

          const afterResult = parseAuditOutput(afterAudit);
          issuesFixed = issuesFound - afterResult.summary.total;

          rawOutput += `\nFixed ${issuesFixed} vulnerabilities\n`;
          rawOutput += `Remaining: ${afterResult.summary.total}\n`;

          if (issuesFixed > 0) {
            modifiedFiles.push('package.json', 'package-lock.json');
          }
        } catch (error: unknown) {
          rawOutput += 'Auto-fix failed\n';
          if (error && typeof error === 'object' && 'message' in error) {
            rawOutput += (error as Error).message + '\n';
          }
        }
      }
    }

    // 5. 위험 수준 경고
    if (auditResult.summary.critical > 0 || auditResult.summary.high > 0) {
      rawOutput += '\n⚠️  WARNING: High/Critical vulnerabilities detected!\n';
      rawOutput += 'Consider running: npm audit fix --force (may include breaking changes)\n';
    }

    return {
      task: 'dep-audit',
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
      task: 'dep-audit',
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
registerTaskExecutor('dep-audit', depAuditExecutor);

export { depAuditExecutor, parseAuditOutput };
