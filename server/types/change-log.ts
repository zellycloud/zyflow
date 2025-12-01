/**
 * ZyFlow 변경 로그 및 리플레이 시스템 타입 정의
 * 
 * 모든 동기화 이벤트의 기록, 저장, 조회 및 리플레이를 위한 타입 정의
 */

// =============================================
// 기본 이벤트 타입 정의
// =============================================

/**
 * 이벤트 유형 열거형
 * - FILE_CHANGE: 파일 시스템 변경 이벤트
 * - DB_CHANGE: 데이터베이스 변경 이벤트
 * - SYNC_OPERATION: 동기화 작업 이벤트
 * - CONFLICT_DETECTED: 충돌 감지 이벤트
 * - CONFLICT_RESOLVED: 충돌 해결 이벤트
 * - RECOVERY_STARTED: 복구 시작 이벤트
 * - RECOVERY_COMPLETED: 복구 완료 이벤트
 * - BACKUP_CREATED: 백업 생성 이벤트
 * - BACKUP_RESTORED: 백업 복원 이벤트
 * - SYSTEM_EVENT: 시스템 관련 이벤트
 */
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

/**
 * 이벤트 심각도 수준
 */
export type EventSeverity = 
  | 'DEBUG'    // 디버깅 정보
  | 'INFO'     // 일반 정보
  | 'WARNING'  // 경고
  | 'ERROR'    // 오류
  | 'CRITICAL'; // 치명적 오류

/**
 * 이벤트 소스 유형
 */
export type EventSource = 
  | 'FILE_WATCHER'    // 파일 감시자
  | 'SYNC_MANAGER'    // 동기화 관리자
  | 'RECOVERY_MANAGER' // 복구 관리자
  | 'BACKUP_MANAGER'  // 백업 관리자
  | 'MCP_SERVER'      // MCP 서버
  | 'USER_ACTION'     // 사용자 액션
  | 'SYSTEM';         // 시스템

/**
 * 파일 변경 이벤트 데이터
 */
export interface FileChangeEventData {
  filePath: string;
  changeType: 'CREATED' | 'MODIFIED' | 'DELETED' | 'RENAMED';
  oldPath?: string; // RENAME 시에만 사용
  fileSize?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 데이터베이스 변경 이벤트 데이터
 */
export interface DBChangeEventData {
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'BATCH';
  recordId?: string | number;
  recordIds?: (string | number)[]; // BATCH 작업 시
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changes?: Record<string, { old: unknown; new: unknown }>;
  transactionId?: string;
}

/**
 * 동기화 작업 이벤트 데이터
 */
export interface SyncOperationEventData {
  operationType: 'LOCAL_TO_REMOTE' | 'REMOTE_TO_LOCAL' | 'BIDIRECTIONAL';
  tableName: string;
  recordId?: string | number;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  result?: {
    recordsProcessed: number;
    recordsSucceeded: number;
    recordsFailed: number;
    duration: number;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * 충돌 관련 이벤트 데이터
 */
export interface ConflictEventData {
  conflictId: string;
  tableName: string;
  recordId: string | number;
  conflictType: 'DATA_CONFLICT' | 'SCHEMA_CONFLICT' | 'VERSION_CONFLICT';
  localValues: Record<string, unknown>;
  remoteValues: Record<string, unknown>;
  resolutionStrategy?: 'LOCAL_WINS' | 'REMOTE_WINS' | 'MERGE' | 'MANUAL';
  resolvedValues?: Record<string, unknown>;
  resolutionTime?: number;
}

/**
 * 복구 관련 이벤트 데이터
 */
export interface RecoveryEventData {
  recoveryId: string;
  operationId?: string;
  failureType: string;
  recoveryAction: string;
  strategy: string;
  result: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  duration: number;
  rollbackPoint?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 백업 관련 이벤트 데이터
 */
export interface BackupEventData {
  backupId: string;
  backupType: 'FULL' | 'INCREMENTAL' | 'SCHEMA_ONLY';
  tables: string[];
  size: number;
  location: string;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  restorePoint?: string;
}

/**
 * 시스템 이벤트 데이터
 */
export interface SystemEventData {
  component: string;
  action: string;
  details: Record<string, unknown>;
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkStatus?: string;
  };
}

// =============================================
// 핵심 이벤트 인터페이스
// =============================================

/**
 * 기본 이벤트 인터페이스
 */
export interface ChangeEvent {
  id: string;                    // 고유 이벤트 ID
  type: EventType;              // 이벤트 유형
  severity: EventSeverity;       // 심각도
  source: EventSource;           // 이벤트 소스
  timestamp: number;             // 타임스탬프 (Unix timestamp)
  projectId?: string;            // 프로젝트 ID (멀티 프로젝트 지원)
  changeId?: string;             // 변경 ID (OpenSpec 변경과 연동)
  correlationId?: string;         // 상관관계 ID (연관된 이벤트 그룹화)
  sessionId?: string;            // 세션 ID (사용자 세션 추적)
  userId?: string;               // 사용자 ID (사용자 액션 추적)
  
  // 이벤트별 데이터 (타입별로 다른 데이터 구조)
  data: 
    | FileChangeEventData
    | DBChangeEventData
    | SyncOperationEventData
    | ConflictEventData
    | RecoveryEventData
    | BackupEventData
    | SystemEventData;
  
  // 메타데이터
  metadata: {
    version: string;             // 이벤트 스키마 버전
    tags?: string[];             // 태그 (필터링용)
    parentEventId?: string;      // 부모 이벤트 ID (계층 구조)
    childEventIds?: string[];    // 자식 이벤트 ID 목록
    stackTrace?: string;         // 스택 트레이스 (오류 이벤트)
    userAgent?: string;          // 사용자 에이전트
    ipAddress?: string;          // IP 주소
    [key: string]: unknown;      // 확장 가능한 메타데이터
  };
  
  // 처리 상태
  processing: {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    processedAt?: number;
    error?: string;
    retryCount: number;
    maxRetries: number;
  };
}

// =============================================
// 이벤트 저장 및 조회 관련 타입
// =============================================

/**
 * 이벤트 저장소 설정
 */
export interface EventStoreConfig {
  // 저장소 유형
  storageType: 'SQLITE' | 'FILE' | 'HYBRID';
  
  // SQLite 설정
  sqlite?: {
    dbPath: string;
    tableName: string;
    maxConnections: number;
  };
  
  // 파일 저장 설정
  file?: {
    logDirectory: string;
    maxFileSize: number;        // 바이트
    maxFiles: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
    encryptionKey?: string;
  };
  
  // 보관 정책
  retention: {
    defaultRetentionDays: number;
    bySeverity: Record<EventSeverity, number>;
    byEventType: Record<EventType, number>;
    maxTotalEvents: number;
    cleanupIntervalHours: number;
  };
  
  // 압축 설정
  compression: {
    enabled: boolean;
    algorithm: 'GZIP' | 'LZ4' | 'BROTLI';
    threshold: number;          // 압축할 최소 크기
  };
  
  // 인덱싱 설정
  indexing: {
    enabled: boolean;
    fields: string[];            // 인덱싱할 필드 목록
    refreshInterval: number;     // 인덱스 새로고침 간격 (초)
  };
}

/**
 * 이벤트 필터 옵션
 */
export interface EventFilter {
  // 기본 필터
  eventTypes?: EventType[];
  severities?: EventSeverity[];
  sources?: EventSource[];
  projectIds?: string[];
  changeIds?: string[];
  userIds?: string[];
  sessionIds?: string[];
  correlationIds?: string[];
  
  // 시간 범위 필터
  timeRange?: {
    start: number;
    end: number;
  };
  
  // 데이터 기반 필터
  dataFilters?: Array<{
    field: string;
    operator: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'CONTAINS';
    value: unknown;
  }>;
  
  // 메타데이터 필터
  metadataFilters?: Array<{
    field: string;
    operator: 'EQ' | 'NE' | 'IN' | 'CONTAINS';
    value: unknown;
  }>;
  
  // 태그 필터
  tags?: {
    include?: string[];
    exclude?: string[];
  };
  
  // 페이징
  pagination?: {
    offset: number;
    limit: number;
  };
  
  // 정렬
  sortBy?: {
    field: string;
    direction: 'ASC' | 'DESC';
  };
}

/**
 * 이벤트 통계 정보
 */
export interface EventStatistics {
  totalEvents: number;
  eventsByType: Record<EventType, number>;
  eventsBySeverity: Record<EventSeverity, number>;
  eventsBySource: Record<EventSource, number>;
  eventsByProject: Record<string, number>;
  timeRange: {
    earliest: number;
    latest: number;
  };
  storageSize: number;
  averageEventsPerDay: number;
  errorRate: number;
  topErrorTypes: Array<{
    type: string;
    count: number;
  }>;
}

// =============================================
// 리플레이 시스템 관련 타입
// =============================================

/**
 * 리플레이 모드
 */
export type ReplayMode = 
  | 'SAFE'      // 안전 모드: 검증만 수행, 실제 변경 없음
  | 'FAST'      // 빠른 모드: 검증 최소화, 최대 속도
  | 'VERBOSE'   // 상세 모드: 모든 단계 로깅
  | 'DRY_RUN';  // 시뮬레이션 모드: 실제 실행 없이 예측만

/**
 * 리플레이 전략
 */
export type ReplayStrategy = 
  | 'SEQUENTIAL'    // 순차적 재생
  | 'PARALLEL'      // 병렬 재생 (독립적 이벤트)
  | 'DEPENDENCY_AWARE' // 의존성 인식 재생
  | 'SELECTIVE';    // 선택적 재생

/**
 * 리플레이 옵션
 */
export interface ReplayOptions {
  mode: ReplayMode;
  strategy: ReplayStrategy;
  maxConcurrency?: number;      // 병렬 재생 시 최대 동시성
  stopOnError?: boolean;        // 오류 발생 시 중지 여부
  skipEvents?: string[];        // 건너뛸 이벤트 ID 목록
  includeEvents?: string[];     // 포함할 이벤트 ID 목록
  speedMultiplier?: number;     // 재생 속도 배수 (1.0 = 정속)
  enableValidation?: boolean;    // 유효성 검사 활성화
  enableRollback?: boolean;      // 롤백 기능 활성화
  checkpointInterval?: number;   // 체크포인트 간격 (이벤트 수)
}

/**
 * 리플레이 결과
 */
export interface ReplayResult {
  id: string;                    // 리플레이 세션 ID
  startTime: number;
  endTime: number;
  duration: number;
  
  // 처리된 이벤트 통계
  events: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  
  // 상세 결과
  results: Array<{
    eventId: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    duration: number;
    error?: string;
    warnings?: string[];
  }>;
  
  // 성능 메트릭
  performance: {
    averageEventProcessingTime: number;
    throughput: number;         // 이벤트/초
    memoryUsage: number;        // MB
    diskUsage: number;          // MB
  };
  
  // 롤백 정보
  rollback?: {
    enabled: boolean;
    checkpoints: string[];
    canRollback: boolean;
  };
  
  // 검증 결과
  validation?: {
    dataIntegrityPassed: boolean;
    consistencyPassed: boolean;
    issues: Array<{
      type: string;
      description: string;
      severity: 'WARNING' | 'ERROR';
    }>;
  };
}

/**
 * 리플레이 세션
 */
export interface ReplaySession {
  id: string;
  name?: string;
  description?: string;
  filter: EventFilter;
  options: ReplayOptions;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: ReplayResult;
  metadata?: Record<string, unknown>;
  
  // 진행 정보
  totalEvents: number;
  processedEvents: number;
  succeededEvents: number;
  failedEvents: number;
  skippedEvents: number;
  duration?: number;
}

// =============================================
// 이벤트 저장소 인터페이스
// =============================================

/**
 * 이벤트 저장소 인터페이스
 */
export interface EventStore {
  // 초기화
  initialize(config: EventStoreConfig): Promise<void>;
  
  // 이벤트 저장
  storeEvent(event: ChangeEvent): Promise<void>;
  storeEvents(events: ChangeEvent[]): Promise<void>;
  
  // 이벤트 조회
  getEvent(id: string): Promise<ChangeEvent | null>;
  getEvents(filter: EventFilter): Promise<ChangeEvent[]>;
  getEventCount(filter?: EventFilter): Promise<number>;
  
  // 이벤트 스트림
  getEventStream(filter: EventFilter): AsyncIterable<ChangeEvent>;
  
  // 통계 및 분석
  getStatistics(filter?: EventFilter): Promise<EventStatistics>;
  getAggregatedData(
    groupBy: string[],
    filter?: EventFilter
  ): Promise<Record<string, unknown>[]>;
  
  // 유지보수
  compact(): Promise<void>;           // 이벤트 압축
  cleanup(): Promise<number>;         // 만료된 이벤트 정리, 삭제된 개수 반환
  reindex(): Promise<void>;           // 인덱스 재구축
  verify(): Promise<boolean>;         // 데이터 무결성 검증
  
  // 백업 및 복원
  backup(location: string): Promise<void>;
  restore(location: string): Promise<void>;
  
  // 상태 정보
  getSize(): Promise<number>;         // 저장소 크기 (바이트)
  getHealth(): Promise<{
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
    issues: string[];
    metrics: Record<string, number>;
  }>;
  
  // 정리
  close(): Promise<void>;
}

// =============================================
// 변경 로그 관리자 인터페이스
// =============================================

/**
 * 변경 로그 관리자 인터페이스
 */
export interface ChangeLogManager {
  // 초기화
  initialize(config: EventStoreConfig): Promise<void>;
  
  // 이벤트 기록
  logEvent(event: Omit<ChangeEvent, 'id' | 'timestamp' | 'processing'>): Promise<string>;
  logEvents(events: Array<Omit<ChangeEvent, 'id' | 'timestamp' | 'processing'>>): Promise<string[]>;
  
  // 편의 메서드
  logFileChange(data: FileChangeEventData, severity?: EventSeverity): Promise<string>;
  logDBChange(data: DBChangeEventData, severity?: EventSeverity): Promise<string>;
  logSyncOperation(data: SyncOperationEventData, severity?: EventSeverity): Promise<string>;
  logConflict(data: ConflictEventData, severity?: EventSeverity): Promise<string>;
  logRecovery(data: RecoveryEventData, severity?: EventSeverity): Promise<string>;
  logBackup(data: BackupEventData, severity?: EventSeverity): Promise<string>;
  logSystemEvent(data: SystemEventData, severity?: EventSeverity): Promise<string>;
  
  // 이벤트 조회
  getEvent(id: string): Promise<ChangeEvent | null>;
  getEvents(filter: EventFilter): Promise<ChangeEvent[]>;
  searchEvents(query: string, filter?: EventFilter): Promise<ChangeEvent[]>;
  
  // 분석 및 통계
  getStatistics(filter?: EventFilter): Promise<EventStatistics>;
  getTimeline(filter?: EventFilter): Promise<Array<{
    timestamp: number;
    count: number;
    types: Record<EventType, number>;
  }>>;
  
  // 관리
  cleanup(): Promise<number>;
  compact(): Promise<void>;
  exportData(filter: EventFilter, format: 'JSON' | 'CSV' | 'SQL'): Promise<string>;
  
  // 상태
  getStatus(): Promise<{
    isInitialized: boolean;
    eventCount: number;
    storageSize: number;
    lastEventTime: number;
  }>;
  
  // 정리
  close(): Promise<void>;
}

/**
 * 롤백 포인트 인터페이스
 */
export interface RollbackPoint {
  id: string;
  sessionId: string;
  timestamp: number;
  description: string;
  snapshot: string; // JSON 형식의 시스템 상태 스냅샷
  metadata?: string; // JSON 형식의 추가 메타데이터
  isActive: boolean;
  isExpired: boolean;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

// =============================================
// 리플레이 엔진 인터페이스
// =============================================

/**
 * 리플레이 엔진 인터페이스
 */
export interface ReplayEngine {
  // 초기화
  initialize(eventStore: EventStore): Promise<void>;
  
  // 리플레이 세션 관리
  createSession(
    name: string,
    filter: EventFilter,
    options: ReplayOptions,
    description?: string
  ): Promise<string>;
  
  getSession(sessionId: string): Promise<ReplaySession | null>;
  getSessions(filter?: Partial<ReplaySession>): Promise<ReplaySession[]>;
  
  // 리플레이 실행
  startReplay(sessionId: string): Promise<void>;
  pauseReplay(sessionId: string): Promise<void>;
  resumeReplay(sessionId: string): Promise<void>;
  cancelReplay(sessionId: string): Promise<void>;
  
  // 실시간 모니터링
  getReplayProgress(sessionId: string): Promise<{
    totalEvents: number;
    processedEvents: number;
    currentEvent?: string;
    estimatedTimeRemaining: number;
    errors: Array<{
      eventId: string;
      error: string;
      timestamp: number;
    }>;
  }>;
  
  // 롤백 기능
  createRollbackPoint(sessionId: string, description?: string): Promise<string>;
  rollbackToPoint(sessionId: string, rollbackPointId: string): Promise<void>;
  
  // 검증
  validateReplay(sessionId: string): Promise<{
    isValid: boolean;
    issues: Array<{
      type: string;
      description: string;
      severity: 'WARNING' | 'ERROR';
    }>;
  }>;
  
  // 정리
  close(): Promise<void>;
}