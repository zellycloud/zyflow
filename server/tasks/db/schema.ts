import { sqliteTable, text, integer, real, blob, index } from 'drizzle-orm/sqlite-core';

// =============================================
// Flow 파이프라인 타입 정의
// =============================================
export type Stage = 'spec' | 'changes' | 'task' | 'code' | 'test' | 'commit' | 'docs';
export type ChangeStatus = 'active' | 'completed' | 'archived';

// Task Origin 타입: 태스크 출처 구분
// - openspec: tasks.md에서 동기화된 태스크
// - inbox: 수동으로 생성된 독립 태스크
// - imported: 외부 시스템에서 가져온 태스크
// - backlog: backlog/*.md 파일에서 동기화된 태스크
export type TaskOrigin = 'openspec' | 'inbox' | 'imported' | 'backlog';

// =============================================
// Change Log 관련 타입 정의
// =============================================

// 이벤트 유형
export type EventType =
  | 'FILE_CHANGE'
  | 'DB_CHANGE'
  | 'SYNC_OPERATION'
  | 'CONFLICT_DETECTED'
  | 'CONFLICT_RESOLVED'
  | 'RECOVERY_STARTED'
  | 'RECOVERY_COMPLETED'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED'
  | 'SYSTEM_EVENT';

// 이벤트 심각도
export type EventSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

// 이벤트 소스
export type EventSource =
  | 'FILE_WATCHER'
  | 'SYNC_MANAGER'
  | 'RECOVERY_MANAGER'
  | 'BACKUP_MANAGER'
  | 'MCP_SERVER'
  | 'USER_ACTION'
  | 'SYSTEM';

// 처리 상태
export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// 리플레이 모드
export type ReplayMode = 'SAFE' | 'FAST' | 'VERBOSE' | 'DRY_RUN';

// 리플레이 전략
export type ReplayStrategy = 'SEQUENTIAL' | 'PARALLEL' | 'DEPENDENCY_AWARE' | 'SELECTIVE';

// 리플레이 세션 상태
export type ReplaySessionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// 순차 번호 관리 테이블
export const sequences = sqliteTable('sequences', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
});

// =============================================
// Changes 테이블 (Flow의 최상위 단위)
// =============================================
export const changes = sqliteTable('changes', {
  id: text('id').primaryKey(), // OpenSpec change-id와 동일
  projectId: text('project_id').notNull(), // 프로젝트 식별자
  title: text('title').notNull(),
  specPath: text('spec_path'), // openspec/changes/{id}/proposal.md 경로
  status: text('status', {
    enum: ['active', 'completed', 'archived']
  }).notNull().default('active'),
  currentStage: text('current_stage', {
    enum: ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']
  }).notNull().default('spec'),
  progress: integer('progress').notNull().default(0), // 0-100
  // OpenSpec 1.0 아티팩트 상태 캐시 (JSON 형식)
  artifactStatus: text('artifact_status'), // { artifacts: [...], progress: {...} }
  artifactStatusUpdatedAt: integer('artifact_status_updated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type Change = typeof changes.$inferSelect;
export type NewChange = typeof changes.$inferInsert;

// =============================================
// Tasks 테이블 (기존 + Flow 확장)
// =============================================
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  // 프로젝트 식별자 (필수 - 프로젝트별 칸반 분리)
  projectId: text('project_id').notNull(),
  // Flow 연결 필드 (nullable - 독립 태스크 지원)
  changeId: text('change_id'), // changes.id 참조, null이면 독립 태스크
  stage: text('stage', {
    enum: ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']
  }).notNull().default('task'), // 기본값 'task' (기존 칸반 호환)
  // 태스크 출처 구분
  origin: text('origin', {
    enum: ['openspec', 'inbox', 'imported', 'backlog']
  }).notNull().default('inbox'),
  // 기존 필드
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', {
    enum: ['todo', 'in-progress', 'review', 'done', 'archived']
  }).notNull().default('todo'),
  priority: text('priority', {
    enum: ['low', 'medium', 'high']
  }).notNull().default('medium'),
  tags: text('tags'), // JSON array: ["bug", "refactor"]
  assignee: text('assignee'),
  order: integer('order').notNull().default(0),
  // 그룹화 관련 필드
  groupTitle: text('group_title'), // 작업 그룹의 제목
  groupOrder: integer('group_order').notNull().default(0), // 그룹 내 순서
  taskOrder: integer('task_order').notNull().default(0), // 그룹 내 작업 순서

  // =============================================
  // Backlog.md 확장 필드 (origin='backlog' 전용)
  // =============================================
  parentTaskId: integer('parent_task_id'), // 서브태스크 부모 ID
  blockedBy: text('blocked_by'), // JSON array of task IDs: ["task-001", "task-002"]
  plan: text('plan'), // ## Plan 섹션 내용 (마크다운)
  acceptanceCriteria: text('acceptance_criteria'), // ## Acceptance Criteria 섹션 (마크다운)
  notes: text('notes'), // ## Notes 섹션 (마크다운)
  dueDate: integer('due_date', { mode: 'timestamp' }), // 마감일
  milestone: text('milestone'), // 마일스톤/스프린트 이름
  backlogFileId: text('backlog_file_id'), // backlog/*.md 파일의 task-id (예: "task-007")

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }), // null if not archived
}, (table) => ({
  // 인덱스 정의
  groupTitleIdx: index('idx_tasks_group_title').on(table.groupTitle),
  groupTaskOrderIdx: index('idx_tasks_group_task_order').on(table.groupOrder, table.taskOrder),
  // Backlog 관련 인덱스
  originIdx: index('idx_tasks_origin').on(table.origin),
  parentTaskIdIdx: index('idx_tasks_parent_task_id').on(table.parentTaskId),
  backlogFileIdIdx: index('idx_tasks_backlog_file_id').on(table.backlogFileId),
  milestoneIdx: index('idx_tasks_milestone').on(table.milestone),
}));

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high';

// =============================================
// Change Log 테이블
// =============================================

// 이벤트 로그 테이블
export const changeEvents = sqliteTable('change_events', {
  // 기본 키 및 메타데이터
  id: text('id').primaryKey(),
  type: text('type', { enum: ['FILE_CHANGE', 'DB_CHANGE', 'SYNC_OPERATION', 'CONFLICT_DETECTED', 'CONFLICT_RESOLVED', 'RECOVERY_STARTED', 'RECOVERY_COMPLETED', 'BACKUP_CREATED', 'BACKUP_RESTORED', 'SYSTEM_EVENT'] }).notNull(),
  severity: text('severity', { enum: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] }).notNull().default('INFO'),
  source: text('source', { enum: ['FILE_WATCHER', 'SYNC_MANAGER', 'RECOVERY_MANAGER', 'BACKUP_MANAGER', 'MCP_SERVER', 'USER_ACTION', 'SYSTEM'] }).notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  
  // 프로젝트 및 변경 관련 ID
  projectId: text('project_id'),
  changeId: text('change_id'),
  correlationId: text('correlation_id'),
  sessionId: text('session_id'),
  userId: text('user_id'),
  
  // 이벤트 데이터 (JSON으로 저장)
  dataType: text('data_type').notNull(), // 데이터 타입 식별자
  data: text('data').notNull(), // JSON 형식의 이벤트 데이터
  
  // 메타데이터 (JSON으로 저장)
  metadata: text('metadata').notNull(), // JSON 형식의 메타데이터
  
  // 처리 상태
  processingStatus: text('processing_status', { enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] }).notNull().default('PENDING'),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  processingError: text('processing_error'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  
  // 인덱스용 필드
  checksum: text('checksum'), // 이벤트 내용 체크섬
  size: integer('size').notNull(), // 이벤트 크기 (바이트)
  
  // 시간戳
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type ChangeEvent = typeof changeEvents.$inferSelect;
export type NewChangeEvent = typeof changeEvents.$inferInsert;

// 리플레이 세션 테이블
export const replaySessions = sqliteTable('replay_sessions', {
  id: text('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  
  // 필터 정보 (JSON으로 저장)
  filter: text('filter').notNull(), // EventFilter JSON
  
  // 리플레이 옵션 (JSON으로 저장)
  options: text('options').notNull(), // ReplayOptions JSON
  
  // 상태 정보
  status: text('status', { enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] }).notNull().default('PENDING'),
  
  // 진행 정보
  totalEvents: integer('total_events').notNull().default(0),
  processedEvents: integer('processed_events').notNull().default(0),
  succeededEvents: integer('succeeded_events').notNull().default(0),
  failedEvents: integer('failed_events').notNull().default(0),
  skippedEvents: integer('skipped_events').notNull().default(0),
  
  // 시간 정보
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  duration: integer('duration'), // 밀리초
  
  // 결과 정보 (JSON으로 저장)
  result: text('result'), // ReplayResult JSON
  
  // 메타데이터
  metadata: text('metadata'), // JSON 형식의 추가 메타데이터
});

export type ReplaySession = typeof replaySessions.$inferSelect;
export type NewReplaySession = typeof replaySessions.$inferInsert;

// 리플레이 결과 상세 테이블
export const replayResults = sqliteTable('replay_results', {
  id: integer('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => replaySessions.id),
  eventId: text('event_id').notNull(),
  status: text('status', { enum: ['SUCCESS', 'FAILED', 'SKIPPED'] }).notNull(),
  duration: integer('duration').notNull(), // 밀리초
  error: text('error'),
  warnings: text('warnings'), // JSON 배열 형식
  order: integer('order').notNull(), // 처리 순서
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type ReplayResult = typeof replayResults.$inferSelect;
export type NewReplayResult = typeof replayResults.$inferInsert;

// 롤백 포인트 테이블
export const rollbackPoints = sqliteTable('rollback_points', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => replaySessions.id),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  description: text('description').notNull(),
  
  // 롤백 데이터 (JSON으로 저장)
  snapshot: text('snapshot').notNull(), // 시스템 상태 스냅샷 JSON
  
  // 메타데이터
  metadata: text('metadata'), // JSON 형식의 추가 메타데이터
  
  // 상태
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  isExpired: integer('is_expired', { mode: 'boolean' }).notNull().default(false),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  
  // 시간戳
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type RollbackPoint = typeof rollbackPoints.$inferSelect;
export type NewRollbackPoint = typeof rollbackPoints.$inferInsert;

// 이벤트 통계 캐시 테이블 (성능 최적화용)
export const eventStatistics = sqliteTable('event_statistics', {
  id: integer('id').primaryKey(),
  
  // 그룹화 키
  projectId: text('project_id'),
  eventType: text('event_type'),
  severity: text('severity'),
  source: text('source'),
  
  // 시간 범위 (일 단위)
  date: text('date').notNull(), // YYYY-MM-DD 형식
  
  // 통계 데이터
  count: integer('count').notNull().default(0),
  size: integer('size').notNull().default(0), // 총 크기
  avgDuration: real('avg_duration'), // 평균 지속 시간 (밀리초)
  errorCount: integer('error_count').notNull().default(0),
  
  // 시간戳
  calculatedAt: integer('calculated_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type EventStatistic = typeof eventStatistics.$inferSelect;
export type NewEventStatistic = typeof eventStatistics.$inferInsert;

// 이벤트 인덱스 테이블 (검색 성능 최적화용)
export const eventIndexes = sqliteTable('event_indexes', {
  id: integer('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => changeEvents.id),
  
  // 인덱싱된 필드
  fieldName: text('field_name').notNull(),
  fieldValue: text('field_value').notNull(),
  fieldType: text('field_type').notNull(), // 'string', 'number', 'boolean', 'date'
  
  // 성능 최적화를 위한 추가 정보
  weight: real('weight').notNull().default(1.0), // 검색 가중치
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type EventIndex = typeof eventIndexes.$inferSelect;
export type NewEventIndex = typeof eventIndexes.$inferInsert;

// =============================================
// Alert System 테이블
// =============================================

// Alert 소스 타입
export type AlertSource = 'github' | 'vercel' | 'sentry' | 'supabase' | 'custom';

// Alert 심각도
export type AlertSeverity = 'critical' | 'warning' | 'info';

// Alert 상태
export type AlertStatus = 'pending' | 'processing' | 'resolved' | 'ignored';

// 위험도 레벨
export type RiskLevel = 'low' | 'medium' | 'high';

// Alerts 테이블
export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(), // UUID
  source: text('source', {
    enum: ['github', 'vercel', 'sentry', 'supabase', 'custom'],
  }).notNull(),
  type: text('type').notNull(), // 'workflow.failed', 'deployment.error', 'issue.created' 등
  severity: text('severity', {
    enum: ['critical', 'warning', 'info'],
  }).notNull(),
  status: text('status', {
    enum: ['pending', 'processing', 'resolved', 'ignored'],
  }).notNull().default('pending'),

  title: text('title').notNull(),
  summary: text('summary'), // Agent 분석 요약
  externalUrl: text('external_url'), // 원본 서비스 링크

  payload: text('payload').notNull(), // JSON - 원본 webhook 데이터
  metadata: text('metadata'), // JSON - repo, branch, commit, environment, projectId

  analysis: text('analysis'), // JSON - AlertAnalysis
  resolution: text('resolution'), // JSON - { type, action, details, prUrl }

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(), // createdAt + 90일
}, (table) => ({
  statusIdx: index('idx_alerts_status').on(table.status),
  sourceIdx: index('idx_alerts_source').on(table.source),
  severityIdx: index('idx_alerts_severity').on(table.severity),
  createdAtIdx: index('idx_alerts_created_at').on(table.createdAt),
  expiresAtIdx: index('idx_alerts_expires_at').on(table.expiresAt),
}));

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

// Alert Analysis 인터페이스 (JSON으로 저장)
export interface AlertAnalysis {
  alertId: string;
  rootCause?: string;
  relatedFiles?: string[];
  suggestedFix?: string;
  autoFixable: boolean;
  autoFixAction?: 'retry' | 'rollback' | 'patch';
  confidence: number; // 0-1
  similarAlerts?: string[];
  documentation?: string;
  analyzedAt: string;
}

// Alert Resolution 인터페이스 (JSON으로 저장)
export interface AlertResolution {
  type: 'auto' | 'manual';
  action: string; // 'pr_created' | 'retried' | 'rolled_back' | 'ignored'
  details?: string;
  prUrl?: string;
}

// Alert Metadata 인터페이스 (JSON으로 저장)
export interface AlertMetadata {
  repo?: string;
  branch?: string;
  commit?: string;
  environment?: string;
  projectId?: string;
}

// Risk Assessment 인터페이스
export interface RiskAssessment {
  level: RiskLevel;
  autoApprove: boolean;
  requiresReview: boolean;
  reason: string;
}

// Activity Logs 테이블
export const activityLogs = sqliteTable('activity_logs', {
  id: text('id').primaryKey(), // UUID
  alertId: text('alert_id').references(() => alerts.id, { onDelete: 'cascade' }),

  actor: text('actor', {
    enum: ['system', 'agent', 'user'],
  }).notNull(),
  action: text('action').notNull(), // 'webhook.received', 'analysis.started', 'pr.created'
  description: text('description').notNull(),

  metadata: text('metadata'), // JSON

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  alertIdIdx: index('idx_activity_logs_alert_id').on(table.alertId),
  createdAtIdx: index('idx_activity_logs_created_at').on(table.createdAt),
}));

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

// Webhook Configs 테이블
export const webhookConfigs = sqliteTable('webhook_configs', {
  id: text('id').primaryKey(), // UUID
  source: text('source', {
    enum: ['github', 'vercel', 'sentry', 'supabase', 'custom'],
  }).notNull(),
  name: text('name').notNull(), // 사용자 지정 이름

  endpoint: text('endpoint').notNull(), // 생성된 webhook URL
  secret: text('secret'), // 암호화됨 - webhook 검증용
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

  rules: text('rules'), // JSON - { include?, exclude?, severityMap? }
  projectIds: text('project_ids'), // JSON array

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  sourceIdx: index('idx_webhook_configs_source').on(table.source),
  enabledIdx: index('idx_webhook_configs_enabled').on(table.enabled),
}));

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type NewWebhookConfig = typeof webhookConfigs.$inferInsert;

// Webhook Rules 인터페이스 (JSON으로 저장)
export interface WebhookRules {
  include?: string[]; // 포함할 이벤트 타입
  exclude?: string[]; // 제외할 이벤트 타입
  severityMap?: Record<string, AlertSeverity>;
}

// Notification Config 테이블 (싱글톤)
export const notificationConfig = sqliteTable('notification_config', {
  id: text('id').primaryKey().default('default'),

  slackWebhookUrl: text('slack_webhook_url'), // 암호화됨
  slackChannel: text('slack_channel'),
  slackEnabled: integer('slack_enabled', { mode: 'boolean' }).notNull().default(false),

  ruleOnCritical: integer('rule_on_critical', { mode: 'boolean' }).notNull().default(true),
  ruleOnAutofix: integer('rule_on_autofix', { mode: 'boolean' }).notNull().default(true),
  ruleOnAll: integer('rule_on_all', { mode: 'boolean' }).notNull().default(false),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type NotificationConfig = typeof notificationConfig.$inferSelect;
export type NewNotificationConfig = typeof notificationConfig.$inferInsert;

// Alert Patterns 테이블 (유사 Alert 매칭 및 해결 패턴 학습)
export const alertPatterns = sqliteTable('alert_patterns', {
  id: text('id').primaryKey(), // UUID
  source: text('source', {
    enum: ['github', 'vercel', 'sentry', 'supabase', 'custom'],
  }).notNull(),
  type: text('type').notNull(), // Alert type pattern (e.g., 'workflow.failure', 'deployment.error')

  // 패턴 식별자 (제목, 에러 메시지 등에서 추출된 핵심 키워드)
  patternSignature: text('pattern_signature').notNull(), // 정규화된 패턴 시그니처
  patternKeywords: text('pattern_keywords'), // JSON array - 주요 키워드들

  // 해결 패턴 정보
  resolutionCount: integer('resolution_count').notNull().default(0),
  autoFixCount: integer('auto_fix_count').notNull().default(0),
  manualFixCount: integer('manual_fix_count').notNull().default(0),
  avgResolutionTime: integer('avg_resolution_time'), // 밀리초

  // 추천 해결책
  recommendedAction: text('recommended_action'), // 가장 성공적인 해결 방법
  recommendedFix: text('recommended_fix'), // 추천 수정 내용
  successRate: real('success_rate'), // 0-1 성공률

  // 연결된 Alert IDs
  alertIds: text('alert_ids'), // JSON array - 이 패턴에 매칭된 Alert ID들

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  sourceTypeIdx: index('idx_alert_patterns_source_type').on(table.source, table.type),
  signatureIdx: index('idx_alert_patterns_signature').on(table.patternSignature),
}));

export type AlertPattern = typeof alertPatterns.$inferSelect;
export type NewAlertPattern = typeof alertPatterns.$inferInsert;

// Alert Trends 테이블 (일별 통계 캐시)
export const alertTrends = sqliteTable('alert_trends', {
  id: integer('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD 형식

  // 소스별 카운트
  source: text('source', {
    enum: ['github', 'vercel', 'sentry', 'supabase', 'custom', 'all'],
  }).notNull(),

  // 카운트 통계
  totalCount: integer('total_count').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  infoCount: integer('info_count').notNull().default(0),

  // 해결 통계
  resolvedCount: integer('resolved_count').notNull().default(0),
  ignoredCount: integer('ignored_count').notNull().default(0),
  autoFixedCount: integer('auto_fixed_count').notNull().default(0),

  // 시간 통계
  avgResolutionTime: integer('avg_resolution_time'), // 밀리초
  minResolutionTime: integer('min_resolution_time'),
  maxResolutionTime: integer('max_resolution_time'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  dateSourceIdx: index('idx_alert_trends_date_source').on(table.date, table.source),
}));

export type AlertTrend = typeof alertTrends.$inferSelect;
export type NewAlertTrend = typeof alertTrends.$inferInsert;
