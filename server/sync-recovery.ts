/**
 * ZyFlow 동기화 복구 매니저
 * 
 * 동기화 실패 감지, 분류, 자동 복구 및 백업/롤백 시스템의 핵심 구현
 */

import type { 
  SyncOperation, 
  SyncError, 
  FailureType, 
  FailureSeverity, 
  FailureClassification,
  RecoveryAction,
  RecoveryStrategy,
  RecoveryContext,
  RecoveryResult,
  BackupInfo,
  SystemState,
  SyncRecoveryConfig,
  RecoveryEvent,
  RollbackPoint,
  RecoveryStats,
  SyncStatusReport,
  RecoveryObserver,
  RecoveryStrategyFactory,
  BackupManager,
  RecoveryEventBus
} from '../src/types/sync-recovery.js';
import {
  ConflictResolutionPolicy
} from '../src/types/sync-recovery.js';
import { getChangeLogManager } from './change-log.js';

/**
 * SyncRecoveryManager - 동기화 실패 자동 복구 시스템
 */
export class SyncRecoveryManager {
  private config: SyncRecoveryConfig;
  private observers: RecoveryObserver[] = [];
  private eventHistory: RecoveryEvent[] = [];
  private stats: RecoveryStats;
  private isInitialized = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private backupInterval?: NodeJS.Timeout;
  private activeRecoveries = new Map<string, Promise<RecoveryResult>>();
  private rollbackPoints = new Map<string, RollbackPoint>();
  
  // 의존성 주입
  private strategyFactory: RecoveryStrategyFactory;
  private backupManager: BackupManager;
  private eventBus: RecoveryEventBus;

  constructor(
    config: Partial<SyncRecoveryConfig> = {},
    strategyFactory?: RecoveryStrategyFactory,
    backupManager?: BackupManager,
    eventBus?: RecoveryEventBus
  ) {
    // 기본 설정과 사용자 설정 병합
    this.config = {
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 30000,
      backoffMultiplier: 2,
      autoBackup: true,
      backupRetentionDays: 30,
      maxBackupSize: 100 * 1024 * 1024, // 100MB
      backupInterval: 24 * 60 * 60 * 1000, // 24시간
      healthCheckInterval: 5 * 60 * 1000, // 5분
      failureThreshold: 3,
      alertThreshold: 5,
      enableAutoRecovery: true,
      requireConfirmationForCritical: true,
      fallbackStrategies: ['RETRY', 'BACKOFF_RETRY', 'FALLBACK_STRATEGY'],
      logLevel: 'INFO',
      logRetentionDays: 7,
      ...config
    };

    // 초기 통계 설정
    this.stats = {
      totalOperations: 0,
      failedOperations: 0,
      recoveredOperations: 0,
      manualInterventions: 0,
      averageRecoveryTime: 0,
      successRate: 0,
      failureTypes: {} as Record<FailureType, number>,
      recoveryActions: {} as Record<RecoveryAction, number>,
      lastUpdated: Date.now()
    };

    // 의존성 설정
    this.strategyFactory = strategyFactory || this.createDefaultStrategyFactory();
    this.backupManager = backupManager || this.createDefaultBackupManager();
    this.eventBus = eventBus || this.createDefaultEventBus();
  }

  /**
   * 복구 매니저 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.publishEvent({
      id: this.generateId(),
      type: 'RECOVERY_STARTED',
      timestamp: Date.now(),
      metadata: { phase: 'INITIALIZATION' }
    });

    try {
      // 백업 관리자 초기화
      await this.backupManager.initialize?.();
      
      // 정기 백업 스케줄러 시작
      if (this.config.autoBackup) {
        this.startBackupScheduler();
      }
      
      // 정기 헬스체크 시작
      this.startHealthCheckScheduler();
      
      // 이벤트 버스 구독
      this.setupEventSubscriptions();
      
      // 이전 롤백 포인트 복원
      await this.restoreRollbackPoints();
      
      // 만료된 백업 정리
      await this.cleanupExpiredBackups();

      this.isInitialized = true;
      
      this.publishEvent({
        id: this.generateId(),
        type: 'RECOVERY_COMPLETED',
        timestamp: Date.now(),
        metadata: { phase: 'INITIALIZATION', success: true }
      });

    } catch (error) {
      this.publishEvent({
        id: this.generateId(),
        type: 'RECOVERY_FAILED',
        timestamp: Date.now(),
        error: {
          code: 'INITIALIZATION_FAILED',
          message: `복구 매니저 초기화 실패: ${(error as Error).message}`,
          timestamp: Date.now(),
          recoverable: true
        }
      });
      
      throw error;
    }
  }

  /**
   * 동기화 실패 처리
   */
  async handleSyncFailure(operation: SyncOperation, error: SyncError): Promise<void> {
    this.stats.totalOperations++;
    this.stats.failedOperations++;
    
    // 실패 분류
    const classification = await this.classifyFailure(operation, error);
    
    // 이벤트 발행
    this.publishEvent({
      id: this.generateId(),
      type: 'FAILURE_DETECTED',
      timestamp: Date.now(),
      operationId: operation.id,
      error,
      metadata: { classification }
    });

    // 변경 로그에 복구 이벤트 기록
    const changeLogManager = getChangeLogManager();
    await changeLogManager.logRecovery({
      recoveryId: this.generateId(),
      operationId: operation.id,
      failureType: classification.failureType,
      recoveryAction: classification.recommendedAction,
      strategy: 'AUTO_DETECTION',
      result: 'PARTIAL',
      duration: 0,
      error: {
        code: error.code,
        message: error.message
      }
    }, 'WARNING');

    // 옵저버 통지
    this.notifyObservers('onFailureDetected', classification);

    // 자동 복구 시도
    if (this.config.enableAutoRecovery && classification.recoverable) {
      await this.attemptRecovery(operation, classification);
    } else if (classification.severity === 'CRITICAL') {
      await this.handleCriticalFailure(operation, classification);
    }
  }

  /**
   * 복구 시도
   */
  async attemptRecovery(operation: SyncOperation, classification: FailureClassification): Promise<RecoveryResult> {
    const operationId = operation.id;
    
    // 이미 진행 중인 복구가 있는지 확인
    if (this.activeRecoveries.has(operationId)) {
      return await this.activeRecoveries.get(operationId)!;
    }

    const recoveryPromise = this.executeRecovery(operation, classification);
    this.activeRecoveries.set(operationId, recoveryPromise);

    try {
      const result = await recoveryPromise;
      
      // 통계 업데이트
      this.updateStats(classification, result);
      
      // 이벤트 발행
      this.publishEvent({
        id: this.generateId(),
        type: result.success ? 'RECOVERY_COMPLETED' : 'RECOVERY_FAILED',
        timestamp: Date.now(),
        operationId,
        action: result.action,
        result,
        error: result.error
      });

      // 변경 로그에 복구 완료/실패 이벤트 기록
      const changeLogManager = getChangeLogManager();
      await changeLogManager.logRecovery({
        recoveryId: this.generateId(),
        operationId: operation.id,
        failureType: classification.failureType,
        recoveryAction: result.action,
        strategy: 'AUTO_RECOVERY',
        result: result.success ? 'SUCCESS' : 'FAILED',
        duration: result.duration,
        rollbackPoint: result.metadata?.rollbackPointId as string,
        error: result.error ? {
          code: result.error.code,
          message: result.error.message
        } : undefined
      }, result.success ? 'INFO' : 'ERROR');

      // 옵저버 통지
      if (result.success) {
        this.notifyObservers('onRecoveryCompleted', result);
      }

      return result;
    } finally {
      this.activeRecoveries.delete(operationId);
    }
  }

  /**
   * 실제 복구 실행
   */
  private async executeRecovery(operation: SyncOperation, classification: FailureClassification): Promise<RecoveryResult> {
    const startTime = Date.now();
    
    // 롤백 포인트 생성
    const rollbackPoint = await this.createRollbackPoint(operation);
    
    // 시스템 상태 확인
    const systemState = await this.getSystemState();
    
    // 복구 컨텍스트 생성
    const context: RecoveryContext = {
      operation,
      classification,
      previousAttempts: operation.retryCount,
      backupInfo: rollbackPoint ? await this.backupManager.listBackups({ after: rollbackPoint.timestamp }).then(b => b[0]) : undefined,
      systemState
    };

    // 옵저버 통지
    this.notifyObservers('onRecoveryStarted', context);

    // 복구 전략 선택
    const strategy = this.strategyFactory.createStrategy(classification.failureType, context);
    
    try {
      // 복구 실행
      const result = await strategy.execute(context);
      
      // 성공 시 롤백 포인트 정리
      if (result.success && rollbackPoint) {
        this.rollbackPoints.delete(rollbackPoint.id);
      }
      
      return {
        ...result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      // 실패 시 롤백
      if (rollbackPoint) {
        await this.rollbackToPoint(rollbackPoint.id);
      }
      
      return {
        success: false,
        action: classification.recommendedAction,
        duration: Date.now() - startTime,
        error: {
          code: 'RECOVERY_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
          recoverable: false
        }
      };
    }
  }

  /**
   * 실패 분류
   */
  private async classifyFailure(operation: SyncOperation, error: SyncError): Promise<FailureClassification> {
    // 오류 메시지와 코드 기반으로 실패 유형 분류
    const failureType = this.determineFailureType(error);
    
    // 심각도 평가
    const severity = this.assessSeverity(failureType, operation);
    
    // 복구 가능성 평가
    const recoverable = this.isRecoverable(failureType, severity, operation);
    
    // 추천 액션 결정
    const recommendedAction = this.getRecommendedAction(failureType, severity, operation.retryCount);
    
    // 예상 복구 시간 계산
    const estimatedRecoveryTime = this.estimateRecoveryTime(failureType, severity);
    
    return {
      operationId: operation.id,
      failureType,
      severity,
      recoverable,
      recommendedAction,
      estimatedRecoveryTime,
      context: {
        operationType: operation.type,
        tableName: operation.tableName,
        retryCount: operation.retryCount,
        errorCode: error.code
      }
    };
  }

  /**
   * 실패 유형 결정
   */
  private determineFailureType(error: SyncError): FailureType {
    const { code, message } = error;
    
    // 네트워크 관련 오류
    if (code.includes('NETWORK') || code.includes('CONNECTION') || 
        message.includes('network') || message.includes('connection')) {
      return 'NETWORK_ERROR';
    }
    
    // 타임아웃 오류
    if (code.includes('TIMEOUT') || message.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    }
    
    // 인증 오류
    if (code.includes('AUTH') || code.includes('UNAUTHORIZED') || 
        message.includes('auth') || message.includes('unauthorized')) {
      return 'AUTHENTICATION_ERROR';
    }
    
    // 권한 오류
    if (code.includes('PERMISSION') || code.includes('FORBIDDEN') || 
        message.includes('permission') || message.includes('forbidden')) {
      return 'PERMISSION_ERROR';
    }
    
    // 데이터 손상
    if (code.includes('CORRUPT') || code.includes('INVALID_DATA') || 
        message.includes('corrupt') || message.includes('invalid data')) {
      return 'DATA_CORRUPTION';
    }
    
    // 스키마 불일치
    if (code.includes('SCHEMA') || code.includes('COLUMN') || 
        message.includes('schema') || message.includes('column')) {
      return 'SCHEMA_MISMATCH';
    }
    
    // 충돌
    if (code.includes('CONFLICT') || message.includes('conflict')) {
      return 'CONFLICT_ERROR';
    }
    
    // 리소스 고갈
    if (code.includes('RESOURCE') || code.includes('MEMORY') || code.includes('DISK') ||
        message.includes('resource') || message.includes('memory') || message.includes('disk')) {
      return 'RESOURCE_EXHAUSTION';
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * 심각도 평가
   */
  private assessSeverity(failureType: FailureType, operation: SyncOperation): FailureSeverity {
    // 실패 유형별 기본 심각도
    const baseSeverity: Record<FailureType, FailureSeverity> = {
      'NETWORK_ERROR': 'MEDIUM',
      'TIMEOUT_ERROR': 'MEDIUM',
      'AUTHENTICATION_ERROR': 'HIGH',
      'PERMISSION_ERROR': 'HIGH',
      'DATA_CORRUPTION': 'CRITICAL',
      'SCHEMA_MISMATCH': 'HIGH',
      'CONFLICT_ERROR': 'MEDIUM',
      'RESOURCE_EXHAUSTION': 'HIGH',
      'UNKNOWN_ERROR': 'MEDIUM'
    };
    
    let severity = baseSeverity[failureType];
    
    // 재시도 횟수에 따른 심각도 조정
    if (operation.retryCount >= this.config.failureThreshold) {
      if (severity === 'LOW') severity = 'MEDIUM';
      else if (severity === 'MEDIUM') severity = 'HIGH';
      else if (severity === 'HIGH') severity = 'CRITICAL';
    }
    
    return severity;
  }

  /**
   * 복구 가능성 평가
   */
  private isRecoverable(failureType: FailureType, severity: FailureSeverity, operation: SyncOperation): boolean {
    // CRITICAL 심각도는 기본적으로 복구 불가
    if (severity === 'CRITICAL') {
      return false;
    }
    
    // 재시도 횟수 초과 시 복구 불가
    if (operation.retryCount >= operation.maxRetries) {
      return false;
    }
    
    // 실패 유형별 복구 가능성
    const recoverableTypes: FailureType[] = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'CONFLICT_ERROR',
      'RESOURCE_EXHAUSTION'
    ];
    
    return recoverableTypes.includes(failureType);
  }

  /**
   * 추천 액션 결정
   */
  private getRecommendedAction(failureType: FailureType, severity: FailureSeverity, retryCount: number): RecoveryAction {
    // CRITICAL은 수동 개입 필요
    if (severity === 'CRITICAL') {
      return 'MANUAL_INTERVENTION';
    }
    
    // 재시도 횟수에 따른 액션 결정
    if (retryCount === 0) {
      return 'RETRY';
    } else if (retryCount < 2) {
      return 'BACKOFF_RETRY';
    } else if (retryCount < 4) {
      return 'FALLBACK_STRATEGY';
    } else {
      // 실패 유형별 특별 액션
      switch (failureType) {
        case 'DATA_CORRUPTION':
        case 'SCHEMA_MISMATCH':
          return 'RESTORE_FROM_BACKUP';
        case 'NETWORK_ERROR':
        case 'TIMEOUT_ERROR':
          return 'RESET_AND_RESYNC';
        default:
          return 'MANUAL_INTERVENTION';
      }
    }
  }

  /**
   * 예상 복구 시간 계산
   */
  private estimateRecoveryTime(failureType: FailureType, severity: FailureSeverity): number {
    const baseTimes: Record<FailureType, number> = {
      'NETWORK_ERROR': 5000,      // 5초
      'TIMEOUT_ERROR': 10000,     // 10초
      'AUTHENTICATION_ERROR': 3000, // 3초
      'PERMISSION_ERROR': 3000,   // 3초
      'DATA_CORRUPTION': 60000,   // 1분
      'SCHEMA_MISMATCH': 30000,   // 30초
      'CONFLICT_ERROR': 15000,    // 15초
      'RESOURCE_EXHAUSTION': 45000, // 45초
      'UNKNOWN_ERROR': 20000      // 20초
    };
    
    const time = baseTimes[failureType];
    
    // 심각도에 따른 조정
    const severityMultipliers: Record<FailureSeverity, number> = {
      'LOW': 0.5,
      'MEDIUM': 1,
      'HIGH': 2,
      'CRITICAL': 5
    };
    
    return time * severityMultipliers[severity];
  }

  /**
   * 롤백 포인트 생성
   */
  private async createRollbackPoint(operation: SyncOperation): Promise<RollbackPoint | null> {
    try {
      const backup = await this.backupManager.createBackup('INCREMENTAL', [operation.tableName]);
      
      const rollbackPoint: RollbackPoint = {
        id: this.generateId(),
        timestamp: Date.now(),
        description: `Rollback point for operation ${operation.id} on ${operation.tableName}`,
        backupId: backup.id,
        operations: [operation.id],
        created: Date.now(),
        expires: Date.now() + (24 * 60 * 60 * 1000) // 24시간 후 만료
      };
      
      this.rollbackPoints.set(rollbackPoint.id, rollbackPoint);
      
      this.notifyObservers('onRollbackPointCreated', rollbackPoint);
      
      return rollbackPoint;
    } catch (error) {
      console.warn('Failed to create rollback point:', error);
      return null;
    }
  }

  /**
   * 롤백 포인트로 복원
   */
  private async rollbackToPoint(rollbackPointId: string): Promise<boolean> {
    const rollbackPoint = this.rollbackPoints.get(rollbackPointId);
    if (!rollbackPoint) {
      return false;
    }
    
    try {
      return await this.backupManager.restoreFromBackup(rollbackPoint.backupId);
    } catch (error) {
      console.error('Rollback failed:', error);
      return false;
    }
  }

  /**
   * 시스템 상태 확인
   */
  private async getSystemState(): Promise<SystemState> {
    // 실제 구현에서는 시스템 모니터링 API 호출
    return {
      networkStatus: 'ONLINE',
      diskSpace: 50 * 1024 * 1024 * 1024, // 50GB
      memoryUsage: 0.6,
      cpuUsage: 0.4,
      activeConnections: 10,
      queueSize: 5,
      lastHealthCheck: Date.now()
    };
  }

  /**
   * 통계 업데이트
   */
  private updateStats(classification: FailureClassification, result: RecoveryResult): void {
    this.stats.recoveredOperations++;
    
    // 실패 유형 통계
    this.stats.failureTypes[classification.failureType] = 
      (this.stats.failureTypes[classification.failureType] || 0) + 1;
    
    // 복구 액션 통계
    this.stats.recoveryActions[result.action] = 
      (this.stats.recoveryActions[result.action] || 0) + 1;
    
    // 평균 복구 시간 업데이트
    const totalRecovered = this.stats.recoveredOperations;
    const currentAvg = this.stats.averageRecoveryTime;
    this.stats.averageRecoveryTime = 
      (currentAvg * (totalRecovered - 1) + result.duration) / totalRecovered;
    
    // 성공률 업데이트
    this.stats.successRate = this.stats.recoveredOperations / this.stats.failedOperations;
    
    this.stats.lastUpdated = Date.now();
  }

  /**
   * 치명적 오류 처리
   */
  private async handleCriticalFailure(operation: SyncOperation, classification: FailureClassification): Promise<void> {
    this.stats.manualInterventions++;
    
    // 즉시 백업 생성
    const backup = await this.backupManager.createBackup('FULL');
    
    // 변경 로그에 백업 생성 이벤트 기록
    const changeLogManager = getChangeLogManager();
    await changeLogManager.logBackup({
      backupId: backup.id,
      backupType: 'FULL',
      tables: [], // 전체 백업
      size: backup.size,
      location: backup.location,
      checksum: backup.checksum,
      compressed: backup.compressed,
      encrypted: backup.encrypted,
      restorePoint: `critical_failure_${operation.id}`
    }, 'CRITICAL');
    
    // 상위 시스템에 알림 (실제 구현에서는 알림 시스템 호출)
    console.error('Critical failure detected:', {
      operationId: operation.id,
      failureType: classification.failureType,
      error: operation.error
    });
  }

  /**
   * 이벤트 발행
   */
  private publishEvent(event: RecoveryEvent): void {
    this.eventHistory.push(event);
    
    // 이벤트 기록 제한 (최근 1000개만 유지)
    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-1000);
    }
    
    this.eventBus.publish(event);
  }

  /**
   * 옵저버 통지
   */
  private notifyObservers<K extends keyof RecoveryObserver>(
    method: K, 
    ...args: Parameters<RecoveryObserver[K]>
  ): void {
    this.observers.forEach(observer => {
      try {
        (observer[method] as any)(...args);
      } catch (error) {
        console.error('Observer notification failed:', error);
      }
    });
  }

  /**
   * 옵저버 추가
   */
  addObserver(observer: RecoveryObserver): void {
    this.observers.push(observer);
  }

  /**
   * 옵저버 제거
   */
  removeObserver(observer: RecoveryObserver): void {
    const index = this.observers.indexOf(observer);
    if (index >= 0) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * 동기화 상태 보고서 생성
   */
  async generateStatusReport(): Promise<SyncStatusReport> {
    const systemState = await this.getSystemState();
    const recentFailures = this.eventHistory
      .filter(e => e.type === 'FAILURE_DETECTED')
      .slice(-10)
      .map(e => e.metadata?.classification as FailureClassification)
      .filter(Boolean);
    
    return {
      timestamp: Date.now(),
      overallStatus: this.stats.successRate > 0.9 ? 'HEALTHY' : 
                   this.stats.successRate > 0.7 ? 'DEGRADED' : 'FAILED',
      activeOperations: this.activeRecoveries.size,
      queuedOperations: 0, // 실제 구현에서는 큐 사이즈 확인
      failedOperations: this.stats.failedOperations,
      recoveringOperations: this.activeRecoveries.size,
      lastSuccessfulSync: this.stats.lastUpdated,
      averageSyncTime: this.stats.averageRecoveryTime,
      systemState,
      recentFailures,
      recommendations: this.generateRecommendations(systemState, recentFailures)
    };
  }

  /**
   * 권장 사항 생성
   */
  private generateRecommendations(systemState: SystemState, recentFailures: FailureClassification[]): string[] {
    const recommendations: string[] = [];
    
    // 시스템 상태 기반 권장사항
    if (systemState.diskSpace < 10 * 1024 * 1024 * 1024) { // 10GB 미만
      recommendations.push('디스크 공간이 부족합니다. 불필요한 파일을 정리하세요.');
    }
    
    if (systemState.memoryUsage > 0.9) {
      recommendations.push('메모리 사용량이 높습니다. 애플리케이션을 재시작하세요.');
    }
    
    if (systemState.networkStatus !== 'ONLINE') {
      recommendations.push('네트워크 연결을 확인하세요.');
    }
    
    // 최근 실패 기반 권장사항
    const failureTypes = recentFailures.map(f => f.failureType);
    const typeCounts = failureTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<FailureType, number>);
    
    if (typeCounts['NETWORK_ERROR'] > 2) {
      recommendations.push('네트워크 연결이 불안정합니다. 네트워크 설정을 확인하세요.');
    }
    
    if (typeCounts['DATA_CORRUPTION'] > 0) {
      recommendations.push('데이터 손상이 감지되었습니다. 최근 백업에서 복원하세요.');
    }
    
    if (this.stats.successRate < 0.8) {
      recommendations.push('동기화 성공률이 낮습니다. 시스템 설정을 검토하세요.');
    }
    
    return recommendations;
  }

  /**
   * 정기 백업 스케줄러 시작
   */
  private startBackupScheduler(): void {
    this.backupInterval = setInterval(async () => {
      try {
        const backup = await this.backupManager.createBackup('INCREMENTAL');
        
        this.publishEvent({
          id: this.generateId(),
          type: 'BACKUP_CREATED',
          timestamp: Date.now(),
          metadata: { backup }
        });

        // 변경 로그에 백업 생성 이벤트 기록
        const changeLogManager = getChangeLogManager();
        await changeLogManager.logBackup({
          backupId: backup.id,
          backupType: 'INCREMENTAL',
          tables: backup.tables,
          size: backup.size,
          location: backup.location,
          checksum: backup.checksum,
          compressed: backup.compressed,
          encrypted: backup.encrypted
        }, 'INFO');
        
        this.notifyObservers('onBackupCreated', backup);
      } catch (error) {
        console.error('Scheduled backup failed:', error);
      }
    }, this.config.backupInterval);
  }

  /**
   * 정기 헬스체크 시작
   */
  private startHealthCheckScheduler(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const systemState = await this.getSystemState();
        
        // 시스템 상태 경고 체크
        if (systemState.memoryUsage > 0.9 || systemState.cpuUsage > 0.9) {
          console.warn('System resources critically high:', systemState);
        }
        
        if (systemState.queueSize > this.config.alertThreshold) {
          console.warn('Operation queue size too large:', systemState.queueSize);
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * 이벤트 버스 구독 설정
   */
  private setupEventSubscriptions(): void {
    // 필요한 이벤트 구독 설정
    this.eventBus.subscribe('RECOVERY_FAILED', (event) => {
      console.error('Recovery failed:', event);
    });
  }

  /**
   * 롤백 포인트 복원
   */
  private async restoreRollbackPoints(): Promise<void> {
    // 실제 구현에서는 영속 저장소에서 롤백 포인트 로드
  }

  /**
   * 만료된 백업 정리
   */
  private async cleanupExpiredBackups(): Promise<void> {
    try {
      await this.backupManager.cleanup();
    } catch (error) {
      console.error('Backup cleanup failed:', error);
    }
  }

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `sync_recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 기본 전략 팩토리 생성
   */
  private createDefaultStrategyFactory(): RecoveryStrategyFactory {
    return {
      createStrategy: (failureType: FailureType, context: RecoveryContext): RecoveryStrategy => {
        // 실패 유형별 기본 전략 생성
        return this.createDefaultStrategy(failureType, context);
      },
      registerCustomStrategy: (name: string, strategy: RecoveryStrategy): void => {
        // 커스텀 전략 등록 로직
      },
      getAvailableStrategies: (): RecoveryStrategy[] => {
        // 사용 가능한 전략 목록 반환
        return [];
      }
    };
  }

  /**
   * 기본 백업 관리자 생성
   */
  private createDefaultBackupManager(): BackupManager {
    return {
      createBackup: async (type: BackupInfo['type'], tables?: string[]): Promise<BackupInfo> => {
        // 기본 백업 생성 로직
        return {
          id: this.generateId(),
          timestamp: Date.now(),
          type,
          size: 0,
          location: '/tmp/backups',
          checksum: '',
          tables: tables || [],
          compressed: true,
          encrypted: false
        };
      },
      restoreFromBackup: async (backupId: string, tables?: string[]): Promise<boolean> => {
        // 기본 복원 로직
        return true;
      },
      listBackups: async (filter?: { type?: BackupInfo['type']; after?: number }): Promise<BackupInfo[]> => {
        // 기본 백업 목록 로직
        return [];
      },
      deleteBackup: async (backupId: string): Promise<boolean> => {
        // 기본 백업 삭제 로직
        return true;
      },
      verifyBackup: async (backupId: string): Promise<boolean> => {
        // 기본 백업 검증 로직
        return true;
      },
      cleanup: async (): Promise<number> => {
        // 기본 정리 로직
        return 0;
      }
    };
  }

  /**
   * 기본 이벤트 버스 생성
   */
  private createDefaultEventBus(): RecoveryEventBus {
    const subscriptions = new Map<RecoveryEvent['type'], Set<(event: RecoveryEvent) => void>>();
    
    return {
      publish: (event: RecoveryEvent): void => {
        const handlers = subscriptions.get(event.type);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(event);
            } catch (error) {
              console.error('Event handler error:', error);
            }
          });
        }
      },
      subscribe: (eventType: RecoveryEvent['type'], handler: (event: RecoveryEvent) => void): (() => void) => {
        if (!subscriptions.has(eventType)) {
          subscriptions.set(eventType, new Set());
        }
        subscriptions.get(eventType)!.add(handler);
        
        return () => {
          subscriptions.get(eventType)?.delete(handler);
        };
      },
      unsubscribe: (eventType: RecoveryEvent['type'], handler: (event: RecoveryEvent) => void): void => {
        subscriptions.get(eventType)?.delete(handler);
      },
      getHistory: (filter?: { since?: number; operationId?: string }): RecoveryEvent[] => {
        let history = [...this.eventHistory];
        
        if (filter?.since) {
          history = history.filter(e => e.timestamp >= filter.since!);
        }
        
        if (filter?.operationId) {
          history = history.filter(e => e.operationId === filter.operationId);
        }
        
        return history;
      }
    };
  }

  /**
   * 기본 복구 전략 생성
   */
  private createDefaultStrategy(failureType: FailureType, context: RecoveryContext): RecoveryStrategy {
    // 실패 유형별 기본 전략
    switch (failureType) {
      case 'NETWORK_ERROR':
        return {
          name: 'NetworkRetryStrategy',
          description: '네트워크 오류 재시도 전략',
          applicableFailureTypes: ['NETWORK_ERROR'],
          execute: async (): Promise<RecoveryResult> => {
            // 지수 백오프 재시도 구현
            const delay = this.config.initialRetryDelay * Math.pow(this.config.backoffMultiplier, context.previousAttempts);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            return {
              success: Math.random() > 0.3, // 70% 성공률 시뮬레이션
              action: 'BACKOFF_RETRY',
              duration: delay
            };
          },
          maxAttempts: this.config.maxRetries,
          backoffMultiplier: this.config.backoffMultiplier,
          priority: 1
        };
        
      case 'TIMEOUT_ERROR':
        return {
          name: 'TimeoutRetryStrategy',
          description: '타임아웃 오류 재시도 전략',
          applicableFailureTypes: ['TIMEOUT_ERROR'],
          execute: async (): Promise<RecoveryResult> => {
            // 타임아웃 증가 후 재시도
            return {
              success: Math.random() > 0.2, // 80% 성공률 시뮬레이션
              action: 'RETRY',
              duration: 1000
            };
          },
          maxAttempts: this.config.maxRetries,
          priority: 2
        };
        
      default:
        return {
          name: 'DefaultRetryStrategy',
          description: '기본 재시도 전략',
          applicableFailureTypes: [failureType],
          execute: async (): Promise<RecoveryResult> => {
            return {
              success: Math.random() > 0.5, // 50% 성공률 시뮬레이션
              action: 'RETRY',
              duration: 1000
            };
          },
          maxAttempts: this.config.maxRetries,
          priority: 10
        };
    }
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    // 스케줄러 정리
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }
    
    // 활성 복구 대기
    await Promise.all(Array.from(this.activeRecoveries.values()));
    
    // 백업 관리자 정리
    await this.backupManager.cleanup?.();
    
    this.isInitialized = false;
  }

  /**
   * 통계 가져오기
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }

  /**
   * 설정 가져오기
   */
  getConfig(): SyncRecoveryConfig {
    return { ...this.config };
  }

  /**
   * 활성 복구 수
   */
  getActiveRecoveriesCount(): number {
    return this.activeRecoveries.size;
  }
}