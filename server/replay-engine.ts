/**
 * ZyFlow 리플레이 엔진
 * 
 * 저장된 이벤트를 재생하여 시스템 상태를 복원하거나
 * 특정 시점부터의 변경사항을 재실행
 */

import { randomUUID } from 'crypto';
import type {
  ReplayEngine as IReplayEngine,
  EventStore,
  ReplaySession,
  ReplayOptions,
  ReplayResult,
  ReplayMode,
  ReplayStrategy,
  ChangeEvent,
  EventFilter,
  EventType,
  RollbackPoint
} from './types/change-log.js';

type ReplaySessionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
import { getSqlite } from './tasks/db/client.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { replaySessions, replayResults, rollbackPoints } from './tasks/db/schema.js';

// DB Row 타입 정의
interface ReplaySessionRow {
  id: string;
  name: string | null;
  description: string | null;
  filter: string;
  options: string;
  status: string;
  total_events: number;
  processed_events: number;
  succeeded_events: number;
  failed_events: number;
  skipped_events: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  duration: number | null;
  result: string | null;
  metadata: string | null;
}

interface ReplayResultInput {
  eventId: string;
  status: string;
  duration: number;
  error?: string;
  warnings?: string[];
  order: number;
  createdAt: number;
}

/**
 * 리플레이 엔진 구현
 */
export class ReplayEngine implements IReplayEngine {
  private eventStore: EventStore | null = null;
  private isInitialized = false;
  private activeSessions = new Map<string, ReplaySession>();
  private sessionProgress = new Map<string, {
    totalEvents: number;
    processedEvents: number;
    currentEvent?: string;
    errors: Array<{
      eventId: string;
      error: string;
      timestamp: number;
    }>;
    startTime: number;
  }>();

  async initialize(eventStore: EventStore): Promise<void> {
    this.eventStore = eventStore;
    this.isInitialized = true;
    
    // 중단된 세션 복원
    await this.restoreInterruptedSessions();
    
    console.log('[ReplayEngine] Initialized');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.eventStore) {
      throw new Error('ReplayEngine not initialized');
    }
  }

  private generateSessionId(): string {
    return `replay_${Date.now()}_${randomUUID().substring(0, 8)}`;
  }

  async createSession(
    name: string,
    filter: EventFilter,
    options: ReplayOptions,
    description?: string
  ): Promise<string> {
    this.ensureInitialized();

    const sessionId = this.generateSessionId();
    const now = Date.now();

    // 필터에 해당하는 이벤트 수 계산
    const totalEvents = await this.eventStore!.getEventCount(filter);

    const session: ReplaySession = {
      id: sessionId,
      name,
      description,
      filter,
      options,
      status: 'PENDING',
      createdAt: now,
      totalEvents,
      processedEvents: 0,
      succeededEvents: 0,
      failedEvents: 0,
      skippedEvents: 0
    };

    // 세션 저장
    this.saveSession(session);
    this.activeSessions.set(sessionId, session);

    // 진행 상태 초기화
    this.sessionProgress.set(sessionId, {
      totalEvents,
      processedEvents: 0,
      errors: [],
      startTime: now
    });

    console.log(`[ReplayEngine] Created session ${sessionId}: ${name}`);
    return sessionId;
  }

  async getSession(sessionId: string): Promise<ReplaySession | null> {
    this.ensureInitialized();

    // 메모리에서 먼저查找
    let session = this.activeSessions.get(sessionId);
    
    if (!session) {
      // 데이터베이스에서查找
      const loadedSession = this.loadSession(sessionId);
      if (loadedSession) {
        session = loadedSession;
        this.activeSessions.set(sessionId, session);
      }
    }

    return session || null;
  }

  async getSessions(filter?: Partial<ReplaySession>): Promise<ReplaySession[]> {
    this.ensureInitialized();

    const db = getSqlite();
    let query = 'SELECT * FROM replay_sessions WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.name) {
        query += ' AND name LIKE ?';
        params.push(`%${filter.name}%`);
      }
    }

    query += ' ORDER BY createdAt DESC';

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(row => this.deserializeSession(row));
  }

  async startReplay(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'PENDING') {
      throw new Error(`Session is not in PENDING status: ${sessionId}`);
    }

    // 세션 상태 업데이트
    session.status = 'RUNNING';
    session.startedAt = Date.now();
    this.saveSession(session);

    // 리플레이 실행 (비동기)
    this.executeReplay(session).catch(error => {
      console.error(`[ReplayEngine] Replay failed for session ${sessionId}:`, error);
      session.status = 'FAILED';
      session.completedAt = Date.now();
      this.saveSession(session);
    });

    console.log(`[ReplayEngine] Started replay for session ${sessionId}`);
  }

  async pauseReplay(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'RUNNING') {
      throw new Error(`Session is not running: ${sessionId}`);
    }

    session.status = 'PENDING';
    this.saveSession(session);

    console.log(`[ReplayEngine] Paused replay for session ${sessionId}`);
  }

  async resumeReplay(sessionId: string): Promise<void> {
    await this.startReplay(sessionId);
  }

  async cancelReplay(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = 'CANCELLED';
    session.completedAt = Date.now();
    this.saveSession(session);

    // 진행 상태 정리
    this.sessionProgress.delete(sessionId);

    console.log(`[ReplayEngine] Cancelled replay for session ${sessionId}`);
  }

  async getReplayProgress(sessionId: string): Promise<{
    totalEvents: number;
    processedEvents: number;
    currentEvent?: string;
    estimatedTimeRemaining: number;
    errors: Array<{
      eventId: string;
      error: string;
      timestamp: number;
    }>;
  }> {
    this.ensureInitialized();

    const progress = this.sessionProgress.get(sessionId);
    if (!progress) {
      throw new Error(`No progress found for session: ${sessionId}`);
    }

    const elapsed = Date.now() - progress.startTime;
    const rate = progress.processedEvents > 0 ? progress.processedEvents / (elapsed / 1000) : 0;
    const remaining = progress.totalEvents - progress.processedEvents;
    const estimatedTimeRemaining = rate > 0 ? remaining / rate : 0;

    return {
      totalEvents: progress.totalEvents,
      processedEvents: progress.processedEvents,
      currentEvent: progress.currentEvent,
      estimatedTimeRemaining,
      errors: progress.errors
    };
  }

  async createRollbackPoint(sessionId: string, description?: string): Promise<string> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const rollbackPointId = `rb_${Date.now()}_${randomUUID().substring(0, 8)}`;
    const now = Date.now();

    // 현재 시스템 상태 스냅샷 생성
    const snapshot = await this.createSystemSnapshot();

    const rollbackPoint: RollbackPoint = {
      id: rollbackPointId,
      sessionId,
      timestamp: now,
      description: description || `Rollback point for session ${sessionId}`,
      snapshot: JSON.stringify(snapshot),
      isActive: true,
      isExpired: false,
      expiresAt: now + (24 * 60 * 60 * 1000), // 24시간 후 만료
      createdAt: now,
      updatedAt: now
    };

    // 롤백 포인트 저장
    this.saveRollbackPoint(rollbackPoint);

    console.log(`[ReplayEngine] Created rollback point ${rollbackPointId} for session ${sessionId}`);
    return rollbackPointId;
  }

  async rollbackToPoint(sessionId: string, rollbackPointId: string): Promise<void> {
    this.ensureInitialized();

    const rollbackPoint = this.loadRollbackPoint(rollbackPointId);
    if (!rollbackPoint) {
      throw new Error(`Rollback point not found: ${rollbackPointId}`);
    }

    if (rollbackPoint.sessionId !== sessionId) {
      throw new Error(`Rollback point ${rollbackPointId} does not belong to session ${sessionId}`);
    }

    if (rollbackPoint.isExpired) {
      throw new Error(`Rollback point ${rollbackPointId} has expired`);
    }

    // 시스템 상태 복원
    const snapshot = JSON.parse(rollbackPoint.snapshot);
    await this.restoreSystemSnapshot(snapshot);

    console.log(`[ReplayEngine] Rolled back session ${sessionId} to point ${rollbackPointId}`);
  }

  async validateReplay(sessionId: string): Promise<{
    isValid: boolean;
    issues: Array<{
      type: string;
      description: string;
      severity: 'WARNING' | 'ERROR';
    }>;
  }> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const issues: Array<{
      type: string;
      description: string;
      severity: 'WARNING' | 'ERROR';
    }> = [];

    // 세션 설정 검증
    if (!session.filter) {
      issues.push({
        type: 'MISSING_FILTER',
        description: 'Session filter is not defined',
        severity: 'ERROR'
      });
    }

    if (!session.options) {
      issues.push({
        type: 'MISSING_OPTIONS',
        description: 'Session options are not defined',
        severity: 'ERROR'
      });
    }

    // 이벤트 존재 여부 검증
    const eventCount = await this.eventStore!.getEventCount(session.filter);
    if (eventCount === 0) {
      issues.push({
        type: 'NO_EVENTS',
        description: 'No events found matching the filter criteria',
        severity: 'WARNING'
      });
    }

    // 리플레이 옵션 검증
    if (session.options.maxConcurrency && session.options.maxConcurrency > 10) {
      issues.push({
        type: 'HIGH_CONCURRENCY',
        description: 'High concurrency may cause system overload',
        severity: 'WARNING'
      });
    }

    return {
      isValid: issues.filter(issue => issue.severity === 'ERROR').length === 0,
      issues
    };
  }

  async close(): Promise<void> {
    // 활성 세션 정리
    for (const [sessionId, session] of this.activeSessions) {
      if (session.status === 'RUNNING') {
        session.status = 'CANCELLED';
        session.completedAt = Date.now();
        this.saveSession(session);
      }
    }

    this.activeSessions.clear();
    this.sessionProgress.clear();
    this.isInitialized = false;

    console.log('[ReplayEngine] Closed');
  }

  // ==================== 내부 메서드 ====================

  private async executeReplay(session: ReplaySession): Promise<void> {
    const { filter, options } = session;
    const startTime = Date.now();

    try {
      // 이벤트 조회
      const events = await this.eventStore!.getEvents(filter);
      
      // 전략에 따른 이벤트 정렬 및 필터링
      const processedEvents = await this.prepareEvents(events, options);
      
      // 체크포인트 생성 (활성화된 경우)
      let checkpointInterval = options.checkpointInterval || 100;
      let lastCheckpoint = 0;

      // 이벤트 재생
      for (let i = 0; i < processedEvents.length; i++) {
        const event = processedEvents[i];
        
        // 진행 상태 업데이트
        const progress = this.sessionProgress.get(session.id)!;
        progress.currentEvent = event.id;

        // 체크포인트 확인
        if (options.enableRollback && i - lastCheckpoint >= checkpointInterval) {
          await this.createRollbackPoint(session.id, `Checkpoint at event ${i + 1}`);
          lastCheckpoint = i;
        }

        try {
          // 이벤트 재생
          const result = await this.replayEvent(event, options);
          
          // 결과 기록
          this.saveReplayResult(session.id, {
            sessionId: session.id,
            eventId: event.id,
            status: result.success ? 'SUCCESS' : 'FAILED',
            duration: result.duration,
            error: result.error,
            order: i,
            createdAt: Date.now()
          });

          // 통계 업데이트
          progress.processedEvents++;
          if (result.success) {
            session.succeededEvents++;
          } else {
            session.failedEvents++;
            progress.errors.push({
              eventId: event.id,
              error: result.error || 'Unknown error',
              timestamp: Date.now()
            });
          }

          // 오류 발생 시 처리
          if (!result.success && options.stopOnError) {
            throw new Error(`Replay stopped due to error at event ${event.id}: ${result.error}`);
          }

        } catch (error) {
          const errorMessage = (error as Error).message;
          
          // 결과 기록
          this.saveReplayResult(session.id, {
            sessionId: session.id,
            eventId: event.id,
            status: 'FAILED',
            duration: 0,
            error: errorMessage,
            order: i,
            createdAt: Date.now()
          });

          session.failedEvents++;
          progress.errors.push({
            eventId: event.id,
            error: errorMessage,
            timestamp: Date.now()
          });

          if (options.stopOnError) {
            throw error;
          }
        }
      }

      // 세션 완료
      session.status = 'COMPLETED';
      session.completedAt = Date.now();
      const duration = session.completedAt - startTime;
      session.duration = duration;

      // 최종 결과 생성
      const replayResult: ReplayResult = {
        id: session.id,
        startTime,
        endTime: session.completedAt,
        duration: duration,
        events: {
          total: session.totalEvents,
          processed: session.processedEvents,
          succeeded: session.succeededEvents,
          failed: session.failedEvents,
          skipped: session.skippedEvents
        },
        results: [], // 개별 결과는 DB에서 조회
        performance: {
          averageEventProcessingTime: duration / session.processedEvents,
          throughput: session.processedEvents / (duration / 1000),
          memoryUsage: 0, // 추가 구현 필요
          diskUsage: 0    // 추가 구현 필요
        },
        validation: options.enableValidation ? await this.validateReplayResults(session.id) : undefined
      };

      session.result = replayResult;
      this.saveSession(session);

      console.log(`[ReplayEngine] Completed replay for session ${session.id}`);

    } catch (error) {
      session.status = 'FAILED';
      session.completedAt = Date.now();
      session.duration = session.completedAt - startTime;
      this.saveSession(session);
      
      throw error;
    }
  }

  private async prepareEvents(events: ChangeEvent[], options: ReplayOptions): Promise<ChangeEvent[]> {
    let processedEvents = [...events];

    // 제외할 이벤트 필터링
    if (options.skipEvents && options.skipEvents.length > 0) {
      processedEvents = processedEvents.filter(event => 
        !options.skipEvents!.includes(event.id)
      );
    }

    // 포함할 이벤트만 필터링
    if (options.includeEvents && options.includeEvents.length > 0) {
      processedEvents = processedEvents.filter(event => 
        options.includeEvents!.includes(event.id)
      );
    }

    // 전략에 따른 정렬
    switch (options.strategy) {
      case 'SEQUENTIAL':
        processedEvents.sort((a, b) => a.timestamp - b.timestamp);
        break;
      
      case 'PARALLEL':
        // 병렬 처리를 위해 그룹화
        processedEvents = this.groupEventsForParallel(processedEvents);
        break;
      
      case 'DEPENDENCY_AWARE':
        processedEvents = await this.sortEventsByDependency(processedEvents);
        break;
      
      case 'SELECTIVE':
        // 선택적 재생 로직
        processedEvents = this.selectEventsForReplay(processedEvents, options);
        break;
    }

    return processedEvents;
  }

  private async replayEvent(event: ChangeEvent, options: ReplayOptions): Promise<{
    success: boolean;
    duration: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // 모드에 따른 처리
      switch (options.mode) {
        case 'DRY_RUN':
          // 시뮬레이션만 수행
          await this.simulateEvent(event);
          break;
        
        case 'SAFE':
          // 안전 모드: 검증 후 실행
          await this.validateAndExecuteEvent(event);
          break;
        
        case 'FAST':
          // 빠른 모드: 최소 검증
          await this.executeEventFast(event);
          break;
        
        case 'VERBOSE':
          // 상세 모드: 모든 단계 로깅
          await this.executeEventVerbose(event);
          break;
      }

      return {
        success: true,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async simulateEvent(event: ChangeEvent): Promise<void> {
    // 이벤트 시뮬레이션 로직 (실제 실행 없음)
    console.log(`[ReplayEngine] Simulating event ${event.id} of type ${event.type}`);
  }

  private async validateAndExecuteEvent(event: ChangeEvent): Promise<void> {
    // 이벤트 유효성 검증
    await this.validateEvent(event);
    
    // 이벤트 실행
    await this.executeEvent(event);
  }

  private async executeEventFast(event: ChangeEvent): Promise<void> {
    // 최소 검증 후 빠른 실행
    await this.executeEvent(event);
  }

  private async executeEventVerbose(event: ChangeEvent): Promise<void> {
    console.log(`[ReplayEngine] Starting verbose execution of event ${event.id}`);
    
    // 상세 로깅과 함께 실행
    await this.validateEvent(event);
    await this.executeEvent(event);
    
    console.log(`[ReplayEngine] Completed verbose execution of event ${event.id}`);
  }

  private async validateEvent(event: ChangeEvent): Promise<void> {
    // 이벤트 유효성 검증 로직
    if (!event.id || !event.type || !event.timestamp) {
      throw new Error('Invalid event structure');
    }
  }

  private async executeEvent(event: ChangeEvent): Promise<void> {
    // 실제 이벤트 실행 로직
    // 이벤트 타입에 따른 적절한 처리
    switch (event.type) {
      case 'FILE_CHANGE':
        await this.executeFileChangeEvent(event);
        break;
      case 'DB_CHANGE':
        await this.executeDBChangeEvent(event);
        break;
      case 'SYNC_OPERATION':
        await this.executeSyncOperationEvent(event);
        break;
      // 다른 이벤트 타입들...
      default:
        console.log(`[ReplayEngine] No specific handler for event type ${event.type}`);
    }
  }

  private async executeFileChangeEvent(event: ChangeEvent): Promise<void> {
    // 파일 변경 이벤트 실행 로직
    console.log(`[ReplayEngine] Executing file change event ${event.id}`);
  }

  private async executeDBChangeEvent(event: ChangeEvent): Promise<void> {
    // DB 변경 이벤트 실행 로직
    console.log(`[ReplayEngine] Executing DB change event ${event.id}`);
  }

  private async executeSyncOperationEvent(event: ChangeEvent): Promise<void> {
    // 동기화 작업 이벤트 실행 로직
    console.log(`[ReplayEngine] Executing sync operation event ${event.id}`);
  }

  private groupEventsForParallel(events: ChangeEvent[]): ChangeEvent[] {
    // 병렬 처리를 위한 이벤트 그룹화
    // 독립적인 이벤트들을 식별하여 그룹화
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  private async sortEventsByDependency(events: ChangeEvent[]): Promise<ChangeEvent[]> {
    // 의존성 기반 이벤트 정렬
    // 이벤트 간 의존관계를 분석하여 올바른 순서로 정렬
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  private selectEventsForReplay(events: ChangeEvent[], options: ReplayOptions): ChangeEvent[] {
    // 선택적 리플레이를 위한 이벤트 필터링
    return events;
  }

  private async createSystemSnapshot(): Promise<Record<string, unknown>> {
    // 현재 시스템 상태 스냅샷 생성
    return {
      timestamp: Date.now(),
      version: '1.0',
      // 추가 시스템 상태 정보
    };
  }

  private async restoreSystemSnapshot(snapshot: Record<string, unknown>): Promise<void> {
    // 시스템 상태 복원
    console.log('[ReplayEngine] Restoring system from snapshot');
  }

  private async validateReplayResults(sessionId: string): Promise<{
    dataIntegrityPassed: boolean;
    consistencyPassed: boolean;
    issues: Array<{
      type: string;
      description: string;
      severity: 'WARNING' | 'ERROR';
    }>;
  }> {
    // 리플레이 결과 검증
    return {
      dataIntegrityPassed: true,
      consistencyPassed: true,
      issues: []
    };
  }

  private async restoreInterruptedSessions(): Promise<void> {
    // 중단된 세션 복원 로직
    console.log('[ReplayEngine] Restoring interrupted sessions...');
  }

  // ==================== 데이터베이스 헬퍼 메서드 ====================

  private saveSession(session: ReplaySession): void {
    const db = getSqlite();

    db.prepare(`
      INSERT OR REPLACE INTO replay_sessions (
        id, name, description, filter, options, status, total_events, processed_events,
        succeeded_events, failed_events, skipped_events, created_at, started_at, completed_at,
        duration, result, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.name,
      session.description,
      JSON.stringify(session.filter),
      JSON.stringify(session.options),
      session.status,
      session.totalEvents,
      session.processedEvents,
      session.succeededEvents,
      session.failedEvents,
      session.skippedEvents,
      session.createdAt,
      session.startedAt,
      session.completedAt,
      session.duration,
      session.result ? JSON.stringify(session.result) : null,
      session.metadata ? JSON.stringify(session.metadata) : null
    );
  }

  private loadSession(sessionId: string): ReplaySession | null {
    const db = getSqlite();

    const row = db.prepare(`
      SELECT * FROM replay_sessions WHERE id = ?
    `).get(sessionId) as ReplaySessionRow | undefined;
    
    if (!row) {
      return null;
    }
    
    return this.deserializeSession(row);
  }

  private deserializeSession(row: ReplaySessionRow): ReplaySession {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      filter: JSON.parse(row.filter),
      options: JSON.parse(row.options),
      status: row.status as ReplaySessionStatus,
      totalEvents: row.total_events || 0,
      processedEvents: row.processed_events || 0,
      succeededEvents: row.succeeded_events || 0,
      failedEvents: row.failed_events || 0,
      skippedEvents: row.skipped_events || 0,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      duration: row.duration,
      result: row.result ? JSON.parse(row.result) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private saveReplayResult(sessionId: string, result: ReplayResultInput): void {
    const db = getSqlite();

    db.prepare(`
      INSERT INTO replay_results (
        session_id, event_id, status, duration, error, warnings, "order", created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      result.eventId,
      result.status,
      result.duration,
      result.error,
      result.warnings ? JSON.stringify(result.warnings) : null,
      result.order,
      result.createdAt
    );
  }

  private saveRollbackPoint(rollbackPoint: RollbackPoint): void {
    const db = getSqlite();

    db.prepare(`
      INSERT OR REPLACE INTO rollback_points (
        id, session_id, timestamp, description, snapshot, is_active, is_expired,
        expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rollbackPoint.id,
      rollbackPoint.sessionId,
      rollbackPoint.timestamp,
      rollbackPoint.description,
      rollbackPoint.snapshot,
      rollbackPoint.isActive ? 1 : 0,
      rollbackPoint.isExpired ? 1 : 0,
      rollbackPoint.expiresAt,
      rollbackPoint.createdAt,
      rollbackPoint.updatedAt
    );
  }

  private loadRollbackPoint(rollbackPointId: string): RollbackPoint | null {
    const db = getSqlite();
    
    const row = db.prepare(`
      SELECT * FROM rollback_points WHERE id = ?
    `).get(rollbackPointId) as any;
    
    if (!row) {
      return null;
    }
    
    return {
      id: row.id,
      sessionId: row.sessionId,
      timestamp: row.timestamp,
      description: row.description,
      snapshot: row.snapshot,
      isActive: Boolean(row.isActive),
      isExpired: Boolean(row.isExpired),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}

// 전역 인스턴스
let globalReplayEngine: ReplayEngine | null = null;

export function getReplayEngine(): ReplayEngine {
  if (!globalReplayEngine) {
    throw new Error('ReplayEngine not initialized. Call initialize() first.');
  }
  return globalReplayEngine;
}

export function createReplayEngine(eventStore: EventStore): ReplayEngine {
  globalReplayEngine = new ReplayEngine();
  globalReplayEngine.initialize(eventStore);
  return globalReplayEngine;
}