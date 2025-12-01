import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

// =============================================
// Flow 파이프라인 타입 정의
// =============================================
export type Stage = 'spec' | 'task' | 'code' | 'test' | 'commit' | 'docs';
export type ChangeStatus = 'active' | 'completed' | 'archived';

// Task Origin 타입: 태스크 출처 구분
// - openspec: tasks.md에서 동기화된 태스크
// - inbox: 수동으로 생성된 독립 태스크
// - imported: 외부 시스템에서 가져온 태스크
export type TaskOrigin = 'openspec' | 'inbox' | 'imported';

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
    enum: ['spec', 'task', 'code', 'test', 'commit', 'docs']
  }).notNull().default('spec'),
  progress: integer('progress').notNull().default(0), // 0-100
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
    enum: ['spec', 'task', 'code', 'test', 'commit', 'docs']
  }).notNull().default('task'), // 기본값 'task' (기존 칸반 호환)
  // 태스크 출처 구분
  origin: text('origin', {
    enum: ['openspec', 'inbox', 'imported']
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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }), // null if not archived
});

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
