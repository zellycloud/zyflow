# 핵심 인터페이스 및 타입 정의

## 개요

ZyFlow 단일 진실 원천 아키텍처의 핵심 인터페이스와 타입 정의를 통합하여 시스템의 일관성과 타입 안전성을 보장합니다. 이 정의들은 모든 컴포넌트 간의 상호작용을 위한 표준 계약서 역할을 합니다.

## 기본 타입 정의

### 1. 공통 타입

```typescript
// 기본 식별자
type Identifier = string

// 타임스탬프
type Timestamp = number

// 버전 번호
type Version = number

// 체크섬
type Checksum = string

// JSON 직렬화 가능 데이터
type JSONValue = string | number | boolean | null | undefined | JSONObject | JSONArray

interface JSONObject {
  [key: string]: JSONValue
}

interface JSONArray extends Array<JSONValue> {}

// 결과 래퍼
type Result<T, E = Error> = {
  success: boolean
  data?: T
  error?: E
  metadata?: Record<string, unknown>
}

// 비동기 결과
type AsyncResult<T> = Promise<Result<T>>

// 페이지네이션
interface Pagination {
  offset: number
  limit: number
  total?: number
}

// 정렬
interface Sort {
  field: string
  direction: 'ASC' | 'DESC'
}

// 필터
interface Filter {
  [key: string]: unknown
}

// 검색 쿼리
interface SearchQuery {
  query?: string
  filters?: Filter[]
  sort?: Sort[]
  pagination?: Pagination
}
```

### 2. 도메인 타입

```typescript
// 집합 루트 ID
type AggregateId = Identifier

// 집합 루트 타입
enum AggregateType {
  TASK = 'TASK',
  CHANGE = 'CHANGE',
  PROJECT = 'PROJECT',
  USER = 'USER',
  SYNC_OPERATION = 'SYNC_OPERATION'
}

// 태스크 상태
enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  REVIEW = 'review',
  DONE = 'done',
  ARCHIVED = 'archived'
}

// 태스크 우선순위
enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// 변경 상태
enum ChangeStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived'
}

// 변경 스테이지
enum ChangeStage {
  SPEC = 'spec',
  TASK = 'task',
  CODE = 'code',
  TEST = 'test',
  COMMIT = 'commit',
  DOCS = 'docs'
}

// 태스크 출처
enum TaskOrigin {
  OPENSPEC = 'openspec',
  INBOX = 'inbox',
  IMPORTED = 'imported'
}

// 동기화 방향
enum SyncDirection {
  SPEC_TO_RUNTIME = 'spec_to_runtime',
  RUNTIME_TO_SPEC = 'runtime_to_spec',
  BIDIRECTIONAL = 'bidirectional'
}

// 동기화 상태
enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}
```

## 도메인 모델

### 1. 태스크 모델

```typescript
interface Task {
  // 기본 정보
  id: Identifier
  changeId?: Identifier
  title: string
  description?: string
  
  // 상태 정보
  status: TaskStatus
  priority: TaskPriority
  origin: TaskOrigin
  
  // 계층 정보
  stage: ChangeStage
  groupTitle?: string
  majorTitle?: string
  subOrder?: number
  taskOrder?: number
  
  // 할당 정보
  assignee?: string
  
  // 메타데이터
  tags: string[]
  metadata: Record<string, unknown>
  
  // 타임스탬프
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
  
  // 버전 정보
  version: Version
  checksum: Checksum
}

interface CreateTaskRequest {
  changeId?: Identifier
  title: string
  description?: string
  priority?: TaskPriority
  assignee?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

interface UpdateTaskRequest {
  id: Identifier
  changes: Partial<Omit<Task, 'id' | 'createdAt' | 'version' | 'checksum'>>
  expectedVersion?: Version
}

interface TaskSearchParams {
  changeId?: Identifier
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string
  tags?: string[]
  stage?: ChangeStage
  origin?: TaskOrigin
  createdAfter?: Timestamp
  createdBefore?: Timestamp
  updatedAfter?: Timestamp
  updatedBefore?: Timestamp
}
```

### 2. 변경(Change) 모델

```typescript
interface Change {
  // 기본 정보
  id: Identifier
  title: string
  description?: string
  
  // 상태 정보
  status: ChangeStatus
  currentStage: ChangeStage
  progress: number // 0-100
  
  // 경로 정보
  specPath?: string
  
  // 메타데이터
  metadata: Record<string, unknown>
  
  // 타임스탬프
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  
  // 버전 정보
  version: Version
  checksum: Checksum
}

interface CreateChangeRequest {
  title: string
  description?: string
  specPath?: string
  metadata?: Record<string, unknown>
}

interface UpdateChangeRequest {
  id: Identifier
  changes: Partial<Omit<Change, 'id' | 'createdAt' | 'version' | 'checksum'>>
  expectedVersion?: Version
}

interface ChangeSearchParams {
  status?: ChangeStatus
  stage?: ChangeStage
  createdAfter?: Timestamp
  createdBefore?: Timestamp
  updatedAfter?: Timestamp
  updatedBefore?: Timestamp
}
```

### 3. 동기화 모델

```typescript
interface SyncOperation {
  // 기본 정보
  id: Identifier
  type: SyncDirection
  status: SyncStatus
  
  // 대상 정보
  changeId: Identifier
  resourceIds: Identifier[]
  
  // 옵션
  options: SyncOptions
  
  // 결과 정보
  result?: SyncResult
  error?: SyncError
  
  // 타임스탬프
  createdAt: Timestamp
  startedAt?: Timestamp
  completedAt?: Timestamp
  
  // 메타데이터
  metadata: Record<string, unknown>
  
  // 버전 정보
  version: Version
}

interface SyncOptions {
  // 동기화 범위
  resourceTypes?: string[]
  includeIds?: Identifier[]
  excludeIds?: Identifier[]
  
  // 전략
  strategy?: SyncStrategy
  conflictResolution?: ConflictResolutionStrategy
  
  // 성능 옵션
  batchSize?: number
  maxConcurrency?: number
  timeout?: number
  
  // 안전 옵션
  dryRun?: boolean
  createRollbackPoint?: boolean
  stopOnConflict?: boolean
  
  // 필터링
  modifiedSince?: Timestamp
  filter?: (resource: any) => boolean
}

interface SyncResult {
  // 처리 통계
  totalProcessed: number
  successfulProcessed: number
  failedProcessed: number
  skippedProcessed: number
  
  // 충돌 정보
  conflictsDetected: Conflict[]
  conflictsResolved: Conflict[]
  conflictsRemaining: Conflict[]
  
  // 성능 메트릭
  duration: number
  throughput: number
  
  // 롤백 정보
  rollbackPointId?: Identifier
  
  // 상세 결과
  details?: Record<string, unknown>
}

enum SyncStrategy {
  INCREMENTAL = 'incremental',
  FULL = 'full',
  SMART = 'smart'
}

enum ConflictResolutionStrategy {
  SPEC_WINS = 'spec_wins',
  RUNTIME_WINS = 'runtime_wins',
  LAST_WRITE_WINS = 'last_write_wins',
  MERGE = 'merge',
  MANUAL = 'manual'
}
```

### 4. 충돌 모델

```typescript
interface Conflict {
  // 기본 정보
  id: Identifier
  type: ConflictType
  severity: ConflictSeverity
  
  // 대상 정보
  resourceType: ResourceType
  resourceId: Identifier
  changeId: Identifier
  
  // 충돌 내용
  specValue: unknown
  runtimeValue: unknown
  baseValue: unknown
  
  // 해결 정보
  resolution?: ConflictResolution
  resolvedAt?: Timestamp
  resolvedBy?: Identifier
  
  // 메타데이터
  metadata: Record<string, unknown>
  
  // 타임스탬프
  detectedAt: Timestamp
  createdAt: Timestamp
}

interface ConflictResolution {
  strategy: ConflictResolutionStrategy
  resolvedValue: unknown
  applied: boolean
  requiresManualIntervention: boolean
}

enum ConflictType {
  DATA_CONFLICT = 'data_conflict',
  STRUCTURE_CONFLICT = 'structure_conflict',
  VERSION_CONFLICT = 'version_conflict',
  DEPENDENCY_CONFLICT = 'dependency_conflict',
  PERMISSION_CONFLICT = 'permission_conflict'
}

enum ConflictSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

enum ResourceType {
  TASK = 'task',
  CHANGE = 'change',
  METADATA = 'metadata'
}
```

## 이벤트 시스템

### 1. 도메인 이벤트

```typescript
interface DomainEvent {
  // 기본 정보
  id: Identifier
  type: EventType
  aggregateId: AggregateId
  aggregateType: AggregateType
  version: Version
  timestamp: Timestamp
  
  // 이벤트 데이터
  data: Record<string, unknown>
  
  // 메타데이터
  metadata: {
    userId?: Identifier
    correlationId?: Identifier
    causationId?: Identifier
    sessionId?: Identifier
    source?: EventSource
    tags?: string[]
    [key: string]: unknown
  }
  
  // 처리 정보
  processing: {
    status: EventProcessingStatus
    processedAt?: Timestamp
    error?: string
    retryCount: number
    maxRetries: number
  }
}

enum EventType {
  // 태스크 이벤트
  TASK_CREATED = 'TaskCreated',
  TASK_UPDATED = 'TaskUpdated',
  TASK_COMPLETED = 'TaskCompleted',
  TASK_DELETED = 'TaskDeleted',
  
  // 변경 이벤트
  CHANGE_CREATED = 'ChangeCreated',
  CHANGE_UPDATED = 'ChangeUpdated',
  CHANGE_STATUS_UPDATED = 'ChangeStatusUpdated',
  CHANGE_DELETED = 'ChangeDeleted',
  
  // 동기화 이벤트
  SYNC_STARTED = 'SyncStarted',
  SYNC_COMPLETED = 'SyncCompleted',
  SYNC_FAILED = 'SyncFailed',
  
  // 충돌 이벤트
  CONFLICT_DETECTED = 'ConflictDetected',
  CONFLICT_RESOLVED = 'ConflictResolved',
  
  // 시스템 이벤트
  SYSTEM_ERROR = 'SystemError',
  SYSTEM_WARNING = 'SystemWarning',
  SYSTEM_INFO = 'SystemInfo'
}

enum EventSource {
  USER_ACTION = 'user_action',
  SYSTEM = 'system',
  SYNC_MANAGER = 'sync_manager',
  FILE_WATCHER = 'file_watcher',
  RECOVERY_MANAGER = 'recovery_manager'
}

enum EventProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

### 2. 이벤트 저장소

```typescript
interface EventStore {
  // 초기화
  initialize(config: EventStoreConfig): AsyncResult<void>
  
  // 이벤트 저장
  saveEvent(event: DomainEvent): AsyncResult<void>
  saveEvents(events: DomainEvent[]): AsyncResult<void>
  
  // 이벤트 조회
  getEvent(id: Identifier): AsyncResult<DomainEvent | null>
  getEvents(filter: EventFilter): AsyncResult<DomainEvent[]>
  getEventStream(filter?: EventFilter): AsyncIterable<DomainEvent>
  
  // 이벤트 재생
  replayEvents(aggregateId: AggregateId, fromVersion?: Version): AsyncIterable<DomainEvent>
  
  // 스냅샷 관리
  createSnapshot(aggregateId: AggregateId, version: Version): AsyncResult<void>
  getSnapshot(aggregateId: AggregateId, version?: Version): AsyncResult<EventSnapshot | null>
  
  // 유지보수
  compact(options?: CompactOptions): AsyncResult<void>
  cleanup(retention?: RetentionPolicy): AsyncResult<number>
  
  // 상태 정보
  getSize(): AsyncResult<number>
  getHealth(): AsyncResult<EventStoreHealth>
  close(): AsyncResult<void>
}

interface EventFilter {
  eventTypes?: EventType[]
  aggregateIds?: AggregateId[]
  aggregateTypes?: AggregateType[]
  timeRange?: {
    start: Timestamp
    end: Timestamp
  }
  userIds?: Identifier[]
  sessionIds?: Identifier[]
  metadata?: Record<string, unknown>
  pagination?: Pagination
  sort?: Sort[]
}

interface EventStoreConfig {
  storageType: 'MEMORY' | 'FILE' | 'DATABASE' | 'HYBRID'
  
  // 파일 저장소 설정
  file?: {
    path: string
    maxFileSize: number
    compressionEnabled: boolean
    encryptionEnabled: boolean
  }
  
  // 데이터베이스 저장소 설정
  database?: {
    connectionString: string
    tableName: string
    maxConnections: number
  }
  
  // 하이브리드 저장소 설정
  hybrid?: {
    memory: {
      maxSize: number
      ttl: number
    }
    persistent: {
      path: string
      syncInterval: number
    }
  }
  
  // 보관 정책
  retention: RetentionPolicy
  
  // 성능 설정
  performance: {
    batchSize: number
    maxConcurrency: number
    cacheEnabled: boolean
  }
}

interface RetentionPolicy {
  defaultRetentionDays: number
  byEventType: Record<EventType, number>
  bySeverity: Record<string, number>
  maxTotalEvents: number
  cleanupIntervalHours: number
}

interface CompactOptions {
  force?: boolean
  targetSize?: number
  preserveRecentDays?: number
}

interface EventSnapshot {
  aggregateId: AggregateId
  aggregateType: AggregateType
  version: Version
  data: Record<string, unknown>
  timestamp: Timestamp
  checksum: Checksum
}

interface EventStoreHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'FAILED'
  issues: string[]
  metrics: {
    totalEvents: number
    storageSize: number
    averageEventSize: number
    oldestEvent: Timestamp
    newestEvent: Timestamp
  }
}
```

## 커맨드 및 쿼리 시스템

### 1. 커맨드

```typescript
interface Command<T = unknown> {
  // 기본 정보
  id: Identifier
  type: CommandType
  aggregateId: AggregateId
  userId: Identifier
  timestamp: Timestamp
  
  // 커맨드 데이터
  data: T
  
  // 메타데이터
  metadata?: {
    correlationId?: Identifier
    expectedVersion?: Version
    timeout?: number
    retryPolicy?: RetryPolicy
    [key: string]: unknown
  }
}

interface CommandHandler<T extends Command, R = void> {
  canHandle(command: Command): command is T
  handle(command: T): AsyncResult<R>
  getCommandType(): CommandType
}

enum CommandType {
  // 태스크 커맨드
  CREATE_TASK = 'CreateTask',
  UPDATE_TASK = 'UpdateTask',
  COMPLETE_TASK = 'CompleteTask',
  DELETE_TASK = 'DeleteTask',
  
  // 변경 커맨드
  CREATE_CHANGE = 'CreateChange',
  UPDATE_CHANGE = 'UpdateChange',
  DELETE_CHANGE = 'DeleteChange',
  
  // 동기화 커맨드
  START_SYNC = 'StartSync',
  CANCEL_SYNC = 'CancelSync',
  RESOLVE_CONFLICT = 'ResolveConflict',
  
  // 시스템 커맨드
  TRIGGER_BACKUP = 'TriggerBackup',
  RESTORE_FROM_BACKUP = 'RestoreFromBackup',
  SYSTEM_MAINTENANCE = 'SystemMaintenance'
}

interface RetryPolicy {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors: string[]
}
```

### 2. 쿼리

```typescript
interface Query<T = unknown> {
  // 기본 정보
  id: Identifier
  type: QueryType
  userId?: Identifier
  timestamp: Timestamp
  
  // 쿼리 파라미터
  parameters: Record<string, unknown>
  
  // 옵션
  options?: {
    include?: string[]
    exclude?: string[]
    sort?: Sort[]
    pagination?: Pagination
    cache?: CacheOptions
  }
}

interface QueryHandler<T extends Query, R = unknown> {
  canHandle(query: Query): query is T
  handle(query: T): AsyncResult<R>
  getQueryType(): QueryType
}

enum QueryType {
  // 태스크 쿼리
  GET_TASK = 'GetTask',
  LIST_TASKS = 'ListTasks',
  SEARCH_TASKS = 'SearchTasks',
  
  // 변경 쿼리
  GET_CHANGE = 'GetChange',
  LIST_CHANGES = 'ListChanges',
  SEARCH_CHANGES = 'SearchChanges',
  
  // 동기화 쿼리
  GET_SYNC_STATUS = 'GetSyncStatus',
  LIST_SYNC_HISTORY = 'ListSyncHistory',
  
  // 통계 쿼리
  GET_TASK_STATISTICS = 'GetTaskStatistics',
  GET_SYNC_STATISTICS = 'GetSyncStatistics',
  GET_SYSTEM_HEALTH = 'GetSystemHealth'
}

interface CacheOptions {
  ttl?: number
  key?: string
  invalidateOn?: string[]
}
```

## 상태 관리

### 1. 상태 관리자

```typescript
interface StateManager<T = Record<string, unknown>> {
  // 상태 조회
  getState(id: Identifier, version?: Version): AsyncResult<VersionedState<T> | null>
  getCurrentState(id: Identifier): AsyncResult<VersionedState<T> | null>
  getStateHistory(id: Identifier, options?: HistoryOptions): AsyncResult<StateTransition<T>[]>
  
  // 상태 수정
  updateState(id: Identifier, updates: Partial<T>, options?: UpdateOptions): AsyncResult<StateUpdateResult<T>>
  
  // 동시성 제어
  acquireLock(id: Identifier, options?: LockOptions): AsyncResult<LockToken | null>
  releaseLock(token: LockToken): AsyncResult<boolean>
  validateLock(token: LockToken): AsyncResult<boolean>
  
  // 상태 검증
  validateState(id: Identifier): AsyncResult<StateValidationResult>
  compareStates(id1: Identifier, id2: Identifier): AsyncResult<StateComparison>
  
  // 모니터링
  getMetrics(): StateMetrics
}

interface VersionedState<T> {
  id: Identifier
  version: Version
  timestamp: Timestamp
  checksum: Checksum
  data: T
  metadata: {
    createdBy: Identifier
    updatedBy?: Identifier
    parentId?: Identifier
    branch?: string
    [key: string]: unknown
  }
}

interface StateTransition<T> {
  fromVersion: Version
  toVersion: Version
  operation: string
  timestamp: Timestamp
  userId: Identifier
  changes: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
}

interface UpdateOptions {
  expectedVersion?: Version
  lockToken?: LockToken
  reason?: string
  metadata?: Record<string, unknown>
  autoRetry?: boolean
  maxRetries?: number
}

interface StateUpdateResult<T> {
  success: boolean
  state?: VersionedState<T>
  conflict?: StateConflict
  error?: Error
  transition?: StateTransition<T>
  newVersion?: Version
}

interface StateConflict {
  type: ConflictType
  expectedVersion: Version
  actualVersion: Version
  conflictingUpdates: Record<string, unknown>
  resolution?: ConflictResolution
}

interface StateValidationResult {
  valid: boolean
  issues: StateIssue[]
}

interface StateIssue {
  type: string
  description: string
  expected?: unknown
  actual?: unknown
}

interface StateComparison {
  identical: boolean
  differences: Record<string, { old: unknown; new: unknown }>
  mergeRequired: boolean
}

interface LockToken {
  id: Identifier
  resourceId: Identifier
  expectedVersion: Version
  acquiredAt: Timestamp
  expiresAt: Timestamp
  exclusive: boolean
  userId?: Identifier
  metadata?: Record<string, unknown>
}

interface LockOptions {
  duration?: number
  timeout?: number
  exclusive?: boolean
  metadata?: Record<string, unknown>
}

interface HistoryOptions {
  fromVersion?: Version
  toVersion?: Version
  timeRange?: { start: Timestamp; end: Timestamp }
  limit?: number
  includeMetadata?: boolean
}

interface StateMetrics {
  totalStates: number
  activeLocks: number
  averageUpdateDuration: number
  conflictRate: number
  cacheHitRate: number
}
```

## 동기화 코디네이터

### 1. 동기화 코디네이터

```typescript
interface SyncCoordinator {
  // 초기화
  initialize(config: SyncCoordinatorConfig): AsyncResult<void>
  
  // 동기화 작업
  syncSpecToRuntime(changeId: Identifier, options?: SyncOptions): AsyncResult<SyncResult>
  syncRuntimeToSpec(changeId: Identifier, options?: SyncOptions): AsyncResult<SyncResult>
  bidirectionalSync(changeId: Identifier, options?: SyncOptions): AsyncResult<SyncResult>
  
  // 충돌 관리
  detectConflicts(changeId: Identifier): AsyncResult<Conflict[]>
  resolveConflicts(conflicts: Conflict[], strategy: ConflictResolutionStrategy): AsyncResult<ConflictResolution[]>
  
  // 상태 관리
  validateConsistency(changeId: Identifier): AsyncResult<ConsistencyReport>
  createRollbackPoint(changeId: Identifier, description?: string): AsyncResult<RollbackPoint>
  rollbackToPoint(changeId: Identifier, rollbackPointId: Identifier): AsyncResult<void>
  
  // 모니터링
  getSyncStatus(changeId: Identifier): AsyncResult<SyncStatus>
  getSyncHistory(changeId: Identifier, filter?: HistoryFilter): AsyncResult<SyncHistory[]>
  getMetrics(): SyncMetrics
}

interface SyncCoordinatorConfig {
  // 동기화 설정
  syncInterval: number
  maxRetries: number
  retryDelay: number
  
  // 충돌 해결 설정
  defaultResolutionStrategy: ConflictResolutionStrategy
  autoResolveThreshold: number
  
  // 성능 설정
  batchSize: number
  maxConcurrency: number
  timeout: number
  
  // 의존성 주입
  eventBus: EventBus
  stateManager: StateManager
  conflictResolver: ConflictResolver
  changeLogManager: ChangeLogManager
  recoveryManager: RecoveryManager
}

interface ConsistencyReport {
  changeId: Identifier
  isConsistent: boolean
  checkedAt: Timestamp
  inconsistencies: Inconsistency[]
  specState: StateSnapshot
  runtimeState: StateSnapshot
  recommendations: string[]
}

interface Inconsistency {
  id: Identifier
  type: InconsistencyType
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  resourcePath: string
  expectedValue: unknown
  actualValue: unknown
  suggestedAction: string
  autoFixable: boolean
}

enum InconsistencyType {
  MISSING_RESOURCE = 'missing_resource',
  EXTRA_RESOURCE = 'extra_resource',
  VALUE_MISMATCH = 'value_mismatch',
  TYPE_MISMATCH = 'type_mismatch',
  VERSION_MISMATCH = 'version_mismatch',
  DEPENDENCY_BROKEN = 'dependency_broken'
}

interface RollbackPoint {
  id: Identifier
  changeId: Identifier
  timestamp: Timestamp
  description: string
  snapshot: string // JSON 직렬화된 상태 스냅샷
  metadata?: Record<string, unknown>
  isActive: boolean
  isExpired: boolean
  expiresAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

interface SyncHistory {
  id: Identifier
  changeId: Identifier
  syncType: SyncDirection
  status: SyncStatus
  startTime: Timestamp
  endTime?: Timestamp
  duration?: number
  result?: SyncResult
  error?: string
  metadata?: Record<string, unknown>
}

interface SyncMetrics {
  totalSyncs: number
  successfulSyncs: number
  failedSyncs: number
  averageSyncTime: number
  conflictsDetected: number
  conflictsResolved: number
  averageResolutionTime: number
}
```

## 복구 시스템

### 1. 복구 관리자

```typescript
interface RecoveryManager {
  // 초기화
  initialize(config: RecoveryManagerConfig): AsyncResult<void>
  
  // 복구 작업
  handleFailure(operation: SyncOperation, error: Error): AsyncResult<void>
  attemptRecovery(operation: SyncOperation): AsyncResult<RecoveryResult>
  
  // 롤백 관리
  createRollbackPoint(description?: string): AsyncResult<RollbackPoint>
  rollbackToPoint(rollbackPointId: Identifier): AsyncResult<boolean>
  
  // 모니터링
  getRecoveryStatus(operationId: Identifier): AsyncResult<RecoveryStatus>
  getRecoveryHistory(filter?: RecoveryFilter): AsyncResult<RecoveryHistory[]>
  getMetrics(): RecoveryMetrics
}

interface RecoveryManagerConfig {
  // 재시도 설정
  maxRetries: number
  initialRetryDelay: number
  maxRetryDelay: number
  backoffMultiplier: number
  
  // 백업 설정
  autoBackup: boolean
  backupRetentionDays: number
  maxBackupSize: number
  backupInterval: number
  
  // 모니터링 설정
  healthCheckInterval: number
  failureThreshold: number
  alertThreshold: number
  
  // 복구 설정
  enableAutoRecovery: boolean
  requireConfirmationForCritical: boolean
  fallbackStrategies: string[]
}

interface RecoveryResult {
  success: boolean
  action: RecoveryAction
  duration: number
  message?: string
  nextAction?: RecoveryAction
  error?: Error
  metadata?: Record<string, unknown>
}

enum RecoveryAction {
  RETRY = 'retry',
  BACKOFF_RETRY = 'backoff_retry',
  FALLBACK_STRATEGY = 'fallback_strategy',
  RESTORE_FROM_BACKUP = 'restore_from_backup',
  RESET_AND_RESYNC = 'reset_and_resync',
  MANUAL_INTERVENTION = 'manual_intervention',
  SKIP_AND_CONTINUE = 'skip_and_continue'
}

interface RecoveryStatus {
  operationId: Identifier
  status: RecoveryStatus
  currentAction?: RecoveryAction
  retryCount: number
  maxRetries: number
  nextRetryAt?: Timestamp
  estimatedCompletionAt?: Timestamp
  error?: string
}

enum RecoveryStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

interface RecoveryHistory {
  id: Identifier
  operationId: Identifier
  status: RecoveryStatus
  action: RecoveryAction
  startTime: Timestamp
  endTime?: Timestamp
  duration?: number
  result?: RecoveryResult
  error?: string
  metadata?: Record<string, unknown>
}

interface RecoveryFilter {
  operationId?: Identifier
  status?: RecoveryStatus
  action?: RecoveryAction
  timeRange?: { start: Timestamp; end: Timestamp }
  limit?: number
}

interface RecoveryMetrics {
  totalOperations: number
  failedOperations: number
  recoveredOperations: number
  manualInterventions: number
  averageRecoveryTime: number
  successRate: number
  failureTypes: Record<string, number>
  recoveryActions: Record<RecoveryAction, number>
  lastUpdated: Timestamp
}
```

## 이벤트 버스

### 1. 이벤트 버스

```typescript
interface EventBus {
  // 초기화
  initialize(config: EventBusConfig): AsyncResult<void>
  
  // 이벤트 발행
  publish<T extends DomainEvent>(event: T): AsyncResult<void>
  publishBatch<T extends DomainEvent>(events: T[]): AsyncResult<void>
  
  // 이벤트 구독
  subscribe<T extends DomainEvent>(
    eventType: EventType,
    handler: EventHandler<T>
  ): UnsubscribeFunction
  
  // 이벤트 스트림
  getEventStream(filter?: EventFilter): AsyncIterable<DomainEvent>
  replayEvents(fromTimestamp: Timestamp, filter?: EventFilter): AsyncIterable<DomainEvent>
  
  // 관리
  getSubscriptions(): SubscriptionInfo[]
  getMetrics(): EventBusMetrics
  close(): AsyncResult<void>
}

type EventHandler<T extends DomainEvent> = (event: T) => Promise<void> | void

type UnsubscribeFunction = () => void

interface EventBusConfig {
  // 저장소 설정
  eventStore: EventStore
  
  // 성능 설정
  maxConcurrency: number
  batchSize: number
  flushInterval: number
  
  // 신뢰성 설정
  enablePersistence: boolean
  enableOrdering: boolean
  enableDeduplication: boolean
  
  // 모니터링
  enableMetrics: boolean
  metricsInterval: number
}

interface SubscriptionInfo {
  id: Identifier
  eventType: EventType
  handlerId: Identifier
  createdAt: Timestamp
  lastProcessed?: Timestamp
  processedCount: number
  errorCount: number
}

interface EventBusMetrics {
  totalEvents: number
  totalSubscriptions: number
  eventsPerSecond: number
  averageProcessingTime: number
  errorRate: number
  queueSize: number
}
```

## 결론

이 핵심 인터페이스 및 타입 정의는 ZyFlow 단일 진실 원천 아키텍처의 모든 컴포넌트가 일관된 방식으로 상호작용할 수 있는 기반을 제공합니다. 이 정의들을 통해:

1. **타입 안전성**: TypeScript의 완전한 타입 지원을 활용한 컴파일 타임 검사
2. **인터페이스 일관성**: 모든 컴포넌트가 표준화된 인터페이스를 구현
3. **확장성**: 잘 정의된 인터페이스를 통한 쉬운 기능 확장
4. **테스트 용이성**: 명확한 계약을 통한 단위 테스트 작성 용이

이러한 인터페이스와 타입 정의는 ZyFlow 시스템의 안정성과 유지보수성을 크게 향상시킬 것입니다.