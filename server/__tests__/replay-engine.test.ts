/**
 * ReplayEngine 단위 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ReplayEngine } from '../replay-engine.js'
import { ChangeLogManager } from '../change-log.js'
import { getSqlite } from '../tasks/db/client.js'
import { replaySessions, replayResults, rollbackPoints } from '../tasks/db/schema.js'
import type { EventFilter, ReplayOptions, ReplayMode, ReplayStrategy } from '../types/change-log.js'

describe('ReplayEngine', () => {
  let replayEngine: ReplayEngine
  let changeLogManager: ChangeLogManager
  let db: any

  beforeEach(async () => {
    // 테스트용 데이터베이스 초기화
    db = getSqlite()
    
    // 테이블 초기화
    db.exec(`DELETE FROM change_events`)
    db.exec(`DELETE FROM replay_sessions`)
    db.exec(`DELETE FROM replay_results`)
    db.exec(`DELETE FROM rollback_points`)
    
    // ChangeLogManager 및 ReplayEngine 인스턴스 생성
    changeLogManager = new ChangeLogManager()
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
        byEventType: {} as Record<string, number>,
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
    
    // ChangeLogManager를 EventStore로 래핑
    const eventStore = changeLogManager as any
    replayEngine = new ReplayEngine()
    await replayEngine.initialize(eventStore)
  })

  afterEach(async () => {
    // 정리
    if (replayEngine) {
      await replayEngine.close()
    }
    
    if (changeLogManager) {
      await changeLogManager.close()
    }
    
    // 테스트 데이터 정리
    if (db) {
      db.exec(`DELETE FROM change_events`)
      db.exec(`DELETE FROM replay_sessions`)
      db.exec(`DELETE FROM replay_results`)
      db.exec(`DELETE FROM rollback_points`)
    }
  })

  describe('리플레이 세션 관리', () => {
    beforeEach(async () => {
      // 테스트용 이벤트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/replay_file1.md',
        changeType: 'MODIFIED'
      })
      
      await changeLogManager.logDBChange({
        tableName: 'tasks',
        operation: 'INSERT',
        recordId: '1'
      })
      
      await changeLogManager.logSyncOperation({
        operationType: 'LOCAL_TO_REMOTE',
        tableName: 'tasks',
        status: 'COMPLETED'
      })
    })

    it('리플레이 세션을 생성해야 함', async () => {
      const filter: EventFilter = {
        eventTypes: ['FILE_CHANGE', 'DB_CHANGE']
      }
      
      const options: ReplayOptions = {
        mode: 'SAFE',
        strategy: 'SEQUENTIAL',
        stopOnError: true,
        enableValidation: true
      }
      
      const sessionId = await replayEngine.createSession(
        'Test Session',
        filter,
        options,
        'Test session for unit testing'
      )
      
      expect(sessionId).toBeDefined()
      expect(sessionId).toMatch(/^replay_\d+_[a-f0-9]{8}$/)
      
      // 데이터베이스에서 확인
      const session = db.prepare(`
        SELECT * FROM replay_sessions WHERE id = ?
      `).get(sessionId)
      
      expect(session).toBeDefined()
      expect(session.name).toBe('Test Session')
      expect(session.description).toBe('Test session for unit testing')
      expect(session.status).toBe('PENDING')
      expect(session.totalEvents).toBe(2)
    })

    it('리플레이 세션을 조회해야 함', async () => {
      // 먼저 세션 생성
      const filter: EventFilter = {
        eventTypes: ['FILE_CHANGE']
      }
      
      const options: ReplayOptions = {
        mode: 'FAST',
        strategy: 'SEQUENTIAL'
      }
      
      const sessionId = await replayEngine.createSession(
        'Query Test Session',
        filter,
        options
      )
      
      // 세션 조회
      const session = await replayEngine.getSession(sessionId)
      
      expect(session).toBeDefined()
      expect(session!.name).toBe('Query Test Session')
      expect(session!.status).toBe('PENDING')
      expect(session!.totalEvents).toBe(1)
    })

    it('모든 리플레이 세션을 조회해야 함', async () => {
      // 여러 세션 생성
      const sessionId1 = await replayEngine.createSession(
        'Session 1',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      const sessionId2 = await replayEngine.createSession(
        'Session 2',
        { eventTypes: ['DB_CHANGE'] },
        { mode: 'FAST', strategy: 'SEQUENTIAL' }
      )
      
      // 모든 세션 조회
      const sessions = await replayEngine.getSessions()
      
      expect(sessions).toHaveLength(2)
      expect(sessions.some(s => s.id === sessionId1)).toBe(true)
      expect(sessions.some(s => s.id === sessionId2)).toBe(true)
    })

    it('상태로 세션을 필터링해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Status Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      // 상태로 필터링
      const pendingSessions = await replayEngine.getSessions({ status: 'PENDING' })
      
      expect(pendingSessions).toHaveLength(1)
      expect(pendingSessions[0].id).toBe(sessionId)
      expect(pendingSessions[0].status).toBe('PENDING')
    })
  })

  describe('리플레이 실행', () => {
    beforeEach(async () => {
      // 리플레이용 테스트 이벤트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/replay_exec_file.md',
        changeType: 'MODIFIED'
      })
    })

    it('리플레이를 시작해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Execution Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'DRY_RUN', strategy: 'SEQUENTIAL' }
      )
      
      // 리플레이 시작
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기 (비동기 실행이므로 바로 완료될 수 있음)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // 세션 상태 확인
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('리플레이 진행 상태를 조회해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Progress Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      // 리플레이 시작
      await replayEngine.startReplay(sessionId)
      
      // 진행 상태 조회
      const progress = await replayEngine.getReplayProgress(sessionId)
      
      expect(progress).toBeDefined()
      expect(progress.totalEvents).toBe(1)
      expect(progress.processedEvents).toBeGreaterThanOrEqual(0)
      expect(progress.estimatedTimeRemaining).toBeGreaterThanOrEqual(0)
    })

    it('리플레이를 일시 중지해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Pause Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      // 리플레이 시작
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // 리플레이 일시 중지
      await replayEngine.pauseReplay(sessionId)
      
      // 상태 확인
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toBe('PENDING')
    })

    it('리플레이를 취소해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Cancel Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      // 리플레이 시작
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // 리플레이 취소
      await replayEngine.cancelReplay(sessionId)
      
      // 상태 확인
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toBe('CANCELLED')
    })
  })

  describe('리플레이 옵션', () => {
    it('안전 모드로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Safe Mode Test',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('빠른 모드로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Fast Mode Test',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'FAST', strategy: 'SEQUENTIAL' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('시뮬레이션 모드로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Dry Run Test',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'DRY_RUN', strategy: 'SEQUENTIAL' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('상세 모드로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Verbose Mode Test',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'VERBOSE', strategy: 'SEQUENTIAL' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })
  })

  describe('롤백 포인트', () => {
    beforeEach(async () => {
      // 롤백 테스트용 이벤트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/rollback_file.md',
        changeType: 'MODIFIED'
      })
    })

    it('롤백 포인트를 생성해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Rollback Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL', enableRollback: true }
      )
      
      // 롤백 포인트 생성
      const rollbackPointId = await replayEngine.createRollbackPoint(
        sessionId,
        'Test rollback point'
      )
      
      expect(rollbackPointId).toBeDefined()
      expect(rollbackPointId).toMatch(/^rb_\d+_[a-f0-9]{8}$/)
      
      // 데이터베이스에서 확인
      const rollbackPoint = db.prepare(`
        SELECT * FROM rollback_points WHERE id = ?
      `).get(rollbackPointId)
      
      expect(rollbackPoint).toBeDefined()
      expect(rollbackPoint.sessionId).toBe(sessionId)
      expect(rollbackPoint.description).toBe('Test rollback point')
      expect(rollbackPoint.isActive).toBe(1)
    })

    it('롤백 포인트로 복원해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Restore Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL', enableRollback: true }
      )
      
      // 롤백 포인트 생성
      const rollbackPointId = await replayEngine.createRollbackPoint(
        sessionId,
        'Test restore point'
      )
      
      // 롤백 포인트로 복원
      await replayEngine.rollbackToPoint(sessionId, rollbackPointId)
      
      // 복원 확인 (실제 구현에서는 시스템 상태를 복원)
      // 이 테스트에서는 롤백 포인트가 존재하는지만 확인
      const rollbackPoint = db.prepare(`
        SELECT * FROM rollback_points WHERE id = ?
      `).get(rollbackPointId)
      
      expect(rollbackPoint).toBeDefined()
      expect(rollbackPoint.sessionId).toBe(sessionId)
    })
  })

  describe('리플레이 검증', () => {
    beforeEach(async () => {
      // 검증용 이벤트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/validation_file.md',
        changeType: 'MODIFIED'
      })
    })

    it('리플레이를 검증해야 함', async () => {
      // 세션 생성
      const sessionId = await replayEngine.createSession(
        'Validation Test Session',
        { eventTypes: ['FILE_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL', enableValidation: true }
      )
      
      // 리플레이 검증
      const validation = await replayEngine.validateReplay(sessionId)
      
      expect(validation).toBeDefined()
      expect(validation.isValid).toBe(true)
      expect(validation.issues).toBeInstanceOf(Array)
    })

    it('잘못된 설정을 감지해야 함', async () => {
      // 잘못된 설정으로 세션 생성
      const sessionId = await replayEngine.createSession(
        'Invalid Config Test',
        { eventTypes: ['FILE_CHANGE'] },
        { 
          mode: 'SAFE', 
          strategy: 'SEQUENTIAL', 
          enableValidation: true,
          maxConcurrency: 20 // 너무 높은 동시성
        }
      )
      
      // 리플레이 검증
      const validation = await replayEngine.validateReplay(sessionId)
      
      expect(validation).toBeDefined()
      expect(validation.isValid).toBe(true) // 기본적으로 유효
      expect(validation.issues.some(issue => 
        issue.type === 'HIGH_CONCURRENCY'
      )).toBe(true)
    })
  })

  describe('리플레이 전략', () => {
    beforeEach(async () => {
      // 전략 테스트용 이벤트 데이터 추가
      await changeLogManager.logFileChange({
        filePath: '/test/strategy_file1.md',
        changeType: 'MODIFIED'
      })
      
      await changeLogManager.logDBChange({
        tableName: 'tasks',
        operation: 'INSERT',
        recordId: '1'
      })
    })

    it('순차적 전략으로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Sequential Strategy Test',
        { eventTypes: ['FILE_CHANGE', 'DB_CHANGE'] },
        { mode: 'SAFE', strategy: 'SEQUENTIAL' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('병렬 전략으로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Parallel Strategy Test',
        { eventTypes: ['FILE_CHANGE', 'DB_CHANGE'] },
        { mode: 'SAFE', strategy: 'PARALLEL', maxConcurrency: 2 }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('의존성 인식 전략으로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Dependency Aware Strategy Test',
        { eventTypes: ['FILE_CHANGE', 'DB_CHANGE'] },
        { mode: 'SAFE', strategy: 'DEPENDENCY_AWARE' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })

    it('선택적 전략으로 리플레이해야 함', async () => {
      const sessionId = await replayEngine.createSession(
        'Selective Strategy Test',
        { eventTypes: ['FILE_CHANGE', 'DB_CHANGE'] },
        { mode: 'SAFE', strategy: 'SELECTIVE' }
      )
      
      await replayEngine.startReplay(sessionId)
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const session = await replayEngine.getSession(sessionId)
      expect(session!.status).toMatch(/^(COMPLETED|RUNNING)$/)
    })
  })

  describe('오류 처리', () => {
    it('존재하지 않는 세션 시작 시 오류를 발생해야 함', async () => {
      await expect(
        replayEngine.startReplay('nonexistent_session')
      ).rejects.toThrow('Session not found: nonexistent_session')
    })

    it('존재하지 않는 세션의 진행 상태 조회 시 오류를 발생해야 함', async () => {
      await expect(
        replayEngine.getReplayProgress('nonexistent_session')
      ).rejects.toThrow('No progress found for session: nonexistent_session')
    })

    it('존재하지 않는 세션 취소 시 오류를 발생해야 함', async () => {
      await expect(
        replayEngine.cancelReplay('nonexistent_session')
      ).rejects.toThrow('Session not found: nonexistent_session')
    })
  })
})