/**
 * Error Analyzer - CI 로그 및 에러 분석
 *
 * 역할:
 * - CI 로그 파싱 (빌드 에러, 테스트 실패, 린트 에러)
 * - 에러 타입 분류 (syntax, type, logic, runtime)
 * - 코드 위치 추출 (file, line, column)
 * - 신뢰도 점수 계산
 */

export type ErrorType = 'syntax' | 'type' | 'logic' | 'runtime' | 'lint' | 'test' | 'build' | 'unknown'
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info'

export interface CodeLocation {
  file: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}

export interface ParsedError {
  id: string
  type: ErrorType
  severity: ErrorSeverity
  message: string
  rawMessage: string
  location?: CodeLocation
  context?: string // 주변 코드 스니펫
  stack?: string
  confidence: number // 0-1
  suggestions?: string[]
}

export interface AnalysisResult {
  errors: ParsedError[]
  summary: {
    total: number
    byType: Record<ErrorType, number>
    bySeverity: Record<ErrorSeverity, number>
  }
  source: 'github' | 'vercel' | 'sentry' | 'supabase' | 'custom'
  rawLog?: string
}

// TypeScript/JavaScript 에러 패턴
const TS_ERROR_PATTERNS = [
  // TypeScript 컴파일 에러
  {
    pattern: /^(.+\.tsx?)\((\d+),(\d+)\):\s*error\s+TS(\d+):\s*(.+)$/gm,
    type: 'type' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      code: `TS${match[4]}`,
      message: match[5],
    }),
  },
  // ESLint 에러
  {
    pattern: /^(.+\.tsx?):(\d+):(\d+):\s*(error|warning)\s+(.+?)\s+(\S+)$/gm,
    type: 'lint' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      severity: match[4] as 'error' | 'warning',
      message: match[5],
      rule: match[6],
    }),
  },
  // Vite/esbuild 빌드 에러
  {
    pattern: /\[vite\].*?(\/.+\.tsx?):(\d+):(\d+)[\s\S]*?error:\s*(.+)/gm,
    type: 'build' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      message: match[4],
    }),
  },
  // Node.js 런타임 에러
  {
    pattern: /^\s+at\s+.+\((.+\.tsx?):(\d+):(\d+)\)$/gm,
    type: 'runtime' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
    }),
  },
]

// 테스트 에러 패턴 (Vitest, Jest)
const TEST_ERROR_PATTERNS = [
  // Vitest 실패
  {
    pattern: /FAIL\s+(.+\.test\.tsx?)\s*\n[\s\S]*?×\s+(.+)/gm,
    type: 'test' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      testName: match[2],
    }),
  },
  // Jest AssertionError
  {
    pattern: /expect\(received\)\.(.+)\n[\s\S]*?Expected:\s*(.+)\n\s*Received:\s*(.+)/gm,
    type: 'test' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      matcher: match[1],
      expected: match[2],
      received: match[3],
    }),
  },
]

// Python 에러 패턴 (Supabase Edge Functions)
const PYTHON_ERROR_PATTERNS = [
  // Python traceback
  {
    pattern: /File "(.+\.py)", line (\d+)[\s\S]*?(\w+Error):\s*(.+)/gm,
    type: 'runtime' as ErrorType,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      line: parseInt(match[2]),
      errorType: match[3],
      message: match[4],
    }),
  },
]

/**
 * CI 로그에서 에러 파싱
 */
export function parseErrors(log: string, source: AnalysisResult['source']): AnalysisResult {
  const errors: ParsedError[] = []
  const patterns = [...TS_ERROR_PATTERNS, ...TEST_ERROR_PATTERNS, ...PYTHON_ERROR_PATTERNS]

  for (const { pattern, type, extract } of patterns) {
    // 패턴을 새로 생성하여 lastIndex 초기화
    const regex = new RegExp(pattern.source, pattern.flags)
    let match

    while ((match = regex.exec(log)) !== null) {
      const extracted = extract(match)
      const error = createParsedError(type, extracted, match[0])
      errors.push(error)
    }
  }

  // 중복 제거 (같은 파일, 라인의 에러)
  const uniqueErrors = deduplicateErrors(errors)

  // 신뢰도 점수 계산
  for (const error of uniqueErrors) {
    error.confidence = calculateConfidence(error)
  }

  // 심각도 순으로 정렬
  uniqueErrors.sort((a, b) => {
    const severityOrder: Record<ErrorSeverity, number> = {
      critical: 0,
      error: 1,
      warning: 2,
      info: 3,
    }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })

  return {
    errors: uniqueErrors,
    summary: summarizeErrors(uniqueErrors),
    source,
    rawLog: log.length > 10000 ? log.slice(0, 10000) + '...' : log,
  }
}

/**
 * ParsedError 객체 생성
 */
function createParsedError(
  type: ErrorType,
  extracted: Record<string, unknown>,
  rawMessage: string
): ParsedError {
  const id = generateErrorId(type, extracted)

  const error: ParsedError = {
    id,
    type,
    severity: determineSeverity(type, extracted),
    message: formatMessage(type, extracted),
    rawMessage,
    confidence: 0,
  }

  // 위치 정보 추가
  if (extracted.file) {
    error.location = {
      file: extracted.file as string,
      line: extracted.line as number | undefined,
      column: extracted.column as number | undefined,
    }
  }

  return error
}

/**
 * 에러 ID 생성 (중복 제거용)
 */
function generateErrorId(type: ErrorType, extracted: Record<string, unknown>): string {
  const parts = [type]
  if (extracted.file) parts.push(String(extracted.file))
  if (extracted.line) parts.push(String(extracted.line))
  if (extracted.code) parts.push(String(extracted.code))
  if (extracted.rule) parts.push(String(extracted.rule))
  return parts.join(':')
}

/**
 * 심각도 결정
 */
function determineSeverity(type: ErrorType, extracted: Record<string, unknown>): ErrorSeverity {
  // ESLint severity 참조
  if (extracted.severity === 'warning') return 'warning'

  switch (type) {
    case 'syntax':
    case 'type':
      return 'error'
    case 'runtime':
      return 'critical'
    case 'lint':
      return 'warning'
    case 'test':
      return 'error'
    case 'build':
      return 'critical'
    default:
      return 'error'
  }
}

/**
 * 에러 메시지 포맷팅
 */
function formatMessage(type: ErrorType, extracted: Record<string, unknown>): string {
  if (extracted.message) return extracted.message as string

  switch (type) {
    case 'test':
      if (extracted.testName) return `Test failed: ${extracted.testName}`
      if (extracted.matcher)
        return `Assertion failed: expected ${extracted.expected}, received ${extracted.received}`
      break
    case 'runtime':
      if (extracted.errorType) return `${extracted.errorType}: ${extracted.message || 'Unknown error'}`
      break
  }

  return 'Unknown error'
}

/**
 * 중복 에러 제거
 */
function deduplicateErrors(errors: ParsedError[]): ParsedError[] {
  const seen = new Set<string>()
  return errors.filter((error) => {
    if (seen.has(error.id)) return false
    seen.add(error.id)
    return true
  })
}

/**
 * 신뢰도 점수 계산 (0-1)
 */
function calculateConfidence(error: ParsedError): number {
  let score = 0.5 // 기본 점수

  // 위치 정보가 있으면 +0.2
  if (error.location?.file) score += 0.15
  if (error.location?.line) score += 0.1
  if (error.location?.column) score += 0.05

  // 에러 타입별 가중치
  const typeConfidence: Record<ErrorType, number> = {
    type: 0.15, // TypeScript 에러는 정확함
    syntax: 0.15,
    lint: 0.1,
    test: 0.1,
    build: 0.1,
    runtime: 0.05, // 런타임 에러는 컨텍스트 부족할 수 있음
    logic: 0,
    unknown: -0.1,
  }
  score += typeConfidence[error.type] || 0

  // 메시지 길이가 적절하면 +0.05
  if (error.message.length > 10 && error.message.length < 200) {
    score += 0.05
  }

  return Math.min(1, Math.max(0, score))
}

/**
 * 에러 요약 생성
 */
function summarizeErrors(errors: ParsedError[]): AnalysisResult['summary'] {
  const byType: Record<ErrorType, number> = {
    syntax: 0,
    type: 0,
    logic: 0,
    runtime: 0,
    lint: 0,
    test: 0,
    build: 0,
    unknown: 0,
  }

  const bySeverity: Record<ErrorSeverity, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
  }

  for (const error of errors) {
    byType[error.type]++
    bySeverity[error.severity]++
  }

  return {
    total: errors.length,
    byType,
    bySeverity,
  }
}

/**
 * GitHub Actions 로그 파싱
 */
export function parseGitHubActionsLog(log: string): AnalysisResult {
  // ANSI 코드 제거
  const cleanLog = log.replace(/\x1b\[[0-9;]*m/g, '')
  return parseErrors(cleanLog, 'github')
}

/**
 * Vercel 빌드 로그 파싱
 */
export function parseVercelBuildLog(log: string): AnalysisResult {
  const cleanLog = log.replace(/\x1b\[[0-9;]*m/g, '')
  return parseErrors(cleanLog, 'vercel')
}

/**
 * Sentry 이슈 데이터 파싱
 */
export function parseSentryIssue(issueData: {
  title: string
  culprit?: string
  metadata?: { filename?: string; function?: string }
  exception?: { values?: Array<{ type: string; value: string; stacktrace?: unknown }> }
}): AnalysisResult {
  const errors: ParsedError[] = []

  // 메인 에러
  const mainError: ParsedError = {
    id: `sentry:${issueData.title}`,
    type: 'runtime',
    severity: 'critical',
    message: issueData.title,
    rawMessage: issueData.title,
    confidence: 0.8,
  }

  if (issueData.metadata?.filename) {
    mainError.location = {
      file: issueData.metadata.filename,
    }
  }

  if (issueData.exception?.values) {
    mainError.stack = JSON.stringify(issueData.exception.values, null, 2)
  }

  errors.push(mainError)

  return {
    errors,
    summary: summarizeErrors(errors),
    source: 'sentry',
  }
}

/**
 * Supabase 알림 파싱
 */
export function parseSupabaseAlert(alertData: {
  type: string
  message: string
  details?: Record<string, unknown>
}): AnalysisResult {
  const errors: ParsedError[] = []

  const severity: ErrorSeverity =
    alertData.type === 'security' ? 'critical' : alertData.type === 'performance' ? 'warning' : 'error'

  errors.push({
    id: `supabase:${alertData.type}:${Date.now()}`,
    type: alertData.type === 'security' ? 'runtime' : 'build',
    severity,
    message: alertData.message,
    rawMessage: JSON.stringify(alertData),
    confidence: 0.7,
  })

  return {
    errors,
    summary: summarizeErrors(errors),
    source: 'supabase',
  }
}

/**
 * 자동 수정 가능 여부 판단
 */
export function isAutoFixable(error: ParsedError): boolean {
  // 위치 정보가 없으면 자동 수정 불가
  if (!error.location?.file) return false

  // 높은 신뢰도가 필요
  if (error.confidence < 0.6) return false

  // 자동 수정 가능한 에러 타입
  const autoFixableTypes: ErrorType[] = ['type', 'syntax', 'lint']
  if (!autoFixableTypes.includes(error.type)) return false

  return true
}

/**
 * 에러 우선순위 계산 (높을수록 먼저 처리)
 */
export function calculatePriority(error: ParsedError): number {
  let priority = 0

  // 심각도별 기본 점수
  const severityScore: Record<ErrorSeverity, number> = {
    critical: 100,
    error: 70,
    warning: 30,
    info: 10,
  }
  priority += severityScore[error.severity]

  // 자동 수정 가능하면 +20
  if (isAutoFixable(error)) priority += 20

  // 신뢰도 반영
  priority += error.confidence * 10

  return priority
}
