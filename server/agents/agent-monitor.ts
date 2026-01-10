/**
 * Agent Execution Monitoring
 *
 * 에이전트 실행 이력 추적 및 모니터링
 * - 실행 이력 DB 저장
 * - 성공/실패 메트릭
 * - API 비용 추적
 * - 대시보드용 데이터 제공
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import type { AutoFixResult } from './error-detector'

// DB 경로 (기존 tasks.db와 동일 위치)
function getDbPath(): string {
  const dataDir = process.env.DATA_DIR
  if (dataDir) {
    return join(dataDir, 'agent-monitor.db')
  }
  return join(homedir(), '.zyflow', 'agent-monitor.db')
}

let db: Database.Database | null = null

/**
 * DB 초기화
 */
function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath())
    initSchema()
  }
  return db
}

/**
 * 스키마 초기화
 */
function initSchema(): void {
  const database = db!

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      errors_found INTEGER DEFAULT 0,
      errors_fixed INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      confidence REAL DEFAULT 0,
      pr_number INTEGER,
      pr_url TEXT,
      auto_merged INTEGER DEFAULT 0,

      -- AI 비용 추적
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_alert ON agent_runs(alert_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_success ON agent_runs(success);

    CREATE TABLE IF NOT EXISTS agent_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_date TEXT NOT NULL,
      total_runs INTEGER DEFAULT 0,
      successful_runs INTEGER DEFAULT 0,
      failed_runs INTEGER DEFAULT 0,
      total_errors_found INTEGER DEFAULT 0,
      total_errors_fixed INTEGER DEFAULT 0,
      total_prs_created INTEGER DEFAULT 0,
      total_auto_merged INTEGER DEFAULT 0,
      avg_duration_ms INTEGER DEFAULT 0,
      total_prompt_tokens INTEGER DEFAULT 0,
      total_completion_tokens INTEGER DEFAULT 0,
      total_estimated_cost REAL DEFAULT 0,

      UNIQUE(metric_date)
    );
  `)
}

export interface AgentRun {
  id: string
  alertId: string
  source: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  success: boolean
  error?: string
  errorsFound: number
  errorsFixed: number
  filesChanged: number
  confidence: number
  prNumber?: number
  prUrl?: string
  autoMerged: boolean
  promptTokens: number
  completionTokens: number
  estimatedCost: number
}

export interface DailyMetrics {
  date: string
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  totalErrorsFound: number
  totalErrorsFixed: number
  fixRate: number
  totalPRsCreated: number
  totalAutoMerged: number
  avgDurationMs: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalEstimatedCost: number
}

/**
 * 실행 시작 기록
 */
export function startRun(alertId: string, source: string): string {
  const database = getDb()
  const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  database.prepare(`
    INSERT INTO agent_runs (id, alert_id, source, started_at, success)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, alertId, source, new Date().toISOString())

  return id
}

/**
 * 실행 완료 기록
 */
export function completeRun(runId: string, result: AutoFixResult): void {
  const database = getDb()

  const prNumber = result.workflowResult?.finalPR?.number
  const prUrl = result.workflowResult?.finalPR?.url

  database.prepare(`
    UPDATE agent_runs SET
      completed_at = ?,
      duration_ms = ?,
      success = ?,
      error = ?,
      errors_found = ?,
      errors_fixed = ?,
      files_changed = ?,
      confidence = ?,
      pr_number = ?,
      pr_url = ?,
      auto_merged = ?
    WHERE id = ?
  `).run(
    new Date().toISOString(),
    result.duration,
    result.success ? 1 : 0,
    result.error || null,
    result.analysis?.summary.total || 0,
    result.fixResult?.metadata.fixedCount || 0,
    result.fixResult?.changes.length || 0,
    result.fixResult?.metadata.confidence || 0,
    prNumber || null,
    prUrl || null,
    result.mergeDecision?.shouldMerge ? 1 : 0,
    runId
  )

  // 일별 메트릭 업데이트
  updateDailyMetrics(result)
}

/**
 * 일별 메트릭 업데이트
 */
function updateDailyMetrics(result: AutoFixResult): void {
  const database = getDb()
  const today = new Date().toISOString().split('T')[0]

  // UPSERT
  database.prepare(`
    INSERT INTO agent_metrics (
      metric_date, total_runs, successful_runs, failed_runs,
      total_errors_found, total_errors_fixed, total_prs_created,
      total_auto_merged, avg_duration_ms
    ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_date) DO UPDATE SET
      total_runs = total_runs + 1,
      successful_runs = successful_runs + ?,
      failed_runs = failed_runs + ?,
      total_errors_found = total_errors_found + ?,
      total_errors_fixed = total_errors_fixed + ?,
      total_prs_created = total_prs_created + ?,
      total_auto_merged = total_auto_merged + ?
  `).run(
    today,
    result.success ? 1 : 0,
    result.success ? 0 : 1,
    result.analysis?.summary.total || 0,
    result.fixResult?.metadata.fixedCount || 0,
    result.workflowResult?.finalPR ? 1 : 0,
    result.mergeDecision?.shouldMerge ? 1 : 0,
    result.duration,
    // ON CONFLICT 부분
    result.success ? 1 : 0,
    result.success ? 0 : 1,
    result.analysis?.summary.total || 0,
    result.fixResult?.metadata.fixedCount || 0,
    result.workflowResult?.finalPR ? 1 : 0,
    result.mergeDecision?.shouldMerge ? 1 : 0
  )
}

/**
 * AI 비용 기록
 */
export function recordAICost(runId: string, promptTokens: number, completionTokens: number): void {
  const database = getDb()

  // Gemini 2.0 Flash 가격 (예상)
  // Input: $0.075 per 1M tokens
  // Output: $0.30 per 1M tokens
  const estimatedCost = (promptTokens * 0.000000075) + (completionTokens * 0.0000003)

  database.prepare(`
    UPDATE agent_runs SET
      prompt_tokens = prompt_tokens + ?,
      completion_tokens = completion_tokens + ?,
      estimated_cost = estimated_cost + ?
    WHERE id = ?
  `).run(promptTokens, completionTokens, estimatedCost, runId)

  // 일별 메트릭도 업데이트
  const today = new Date().toISOString().split('T')[0]
  database.prepare(`
    UPDATE agent_metrics SET
      total_prompt_tokens = total_prompt_tokens + ?,
      total_completion_tokens = total_completion_tokens + ?,
      total_estimated_cost = total_estimated_cost + ?
    WHERE metric_date = ?
  `).run(promptTokens, completionTokens, estimatedCost, today)
}

/**
 * 최근 실행 조회
 */
export function getRecentRuns(limit = 20): AgentRun[] {
  const database = getDb()

  const rows = database.prepare(`
    SELECT * FROM agent_runs
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>

  return rows.map(rowToAgentRun)
}

/**
 * 특정 알림의 실행 이력 조회
 */
export function getRunsByAlert(alertId: string): AgentRun[] {
  const database = getDb()

  const rows = database.prepare(`
    SELECT * FROM agent_runs
    WHERE alert_id = ?
    ORDER BY started_at DESC
  `).all(alertId) as Array<Record<string, unknown>>

  return rows.map(rowToAgentRun)
}

/**
 * 일별 메트릭 조회
 */
export function getDailyMetrics(days = 30): DailyMetrics[] {
  const database = getDb()

  const rows = database.prepare(`
    SELECT * FROM agent_metrics
    ORDER BY metric_date DESC
    LIMIT ?
  `).all(days) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    date: row.metric_date as string,
    totalRuns: row.total_runs as number,
    successfulRuns: row.successful_runs as number,
    failedRuns: row.failed_runs as number,
    successRate: (row.total_runs as number) > 0
      ? (row.successful_runs as number) / (row.total_runs as number)
      : 0,
    totalErrorsFound: row.total_errors_found as number,
    totalErrorsFixed: row.total_errors_fixed as number,
    fixRate: (row.total_errors_found as number) > 0
      ? (row.total_errors_fixed as number) / (row.total_errors_found as number)
      : 0,
    totalPRsCreated: row.total_prs_created as number,
    totalAutoMerged: row.total_auto_merged as number,
    avgDurationMs: row.avg_duration_ms as number,
    totalPromptTokens: row.total_prompt_tokens as number,
    totalCompletionTokens: row.total_completion_tokens as number,
    totalEstimatedCost: row.total_estimated_cost as number,
  }))
}

/**
 * 전체 통계
 */
export function getOverallStats(): {
  totalRuns: number
  successRate: number
  totalErrorsFound: number
  totalErrorsFixed: number
  fixRate: number
  totalPRsCreated: number
  autoMergeRate: number
  avgDurationMs: number
  totalCost: number
} {
  const database = getDb()

  const stats = database.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(success) as successful_runs,
      SUM(errors_found) as total_errors_found,
      SUM(errors_fixed) as total_errors_fixed,
      SUM(CASE WHEN pr_number IS NOT NULL THEN 1 ELSE 0 END) as total_prs,
      SUM(auto_merged) as total_auto_merged,
      AVG(duration_ms) as avg_duration,
      SUM(estimated_cost) as total_cost
    FROM agent_runs
  `).get() as Record<string, unknown>

  const totalRuns = (stats.total_runs as number) || 0
  const successfulRuns = (stats.successful_runs as number) || 0
  const totalErrorsFound = (stats.total_errors_found as number) || 0
  const totalErrorsFixed = (stats.total_errors_fixed as number) || 0
  const totalPRs = (stats.total_prs as number) || 0
  const totalAutoMerged = (stats.total_auto_merged as number) || 0

  return {
    totalRuns,
    successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    totalErrorsFound,
    totalErrorsFixed,
    fixRate: totalErrorsFound > 0 ? totalErrorsFixed / totalErrorsFound : 0,
    totalPRsCreated: totalPRs,
    autoMergeRate: totalPRs > 0 ? totalAutoMerged / totalPRs : 0,
    avgDurationMs: (stats.avg_duration as number) || 0,
    totalCost: (stats.total_cost as number) || 0,
  }
}

/**
 * DB 행을 AgentRun으로 변환
 */
function rowToAgentRun(row: Record<string, unknown>): AgentRun {
  return {
    id: row.id as string,
    alertId: row.alert_id as string,
    source: row.source as string,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
    durationMs: row.duration_ms as number | undefined,
    success: Boolean(row.success),
    error: row.error as string | undefined,
    errorsFound: row.errors_found as number,
    errorsFixed: row.errors_fixed as number,
    filesChanged: row.files_changed as number,
    confidence: row.confidence as number,
    prNumber: row.pr_number as number | undefined,
    prUrl: row.pr_url as string | undefined,
    autoMerged: Boolean(row.auto_merged),
    promptTokens: row.prompt_tokens as number,
    completionTokens: row.completion_tokens as number,
    estimatedCost: row.estimated_cost as number,
  }
}

/**
 * DB 연결 종료
 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
