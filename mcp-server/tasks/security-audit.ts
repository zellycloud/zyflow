/**
 * security-audit Task
 *
 * Supabase 보안 로그를 분석하고 보안 경고 리포트를 생성합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { readFile } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * 보안 이벤트 정보
 */
interface SecurityEvent {
  timestamp: string;
  type: SecurityEventType;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details: string;
  ip?: string;
  userId?: string;
  action?: string;
}

/**
 * 보안 이벤트 타입
 */
type SecurityEventType =
  | 'auth_failure'
  | 'suspicious_access'
  | 'rate_limit'
  | 'policy_violation'
  | 'sql_injection'
  | 'brute_force'
  | 'unauthorized_access'
  | 'data_exposure'
  | 'unknown';

/**
 * 보안 분석 결과
 */
interface SecurityAnalysis {
  totalEvents: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  topIPs: { ip: string; count: number }[];
  recommendations: string[];
}

/**
 * Supabase 로그에서 보안 이벤트 추출
 */
async function fetchSupabaseSecurityLogs(projectPath: string): Promise<{
  events: SecurityEvent[];
  rawOutput: string;
}> {
  const events: SecurityEvent[] = [];
  let rawOutput = '';

  try {
    // Supabase CLI로 로그 조회
    const { stdout } = await execAsync(
      'supabase logs --project-ref $SUPABASE_PROJECT_REF --auth-token $SUPABASE_AUTH_TOKEN 2>/dev/null | head -500',
      { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
    );

    rawOutput = stdout;

    // 로그 파싱하여 보안 이벤트 추출
    const lines = stdout.split('\n');

    for (const line of lines) {
      const event = parseSecurityEvent(line);
      if (event) {
        events.push(event);
      }
    }
  } catch {
    // Supabase CLI 실패 시 로컬 로그 파일 확인
    try {
      const logPath = join(projectPath, '.supabase', 'logs', 'auth.log');
      const logContent = await readFile(logPath, 'utf-8');
      rawOutput = logContent.slice(0, 5000);

      for (const line of logContent.split('\n')) {
        const event = parseSecurityEvent(line);
        if (event) {
          events.push(event);
        }
      }
    } catch {
      rawOutput = 'Unable to fetch Supabase logs. Ensure supabase CLI is configured or logs are available.\n';
    }
  }

  return { events, rawOutput };
}

/**
 * 로그 라인에서 보안 이벤트 파싱
 */
function parseSecurityEvent(line: string): SecurityEvent | null {
  const lowerLine = line.toLowerCase();

  // 인증 실패
  if (
    lowerLine.includes('auth') &&
    (lowerLine.includes('fail') || lowerLine.includes('invalid') || lowerLine.includes('denied'))
  ) {
    return {
      timestamp: extractTimestamp(line),
      type: 'auth_failure',
      severity: 'medium',
      details: line.slice(0, 200),
      ip: extractIP(line),
    };
  }

  // 비정상 접근
  if (
    lowerLine.includes('suspicious') ||
    lowerLine.includes('anomal') ||
    lowerLine.includes('unusual')
  ) {
    return {
      timestamp: extractTimestamp(line),
      type: 'suspicious_access',
      severity: 'high',
      details: line.slice(0, 200),
      ip: extractIP(line),
    };
  }

  // Rate limit
  if (lowerLine.includes('rate') && lowerLine.includes('limit')) {
    return {
      timestamp: extractTimestamp(line),
      type: 'rate_limit',
      severity: 'medium',
      details: line.slice(0, 200),
      ip: extractIP(line),
    };
  }

  // RLS 정책 위반
  if (lowerLine.includes('policy') || lowerLine.includes('permission')) {
    return {
      timestamp: extractTimestamp(line),
      type: 'policy_violation',
      severity: 'high',
      details: line.slice(0, 200),
    };
  }

  // SQL Injection 시도
  if (
    lowerLine.includes('sql') &&
    (lowerLine.includes('injection') || lowerLine.includes('error'))
  ) {
    return {
      timestamp: extractTimestamp(line),
      type: 'sql_injection',
      severity: 'critical',
      details: line.slice(0, 200),
      ip: extractIP(line),
    };
  }

  // 무차별 대입 공격
  if (lowerLine.includes('brute') || (lowerLine.includes('multiple') && lowerLine.includes('fail'))) {
    return {
      timestamp: extractTimestamp(line),
      type: 'brute_force',
      severity: 'critical',
      details: line.slice(0, 200),
      ip: extractIP(line),
    };
  }

  return null;
}

/**
 * 로그에서 타임스탬프 추출
 */
function extractTimestamp(line: string): string {
  const match = line.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
  return match ? match[0] : new Date().toISOString();
}

/**
 * 로그에서 IP 주소 추출
 */
function extractIP(line: string): string | undefined {
  const match = line.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  return match ? match[0] : undefined;
}

/**
 * 보안 이벤트 분석
 */
function analyzeSecurityEvents(events: SecurityEvent[]): SecurityAnalysis {
  const analysis: SecurityAnalysis = {
    totalEvents: events.length,
    bySeverity: {},
    byType: {},
    topIPs: [],
    recommendations: [],
  };

  // 심각도별, 타입별 집계
  const ipCounts: Record<string, number> = {};

  for (const event of events) {
    analysis.bySeverity[event.severity] = (analysis.bySeverity[event.severity] || 0) + 1;
    analysis.byType[event.type] = (analysis.byType[event.type] || 0) + 1;

    if (event.ip) {
      ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
    }
  }

  // 상위 IP 정렬
  analysis.topIPs = Object.entries(ipCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  // 권장 사항 생성
  if ((analysis.bySeverity.critical || 0) > 0) {
    analysis.recommendations.push('CRITICAL: Immediate investigation required for critical security events.');
  }

  if ((analysis.byType.brute_force || 0) > 0) {
    analysis.recommendations.push('Implement rate limiting and account lockout policies.');
  }

  if ((analysis.byType.sql_injection || 0) > 0) {
    analysis.recommendations.push('Review all database queries for proper parameterization.');
  }

  if ((analysis.byType.auth_failure || 0) > 5) {
    analysis.recommendations.push('Consider implementing CAPTCHA after multiple failed login attempts.');
  }

  if (analysis.topIPs.some((ip) => ip.count > 20)) {
    analysis.recommendations.push('Consider blocking or rate-limiting suspicious IP addresses.');
  }

  if ((analysis.byType.policy_violation || 0) > 0) {
    analysis.recommendations.push('Review RLS policies to ensure they are correctly configured.');
  }

  return analysis;
}

/**
 * security-audit 실행기
 */
async function securityAuditExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. Supabase 보안 로그 가져오기
    rawOutput += '=== Fetching Supabase security logs ===\n\n';
    const { events, rawOutput: logOutput } = await fetchSupabaseSecurityLogs(projectPath);
    rawOutput += logOutput.slice(0, 2000) + '\n';

    if (events.length === 0) {
      rawOutput += '\nNo security events found in logs.\n';
      rawOutput += 'This could mean:\n';
      rawOutput += '  - No security issues detected\n';
      rawOutput += '  - Supabase CLI not configured\n';
      rawOutput += '  - Logs not available\n';

      suggestions.push({
        file: '.env',
        issue: 'Supabase security logging',
        suggestion: 'Ensure SUPABASE_PROJECT_REF and SUPABASE_AUTH_TOKEN are configured for security monitoring.',
        confidence: 'medium',
      });

      return {
        task: 'security-audit',
        success: true,
        duration: 0,
        issuesFound: 0,
        issuesFixed: 0,
        model: options.model,
        cli: options.cli,
        details: {
          suggestions,
          rawOutput,
        },
      };
    }

    // 2. 보안 이벤트 분석
    rawOutput += '\n=== Security Analysis ===\n\n';
    const analysis = analyzeSecurityEvents(events);
    issuesFound = analysis.totalEvents;

    rawOutput += `Total security events: ${analysis.totalEvents}\n\n`;

    rawOutput += 'By severity:\n';
    for (const [severity, count] of Object.entries(analysis.bySeverity)) {
      rawOutput += `  ${severity}: ${count}\n`;
    }

    rawOutput += '\nBy type:\n';
    for (const [type, count] of Object.entries(analysis.byType)) {
      rawOutput += `  ${type}: ${count}\n`;
    }

    // 3. 상위 IP 정보
    if (analysis.topIPs.length > 0) {
      rawOutput += '\nTop source IPs:\n';
      for (const { ip, count } of analysis.topIPs) {
        rawOutput += `  ${ip}: ${count} events\n`;

        if (count > 10) {
          suggestions.push({
            file: 'security-config',
            issue: `Suspicious activity from IP: ${ip} (${count} events)`,
            suggestion: 'Consider blocking this IP or implementing additional rate limiting.',
            confidence: 'high',
          });
        }
      }
    }

    // 4. 권장 사항
    rawOutput += '\n=== Recommendations ===\n\n';
    for (const rec of analysis.recommendations) {
      rawOutput += `• ${rec}\n`;

      suggestions.push({
        file: 'security-policy',
        issue: rec,
        suggestion: rec,
        confidence: rec.includes('CRITICAL') ? 'high' : 'medium',
      });
    }

    // 5. 최근 이벤트 샘플
    rawOutput += '\n=== Recent Events (sample) ===\n\n';
    for (const event of events.slice(0, 10)) {
      rawOutput += `[${event.severity.toUpperCase()}] ${event.type}\n`;
      rawOutput += `  Time: ${event.timestamp}\n`;
      if (event.ip) rawOutput += `  IP: ${event.ip}\n`;
      rawOutput += `  Details: ${event.details.slice(0, 100)}...\n\n`;
    }

    // 6. 경고 레벨 설정
    if ((analysis.bySeverity.critical || 0) > 0) {
      rawOutput += '\n⚠️  ALERT: Critical security events detected! Immediate action required.\n';
    } else if ((analysis.bySeverity.high || 0) > 5) {
      rawOutput += '\n⚠️  WARNING: Multiple high-severity security events detected.\n';
    }

    return {
      task: 'security-audit',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed: 0, // security-audit는 분석만 수행
      model: options.model,
      cli: options.cli,
      details: {
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'security-audit',
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
registerTaskExecutor('security-audit', securityAuditExecutor);

export { securityAuditExecutor, analyzeSecurityEvents };
