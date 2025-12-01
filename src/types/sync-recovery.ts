/**
 * ZyFlow 동기화 복구 시스템 타입 정의
 * 
 * 동기화 실패 감지, 분류, 복구 전략 및 백업/롤백 시스템을 위한 타입 정의
 */

// 기본 동기화 작업 타입
export interface SyncOperation {
  id: string;
  type: 'LOCAL_TO_REMOTE' | 'REMOTE_TO_LOCAL' | 'BIDIRECTIONAL';
  tableName: string;
  recordId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'RECOVERING';
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  data?: Record<string, unknown>;
  error?: SyncError;
}

// 동기화 오류 타입
export interface SyncError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
  stack?: string;
  recoverable: boolean;
}

// 실패 유형 분류
export type FailureType = 
  | 'NETWORK_ERROR'           // 네트워크 연결 문제
  | 'TIMEOUT_ERROR'          // 타임아웃 발생
  | 'AUTHENTICATION_ERROR'    // 인증 실패
  | 'PERMISSION_ERROR'       // 권한 부족
  | 'DATA_CORRUPTION'        // 데이터 손상
  | 'SCHEMA_MISMATCH'        // 스키마 불일치
  | 'CONFLICT_ERROR'         // 데이터 충돌
  | 'RESOURCE_EXHAUSTION'    // 리소스 고갈
  | 'UNKNOWN_ERROR';         // 알 수 없는 오류

// 실패 심각도 수준
export type FailureSeverity = 
  | 'LOW'      // 일시적 오류, 자동 복구 가능
  | 'MEDIUM'   // 사용자 개입 필요 가능성
  | 'HIGH'     // 즉시 조치 필요
  | 'CRITICAL'; // 시스템 전체 영향

// 실패 분류 결과
export interface FailureClassification {
  operationId: string;
  failureType: FailureType;
  severity: FailureSeverity;
  recoverable: boolean;
  recommendedAction: RecoveryAction;
  estimatedRecoveryTime: number; // 밀리초
  context: Record<string, unknown>;
}

// 복구 액션 타입
export type RecoveryAction = 
  | 'RETRY'                    // 재시도
  | 'BACKOFF_RETRY'            // 지수 백오프 재시도
  | 'FALLBACK_STRATEGY'        // 대체 전략 사용
  | 'RESTORE_FROM_BACKUP'      // 백업에서 복원
  | 'RESET_AND_RESYNC'         // 재초기화 및 재동기화
  | 'MANUAL_INTERVENTION'      // 수동 개입 필요
  | 'ESCALATE'                 // 상위 시스템에 에스컬레이션
  | 'SKIP_AND_CONTINUE';       // 건너뛰고 계속

// 복구 전략 인터페이스
export interface RecoveryStrategy {
  name: string;
  description: string;
  applicableFailureTypes: FailureType[];
  execute: (context: RecoveryContext) => Promise<RecoveryResult>;
  maxAttempts: number;
  backoffMultiplier?: number;
  priority: number; // 낮을수록 높은 우선순위
}

// 복구 컨텍스트
export interface RecoveryContext {
  operation: SyncOperation;
  classification: FailureClassification;
  previousAttempts: number;
  backupInfo?: BackupInfo;
  systemState: SystemState;
}

// 복구 결과
export interface RecoveryResult {
  success: boolean;
  action: RecoveryAction;
  duration: number; // 밀리초
  message?: string;
  nextAction?: RecoveryAction;
  error?: SyncError;
  metadata?: Record<string, unknown>;
}

// 백업 정보
export interface BackupInfo {
  id: string;
  timestamp: number;
  type: 'FULL' | 'INCREMENTAL' | 'SCHEMA_ONLY';
  size: number; // 바이트
  location: string;
  checksum: string;
  tables: string[];
  compressed: boolean;
  encrypted: boolean;
}

// 시스템 상태
export interface SystemState {
  networkStatus: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  diskSpace: number; // 사용 가능한 디스크 공간 (바이트)
  memoryUsage: number; // 메모리 사용률 (0-1)
  cpuUsage: number; // CPU 사용률 (0-1)
  activeConnections: number;
  queueSize: number;
  lastHealthCheck: number;
}

// 복구 매니저 설정
export interface SyncRecoveryConfig {
  // 재시도 설정
  maxRetries: number;
  initialRetryDelay: number; // 밀리초
  maxRetryDelay: number; // 밀리초
  backoffMultiplier: number;
  
  // 백업 설정
  autoBackup: boolean;
  backupRetentionDays: number;
  maxBackupSize: number; // 바이트
  backupInterval: number; // 밀리초
  
  // 모니터링 설정
  healthCheckInterval: number; // 밀리초
  failureThreshold: number; // 연속 실패 허용 한계
  alertThreshold: number; // 알림 발생 기준
  
  // 복구 전략 설정
  enableAutoRecovery: boolean;
  requireConfirmationForCritical: boolean;
  fallbackStrategies: string[];
  
  // 로깅 설정
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  logRetentionDays: number;
}

// 복구 이벤트
export interface RecoveryEvent {
  id: string;
  type: 'FAILURE_DETECTED' | 'RECOVERY_STARTED' | 'RECOVERY_COMPLETED' | 'RECOVERY_FAILED' | 'BACKUP_CREATED';
  timestamp: number;
  operationId?: string;
  action?: RecoveryAction;
  result?: RecoveryResult;
  error?: SyncError;
  metadata?: Record<string, unknown>;
}

// 롤백 포인트
export interface RollbackPoint {
  id: string;
  timestamp: number;
  description: string;
  backupId: string;
  operations: string[]; // 롤백 대상 작업 ID 목록
  created: number;
  expires?: number; // 만료 시간
}

// 복구 통계
export interface RecoveryStats {
  totalOperations: number;
  failedOperations: number;
  recoveredOperations: number;
  manualInterventions: number;
  averageRecoveryTime: number;
  successRate: number;
  failureTypes: Record<FailureType, number>;
  recoveryActions: Record<RecoveryAction, number>;
  lastUpdated: number;
}

// 충돌 해결 정책
export interface ConflictResolutionPolicy {
  tableName: string;
  strategy: 'LOCAL_WINS' | 'REMOTE_WINS' | 'LAST_WRITE_WINS' | 'MERGE' | 'MANUAL';
  priority: number;
  conditions?: Record<string, unknown>;
}

// 동기화 상태 보고서
export interface SyncStatusReport {
  timestamp: number;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  activeOperations: number;
  queuedOperations: number;
  failedOperations: number;
  recoveringOperations: number;
  lastSuccessfulSync: number;
  averageSyncTime: number;
  systemState: SystemState;
  recentFailures: FailureClassification[];
  recommendations: string[];
}

// 복구 관찰자 인터페이스
export interface RecoveryObserver {
  onFailureDetected: (classification: FailureClassification) => void;
  onRecoveryStarted: (context: RecoveryContext) => void;
  onRecoveryCompleted: (result: RecoveryResult) => void;
  onBackupCreated: (backup: BackupInfo) => void;
  onRollbackPointCreated: (point: RollbackPoint) => void;
}

// 복구 전략 팩토리
export interface RecoveryStrategyFactory {
  createStrategy: (failureType: FailureType, context: RecoveryContext) => RecoveryStrategy;
  registerCustomStrategy: (name: string, strategy: RecoveryStrategy) => void;
  getAvailableStrategies: () => RecoveryStrategy[];
}

// 백업 관리자 인터페이스
export interface BackupManager {
  initialize?: () => Promise<void>; // 초기화 메서드 (선택적)
  createBackup: (type: BackupInfo['type'], tables?: string[]) => Promise<BackupInfo>;
  restoreFromBackup: (backupId: string, tables?: string[]) => Promise<boolean>;
  listBackups: (filter?: { type?: BackupInfo['type']; after?: number }) => Promise<BackupInfo[]>;
  deleteBackup: (backupId: string) => Promise<boolean>;
  verifyBackup: (backupId: string) => Promise<boolean>;
  cleanup: () => Promise<number>; // 만료된 백업 정리, 삭제된 개수 반환
}

// 이벤트 버스 인터페이스
export interface RecoveryEventBus {
  publish: (event: RecoveryEvent) => void;
  subscribe: (eventType: RecoveryEvent['type'], handler: (event: RecoveryEvent) => void) => () => void;
  unsubscribe: (eventType: RecoveryEvent['type'], handler: (event: RecoveryEvent) => void) => void;
  getHistory: (filter?: { since?: number; operationId?: string }) => RecoveryEvent[];
}