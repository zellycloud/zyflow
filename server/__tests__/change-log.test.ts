/**
 * ChangeLogManager 단위 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ChangeLogManager } from '../change-log.js'
import { getSqlite } from '../tasks/db/client.js'
import type { EventFilter, EventType } from '../types/change-log.js'
import type Database from 'better-sqlite3'

describe('ChangeLogManager', () => {
  let changeLogManager: ChangeLogManager
  let db: Database.Database

  beforeEach(async () => {
    // 테스트용 데이터베이스 초기화
    db = getSqlite()
    
    // 테이블 초기화
    db.exec(`DELETE FROM change_events`)
    
    // ChangeLogManager 인스턴스 생성
    changeLogManager = new ChangeLogManager()
    
    // 설정으로 초기화
    await changeLogManager.initialize({
      storageType: 'SQLITE',
      retention: {
        defaultRetentionDays: 30,
        bySeverity: {
          'DEBUG': 7,
          'INFO': 30,
          'WARNING': 90,
          'ERROR': 180,
          'CRITICAL': 365
        },
        byEventType: {} as Record<EventType, number>,
        maxTotalEvents: 10000,
        cleanupIntervalHours: 24
      },
      compression: {
        enabled: true,
        algorithm: 'GZIP',
        threshold: 1024
      },
      indexing: {
        enabled: true,
        fields: ['type', 'severity', 'source', 'timestamp'],
        refreshInterval: 300
      }
    })
  })

  afterEach(async () => {
    // 정리
    if (changeLogManager) {
      await changeLogManager.close()
    }
    
    // 테스트 데이터 정리
    if (db) {
      db.exec(`DELETE FROM change_events`)
    }
  })

  describe('이벤트 로깅', () => {
    it('파일 변경 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logFileChange({
        filePath: '/test/path/file.md',
        changeType: 'MODIFIED',
        fileSize: 1024,
        checksum: 'abc123'
      })

      expect(eventId).toBeDefined()
      expect(eventId).toMatch(/^evt_\d+_[a-f0-9]{8}$/)

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event).toBeDefined()
      expect(event.type).toBe('FILE_CHANGE')
      expect(event.severity).toBe('INFO')
      expect(event.source).toBe('FILE_WATCHER')
    })

    it('DB 변경 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logDBChange({
        tableName: 'tasks',
        operation: 'INSERT',
        recordId: '123',
        newValues: { title: 'Test Task', status: 'todo' }
      }, 'WARNING')

      expect(eventId).toBeDefined()

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event.type).toBe('DB_CHANGE')
      expect(event.severity).toBe('WARNING')
      expect(event.source).toBe('SYNC_MANAGER')
    })

    it('동기화 작업 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logSyncOperation({
        operationType: 'LOCAL_TO_REMOTE',
        tableName: 'tasks',
        status: 'COMPLETED',
        result: {
          recordsProcessed: 10,
          recordsSucceeded: 9,
          recordsFailed: 1,
          duration: 5000
        }
      })

      expect(eventId).toBeDefined()

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event.type).toBe('SYNC_OPERATION')
      expect(event.severity).toBe('INFO')
      expect(event.source).toBe('SYNC_MANAGER')
    })

    it('충돌 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logConflict({
        conflictId: 'conflict_123',
        tableName: 'tasks',
        recordId: '123',
        conflictType: 'DATA_CONFLICT',
        localValues: { status: 'todo' },
        remoteValues: { status: 'done' },
        resolutionStrategy: 'LOCAL_WINS',
        resolvedValues: { status: 'todo' }
      }, 'ERROR')

      expect(eventId).toBeDefined()

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event.type).toBe('CONFLICT_RESOLVED')
      expect(event.severity).toBe('ERROR')
      expect(event.source).toBe('SYNC_MANAGER')
    })

    it('복구 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logRecovery({
        recoveryId: 'recovery_123',
        operationId: 'op_123',
        failureType: 'NETWORK_ERROR',
        recoveryAction: 'RETRY',
        strategy: 'BACKOFF_RETRY',
        result: 'SUCCESS',
        duration: 3000
      })

      expect(eventId).toBeDefined()

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event.type).toBe('RECOVERY_COMPLETED')
      expect(event.severity).toBe('INFO')
      expect(event.source).toBe('RECOVERY_MANAGER')
    })

    it('백업 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logBackup({
        backupId: 'backup_123',
        backupType: 'INCREMENTAL',
        tables: ['tasks', 'changes'],
        size: 2048,
        location: '/backup/path',
        checksum: 'def456',
        compressed: true,
        encrypted: false
      })

      expect(eventId).toBeDefined()

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event.type).toBe('BACKUP_CREATED')
      expect(event.severity).toBe('INFO')
      expect(event.source).toBe('BACKUP_MANAGER')
    })

    it('시스템 이벤트를 로깅해야 함', async () => {
      const eventId = await changeLogManager.logSystemEvent({
        component: 'TestComponent',
        action: 'TEST_ACTION',
        details: { test: true },
        metrics: {
          cpuUsage: 0.5,
          memoryUsage: 0.7
        }
      }, 'DEBUG')

      expect(eventId).toBeDefined()

      // 데이터베이스에서 확인
      const event = db.prepare(`
        SELECT * FROM change_events WHERE id = ?
      `).get(eventId)

      expect(event.type).toBe('SYSTEM_EVENT')
      expect(event.severity).toBe('DEBUG')
      expect(event.source).toBe('SYSTEM')
    })
  })

  describe('이벤트 조회', () => {
    beforeEach(async () => {
      // 테스트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/file1.md',
        changeType: 'MODIFIED'
      })
      
      await changeLogManager.logDBChange({
        tableName: 'tasks',
        operation: 'INSERT'
      })
      
      await changeLogManager.logSyncOperation({
        operationType: 'LOCAL_TO_REMOTE',
        tableName: 'tasks',
        status: 'COMPLETED'
      })
    })

    it('모든 이벤트를 조회해야 함', async () => {
      const events = await changeLogManager.getEvents({})
      
      expect(events).toHaveLength(3)
      expect(events[0].type).toBeDefined()
      expect(events[1].type).toBeDefined()
      expect(events[2].type).toBeDefined()
    })

    it('이벤트 타입으로 필터링해야 함', async () => {
      const filter: EventFilter = {
        eventTypes: ['FILE_CHANGE']
      }
      
      const events = await changeLogManager.getEvents(filter)
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('FILE_CHANGE')
    })

    it('심각도로 필터링해야 함', async () => {
      const filter: EventFilter = {
        severities: ['ERROR', 'CRITICAL']
      }
      
      const events = await changeLogManager.getEvents(filter)
      
      expect(events).toHaveLength(0)
    })

    it('페이징이 적용되어야 함', async () => {
      const filter: EventFilter = {
        pagination: {
          offset: 0,
          limit: 2
        }
      }
      
      const events = await changeLogManager.getEvents(filter)
      
      expect(events).toHaveLength(2)
    })

    it('정렬이 적용되어야 함', async () => {
      const filter: EventFilter = {
        sortBy: {
          field: 'timestamp',
          direction: 'ASC'
        }
      }
      
      const events = await changeLogManager.getEvents(filter)
      
      expect(events).toHaveLength(3)
      expect(events[0].timestamp).toBeLessThanOrEqual(events[1].timestamp)
      expect(events[1].timestamp).toBeLessThanOrEqual(events[2].timestamp)
    })
  })

  describe('이벤트 검색', () => {
    beforeEach(async () => {
      // 검색용 테스트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/special_file.md',
        changeType: 'MODIFIED'
      })
      
      await changeLogManager.logDBChange({
        tableName: 'special_table',
        operation: 'UPDATE'
      })
    })

    it('텍스트로 이벤트를 검색해야 함', async () => {
      const events = await changeLogManager.searchEvents('special')
      
      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => 
        JSON.stringify(e).toLowerCase().includes('special')
      )).toBe(true)
    })
  })

  describe('통계', () => {
    beforeEach(async () => {
      // 통계용 테스트 데이터 추가
      for (let i = 0; i < 5; i++) {
        await changeLogManager.logFileChange({
          filePath: `/test/file${i}.md`,
          changeType: 'MODIFIED'
        })
      }
      
      for (let i = 0; i < 3; i++) {
        await changeLogManager.logDBChange({
          tableName: 'tasks',
          operation: 'INSERT'
        }, 'ERROR')
      }
    })

    it('이벤트 통계를 계산해야 함', async () => {
      const statistics = await changeLogManager.getStatistics()
      
      expect(statistics.totalEvents).toBe(8)
      expect(statistics.eventsByType['FILE_CHANGE']).toBe(5)
      expect(statistics.eventsByType['DB_CHANGE']).toBe(3)
      expect(statistics.eventsBySeverity['INFO']).toBe(5)
      expect(statistics.eventsBySeverity['ERROR']).toBe(3)
    })

    it('타임라인을 생성해야 함', async () => {
      const timeline = await changeLogManager.getTimeline()
      
      expect(timeline.length).toBeGreaterThan(0)
      expect(timeline[0]).toHaveProperty('timestamp')
      expect(timeline[0]).toHaveProperty('count')
      expect(timeline[0]).toHaveProperty('types')
    })
  })

  describe('데이터 내보내기', () => {
    beforeEach(async () => {
      // 내보내기용 테스트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/export_file.md',
        changeType: 'MODIFIED'
      })
    })

    it('JSON 형식으로 내보내기해야 함', async () => {
      const exported = await changeLogManager.exportData({}, 'JSON')

      // Check for JSON containing FILE_CHANGE type (with or without spaces around colon)
      expect(exported).toMatch(/"type"\s*:\s*"FILE_CHANGE"/)
      expect(exported).toMatch(/"filePath"\s*:\s*"\/test\/export_file\.md"/)
    })

    it('CSV 형식으로 내보내기해야 함', async () => {
      const exported = await changeLogManager.exportData({}, 'CSV')
      
      expect(exported).toContain('id,type,severity,source')
      expect(exported).toContain('FILE_CHANGE')
    })

    it('SQL 형식으로 내보내기해야 함', async () => {
      const exported = await changeLogManager.exportData({}, 'SQL')
      
      expect(exported).toContain('INSERT INTO change_events')
      expect(exported).toContain('FILE_CHANGE')
    })
  })

  describe('상태 관리', () => {
    it('초기화 상태를 확인해야 함', async () => {
      const status = await changeLogManager.getStatus()
      
      expect(status.isInitialized).toBe(true)
      expect(status.eventCount).toBeGreaterThanOrEqual(0)
      expect(status.storageSize).toBeGreaterThanOrEqual(0)
      expect(status.lastEventTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('데이터 정리', () => {
    beforeEach(async () => {
      // 정리용 테스트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/cleanup_file.md',
        changeType: 'MODIFIED'
      })
    })

    it('오래된 이벤트를 정리해야 함', async () => {
      const beforeCount = await changeLogManager.getEvents({}).then(events => events.length)
      const deletedCount = await changeLogManager.cleanup()
      
      expect(deletedCount).toBeGreaterThanOrEqual(0)
      
      const afterCount = await changeLogManager.getEvents({}).then(events => events.length)
      expect(afterCount).toBeLessThanOrEqual(beforeCount)
    })
  })
})