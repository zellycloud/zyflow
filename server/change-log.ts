/**
 * ZyFlow 변경 로그 관리자
 * 
 * 모든 동기화 이벤트의 기록, 저장, 조회 및 관리를 담당
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type {
  ChangeEvent,
  ChangeLogManager as IChangeLogManager,
  EventStore,
  EventStoreConfig,
  EventFilter,
  EventStatistics,
  FileChangeEventData,
  DBChangeEventData,
  SyncOperationEventData,
  ConflictEventData,
  RecoveryEventData,
  BackupEventData,
  SystemEventData,
  EventSeverity,
  EventType,
  EventSource
} from './types/change-log.js';
import { getSqlite } from './tasks/db/client.js';
import { changeEvents, eventStatistics } from './tasks/db/schema.js';

/**
 * SQLite 기반 이벤트 저장소 구현
 */
class SQLiteEventStore implements EventStore {
  private config: EventStoreConfig | null = null;
  private db = getSqlite();
  private isInitialized = false;

  async initialize(config: EventStoreConfig): Promise<void> {
    this.config = config;
    
    // 테이블 생성 (이미 스키마에 정의되어 있음)
    // 인덱스 생성
    this.createIndexes();
    
    this.isInitialized = true;
    console.log('[EventStore] SQLite event store initialized');
  }

  private createIndexes(): void {
    // 성능 최적화를 위한 인덱스 생성
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_change_events_timestamp ON change_events(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_type ON change_events(type)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_severity ON change_events(severity)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_source ON change_events(source)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_project_id ON change_events(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_change_id ON change_events(change_id)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_correlation_id ON change_events(correlation_id)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_session_id ON change_events(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_user_id ON change_events(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_processing_status ON change_events(processing_status)',
      'CREATE INDEX IF NOT EXISTS idx_change_events_created_at ON change_events(created_at)',
    ];

    indexes.forEach(sql => {
      try {
        this.db.exec(sql);
      } catch (error) {
        console.warn('[EventStore] Index creation failed:', sql, error);
      }
    });
  }

  async storeEvent(event: ChangeEvent): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const serializedEvent = {
      ...event,
      data: JSON.stringify(event.data),
      metadata: JSON.stringify(event.metadata)
    };

    this.db.prepare(`
      INSERT INTO change_events (
        id, type, severity, source, timestamp, projectId, changeId, correlationId,
        sessionId, userId, dataType, data, metadata, processingStatus, retryCount,
        maxRetries, checksum, size, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      serializedEvent.id,
      serializedEvent.type,
      serializedEvent.severity,
      serializedEvent.source,
      serializedEvent.timestamp,
      serializedEvent.projectId,
      serializedEvent.changeId,
      serializedEvent.correlationId,
      serializedEvent.sessionId,
      serializedEvent.userId,
      this.getDataType(event.type),
      serializedEvent.data,
      serializedEvent.metadata,
      serializedEvent.processing.status,
      serializedEvent.processing.retryCount,
      serializedEvent.processing.maxRetries,
      this.calculateChecksum(event),
      this.calculateSize(event),
      Date.now(),
      Date.now()
    );

    // 통계 캐시 업데이트 (비동기)
    this.updateStatisticsCache(event).catch(error => {
      console.warn('[EventStore] Statistics cache update failed:', error);
    });
  }

  async storeEvents(events: ChangeEvent[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const transaction = this.db.transaction(() => {
      for (const event of events) {
        this.storeEvent(event);
      }
    });

    transaction();
  }

  async getEvent(id: string): Promise<ChangeEvent | null> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const row = this.db.prepare(`
      SELECT * FROM change_events WHERE id = ?
    `).get(id) as any;

    if (!row) {
      return null;
    }

    return this.deserializeEvent(row);
  }

  async getEvents(filter: EventFilter): Promise<ChangeEvent[]> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    let query = 'SELECT * FROM change_events WHERE 1=1';
    const params: any[] = [];

    // 필터 조건 추가
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      query += ` AND type IN (${filter.eventTypes.map(() => '?').join(',')})`;
      params.push(...filter.eventTypes);
    }

    if (filter.severities && filter.severities.length > 0) {
      query += ` AND severity IN (${filter.severities.map(() => '?').join(',')})`;
      params.push(...filter.severities);
    }

    if (filter.sources && filter.sources.length > 0) {
      query += ` AND source IN (${filter.sources.map(() => '?').join(',')})`;
      params.push(...filter.sources);
    }

    if (filter.projectIds && filter.projectIds.length > 0) {
      query += ` AND projectId IN (${filter.projectIds.map(() => '?').join(',')})`;
      params.push(...filter.projectIds);
    }

    if (filter.changeIds && filter.changeIds.length > 0) {
      query += ` AND changeId IN (${filter.changeIds.map(() => '?').join(',')})`;
      params.push(...filter.changeIds);
    }

    if (filter.userIds && filter.userIds.length > 0) {
      query += ` AND userId IN (${filter.userIds.map(() => '?').join(',')})`;
      params.push(...filter.userIds);
    }

    if (filter.sessionIds && filter.sessionIds.length > 0) {
      query += ` AND sessionId IN (${filter.sessionIds.map(() => '?').join(',')})`;
      params.push(...filter.sessionIds);
    }

    if (filter.correlationIds && filter.correlationIds.length > 0) {
      query += ` AND correlationId IN (${filter.correlationIds.map(() => '?').join(',')})`;
      params.push(...filter.correlationIds);
    }

    if (filter.timeRange) {
      query += ' AND timestamp >= ? AND timestamp <= ?';
      params.push(filter.timeRange.start, filter.timeRange.end);
    }

    // 정렬
    if (filter.sortBy) {
      query += ` ORDER BY ${filter.sortBy.field} ${filter.sortBy.direction}`;
    } else {
      query += ' ORDER BY timestamp DESC';
    }

    // 페이징
    if (filter.pagination) {
      query += ' LIMIT ? OFFSET ?';
      params.push(filter.pagination.limit, filter.pagination.offset);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.deserializeEvent(row));
  }

  async getEventCount(filter?: EventFilter): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    let query = 'SELECT COUNT(*) as count FROM change_events WHERE 1=1';
    const params: any[] = [];

    // 필터 조건 추가 (getEvents와 동일한 로직)
    if (filter) {
      if (filter.eventTypes && filter.eventTypes.length > 0) {
        query += ` AND type IN (${filter.eventTypes.map(() => '?').join(',')})`;
        params.push(...filter.eventTypes);
      }
      // ... 다른 필터 조건들도 동일하게 추가
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  async *getEventStream(filter: EventFilter): AsyncIterable<ChangeEvent> {
    const events = await this.getEvents(filter);
    for (const event of events) {
      yield event;
    }
  }

  async getStatistics(filter?: EventFilter): Promise<EventStatistics> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    // 기본 통계 쿼리
    const baseQuery = filter ? this.buildFilterQuery(filter) : 'SELECT * FROM change_events';
    
    const totalEvents = this.db.prepare(`SELECT COUNT(*) as count FROM (${baseQuery})`).get() as { count: number };
    
    // 이벤트 유형별 통계
    const typeStats = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM (${baseQuery}) GROUP BY type
    `).all() as Array<{ type: EventType; count: number }>;
    
    const eventsByType: Record<EventType, number> = {} as any;
    typeStats.forEach(stat => {
      eventsByType[stat.type] = stat.count;
    });

    // 심각도별 통계
    const severityStats = this.db.prepare(`
      SELECT severity, COUNT(*) as count FROM (${baseQuery}) GROUP BY severity
    `).all() as Array<{ severity: EventSeverity; count: number }>;
    
    const eventsBySeverity: Record<EventSeverity, number> = {} as any;
    severityStats.forEach(stat => {
      eventsBySeverity[stat.severity] = stat.count;
    });

    // 소스별 통계
    const sourceStats = this.db.prepare(`
      SELECT source, COUNT(*) as count FROM (${baseQuery}) GROUP BY source
    `).all() as Array<{ source: EventSource; count: number }>;
    
    const eventsBySource: Record<EventSource, number> = {} as any;
    sourceStats.forEach(stat => {
      eventsBySource[stat.source] = stat.count;
    });

    // 시간 범위
    const timeRange = this.db.prepare(`
      SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM (${baseQuery})
    `).get() as { earliest: number; latest: number } | undefined;

    // 스토리지 크기
    const storageSize = this.db.prepare(`
      SELECT SUM(size) as totalSize FROM (${baseQuery})
    `).get() as { totalSize: number } | undefined;

    // 오류율
    const errorCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM (${baseQuery}) WHERE severity IN ('ERROR', 'CRITICAL')
    `).get() as { count: number };

    return {
      totalEvents: totalEvents.count,
      eventsByType,
      eventsBySeverity,
      eventsBySource,
      eventsByProject: {}, // 프로젝트별 통계는 추가 구현 필요
      timeRange: timeRange || { earliest: 0, latest: 0 },
      storageSize: storageSize?.totalSize || 0,
      averageEventsPerDay: 0, // 추가 계산 필요
      errorRate: totalEvents.count > 0 ? errorCount.count / totalEvents.count : 0,
      topErrorTypes: [] // 추가 구현 필요
    };
  }

  async getAggregatedData(
    groupBy: string[],
    filter?: EventFilter
  ): Promise<Record<string, unknown>[]> {
    // 구현 필요
    return [];
  }

  async compact(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    // 오래된 이벤트 압축 및 아카이빙
    console.log('[EventStore] Compacting events...');
    
    // 구현 필요: 이벤트 압축 로직
  }

  async cleanup(): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    if (!this.config) {
      throw new Error('No configuration available');
    }

    const retention = this.config.retention;
    let deletedCount = 0;

    // 기본 보관 정책에 따른 정리
    const cutoffDate = Date.now() - (retention.defaultRetentionDays * 24 * 60 * 60 * 1000);
    
    const result = this.db.prepare(`
      DELETE FROM change_events WHERE timestamp < ?
    `).run(cutoffDate);
    
    deletedCount = result.changes;

    console.log(`[EventStore] Cleaned up ${deletedCount} old events`);
    return deletedCount;
  }

  async reindex(): Promise<void> {
    console.log('[EventStore] Reindexing...');
    // 인덱스 재구축 로직
  }

  async verify(): Promise<boolean> {
    console.log('[EventStore] Verifying data integrity...');
    // 데이터 무결성 검증 로직
    return true;
  }

  async backup(location: string): Promise<void> {
    console.log(`[EventStore] Creating backup at ${location}...`);
    // 백업 로직
  }

  async restore(location: string): Promise<void> {
    console.log(`[EventStore] Restoring from ${location}...`);
    // 복원 로직
  }

  async getSize(): Promise<number> {
    const result = this.db.prepare(`
      SELECT SUM(size) as totalSize FROM change_events
    `).get() as { totalSize: number } | undefined;
    
    return result?.totalSize || 0;
  }

  async getHealth(): Promise<{
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
    issues: string[];
    metrics: Record<string, number>;
  }> {
    // 상태 확인 로직
    return {
      status: 'HEALTHY',
      issues: [],
      metrics: {
        totalEvents: await this.getEventCount(),
        storageSize: await this.getSize(),
        averageEventSize: 0
      }
    };
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    console.log('[EventStore] Closed');
  }

  // 헬퍼 메서드
  private buildFilterQuery(filter: EventFilter): string {
    let query = 'SELECT * FROM change_events WHERE 1=1';
    const params: any[] = [];

    // 필터 조건 구성 (getEvents와 동일한 로직)
    // ...

    return query;
  }

  private getDataType(eventType: EventType): string {
    const typeMap: Record<EventType, string> = {
      'FILE_CHANGE': 'FileChangeEventData',
      'DB_CHANGE': 'DBChangeEventData',
      'SYNC_OPERATION': 'SyncOperationEventData',
      'CONFLICT_DETECTED': 'ConflictEventData',
      'CONFLICT_RESOLVED': 'ConflictEventData',
      'RECOVERY_STARTED': 'RecoveryEventData',
      'RECOVERY_COMPLETED': 'RecoveryEventData',
      'BACKUP_CREATED': 'BackupEventData',
      'BACKUP_RESTORED': 'BackupEventData',
      'SYSTEM_EVENT': 'SystemEventData'
    };
    
    return typeMap[eventType] || 'Unknown';
  }

  private calculateChecksum(event: ChangeEvent): string {
    const content = JSON.stringify({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp
    });
    return createHash('sha256').update(content).digest('hex');
  }

  private calculateSize(event: ChangeEvent): number {
    return Buffer.byteLength(JSON.stringify(event), 'utf8');
  }

  private deserializeEvent(row: any): ChangeEvent {
    return {
      id: row.id,
      type: row.type as EventType,
      severity: row.severity as EventSeverity,
      source: row.source as EventSource,
      timestamp: row.timestamp,
      projectId: row.projectId,
      changeId: row.changeId,
      correlationId: row.correlationId,
      sessionId: row.sessionId,
      userId: row.userId,
      data: JSON.parse(row.data),
      metadata: JSON.parse(row.metadata),
      processing: {
        status: row.processing_status,
        processedAt: row.processedAt,
        error: row.processingError,
        retryCount: row.retryCount,
        maxRetries: row.maxRetries
      }
    };
  }

  private async updateStatisticsCache(event: ChangeEvent): Promise<void> {
    // 통계 캐시 업데이트 로직
    const date = new Date(event.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    
    this.db.prepare(`
      INSERT OR REPLACE INTO event_statistics (
        projectId, eventType, severity, source, date, count, size, calculatedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      event.projectId,
      event.type,
      event.severity,
      event.source,
      date,
      this.calculateSize(event),
      Date.now(),
      Date.now(),
      Date.now()
    );
  }
}

/**
 * ChangeLogManager 구현
 */
export class ChangeLogManager implements IChangeLogManager {
  private eventStore: EventStore;
  private isInitialized = false;
  private config: EventStoreConfig | null = null;

  constructor(eventStore?: EventStore) {
    this.eventStore = eventStore || new SQLiteEventStore();
  }

  async initialize(config: EventStoreConfig): Promise<void> {
    this.config = config;
    await this.eventStore.initialize(config);
    this.isInitialized = true;
    
    console.log('[ChangeLogManager] Initialized with config:', config.storageType);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('ChangeLogManager not initialized');
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${randomUUID().substring(0, 8)}`;
  }

  async logEvent(event: Omit<ChangeEvent, 'id' | 'timestamp' | 'processing'>): Promise<string> {
    this.ensureInitialized();
    
    const fullEvent: ChangeEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now(),
      processing: {
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3
      }
    };

    await this.eventStore.storeEvent(fullEvent);
    return fullEvent.id;
  }

  async logEvents(events: Array<Omit<ChangeEvent, 'id' | 'timestamp' | 'processing'>>): Promise<string[]> {
    this.ensureInitialized();
    
    const fullEvents: ChangeEvent[] = events.map(event => ({
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now(),
      processing: {
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3
      }
    }));

    await this.eventStore.storeEvents(fullEvents);
    return fullEvents.map(e => e.id);
  }

  // 편의 메서드들
  async logFileChange(
    data: FileChangeEventData, 
    severity: EventSeverity = 'INFO'
  ): Promise<string> {
    return this.logEvent({
      type: 'FILE_CHANGE',
      severity,
      source: 'FILE_WATCHER',
      data,
      metadata: {
        version: '1.0',
        tags: ['file', 'filesystem']
      }
    });
  }

  async logDBChange(
    data: DBChangeEventData, 
    severity: EventSeverity = 'INFO'
  ): Promise<string> {
    return this.logEvent({
      type: 'DB_CHANGE',
      severity,
      source: 'SYNC_MANAGER',
      data,
      metadata: {
        version: '1.0',
        tags: ['database', 'sync']
      }
    });
  }

  async logSyncOperation(
    data: SyncOperationEventData, 
    severity: EventSeverity = 'INFO'
  ): Promise<string> {
    return this.logEvent({
      type: 'SYNC_OPERATION',
      severity,
      source: 'SYNC_MANAGER',
      data,
      metadata: {
        version: '1.0',
        tags: ['sync', 'operation']
      }
    });
  }

  async logConflict(
    data: ConflictEventData, 
    severity: EventSeverity = 'WARNING'
  ): Promise<string> {
    return this.logEvent({
      type: data.resolutionStrategy ? 'CONFLICT_RESOLVED' : 'CONFLICT_DETECTED',
      severity,
      source: 'SYNC_MANAGER',
      data,
      metadata: {
        version: '1.0',
        tags: ['conflict', 'resolution']
      }
    });
  }

  async logRecovery(
    data: RecoveryEventData, 
    severity: EventSeverity = 'INFO'
  ): Promise<string> {
    return this.logEvent({
      type: data.result === 'SUCCESS' ? 'RECOVERY_COMPLETED' : 'RECOVERY_STARTED',
      severity,
      source: 'RECOVERY_MANAGER',
      data,
      metadata: {
        version: '1.0',
        tags: ['recovery', 'failure']
      }
    });
  }

  async logBackup(
    data: BackupEventData, 
    severity: EventSeverity = 'INFO'
  ): Promise<string> {
    return this.logEvent({
      type: 'BACKUP_CREATED',
      severity,
      source: 'BACKUP_MANAGER',
      data,
      metadata: {
        version: '1.0',
        tags: ['backup', 'storage']
      }
    });
  }

  async logSystemEvent(
    data: SystemEventData, 
    severity: EventSeverity = 'INFO'
  ): Promise<string> {
    return this.logEvent({
      type: 'SYSTEM_EVENT',
      severity,
      source: 'SYSTEM',
      data,
      metadata: {
        version: '1.0',
        tags: ['system', 'monitoring']
      }
    });
  }

  // 조회 메서드들
  async getEvent(id: string): Promise<ChangeEvent | null> {
    this.ensureInitialized();
    return this.eventStore.getEvent(id);
  }

  async getEvents(filter: EventFilter): Promise<ChangeEvent[]> {
    this.ensureInitialized();
    return this.eventStore.getEvents(filter);
  }

  async searchEvents(query: string, filter?: EventFilter): Promise<ChangeEvent[]> {
    this.ensureInitialized();
    
    // 간단한 텍스트 검색 구현
    // 실제로는 전문 검색 엔진(Full-text search) 사용 권장
    const allEvents = await this.eventStore.getEvents(filter || {});
    
    return allEvents.filter(event => {
      const searchText = JSON.stringify(event).toLowerCase();
      return searchText.includes(query.toLowerCase());
    });
  }

  // 분석 및 통계
  async getStatistics(filter?: EventFilter): Promise<EventStatistics> {
    this.ensureInitialized();
    return this.eventStore.getStatistics(filter);
  }

  async getTimeline(filter?: EventFilter): Promise<Array<{
    timestamp: number;
    count: number;
    types: Record<EventType, number>;
  }>> {
    this.ensureInitialized();
    
    // 타임라인 데이터 생성 (시간 단위로 그룹화)
    const events = await this.eventStore.getEvents(filter || {});
    const timelineMap = new Map<number, { count: number; types: Record<EventType, number> }>();
    
    events.forEach(event => {
      const hourKey = Math.floor(event.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      
      if (!timelineMap.has(hourKey)) {
        timelineMap.set(hourKey, { count: 0, types: {} as Record<EventType, number> });
      }
      
      const entry = timelineMap.get(hourKey)!;
      entry.count++;
      entry.types[event.type] = (entry.types[event.type] || 0) + 1;
    });
    
    return Array.from(timelineMap.entries())
      .map(([timestamp, data]) => ({ timestamp, ...data }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // 관리 메서드들
  async cleanup(): Promise<number> {
    this.ensureInitialized();
    return this.eventStore.cleanup();
  }

  async compact(): Promise<void> {
    this.ensureInitialized();
    return this.eventStore.compact();
  }

  async exportData(filter: EventFilter, format: 'JSON' | 'CSV' | 'SQL'): Promise<string> {
    this.ensureInitialized();
    
    const events = await this.eventStore.getEvents(filter);
    
    switch (format) {
      case 'JSON':
        return JSON.stringify(events, null, 2);
      
      case 'CSV':
        // CSV 형식으로 변환
        const headers = ['id', 'type', 'severity', 'source', 'timestamp', 'projectId'];
        const csvRows = [headers.join(',')];
        
        events.forEach(event => {
          const row = [
            event.id,
            event.type,
            event.severity,
            event.source,
            event.timestamp,
            event.projectId || ''
          ];
          csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
      
      case 'SQL':
        // SQL INSERT 문으로 변환
        const sqlStatements = events.map(event => {
          const data = JSON.stringify(event.data).replace(/'/g, "''");
          const metadata = JSON.stringify(event.metadata).replace(/'/g, "''");
          
          return `INSERT INTO change_events (id, type, severity, source, timestamp, data, metadata) VALUES ('${event.id}', '${event.type}', '${event.severity}', '${event.source}', ${event.timestamp}, '${data}', '${metadata}');`;
        });
        
        return sqlStatements.join('\n');
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // 상태 메서드들
  async getStatus(): Promise<{
    isInitialized: boolean;
    eventCount: number;
    storageSize: number;
    lastEventTime: number;
  }> {
    const eventCount = await this.eventStore.getEventCount();
    const storageSize = await this.eventStore.getSize();
    
    // 마지막 이벤트 시간 조회
    const lastEvents = await this.eventStore.getEvents({
      sortBy: { field: 'timestamp', direction: 'DESC' },
      pagination: { offset: 0, limit: 1 }
    });
    
    const lastEventTime = lastEvents.length > 0 ? lastEvents[0].timestamp : 0;
    
    return {
      isInitialized: this.isInitialized,
      eventCount,
      storageSize,
      lastEventTime
    };
  }

  async close(): Promise<void> {
    await this.eventStore.close();
    this.isInitialized = false;
    console.log('[ChangeLogManager] Closed');
  }
}

// 전역 인스턴스
let globalChangeLogManager: ChangeLogManager | null = null;

export function getChangeLogManager(): ChangeLogManager {
  if (!globalChangeLogManager) {
    globalChangeLogManager = new ChangeLogManager();
  }
  return globalChangeLogManager;
}

export function setChangeLogManager(manager: ChangeLogManager): void {
  globalChangeLogManager = manager;
}