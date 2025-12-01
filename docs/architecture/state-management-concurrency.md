# 상태 관리 모델 및 동시성 제어 전략 설계

## 개요

ZyFlow의 단일 진실 원천 아키텍처에서 상태 관리와 동시성 제어는 시스템의 안정성과 일관성을 보장하는 핵심 요소입니다. 이 설계는 다중 사용자 환경에서의 데이터 무결성을 유지하면서도 높은 성능을 제공하는 것을 목표로 합니다.

## 핵심 원칙

### 1. 낙관적 동시성 제어 (Optimistic Concurrency Control)
- 대부분의 작업이 충돌 없이 완료된다고 가정
- 버전 번호를 통한 충돌 감지
- 충돌 발생 시 재시도 또는 병합 전략 적용

### 2. MVCC (Multi-Version Concurrency Control)
- 여러 버전의 데이터 동시 유지
- 읽기 작업은 항상 특정 시점의 스냅샷 제공
- 쓰기 작업은 새 버전 생성

### 3. 분산 잠금 (Distributed Locking)
- 중요 리소스에 대한 배타적 접근 보장
- 데드락 방지 및 타임아웃 처리
- 계층적 잠금 전략

## 상태 관리 모델

### 1. 버전화된 상태 모델

```typescript
interface VersionedState {
  id: string
  version: number
  timestamp: number
  checksum: string
  
  // 상태 데이터
  data: Record<string, unknown>
  
  // 메타데이터
  metadata: {
    createdBy: string
    updatedBy?: string
    parentId?: string
    branch?: string
    [key: string]: unknown
  }
  
  // 동시성 제어
  concurrency: {
    lockToken?: string
    lockExpiresAt?: number
    expectedVersion?: number
  }
}

interface StateTransition {
  fromVersion: number
  toVersion: number
  operation: string
  timestamp: number
  userId: string
  
  // 변경 내용
  changes: Record<string, { old: unknown; new: unknown }>
  
  // 전환 메타데이터
  metadata: {
    reason?: string
    context?: Record<string, unknown>
    [key: string]: unknown
  }
}
```

### 2. 상태 관리자 인터페이스

```typescript
interface StateManager<T = Record<string, unknown>> {
  // 상태 조회
  getState(id: string, version?: number): Promise<VersionedState<T> | null>
  getCurrentState(id: string): Promise<VersionedState<T> | null>
  getStateHistory(id: string, options?: HistoryOptions): Promise<StateTransition[]>
  
  // 상태 수정
  updateState(
    id: string, 
    updates: Partial<T>, 
    options?: UpdateOptions
  ): Promise<StateUpdateResult<T>>
  
  // 동시성 제어
  acquireLock(id: string, options?: LockOptions): Promise<LockToken | null>
  releaseLock(token: LockToken): Promise<boolean>
  extendLock(token: LockToken, duration: number): Promise<boolean>
  
  // 상태 검증
  validateState(id: string): Promise<StateValidationResult>
  compareStates(id1: string, id2: string): Promise<StateComparison>
}

interface UpdateOptions {
  expectedVersion?: number
  lockToken?: string
  reason?: string
  metadata?: Record<string, unknown>
  autoRetry?: boolean
  maxRetries?: number
}

interface LockOptions {
  duration?: number // 밀리초
  timeout?: number  // 대기 시간
  exclusive?: boolean
  metadata?: Record<string, unknown>
}

interface HistoryOptions {
  fromVersion?: number
  toVersion?: number
  timeRange?: { start: number; end: number }
  limit?: number
  includeMetadata?: boolean
}

interface StateUpdateResult<T> {
  success: boolean
  state?: VersionedState<T>
  conflict?: StateConflict
  error?: Error
  
  // 업데이트 정보
  transition?: StateTransition
  newVersion?: number
}

interface StateConflict {
  type: ConflictType
  expectedVersion: number
  actualVersion: number
  conflictingUpdates: Record<string, unknown>
  resolution?: ConflictResolution
}

type ConflictType = 
  | 'VERSION_CONFLICT'    // 버전 충돌
  | 'SIMULTANEOUS_UPDATE' // 동시 업데이트
  | 'LOCK_CONFLICT'       // 잠금 충돌
  | 'DEPENDENCY_CONFLICT'  // 의존성 충돌

interface ConflictResolution {
  strategy: ResolutionStrategy
  resolvedState?: Record<string, unknown>
  requiresManualIntervention?: boolean
}
```

### 3. 낙관적 잠금 구현

```typescript
class OptimisticLockManager {
  private locks = new Map<string, LockInfo>()
  
  async acquireLock(
    resourceId: string, 
    expectedVersion: number,
    options: LockOptions = {}
  ): Promise<LockToken | null> {
    const currentLock = this.locks.get(resourceId)
    
    // 기존 잠금 확인
    if (currentLock && !this.isExpired(currentLock)) {
      if (currentLock.exclusive || options.exclusive) {
        return null // 잠금 획득 실패
      }
    }
    
    const lockToken: LockToken = {
      id: this.generateLockId(),
      resourceId,
      expectedVersion,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + (options.duration || 30000), // 기본 30초
      exclusive: options.exclusive || false,
      userId: options.metadata?.userId,
      metadata: options.metadata
    }
    
    this.locks.set(resourceId, {
      token: lockToken,
      version: expectedVersion
    })
    
    return lockToken
  }
  
  async releaseLock(token: LockToken): Promise<boolean> {
    const lockInfo = this.locks.get(token.resourceId)
    
    if (!lockInfo || lockInfo.token.id !== token.id) {
      return false
    }
    
    this.locks.delete(token.resourceId)
    return true
  }
  
  async validateLock(token: LockToken): Promise<boolean> {
    const lockInfo = this.locks.get(token.resourceId)
    
    if (!lockInfo || lockInfo.token.id !== token.id) {
      return false
    }
    
    if (this.isExpired(lockInfo)) {
      this.locks.delete(token.resourceId)
      return false
    }
    
    return true
  }
  
  private isExpired(lockInfo: LockInfo): boolean {
    return Date.now() > lockInfo.token.expiresAt
  }
  
  private generateLockId(): string {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

interface LockToken {
  id: string
  resourceId: string
  expectedVersion: number
  acquiredAt: number
  expiresAt: number
  exclusive: boolean
  userId?: string
  metadata?: Record<string, unknown>
}

interface LockInfo {
  token: LockToken
  version: number
}
```

### 4. MVCC 구현

```typescript
class MVCCStateManager<T> implements StateManager<T> {
  private versions = new Map<string, VersionedState<T>[]>()
  private lockManager = new OptimisticLockManager()
  
  async getCurrentState(id: string): Promise<VersionedState<T> | null> {
    const versions = this.versions.get(id) || []
    if (versions.length === 0) return null
    
    // 가장 최신 버전 반환
    return versions[versions.length - 1]
  }
  
  async getState(id: string, version: number): Promise<VersionedState<T> | null> {
    const versions = this.versions.get(id) || []
    return versions.find(v => v.version === version) || null
  }
  
  async updateState(
    id: string,
    updates: Partial<T>,
    options: UpdateOptions = {}
  ): Promise<StateUpdateResult<T>> {
    const currentState = await this.getCurrentState(id)
    
    // 버전 충돌 검사
    if (options.expectedVersion && currentState) {
      if (currentState.version !== options.expectedVersion) {
        return {
          success: false,
          conflict: {
            type: 'VERSION_CONFLICT',
            expectedVersion: options.expectedVersion,
            actualVersion: currentState.version,
            conflictingUpdates: updates
          }
        }
      }
    }
    
    // 잠금 검사
    if (options.lockToken) {
      const lockValid = await this.lockManager.validateLock(options.lockToken)
      if (!lockValid) {
        return {
          success: false,
          conflict: {
            type: 'LOCK_CONFLICT',
            expectedVersion: options.expectedVersion || 0,
            actualVersion: currentState?.version || 0,
            conflictingUpdates: updates
          }
        }
      }
    }
    
    // 새 버전 생성
    const newVersion = (currentState?.version || 0) + 1
    const newData = currentState ? { ...currentState.data, ...updates } : updates as T
    
    const newState: VersionedState<T> = {
      id,
      version: newVersion,
      timestamp: Date.now(),
      checksum: this.calculateChecksum(newData),
      data: newData,
      metadata: {
        createdBy: options.metadata?.userId || 'system',
        updatedBy: options.metadata?.userId,
        parentId: currentState?.id,
        ...options.metadata
      }
    }
    
    // 상태 저장
    if (!this.versions.has(id)) {
      this.versions.set(id, [])
    }
    this.versions.get(id)!.push(newState)
    
    // 전환 기록
    const transition: StateTransition = {
      fromVersion: currentState?.version || 0,
      toVersion: newVersion,
      operation: 'UPDATE',
      timestamp: Date.now(),
      userId: options.metadata?.userId || 'system',
      changes: this.extractChanges(currentState?.data || {}, updates),
      metadata: {
        reason: options.reason,
        context: options.metadata
      }
    }
    
    return {
      success: true,
      state: newState,
      newVersion,
      transition
    }
  }
  
  async acquireLock(id: string, options: LockOptions = {}): Promise<LockToken | null> {
    const currentState = await this.getCurrentState(id)
    const expectedVersion = currentState?.version || 0
    
    return await this.lockManager.acquireLock(id, expectedVersion, options)
  }
  
  async releaseLock(token: LockToken): Promise<boolean> {
    return await this.lockManager.releaseLock(token)
  }
  
  async validateState(id: string): Promise<StateValidationResult> {
    const state = await this.getCurrentState(id)
    
    if (!state) {
      return {
        valid: false,
        issues: [{ type: 'MISSING_STATE', description: `State not found: ${id}` }]
      }
    }
    
    const issues: StateIssue[] = []
    
    // 체크섬 검증
    const expectedChecksum = this.calculateChecksum(state.data)
    if (state.checksum !== expectedChecksum) {
      issues.push({
        type: 'CHECKSUM_MISMATCH',
        description: `Checksum mismatch for state ${id}`,
        expected: expectedChecksum,
        actual: state.checksum
      })
    }
    
    // 버전 무결성 검증
    const versions = this.versions.get(id) || []
    for (let i = 1; i < versions.length; i++) {
      if (versions[i].version !== versions[i-1].version + 1) {
        issues.push({
          type: 'VERSION_GAP',
          description: `Version gap detected between ${versions[i-1].version} and ${versions[i].version}`
        })
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    }
  }
  
  private calculateChecksum(data: Record<string, unknown>): string {
    const content = JSON.stringify(data, Object.keys(data).sort())
    return require('crypto').createHash('sha256').update(content).digest('hex')
  }
  
  private extractChanges(
    oldData: Record<string, unknown>, 
    newData: Record<string, unknown>
  ): Record<string, { old: unknown; new: unknown }> {
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    
    // 모든 키 수집
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
    
    for (const key of allKeys) {
      const oldValue = oldData[key]
      const newValue = newData[key]
      
      if (oldValue !== newValue) {
        changes[key] = { old: oldValue, new: newValue }
      }
    }
    
    return changes
  }
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
```

## 동시성 제어 전략

### 1. 계층적 잠금 전략

```typescript
interface LockHierarchy {
  // 리소스 계층 구조
  levels: LockLevel[]
  
  // 잠금 획득 순서
  acquireOrder: string[]
}

interface LockLevel {
  name: string
  resources: string[]
  timeout: number
  exclusive: boolean
}

class HierarchicalLockManager {
  private hierarchy: LockHierarchy
  private lockManagers = new Map<string, OptimisticLockManager>()
  
  constructor(hierarchy: LockHierarchy) {
    this.hierarchy = hierarchy
    
    // 각 레벨별 잠금 관리자 생성
    hierarchy.levels.forEach(level => {
      this.lockManagers.set(level.name, new OptimisticLockManager())
    })
  }
  
  async acquireMultipleLocks(
    resourceId: string,
    levels: string[],
    options: LockOptions = {}
  ): Promise<LockToken[]> {
    // 계층 순서에 따라 잠금 획득
    const sortedLevels = this.sortByHierarchy(levels)
    const tokens: LockToken[] = []
    
    try {
      for (const levelName of sortedLevels) {
        const lockManager = this.lockManagers.get(levelName)
        if (!lockManager) {
          throw new Error(`Unknown lock level: ${levelName}`)
        }
        
        const levelOptions = this.getLevelOptions(levelName, options)
        const token = await lockManager.acquireLock(resourceId, 0, levelOptions)
        
        if (!token) {
          // 잠금 획득 실패 시 이미 획득한 잠금 해제
          await this.releaseMultipleLocks(tokens)
          return []
        }
        
        tokens.push(token)
      }
      
      return tokens
    } catch (error) {
      // 오류 발생 시 정리
      await this.releaseMultipleLocks(tokens)
      throw error
    }
  }
  
  async releaseMultipleLocks(tokens: LockToken[]): Promise<boolean> {
    const results = await Promise.allSettled(
      tokens.map(token => {
        const lockManager = this.lockManagers.get(this.getLockLevel(token.resourceId))
        return lockManager?.releaseLock(token) || Promise.resolve(false)
      })
    )
    
    return results.every(result => result.status === 'fulfilled' && result.value)
  }
  
  private sortByHierarchy(levels: string[]): string[] {
    return levels.sort((a, b) => {
      const orderA = this.hierarchy.acquireOrder.indexOf(a)
      const orderB = this.hierarchy.acquireOrder.indexOf(b)
      return orderA - orderB
    })
  }
  
  private getLevelOptions(levelName: string, options: LockOptions): LockOptions {
    const level = this.hierarchy.levels.find(l => l.name === levelName)
    if (!level) return options
    
    return {
      ...options,
      duration: options.duration || level.timeout,
      exclusive: options.exclusive !== undefined ? options.exclusive : level.exclusive
    }
  }
  
  private getLockLevel(resourceId: string): string {
    // 리소스 ID에서 레벨 추출
    const parts = resourceId.split(':')
    return parts[0] // 첫 부분이 레벨
  }
}
```

### 2. 분산 트랜잭션 관리

```typescript
interface DistributedTransaction {
  id: string
  participants: TransactionParticipant[]
  status: TransactionStatus
  createdAt: number
  timeoutAt: number
  
  // 2PC 상태
  prepareResults?: Map<string, boolean>
  commitResults?: Map<string, boolean>
}

interface TransactionParticipant {
  id: string
  resourceId: string
  operation: TransactionOperation
  prepare: () => Promise<boolean>
  commit: () => Promise<boolean>
  rollback: () => Promise<boolean>
}

enum TransactionStatus {
  ACTIVE = 'ACTIVE',
  PREPARING = 'PREPARING',
  PREPARED = 'PREPARED',
  COMMITTING = 'COMMITTING',
  COMMITTED = 'COMMITTED',
  ABORTING = 'ABORTING',
  ABORTED = 'ABORTED',
  TIMEOUT = 'TIMEOUT'
}

class DistributedTransactionManager {
  private transactions = new Map<string, DistributedTransaction>()
  private lockManager: HierarchicalLockManager
  
  constructor(lockManager: HierarchicalLockManager) {
    this.lockManager = lockManager
  }
  
  async executeTransaction(
    participants: TransactionParticipant[],
    timeout: number = 30000
  ): Promise<boolean> {
    const transaction: DistributedTransaction = {
      id: this.generateTransactionId(),
      participants,
      status: TransactionStatus.ACTIVE,
      createdAt: Date.now(),
      timeoutAt: Date.now() + timeout
    }
    
    this.transactions.set(transaction.id, transaction)
    
    try {
      // 2-Phase Commit 실행
      return await this.executeTwoPhaseCommit(transaction)
    } finally {
      this.transactions.delete(transaction.id)
    }
  }
  
  private async executeTwoPhaseCommit(
    transaction: DistributedTransaction
  ): Promise<boolean> {
    // Phase 1: Prepare
    transaction.status = TransactionStatus.PREPARING
    const prepareResults = new Map<string, boolean>()
    
    for (const participant of transaction.participants) {
      try {
        const result = await Promise.race([
          participant.prepare(),
          this.createTimeoutPromise(transaction.timeoutAt - Date.now())
        ])
        
        prepareResults.set(participant.id, result)
        
        if (!result) {
          // Prepare 실패 시 롤백
          await this.abortTransaction(transaction, prepareResults)
          return false
        }
      } catch (error) {
        // 오류 발생 시 롤백
        await this.abortTransaction(transaction, prepareResults)
        return false
      }
    }
    
    transaction.prepareResults = prepareResults
    transaction.status = TransactionStatus.PREPARED
    
    // Phase 2: Commit
    transaction.status = TransactionStatus.COMMITTING
    const commitResults = new Map<string, boolean>()
    
    for (const participant of transaction.participants) {
      try {
        const result = await Promise.race([
          participant.commit(),
          this.createTimeoutPromise(transaction.timeoutAt - Date.now())
        ])
        
        commitResults.set(participant.id, result)
        
        if (!result) {
          console.error(`Commit failed for participant ${participant.id}`)
          // 실제 시스템에서는 보상 트랜잭션 실행
        }
      } catch (error) {
        console.error(`Commit error for participant ${participant.id}:`, error)
        commitResults.set(participant.id, false)
      }
    }
    
    transaction.commitResults = commitResults
    
    const allCommitted = Array.from(commitResults.values()).every(result => result)
    transaction.status = allCommitted ? TransactionStatus.COMMITTED : TransactionStatus.ABORTED
    
    return allCommitted
  }
  
  private async abortTransaction(
    transaction: DistributedTransaction,
    prepareResults: Map<string, boolean>
  ): Promise<void> {
    transaction.status = TransactionStatus.ABORTING
    
    // Prepare 성공한 참여자들 롤백
    const rollbackPromises = transaction.participants
      .filter(p => prepareResults.get(p.id) === true)
      .map(p => p.rollback().catch(error => 
        console.error(`Rollback failed for participant ${p.id}:`, error)
      ))
    
    await Promise.allSettled(rollbackPromises)
    transaction.status = TransactionStatus.ABORTED
  }
  
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Transaction timeout')), timeout)
    })
  }
  
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}
```

### 3. 충돌 해결 전략

```typescript
interface ConflictResolver {
  resolveConflict<T>(
    conflict: StateConflict,
    currentState: VersionedState<T>,
    requestedUpdates: Partial<T>
  ): Promise<ConflictResolution>
}

class ThreeWayMergeResolver implements ConflictResolver {
  async resolveConflict<T>(
    conflict: StateConflict,
    currentState: VersionedState<T>,
    requestedUpdates: Partial<T>
  ): Promise<ConflictResolution> {
    switch (conflict.type) {
      case 'VERSION_CONFLICT':
        return await this.resolveVersionConflict(currentState, requestedUpdates)
      
      case 'SIMULTANEOUS_UPDATE':
        return await this.resolveSimultaneousUpdate(conflict, currentState, requestedUpdates)
      
      default:
        return {
          strategy: 'MANUAL',
          requiresManualIntervention: true
        }
    }
  }
  
  private async resolveVersionConflict<T>(
    currentState: VersionedState<T>,
    requestedUpdates: Partial<T>
  ): Promise<ConflictResolution> {
    // 3-way merge 시도
    const baseState = await this.getBaseState(currentState.id, conflict.expectedVersion)
    if (!baseState) {
      return {
        strategy: 'MANUAL',
        requiresManualIntervention: true
      }
    }
    
    const mergeResult = await this.threeWayMerge(
      baseState.data,
      currentState.data,
      requestedUpdates
    )
    
    if (mergeResult.success) {
      return {
        strategy: 'MERGE',
        resolvedState: mergeResult.mergedState
      }
    }
    
    // 자동 병합 실패 시 전략 선택
    return this.selectFallbackStrategy(currentState, requestedUpdates)
  }
  
  private async threeWayMerge<T>(
    base: T,
    current: T,
    requested: Partial<T>
  ): Promise<{ success: boolean; mergedState?: T }> {
    const merged: any = { ...current }
    const conflicts: string[] = []
    
    for (const [key, newValue] of Object.entries(requested)) {
      const baseValue = (base as any)[key]
      const currentValue = (current as any)[key]
      
      // 값이 동일한 경우
      if (currentValue === newValue) {
        continue
      }
      
      // base와 동일한 경우
      if (baseValue === newValue) {
        merged[key] = currentValue
        continue
      }
      
      // base와 동일한 경우
      if (baseValue === currentValue) {
        merged[key] = newValue
        continue
      }
      
      // 충돌 발생
      conflicts.push(key)
    }
    
    if (conflicts.length > 0) {
      return { success: false }
    }
    
    return { success: true, mergedState: merged }
  }
  
  private selectFallbackStrategy<T>(
    currentState: VersionedState<T>,
    requestedUpdates: Partial<T>
  ): ConflictResolution {
    // 타임스탬프 기반 전략
    if (currentState.timestamp > Date.now() - 60000) { // 1분 이내 업데이트
      return {
        strategy: 'CURRENT_WINS',
        resolvedState: currentState.data
      }
    }
    
    // 사용자 우선 전략
    return {
      strategy: 'REQUESTED_WINS',
      resolvedState: { ...currentState.data, ...requestedUpdates }
    }
  }
}
```

## 성능 최적화

### 1. 상태 캐싱

```typescript
interface StateCache {
  get<T>(key: string): Promise<VersionedState<T> | null>
  set<T>(key: string, state: VersionedState<T>, ttl?: number): Promise<void>
  invalidate(key: string): Promise<void>
  invalidatePattern(pattern: string): Promise<void>
}

class MultiLevelStateCache implements StateCache {
  private l1Cache = new Map<string, CacheEntry>() // 인메모리
  private l2Cache?: StateCache // Redis 등 외부 캐시
  
  constructor(l2Cache?: StateCache) {
    this.l2Cache = l2Cache
  }
  
  async get<T>(key: string): Promise<VersionedState<T> | null> {
    // L1 캐시 확인
    const l1Entry = this.l1Cache.get(key)
    if (l1Entry && !this.isExpired(l1Entry)) {
      return l1Entry.state as VersionedState<T>
    }
    
    // L2 캐시 확인
    if (this.l2Cache) {
      const l2State = await this.l2Cache.get<T>(key)
      if (l2State) {
        // L1 캐시에 저장
        this.l1Cache.set(key, {
          state: l2State,
          expiresAt: Date.now() + 300000 // 5분
        })
        return l2State
      }
    }
    
    return null
  }
  
  async set<T>(key: string, state: VersionedState<T>, ttl = 300000): Promise<void> {
    // L1 캐시에 저장
    this.l1Cache.set(key, {
      state,
      expiresAt: Date.now() + ttl
    })
    
    // L2 캐시에 저장
    if (this.l2Cache) {
      await this.l2Cache.set(key, state, ttl)
    }
  }
  
  async invalidate(key: string): Promise<void> {
    this.l1Cache.delete(key)
    if (this.l2Cache) {
      await this.l2Cache.invalidate(key)
    }
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    // L1 캐시에서 패턴 매칭 항목 삭제
    for (const key of this.l1Cache.keys()) {
      if (this.matchesPattern(key, pattern)) {
        this.l1Cache.delete(key)
      }
    }
    
    // L2 캐시에서 패턴 매칭 항목 삭제
    if (this.l2Cache) {
      await this.l2Cache.invalidatePattern(pattern)
    }
  }
  
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt
  }
  
  private matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return regex.test(key)
  }
}

interface CacheEntry {
  state: VersionedState
  expiresAt: number
}
```

### 2. 배치 상태 업데이트

```typescript
class BatchStateUpdater<T> {
  private pendingUpdates = new Map<string, PendingUpdate<T>>()
  private batchSize = 50
  private flushInterval = 1000 // 1초
  private flushTimer?: NodeJS.Timeout
  
  constructor(
    private stateManager: StateManager<T>,
    private conflictResolver: ConflictResolver
  ) {
    this.startFlushTimer()
  }
  
  async scheduleUpdate(
    id: string,
    updates: Partial<T>,
    options?: UpdateOptions
  ): Promise<StateUpdateResult<T>> {
    const updateId = this.generateUpdateId()
    
    // 대기열에 추가
    this.pendingUpdates.set(id, {
      id: updateId,
      resourceId: id,
      updates,
      options,
      timestamp: Date.now()
    })
    
    // 배치 크기 확인
    if (this.pendingUpdates.size >= this.batchSize) {
      await this.flushUpdates()
    }
    
    // 결과를 기다림
    return await this.waitForUpdateResult(updateId)
  }
  
  private async flushUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return
    
    const updates = Array.from(this.pendingUpdates.values())
    this.pendingUpdates.clear()
    
    // 리소스별로 그룹화
    const groupedUpdates = this.groupByResource(updates)
    
    // 병렬 처리
    const results = await Promise.allSettled(
      Array.from(groupedUpdates.entries()).map(([resourceId, resourceUpdates]) =>
        this.processResourceUpdates(resourceId, resourceUpdates)
      )
    )
    
    // 결과 처리
    results.forEach(result => {
      if (result.status === 'rejected') {
        console.error('Batch update failed:', result.reason)
      }
    })
  }
  
  private async processResourceUpdates(
    resourceId: string,
    updates: PendingUpdate<T>[]
  ): Promise<void> {
    // 업데이트 순서 정렬 (타임스탬프 기준)
    updates.sort((a, b) => a.timestamp - b.timestamp)
    
    let currentState = await this.stateManager.getCurrentState(resourceId)
    
    for (const update of updates) {
      const result = await this.stateManager.updateState(
        resourceId,
        update.updates,
        {
          ...update.options,
          expectedVersion: currentState?.version
        }
      )
      
      if (result.success) {
        currentState = result.state
        this.resolveUpdate(update.id, result)
      } else if (result.conflict) {
        // 충돌 해결 시도
        const resolution = await this.conflictResolver.resolveConflict(
          result.conflict,
          currentState!,
          update.updates
        )
        
        if (resolution.resolvedState) {
          const retryResult = await this.stateManager.updateState(
            resourceId,
            resolution.resolvedState,
            update.options
          )
          
          if (retryResult.success) {
            currentState = retryResult.state
            this.resolveUpdate(update.id, retryResult)
          } else {
            this.resolveUpdate(update.id, retryResult)
          }
        } else {
          this.resolveUpdate(update.id, result)
        }
      } else {
        this.resolveUpdate(update.id, result)
      }
    }
  }
  
  private resolveUpdate(updateId: string, result: StateUpdateResult<T>): void {
    // 결과를 대기 중인 요청에 전달
    // 실제 구현에서는 Promise 또는 이벤트 기반으로 구현
  }
  
  private async waitForUpdateResult(updateId: string): Promise<StateUpdateResult<T>> {
    // 실제 구현에서는 Promise 기반 대기
    return new Promise((resolve) => {
      // 결과 대기 로직
    })
  }
  
  private groupByResource(updates: PendingUpdate<T>[]): Map<string, PendingUpdate<T>[]> {
    const grouped = new Map<string, PendingUpdate<T>[]>()
    
    for (const update of updates) {
      if (!grouped.has(update.resourceId)) {
        grouped.set(update.resourceId, [])
      }
      grouped.get(update.resourceId)!.push(update)
    }
    
    return grouped
  }
  
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushUpdates().catch(error => 
        console.error('Flush timer error:', error)
      )
    }, this.flushInterval)
  }
  
  private generateUpdateId(): string {
    return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

interface PendingUpdate<T> {
  id: string
  resourceId: string
  updates: Partial<T>
  options?: UpdateOptions
  timestamp: number
}
```

## 모니터링 및 진단

### 1. 동시성 메트릭

```typescript
interface ConcurrencyMetrics {
  // 잠금 메트릭
  lockAcquisitions: number
  lockContentions: number
  lockWaitTime: number
  lockHoldTime: number
  
  // 트랜잭션 메트릭
  transactionsStarted: number
  transactionsCommitted: number
  transactionsAborted: number
  transactionDuration: number
  
  // 충돌 메트릭
  conflictsDetected: number
  conflictsResolved: number
  conflictResolutionTime: number
  
  // 상태 메트릭
  stateUpdates: number
  stateReads: number
  cacheHitRate: number
}

class ConcurrencyMonitor {
  private metrics: ConcurrencyMetrics = this.initializeMetrics()
  private timers = new Map<string, number>()
  
  recordLockAcquisition(resourceId: string, waitTime: number): void {
    this.metrics.lockAcquisitions++
    this.metrics.lockWaitTime = (this.metrics.lockWaitTime + waitTime) / 2
  }
  
  recordLockContention(resourceId: string): void {
    this.metrics.lockContentions++
  }
  
  recordLockRelease(resourceId: string, holdTime: number): void {
    this.metrics.lockHoldTime = (this.metrics.lockHoldTime + holdTime) / 2
  }
  
  recordTransactionStart(transactionId: string): void {
    this.metrics.transactionsStarted++
    this.timers.set(transactionId, Date.now())
  }
  
  recordTransactionCommit(transactionId: string): void {
    this.metrics.transactionsCommitted++
    this.recordTransactionEnd(transactionId)
  }
  
  recordTransactionAbort(transactionId: string): void {
    this.metrics.transactionsAborted++
    this.recordTransactionEnd(transactionId)
  }
  
  private recordTransactionEnd(transactionId: string): void {
    const startTime = this.timers.get(transactionId)
    if (startTime) {
      const duration = Date.now() - startTime
      this.metrics.transactionDuration = (this.metrics.transactionDuration + duration) / 2
      this.timers.delete(transactionId)
    }
  }
  
  getMetrics(): ConcurrencyMetrics {
    return { ...this.metrics }
  }
  
  private initializeMetrics(): ConcurrencyMetrics {
    return {
      lockAcquisitions: 0,
      lockContentions: 0,
      lockWaitTime: 0,
      lockHoldTime: 0,
      transactionsStarted: 0,
      transactionsCommitted: 0,
      transactionsAborted: 0,
      transactionDuration: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      conflictResolutionTime: 0,
      stateUpdates: 0,
      stateReads: 0,
      cacheHitRate: 0
    }
  }
}
```

## 결론

ZyFlow의 상태 관리 모델 및 동시성 제어 전략은 다음과 같은 핵심 특징을 제공합니다:

1. **낙관적 동시성 제어**: 높은 동시성 처리 능력
2. **MVCC**: 일관된 읽기 스냅샷 제공
3. **계층적 잠금**: 데드락 방지 및 효율적인 리소스 관리
4. **분산 트랜잭션**: 다중 리소스의 원자성 보장
5. **자동 충돌 해결**: 3-way merge 등 지능형 해결 전략
6. **성능 최적화**: 다단계 캐싱 및 배치 처리

이 전략들은 ZyFlow가 다중 사용자 환경에서도 데이터 일관성을 유지하면서 높은 성능을 제공할 수 있는 기반이 됩니다.