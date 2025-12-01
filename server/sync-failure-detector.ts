/**
 * ZyFlow 동기화 실패 탐지기
 * 
 * 동기화 작업 실패를 실시간으로 감지하고 분류하는 모듈
 */

import type { 
  SyncOperation, 
  SyncError, 
  FailureType, 
  FailureSeverity, 
  FailureClassification,
  RecoveryEvent
} from '@/types/sync-recovery';
import {
  SystemState
} from '@/types/sync-recovery';

/**
 * 실패 탐지기 설정
 */
export interface FailureDetectorConfig {
  // 탐지 임계값
  consecutiveFailureThreshold: number;    // 연속 실패 허용 한계
  failureRateThreshold: number;          // 실패율 임계값 (0-1)
  timeoutThreshold: number;               // 타임아웃 임계값 (밀리초)
  
  // 모니터링 간격
  monitoringInterval: number;             // 모니터링 간격 (밀리초)
  slidingWindowSize: number;             // 슬라이딩 윈도우 크기 (밀리초)
  
  // 필터링 설정
  enableNoiseFiltering: boolean;        // 노이즈 필터링 활성화
  noiseThreshold: number;               // 노이즈 임계값
  
  // 알림 설정
  enableAlerts: boolean;               // 알림 활성화
  alertCooldown: number;                // 알림 쿨다운 (밀리초)
}

/**
 * 실패 이력
 */
interface FailureHistory {
  timestamp: number;
  operationId: string;
  failureType: FailureType;
  severity: FailureSeverity;
  recoverable: boolean;
}

/**
 * 동기화 실패 탐지기
 */
export class SyncFailureDetector {
  private config: FailureDetectorConfig;
  private operationHistory = new Map<string, SyncOperation[]>();
  private failureHistory: FailureHistory[] = [];
  private lastAlertTime = 0;
  private monitoringInterval?: NodeJS.Timeout;
  private isActive = false;
  private eventListeners = new Map<string, ((event: RecoveryEvent) => void)[]>();

  constructor(config: Partial<FailureDetectorConfig> = {}) {
    this.config = {
      consecutiveFailureThreshold: 3,
      failureRateThreshold: 0.3,
      timeoutThreshold: 30000,
      monitoringInterval: 5000,
      slidingWindowSize: 300000, // 5분
      enableNoiseFiltering: true,
      noiseThreshold: 0.1,
      enableAlerts: true,
      alertCooldown: 60000, // 1분
      ...config
    };
  }

  /**
   * 탐지기 시작
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.startMonitoring();
    
    this.publishEvent({
      id: this.generateId(),
      type: 'RECOVERY_STARTED',
      timestamp: Date.now(),
      metadata: { component: 'FailureDetector', action: 'START' }
    });
  }

  /**
   * 탐지기 중지
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.publishEvent({
      id: this.generateId(),
      type: 'RECOVERY_COMPLETED',
      timestamp: Date.now(),
      metadata: { component: 'FailureDetector', action: 'STOP' }
    });
  }

  /**
   * 동기화 작업 등록
   */
  registerOperation(operation: SyncOperation): void {
    const operations = this.operationHistory.get(operation.tableName) || [];
    operations.push(operation);
    
    // 히스토리 크기 제한
    if (operations.length > 1000) {
      operations.splice(0, operations.length - 1000);
    }
    
    this.operationHistory.set(operation.tableName, operations);
  }

  /**
   * 동기화 실패 보고
   */
  async reportFailure(operation: SyncOperation, error: SyncError): Promise<FailureClassification> {
    // 실패 분류
    const classification = await this.classifyFailure(operation, error);
    
    // 실패 이력 기록
    this.recordFailure(operation, classification);
    
    // 이벤트 발행
    this.publishEvent({
      id: this.generateId(),
      type: 'FAILURE_DETECTED',
      timestamp: Date.now(),
      operationId: operation.id,
      error,
      metadata: { classification }
    });
    
    // 패턴 분석
    await this.analyzeFailurePatterns();
    
    return classification;
  }

  /**
   * 동기화 성공 보고
   */
  reportSuccess(operation: SyncOperation): void {
    // 작업 상태 업데이트
    const operations = this.operationHistory.get(operation.tableName) || [];
    const index = operations.findIndex(op => op.id === operation.id);
    
    if (index >= 0) {
      operations[index] = { ...operation, status: 'COMPLETED' };
    }
    
    // 성공 이벤트 발행
    this.publishEvent({
      id: this.generateId(),
      type: 'RECOVERY_COMPLETED',
      timestamp: Date.now(),
      operationId: operation.id,
      metadata: { component: 'FailureDetector', action: 'SUCCESS_REPORT' }
    });
  }

  /**
   * 실패 분류
   */
  private async classifyFailure(operation: SyncOperation, error: SyncError): Promise<FailureClassification> {
    // 실패 유형 결정
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
        errorCode: error.code,
        errorMessage: error.message,
        timestamp: operation.timestamp
      }
    };
  }

  /**
   * 실패 유형 결정
   */
  private determineFailureType(error: SyncError): FailureType {
    const { code, message } = error;
    
    // 네트워크 관련 오류
    if (this.matchesPattern(code, message, [
      /network/i, /connection/i, /timeout/i, /unreachable/i,
      /ECONNREFUSED/i, /ENOTFOUND/i, /ETIMEDOUT/i
    ])) {
      return 'NETWORK_ERROR';
    }
    
    // 타임아웃 오류
    if (this.matchesPattern(code, message, [
      /timeout/i, /deadline/i, /TIMEOUT/i
    ])) {
      return 'TIMEOUT_ERROR';
    }
    
    // 인증 오류
    if (this.matchesPattern(code, message, [
      /auth/i, /unauthorized/i, /token/i, /JWT/i,
      /401/i, /AUTH/i
    ])) {
      return 'AUTHENTICATION_ERROR';
    }
    
    // 권한 오류
    if (this.matchesPattern(code, message, [
      /permission/i, /forbidden/i, /access/i, /denied/i,
      /403/i, /PERMISSION/i
    ])) {
      return 'PERMISSION_ERROR';
    }
    
    // 데이터 손상
    if (this.matchesPattern(code, message, [
      /corrupt/i, /invalid/i, /malformed/i, /checksum/i,
      /CORRUPT/i, /INVALID/i
    ])) {
      return 'DATA_CORRUPTION';
    }
    
    // 스키마 불일치
    if (this.matchesPattern(code, message, [
      /schema/i, /column/i, /table/i, /constraint/i,
      /SCHEMA/i, /COLUMN/i
    ])) {
      return 'SCHEMA_MISMATCH';
    }
    
    // 충돌
    if (this.matchesPattern(code, message, [
      /conflict/i, /duplicate/i, /unique/i, /violation/i,
      /CONFLICT/i, /DUPLICATE/i
    ])) {
      return 'CONFLICT_ERROR';
    }
    
    // 리소스 고갈
    if (this.matchesPattern(code, message, [
      /resource/i, /memory/i, /disk/i, /space/i, /quota/i,
      /RESOURCE/i, /MEMORY/i
    ])) {
      return 'RESOURCE_EXHAUSTION';
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * 패턴 매칭
   */
  private matchesPattern(code: string, message: string, patterns: RegExp[]): boolean {
    const combined = `${code} ${message}`;
    return patterns.some(pattern => pattern.test(combined));
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
    if (operation.retryCount >= this.config.consecutiveFailureThreshold) {
      if (severity === 'LOW') severity = 'MEDIUM';
      else if (severity === 'MEDIUM') severity = 'HIGH';
      else if (severity === 'HIGH') severity = 'CRITICAL';
    }
    
    // 최근 실패 이력 고려
    const recentFailures = this.getRecentFailures(operation.tableName);
    if (recentFailures.length >= 5) {
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
  private getRecommendedAction(failureType: FailureType, severity: FailureSeverity, retryCount: number): 'RETRY' | 'BACKOFF_RETRY' | 'FALLBACK_STRATEGY' | 'RESTORE_FROM_BACKUP' | 'RESET_AND_RESYNC' | 'MANUAL_INTERVENTION' | 'ESCALATE' | 'SKIP_AND_CONTINUE' {
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
        case 'AUTHENTICATION_ERROR':
        case 'PERMISSION_ERROR':
          return 'ESCALATE';
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
   * 실패 이력 기록
   */
  private recordFailure(operation: SyncOperation, classification: FailureClassification): void {
    const failure: FailureHistory = {
      timestamp: Date.now(),
      operationId: operation.id,
      failureType: classification.failureType,
      severity: classification.severity,
      recoverable: classification.recoverable
    };
    
    this.failureHistory.push(failure);
    
    // 히스토리 크기 제한
    if (this.failureHistory.length > 10000) {
      this.failureHistory.splice(0, this.failureHistory.length - 10000);
    }
  }

  /**
   * 패턴 분석
   */
  private async analyzeFailurePatterns(): Promise<void> {
    // 최근 실패 패턴 분석
    const recentFailures = this.getRecentFailures();
    
    // 연속 실패 패턴 감지
    await this.detectConsecutiveFailures(recentFailures);
    
    // 실패율 패턴 감지
    await this.detectFailureRatePattern(recentFailures);
    
    // 노이즈 필터링
    if (this.config.enableNoiseFiltering) {
      await this.filterNoise(recentFailures);
    }
  }

  /**
   * 연속 실패 패턴 감지
   */
  private async detectConsecutiveFailures(failures: FailureHistory[]): Promise<void> {
    // 테이블별 연속 실패 그룹화
    const tableGroups = new Map<string, FailureHistory[]>();
    
    for (const failure of failures) {
      const operation = this.findOperation(failure.operationId);
      if (operation) {
        const tableFailures = tableGroups.get(operation.tableName) || [];
        tableFailures.push(failure);
        tableGroups.set(operation.tableName, tableFailures);
      }
    }
    
    // 연속 실패 임계값 초과 감지
    for (const [tableName, tableFailures] of tableGroups) {
      if (tableFailures.length >= this.config.consecutiveFailureThreshold) {
        await this.triggerAlert({
          type: 'CONSECUTIVE_FAILURES',
          tableName,
          count: tableFailures.length,
          threshold: this.config.consecutiveFailureThreshold
        });
      }
    }
  }

  /**
   * 실패율 패턴 감지
   */
  private async detectFailureRatePattern(failures: FailureHistory[]): Promise<void> {
    // 시간 윈도우 내 실패율 계산
    const windowStart = Date.now() - this.config.slidingWindowSize;
    const windowFailures = failures.filter(f => f.timestamp >= windowStart);
    
    // 전체 작업 수 계산
    let totalOperations = 0;
    for (const operations of this.operationHistory.values()) {
      totalOperations += operations.filter(op => 
        op.timestamp >= windowStart
      ).length;
    }
    
    if (totalOperations > 0) {
      const failureRate = windowFailures.length / totalOperations;
      
      if (failureRate > this.config.failureRateThreshold) {
        await this.triggerAlert({
          type: 'HIGH_FAILURE_RATE',
          failureRate,
          threshold: this.config.failureRateThreshold,
          windowSize: this.config.slidingWindowSize
        });
      }
    }
  }

  /**
   * 노이즈 필터링
   */
  private async filterNoise(failures: FailureHistory[]): Promise<void> {
    // 실패 유형별 빈도 계산
    const typeCounts = new Map<FailureType, number>();
    
    for (const failure of failures) {
      const count = typeCounts.get(failure.failureType) || 0;
      typeCounts.set(failure.failureType, count + 1);
    }
    
    const totalFailures = failures.length;
    
    // 노이즈 임계값 미만 실패 유형 필터링
    for (const [failureType, count] of typeCounts) {
      const ratio = count / totalFailures;
      
      if (ratio < this.config.noiseThreshold && failureType === 'UNKNOWN_ERROR') {
        await this.triggerAlert({
          type: 'NOISE_DETECTED',
          failureType,
          ratio,
          threshold: this.config.noiseThreshold
        });
      }
    }
  }

  /**
   * 알림 트리거
   */
  private async triggerAlert(alertData: Record<string, unknown>): Promise<void> {
    if (!this.config.enableAlerts) {
      return;
    }
    
    // 쿨다운 체크
    const now = Date.now();
    if (now - this.lastAlertTime < this.config.alertCooldown) {
      return;
    }
    
    this.lastAlertTime = now;
    
    // 알림 이벤트 발행
    this.publishEvent({
      id: this.generateId(),
      type: 'FAILURE_DETECTED',
      timestamp: now,
      metadata: { 
        alert: true,
        alertData,
        component: 'FailureDetector'
      }
    });
  }

  /**
   * 최근 실패 이력 가져오기
   */
  private getRecentFailures(tableName?: string): FailureHistory[] {
    const windowStart = Date.now() - this.config.slidingWindowSize;
    let failures = this.failureHistory.filter(f => f.timestamp >= windowStart);
    
    if (tableName) {
      failures = failures.filter(f => {
        const operation = this.findOperation(f.operationId);
        return operation && operation.tableName === tableName;
      });
    }
    
    return failures;
  }

  /**
   * 작업 찾기
   */
  private findOperation(operationId: string): SyncOperation | undefined {
    for (const operations of this.operationHistory.values()) {
      const operation = operations.find(op => op.id === operationId);
      if (operation) {
        return operation;
      }
    }
    return undefined;
  }

  /**
   * 모니터링 시작
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      if (!this.isActive) {
        return;
      }
      
      try {
        // 타임아웃 작업 감지
        await this.detectTimeoutOperations();
        
        // 시스템 상태 확인
        await this.checkSystemHealth();
        
      } catch (error) {
        console.error('Monitoring error:', error);
      }
    }, this.config.monitoringInterval);
  }

  /**
   * 타임아웃 작업 감지
   */
  private async detectTimeoutOperations(): Promise<void> {
    const now = Date.now();
    const timeoutThreshold = this.config.timeoutThreshold;
    
    for (const [tableName, operations] of this.operationHistory) {
      for (const operation of operations) {
        if (operation.status === 'IN_PROGRESS' && 
            (now - operation.timestamp) > timeoutThreshold) {
          
          // 타임아웃 오류 생성
          const timeoutError: SyncError = {
            code: 'OPERATION_TIMEOUT',
            message: `Operation ${operation.id} timed out after ${timeoutThreshold}ms`,
            timestamp: now,
            recoverable: true
          };
          
          // 실패 보고
          await this.reportFailure(operation, timeoutError);
        }
      }
    }
  }

  /**
   * 시스템 상태 확인
   */
  private async checkSystemHealth(): Promise<void> {
    // 실제 구현에서는 시스템 상태 모니터링 API 호출
    // 여기서는 간단한 상태 확인만 수행
    const memoryUsage = process.memoryUsage();
    const memoryUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    if (memoryUsageRatio > 0.9) {
      await this.triggerAlert({
        type: 'HIGH_MEMORY_USAGE',
        usage: memoryUsageRatio,
        threshold: 0.9
      });
    }
  }

  /**
   * 이벤트 발행
   */
  private publishEvent(event: RecoveryEvent): void {
    const listeners = this.eventListeners.get(event.type) || [];
    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
  }

  /**
   * 이벤트 리스너 등록
   */
  addEventListener(eventType: RecoveryEvent['type'], listener: (event: RecoveryEvent) => void): () => void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.push(listener);
    this.eventListeners.set(eventType, listeners);
    
    return () => {
      const currentListeners = this.eventListeners.get(eventType) || [];
      const index = currentListeners.indexOf(listener);
      if (index >= 0) {
        currentListeners.splice(index, 1);
        this.eventListeners.set(eventType, currentListeners);
      }
    };
  }

  /**
   * 통계 가져오기
   */
  getStats(): {
    totalFailures: number;
    failureRate: number;
    failureTypes: Record<FailureType, number>;
    severityDistribution: Record<FailureSeverity, number>;
    recoverableRate: number;
  } {
    const totalFailures = this.failureHistory.length;
    const recoverableFailures = this.failureHistory.filter(f => f.recoverable).length;
    
    const failureTypes = this.failureHistory.reduce((acc, f) => {
      acc[f.failureType] = (acc[f.failureType] || 0) + 1;
      return acc;
    }, {} as Record<FailureType, number>);
    
    const severityDistribution = this.failureHistory.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {} as Record<FailureSeverity, number>);
    
    // 전체 작업 수 계산
    let totalOperations = 0;
    for (const operations of this.operationHistory.values()) {
      totalOperations += operations.length;
    }
    
    return {
      totalFailures,
      failureRate: totalOperations > 0 ? totalFailures / totalOperations : 0,
      failureTypes,
      severityDistribution,
      recoverableRate: totalFailures > 0 ? recoverableFailures / totalFailures : 0
    };
  }

  /**
   * 설정 가져오기
   */
  getConfig(): FailureDetectorConfig {
    return { ...this.config };
  }

  /**
   * 활성 상태 확인
   */
  isDetectorActive(): boolean {
    return this.isActive;
  }

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `failure_detector_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 정리
   */
  cleanup(): void {
    this.stop();
    this.operationHistory.clear();
    this.failureHistory = [];
    this.eventListeners.clear();
  }
}