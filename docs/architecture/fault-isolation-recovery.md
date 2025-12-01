# 장애 격리 및 자동 복구 메커니즘 통합

## 개요

ZyFlow의 단일 진실 원천 아키텍처에서 장애 격리 및 자동 복구는 시스템의 안정성과 가용성을 보장하는 핵심 요소입니다. 이 설계는 장애의 전파를 방지하고, 시스템이 자동으로 장애를 감지하고 복구할 수 있는 능력을 제공하는 것을 목표로 합니다.

## 핵심 원칙

### 1. 장애 격리 (Fault Isolation)
- **격리 경계**: 명확한 격리 경계 설정으로 장애 전파 방지
- **서킷 브레이커**: 연쇄적 장애 방지를 위한 서킷 브레이커 패턴 적용
- **벌크헤드 패턴**: 장애 영향을 최소화하는 격리 패턴

### 2. 자동 복구 (Automatic Recovery)
- **자가 치유(Self-healing)**: 시스템이 스스로 장애를 감지하고 복구
- **그레이스풀 데그레이션**: 장애 시 점진적 기능 축소로 서비스 연속성 보장
- **롤백 및 포워드 복구**: 안전한 상태로의 복원 및 진행

### 3. 장애 감지 (Fault Detection)
- **실시간 모니터링**: 지속적인 상태 모니터링을 통한 조기 장애 감지
- **헬스체크**: 정기적인 시스템 건강 상태 검사
- **이상 감지**: 통계적 및 머신러닝 기반 이상 행동 감지

## 장애 격리 아키텍처

### 1. 격리 경계 설계

```typescript
interface IsolationBoundary {
  id: string
  name: string
  type: IsolationType
  components: string[]
  
  // 격리 규칙
  isolationRules: IsolationRule[]
  
  // 장애 전파 방지
  failurePropagation: {
    allowedRoutes: string[]
    blockedRoutes: string[]
    circuitBreakerThreshold: number
  }
  
  // 복구 전략
  recoveryStrategy: RecoveryStrategy
}

type IsolationType = 
  | 'PROCESS'      // 프로세스 수준 격리
  | 'SERVICE'      // 서비스 수준 격리
  | 'DATABASE'     // 데이터베이스 수준 격리
  | 'NETWORK'      // 네트워크 수준 격리
  | 'RESOURCE'     // 리소스 수준 격리

interface IsolationRule {
  condition: string // 격리 조건
  action: IsolationAction
  priority: number
  timeout: number
}

type IsolationAction = 
  | 'ISOLATE_COMPONENT'     // 컴포넌트 격리
  | 'REDIRECT_TRAFFIC'      // 트래픽 우회
  | 'SCALE_UP'              // 스케일업
  | 'SCALE_DOWN'            // 스케일다운
  | 'RESTART_COMPONENT'     // 컴포넌트 재시작
  | 'ENABLE_BACKUP'        // 백업 시스템 활성화

class IsolationManager {
  private boundaries = new Map<string, IsolationBoundary>()
  private circuitBreakers = new Map<string, CircuitBreaker>()
  
  createBoundary(config: IsolationBoundaryConfig): IsolationBoundary {
    const boundary: IsolationBoundary = {
      id: this.generateBoundaryId(),
      name: config.name,
      type: config.type,
      components: config.components,
      isolationRules: config.isolationRules || [],
      failurePropagation: {
        allowedRoutes: config.allowedRoutes || [],
        blockedRoutes: config.blockedRoutes || [],
        circuitBreakerThreshold: config.circuitBreakerThreshold || 5
      },
      recoveryStrategy: config.recoveryStrategy || this.getDefaultRecoveryStrategy()
    }
    
    // 서킷 브레이커 생성
    for (const component of boundary.components) {
      const circuitBreaker = new CircuitBreaker({
        threshold: boundary.failurePropagation.circuitBreakerThreshold,
        timeout: 30000, // 30초
        resetTimeout: 60000 // 60초
      })
      
      this.circuitBreakers.set(component, circuitBreaker)
    }
    
    this.boundaries.set(boundary.id, boundary)
    return boundary
  }
  
  async isolateComponent(componentId: string, reason: string): Promise<void> {
    const boundary = this.findBoundaryForComponent(componentId)
    if (!boundary) {
      throw new Error(`No isolation boundary found for component: ${componentId}`)
    }
    
    // 서킷 브레이커 트리거
    const circuitBreaker = this.circuitBreakers.get(componentId)
    if (circuitBreaker) {
      circuitBreaker.trip(reason)
    }
    
    // 격리 규칙 실행
    await this.executeIsolationRules(boundary, componentId, reason)
    
    // 이벤트 발행
    await this.publishIsolationEvent({
      type: 'COMPONENT_ISOLATED',
      componentId,
      boundaryId: boundary.id,
      reason,
      timestamp: Date.now()
    })
  }
  
  async executeIsolationRules(
    boundary: IsolationBoundary, 
    componentId: string, 
    reason: string
  ): Promise<void> {
    const applicableRules = boundary.isolationRules
      .filter(rule => this.evaluateCondition(rule.condition, componentId, reason))
      .sort((a, b) => b.priority - a.priority)
    
    for (const rule of applicableRules) {
      try {
        await this.executeIsolationAction(rule.action, componentId, boundary)
        
        // 타임아웃 적용
        if (rule.timeout > 0) {
          setTimeout(async () => {
            await this.releaseIsolation(componentId, rule.id)
          }, rule.timeout)
        }
      } catch (error) {
        console.error(`Failed to execute isolation rule ${rule.id}:`, error)
      }
    }
  }
  
  private async executeIsolationAction(
    action: IsolationAction, 
    componentId: string, 
    boundary: IsolationBoundary
  ): Promise<void> {
    switch (action) {
      case 'ISOLATE_COMPONENT':
        await this.isolateComponentInternally(componentId)
        break
        
      case 'REDIRECT_TRAFFIC':
        await this.redirectTraffic(componentId, boundary)
        break
        
      case 'SCALE_UP':
        await this.scaleComponent(componentId, 'up')
        break
        
      case 'SCALE_DOWN':
        await this.scaleComponent(componentId, 'down')
        break
        
      case 'RESTART_COMPONENT':
        await this.restartComponent(componentId)
        break
        
      case 'ENABLE_BACKUP':
        await this.enableBackupSystem(boundary)
        break
    }
  }
}
```

### 2. 서킷 브레이커 패턴

```typescript
interface CircuitBreakerConfig {
  threshold: number      // 실패 임계값
  timeout: number        // 타임아웃 (ms)
  resetTimeout: number    // 리셋 타임아웃 (ms)
  monitoringPeriod: number // 모니터링 기간 (ms)
}

enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // 정상 상태
  OPEN = 'OPEN',         // 차단 상태
  HALF_OPEN = 'HALF_OPEN'  // 반개방 상태
}

class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0
  private successCount = 0
  
  constructor(private config: CircuitBreakerConfig) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN
      } else {
        throw new Error('Circuit breaker is OPEN')
      }
    }
    
    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.config.threshold) {
        this.reset()
      }
    }
  }
  
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.failureCount >= this.config.threshold) {
        this.trip('Failure threshold exceeded')
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.trip('Failure in HALF_OPEN state')
    }
  }
  
  trip(reason: string): void {
    this.state = CircuitBreakerState.OPEN
    this.lastFailureTime = Date.now()
    
    console.warn(`Circuit breaker tripped: ${reason}`)
    
    // 이벤트 발행
    this.publishCircuitBreakerEvent({
      type: 'CIRCUIT_BREAKER_TRIPPED',
      reason,
      timestamp: Date.now(),
      failureCount: this.failureCount
    })
  }
  
  reset(): void {
    this.state = CircuitBreakerState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    
    console.info('Circuit breaker reset')
  }
  
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout
  }
  
  getState(): CircuitBreakerState {
    return this.state
  }
  
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    }
  }
}

interface CircuitBreakerMetrics {
  state: CircuitBreakerState
  failureCount: number
  successCount: number
  lastFailureTime: number
}
```

## 자동 복구 시스템

### 1. 복구 전략 관리자

```typescript
interface RecoveryStrategy {
  id: string
  name: string
  type: RecoveryType
  
  // 복구 단계
  steps: RecoveryStep[]
  
  // 복구 조건
  conditions: RecoveryCondition[]
  
  // 롤백 전략
  rollbackStrategy: RollbackStrategy
  
  // 복구 메트릭
  metrics: RecoveryMetrics
}

type RecoveryType = 
  | 'AUTOMATIC'    // 자동 복구
  | 'SEMIAUTOMATIC' // 반자동 복구
  | 'MANUAL'       // 수동 복구

interface RecoveryStep {
  id: string
  name: string
  type: StepType
  order: number
  
  // 단계 실행
  execute: (context: RecoveryContext) => Promise<StepResult>
  
  // 성공 조건
  successCriteria: SuccessCriteria
  
  // 타임아웃
  timeout: number
  
  // 재시도 정책
  retryPolicy: RetryPolicy
}

type StepType = 
  | 'DIAGNOSTIC'     // 진단
  | 'ISOLATION'      // 격리
  | 'REPAIR'         // 수리
  | 'RESTART'        // 재시작
  | 'RESTORE'        // 복원
  | 'VERIFY'         // 검증

interface RecoveryContext {
  incidentId: string
  componentId: string
  failureType: string
  severity: FailureSeverity
  startTime: number
  
  // 컨텍스트 데이터
  data: Record<string, unknown>
  
  // 복구 이력
  history: RecoveryStepResult[]
}

class RecoveryManager {
  private strategies = new Map<string, RecoveryStrategy>()
  private activeRecoveries = new Map<string, RecoveryExecution>()
  private recoveryQueue: RecoveryRequest[] = []
  
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.id, strategy)
  }
  
  async initiateRecovery(request: RecoveryRequest): Promise<string> {
    const recoveryId = this.generateRecoveryId()
    
    // 적절한 복구 전략 선택
    const strategy = this.selectRecoveryStrategy(request)
    
    const context: RecoveryContext = {
      incidentId: request.incidentId,
      componentId: request.componentId,
      failureType: request.failureType,
      severity: request.severity,
      startTime: Date.now(),
      data: request.data || {},
      history: []
    }
    
    const execution: RecoveryExecution = {
      id: recoveryId,
      strategy,
      context,
      currentStep: 0,
      status: RecoveryStatus.PENDING,
      startTime: Date.now()
    }
    
    this.activeRecoveries.set(recoveryId, execution)
    
    // 복구 실행 시작
    this.executeRecovery(recoveryId).catch(error => {
      console.error(`Recovery execution failed: ${recoveryId}`, error)
    })
    
    return recoveryId
  }
  
  private async executeRecovery(recoveryId: string): Promise<void> {
    const execution = this.activeRecoveries.get(recoveryId)
    if (!execution) {
      throw new Error(`Recovery execution not found: ${recoveryId}`)
    }
    
    execution.status = RecoveryStatus.RUNNING
    
    try {
      const steps = execution.strategy.steps
      
      for (let i = 0; i < steps.length; i++) {
        execution.currentStep = i
        const step = steps[i]
        
        const stepResult = await this.executeStep(step, execution.context)
        execution.context.history.push(stepResult)
        
        // 성공 여부 확인
        if (!this.meetsSuccessCriteria(stepResult, step.successCriteria)) {
          if (step.retryPolicy.maxRetries > 0) {
            // 재시도
            await this.retryStep(step, execution.context, step.retryPolicy)
          } else {
            // 복구 실패
            execution.status = RecoveryStatus.FAILED
            await this.handleRecoveryFailure(execution)
            return
          }
        }
      }
      
      // 모든 단계 성공
      execution.status = RecoveryStatus.COMPLETED
      await this.handleRecoverySuccess(execution)
      
    } catch (error) {
      execution.status = RecoveryStatus.FAILED
      await this.handleRecoveryFailure(execution, error as Error)
    } finally {
      this.activeRecoveries.delete(recoveryId)
    }
  }
  
  private async executeStep(
    step: RecoveryStep, 
    context: RecoveryContext
  ): Promise<RecoveryStepResult> {
    const startTime = Date.now()
    
    try {
      // 타임아웃 적용
      const result = await Promise.race([
        step.execute(context),
        this.createTimeoutPromise(step.timeout)
      ])
      
      return {
        stepId: step.id,
        success: true,
        result: result,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        stepId: step.id,
        success: false,
        error: error as Error,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }
  
  private async retryStep(
    step: RecoveryStep, 
    context: RecoveryContext, 
    retryPolicy: RetryPolicy
  ): Promise<RecoveryStepResult> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= retryPolicy.maxRetries; attempt++) {
      if (attempt > 1) {
        // 대기 시간 적용
        const delay = retryPolicy.delay * Math.pow(retryPolicy.backoffMultiplier, attempt - 1)
        await this.sleep(delay)
      }
      
      try {
        const result = await this.executeStep(step, context)
        if (result.success) {
          return result
        }
      } catch (error) {
        lastError = error as Error
      }
    }
    
    return {
      stepId: step.id,
      success: false,
      error: lastError || new Error('Max retries exceeded'),
      timestamp: Date.now()
    }
  }
  
  private selectRecoveryStrategy(request: RecoveryRequest): RecoveryStrategy {
    // 실패 유형별 전략 매칭
    for (const strategy of this.strategies.values()) {
      if (this.matchesStrategy(strategy, request)) {
        return strategy
      }
    }
    
    // 기본 전략 반환
    return this.getDefaultStrategy()
  }
  
  private matchesStrategy(strategy: RecoveryStrategy, request: RecoveryRequest): boolean {
    return strategy.conditions.some(condition =>
      this.evaluateCondition(condition, request)
    )
  }
}

interface RecoveryExecution {
  id: string
  strategy: RecoveryStrategy
  context: RecoveryContext
  currentStep: number
  status: RecoveryStatus
  startTime: number
  endTime?: number
}

enum RecoveryStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

interface RecoveryStepResult {
  stepId: string
  success: boolean
  result?: unknown
  error?: Error
  duration: number
  timestamp: number
}
```

### 2. 헬스체크 시스템

```typescript
interface HealthCheck {
  id: string
  name: string
  component: string
  
  // 검사 항목
  checks: HealthCheckItem[]
  
  // 실행 스케줄
  schedule: HealthCheckSchedule
  
  // 임계값
  thresholds: HealthThresholds
}

interface HealthCheckItem {
  id: string
  name: string
  type: CheckType
  
  // 검사 실행
  execute: () => Promise<HealthCheckResult>
  
  // 타임아웃
  timeout: number
  
  // 의존성
  dependencies: string[]
}

type CheckType = 
  | 'HTTP_ENDPOINT'    // HTTP 엔드포인트 검사
  | 'DATABASE_QUERY'   // 데이터베이스 쿼리 검사
  | 'FILE_SYSTEM'     // 파일 시스템 검사
  | 'MEMORY_USAGE'    // 메모리 사용량 검사
  | 'CPU_USAGE'       // CPU 사용량 검사
  | 'CUSTOM'          // 사용자 정의 검사

interface HealthCheckResult {
  status: HealthStatus
  message: string
  metrics?: Record<string, number>
  timestamp: number
  duration: number
}

enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN'
}

class HealthCheckManager {
  private healthChecks = new Map<string, HealthCheck>()
  private checkResults = new Map<string, HealthCheckResult[]>()
  private schedulers = new Map<string, NodeJS.Timeout>()
  
  registerHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.id, check)
    
    // 스케줄러 설정
    this.scheduleHealthCheck(check)
  }
  
  private scheduleHealthCheck(check: HealthCheck): void {
    const scheduler = setInterval(async () => {
      await this.executeHealthCheck(check.id)
    }, check.schedule.interval)
    
    this.schedulers.set(check.id, scheduler)
    
    // 초기 실행
    this.executeHealthCheck(check.id).catch(error => {
      console.error(`Initial health check failed: ${check.id}`, error)
    })
  }
  
  async executeHealthCheck(checkId: string): Promise<HealthCheckResult[]> {
    const check = this.healthChecks.get(checkId)
    if (!check) {
      throw new Error(`Health check not found: ${checkId}`)
    }
    
    const results: HealthCheckResult[] = []
    
    for (const item of check.checks) {
      try {
        // 의존성 검사
        if (item.dependencies.length > 0) {
          await this.checkDependencies(item.dependencies)
        }
        
        // 타임아웃 적용
        const result = await Promise.race([
          item.execute(),
          this.createTimeoutPromise(item.timeout)
        ])
        
        results.push(result)
        
        // 임계값 검사
        this.evaluateThresholds(result, check.thresholds)
        
      } catch (error) {
        results.push({
          status: HealthStatus.UNKNOWN,
          message: `Health check failed: ${(error as Error).message}`,
          timestamp: Date.now(),
          duration: 0
        })
      }
    }
    
    // 결과 저장
    if (!this.checkResults.has(checkId)) {
      this.checkResults.set(checkId, [])
    }
    
    const checkHistory = this.checkResults.get(checkId)!
    checkHistory.push(...results)
    
    // 히스토리 크기 제한
    if (checkHistory.length > 100) {
      checkHistory.splice(0, checkHistory.length - 100)
    }
    
    // 전체 상태 계산
    const overallStatus = this.calculateOverallStatus(results)
    
    // 이벤트 발행
    await this.publishHealthCheckEvent({
      checkId,
      component: check.component,
      status: overallStatus,
      results,
      timestamp: Date.now()
    })
    
    return results
  }
  
  private evaluateThresholds(
    result: HealthCheckResult, 
    thresholds: HealthThresholds
  ): void {
    if (!result.metrics || !thresholds) return
    
    for (const [metric, value] of Object.entries(result.metrics)) {
      const threshold = thresholds[metric]
      if (!threshold) continue
      
      if (value > threshold.critical) {
        result.status = HealthStatus.UNHEALTHY
        result.message = `Critical threshold exceeded for ${metric}: ${value} > ${threshold.critical}`
      } else if (value > threshold.warning) {
        if (result.status === HealthStatus.HEALTHY) {
          result.status = HealthStatus.DEGRADED
          result.message = `Warning threshold exceeded for ${metric}: ${value} > ${threshold.warning}`
        }
      }
    }
  }
  
  private calculateOverallStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) return HealthStatus.UNKNOWN
    
    const statusCounts = {
      [HealthStatus.HEALTHY]: 0,
      [HealthStatus.DEGRADED]: 0,
      [HealthStatus.UNHEALTHY]: 0,
      [HealthStatus.UNKNOWN]: 0
    }
    
    for (const result of results) {
      statusCounts[result.status]++
    }
    
    // 가장 심각한 상태 반환
    if (statusCounts[HealthStatus.UNHEALTHY] > 0) {
      return HealthStatus.UNHEALTHY
    } else if (statusCounts[HealthStatus.DEGRADED] > 0) {
      return HealthStatus.DEGRADED
    } else if (statusCounts[HealthStatus.HEALTHY] === results.length) {
      return HealthStatus.HEALTHY
    } else {
      return HealthStatus.UNKNOWN
    }
  }
}

interface HealthThresholds {
  [metric: string]: {
    warning: number
    critical: number
  }
}

interface HealthCheckSchedule {
  interval: number      // 검사 간격 (ms)
  retryInterval?: number // 실패 시 재시도 간격 (ms)
  maxRetries?: number   // 최대 재시도 횟수
}
```

## 장애 감지 및 분석

### 1. 이상 감지 시스템

```typescript
interface AnomalyDetector {
  // 이상 감지
  detectAnomaly(metrics: MetricsData): Promise<AnomalyResult[]>
  
  // 모델 학습
  trainModel(historicalData: MetricsData[]): Promise<void>
  
  // 임계값 동적 조정
  adjustThresholds(anomalies: AnomalyResult[]): Promise<void>
}

class StatisticalAnomalyDetector implements AnomalyDetector {
  private baseline: BaselineMetrics
  private thresholds: AnomalyThresholds
  
  async detectAnomaly(metrics: MetricsData): Promise<AnomalyResult[]> {
    const anomalies: AnomalyResult[] = []
    
    // 1. Z-score 기반 이상 감지
    const zScoreAnomalies = this.detectZScoreAnomalies(metrics)
    anomalies.push(...zScoreAnomalies)
    
    // 2. 이동 평균 기반 이상 감지
    const movingAvgAnomalies = this.detectMovingAverageAnomalies(metrics)
    anomalies.push(...movingAvgAnomalies)
    
    // 3. 급격 변화 감지
    const suddenChangeAnomalies = this.detectSuddenChangeAnomalies(metrics)
    anomalies.push(...suddenChangeAnomalies)
    
    // 4. 패턴 이상 감지
    const patternAnomalies = this.detectPatternAnomalies(metrics)
    anomalies.push(...patternAnomalies)
    
    return anomalies
  }
  
  private detectZScoreAnomalies(metrics: MetricsData): AnomalyResult[] {
    const anomalies: AnomalyResult[] = []
    
    for (const [metric, value] of Object.entries(metrics.values)) {
      const baseline = this.baseline[metric]
      if (!baseline) continue
      
      const mean = baseline.mean
      const stdDev = baseline.standardDeviation
      
      if (stdDev === 0) continue
      
      const zScore = Math.abs((value - mean) / stdDev)
      
      if (zScore > this.thresholds.zScore) {
        anomalies.push({
          type: 'STATISTICAL_OUTLIER',
          metric,
          value,
          baseline: { mean, stdDev },
          severity: this.calculateSeverity(zScore),
          confidence: this.calculateConfidence(zScore),
          timestamp: metrics.timestamp
        })
      }
    }
    
    return anomalies
  }
  
  private detectMovingAverageAnomalies(metrics: MetricsData): AnomalyResult[] {
    const anomalies: AnomalyResult[] = []
    const windowSize = this.thresholds.movingAverageWindow
    
    for (const [metric, value] of Object.entries(metrics.values)) {
      const history = this.getMetricHistory(metric, windowSize)
      
      if (history.length < windowSize) continue
      
      const movingAverage = history.reduce((sum, val) => sum + val, 0) / history.length
      const deviation = Math.abs(value - movingAverage)
      const threshold = movingAverage * this.thresholds.movingAverageThreshold
      
      if (deviation > threshold) {
        anomalies.push({
          type: 'MOVING_AVERAGE_DEVIATION',
          metric,
          value,
          movingAverage,
          deviation,
          severity: this.calculateSeverity(deviation / movingAverage),
          timestamp: metrics.timestamp
        })
      }
    }
    
    return anomalies
  }
  
  private detectSuddenChangeAnomalies(metrics: MetricsData): AnomalyResult[] {
    const anomalies: AnomalyResult[] = []
    
    for (const [metric, value] of Object.entries(metrics.values)) {
      const recentValues = this.getMetricHistory(metric, 2)
      
      if (recentValues.length < 2) continue
      
      const previousValue = recentValues[recentValues.length - 2]
      const changeRate = Math.abs((value - previousValue) / previousValue)
      
      if (changeRate > this.thresholds.suddenChangeThreshold) {
        anomalies.push({
          type: 'SUDDEN_CHANGE',
          metric,
          value,
          previousValue,
          changeRate,
          severity: this.calculateSeverity(changeRate),
          timestamp: metrics.timestamp
        })
      }
    }
    
    return anomalies
  }
  
  async trainModel(historicalData: MetricsData[]): Promise<void> {
    // 기준선 메트릭 계산
    this.baseline = this.calculateBaseline(historicalData)
    
    // 동적 임계값 조정
    this.adjustDynamicThresholds(historicalData)
  }
  
  private calculateBaseline(data: MetricsData[]): BaselineMetrics {
    const baseline: BaselineMetrics = {}
    
    // 각 메트릭에 대한 통계 계산
    const metricValues: Record<string, number[]> = {}
    
    for (const dataPoint of data) {
      for (const [metric, value] of Object.entries(dataPoint.values)) {
        if (!metricValues[metric]) {
          metricValues[metric] = []
        }
        metricValues[metric].push(value)
      }
    }
    
    for (const [metric, values] of Object.entries(metricValues)) {
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
      const standardDeviation = Math.sqrt(variance)
      
      baseline[metric] = { mean, standardDeviation }
    }
    
    return baseline
  }
}

interface AnomalyResult {
  type: AnomalyType
  metric: string
  value: number
  severity: AnomalySeverity
  confidence: number
  timestamp: number
  
  // 추가 정보
  baseline?: { mean: number; standardDeviation: number }
  movingAverage?: number
  deviation?: number
  previousValue?: number
  changeRate?: number
}

type AnomalyType = 
  | 'STATISTICAL_OUTLIER'
  | 'MOVING_AVERAGE_DEVIATION'
  | 'SUDDEN_CHANGE'
  | 'PATTERN_ANOMALY'

enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```

### 2. 장애 상관 분석

```typescript
interface FailureCorrelationAnalyzer {
  // 장애 상관 분석
  analyzeCorrelations(incidents: Incident[]): Promise<CorrelationResult[]>
  
  // 근본 원인 분석
  findRootCause(incident: Incident): Promise<RootCauseAnalysis>
  
  // 장애 패턴 식별
  identifyPatterns(incidents: Incident[]): Promise<FailurePattern[]>
}

class FailureCorrelationAnalyzer implements FailureCorrelationAnalyzer {
  async analyzeCorrelations(incidents: Incident[]): Promise<CorrelationResult[]> {
    const correlations: CorrelationResult[] = []
    
    // 1. 시간적 상관 분석
    const temporalCorrelations = this.analyzeTemporalCorrelations(incidents)
    correlations.push(...temporalCorrelations)
    
    // 2. 컴포넌트 상관 분석
    const componentCorrelations = this.analyzeComponentCorrelations(incidents)
    correlations.push(...componentCorrelations)
    
    // 3. 인과관계 상관 분석
    const causalCorrelations = this.analyzeCausalCorrelations(incidents)
    correlations.push(...causalCorrelations)
    
    return correlations
  }
  
  private analyzeTemporalCorrelations(incidents: Incident[]): CorrelationResult[] {
    const correlations: CorrelationResult[] = []
    
    // 시간 윈도우 내 장애 그룹화
    const timeWindows = this.groupByTimeWindow(incidents, 300000) // 5분 윈도우
    
    for (const window of timeWindows) {
      if (window.incidents.length < 2) continue
      
      // 상관 계수 계산
      const correlation = this.calculateTemporalCorrelation(window.incidents)
      
      if (correlation.strength > 0.7) { // 높은 상관 계수
        correlations.push({
          type: 'TEMPORAL',
          incidents: window.incidents,
          strength: correlation.strength,
          confidence: correlation.confidence,
          timeWindow: window.timeRange,
          description: `Strong temporal correlation detected in ${window.timeRange.duration}ms window`
        })
      }
    }
    
    return correlations
  }
  
  private analyzeComponentCorrelations(incidents: Incident[]): CorrelationResult[] {
    const correlations: CorrelationResult[] = []
    
    // 컴포넌트별 장애 빈도 계산
    const componentFailures = this.groupByComponent(incidents)
    
    for (const [component, componentIncidents] of componentFailures.entries()) {
      if (componentIncidents.length < 2) continue
      
      // 동시 발생 패턴 분석
      const simultaneousFailures = this.findSimultaneousFailures(componentIncidents)
      
      if (simultaneousFailures.length > 0) {
        correlations.push({
          type: 'COMPONENT',
          component,
          incidents: simultaneousFailures,
          strength: this.calculateComponentCorrelationStrength(simultaneousFailures),
          description: `Component ${component} shows correlated failure patterns`
        })
      }
    }
    
    return correlations
  }
  
  async findRootCause(incident: Incident): Promise<RootCauseAnalysis> {
    const analysis: RootCauseAnalysis = {
      incidentId: incident.id,
      possibleCauses: [],
      mostLikelyCause: null,
      confidence: 0,
      evidence: []
    }
    
    // 1. 이벤트 트리 분석
    const eventTree = this.buildEventTree(incident)
    const rootEvents = this.findRootEvents(eventTree)
    
    // 2. 타임라인 분석
    const timeline = this.buildTimeline(incident)
    const criticalPath = this.findCriticalPath(timeline)
    
    // 3. 컴포넌트 의존성 분석
    const dependencyGraph = this.buildDependencyGraph(incident)
    const affectedComponents = this.findAffectedComponents(dependencyGraph)
    
    // 4. 가능한 원인 추론
    const possibleCauses = this.inferPossibleCauses(rootEvents, criticalPath, affectedComponents)
    
    analysis.possibleCauses = possibleCauses
    analysis.mostLikelyCause = this.selectMostLikelyCause(possibleCauses)
    analysis.confidence = this.calculateConfidence(analysis.mostLikelyCause, evidence)
    analysis.evidence = this.collectEvidence(incident, rootEvents, criticalPath)
    
    return analysis
  }
}

interface CorrelationResult {
  type: CorrelationType
  incidents: Incident[]
  strength: number
  confidence: number
  timeWindow?: TimeRange
  component?: string
  description: string
}

type CorrelationType = 
  | 'TEMPORAL'
  | 'COMPONENT'
  | 'CAUSAL'
  | 'ENVIRONMENTAL'

interface RootCauseAnalysis {
  incidentId: string
  possibleCauses: PossibleCause[]
  mostLikelyCause: PossibleCause | null
  confidence: number
  evidence: Evidence[]
}

interface PossibleCause {
  id: string
  description: string
  likelihood: number
  category: CauseCategory
  supportingEvidence: string[]
}
```

## 결론

ZyFlow의 장애 격리 및 자동 복구 메커니즘은 다음과 같은 핵심 특징을 제공합니다:

1. **다단계 격리**: 프로세스, 서비스, 데이터베이스, 네트워크 수준의 격리
2. **서킷 브레이커**: 연쇄적 장애 방지 및 자동 복구
3. **지능형 복구**: 상황에 따른 동적 복구 전략 선택
4. **실시간 헬스체크**: 지속적인 시스템 상태 모니터링
5. **이상 감지**: 통계적 및 머신러닝 기반 조기 장애 감지
6. **상관 분석**: 장애 패턴 식별 및 근본 원인 분석

이 메커니즘들을 통해 ZyFlow는 장애 발생 시에도 안정적인 서비스를 제공하고, 최소한의 개입으로 자동으로 복구할 수 있는 능력을 갖추게 됩니다.