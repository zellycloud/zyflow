# ZyFlow 단일 진실 원천 아키텍처 통합 테스트 전략

## 개요

이 문서는 ZyFlow 단일 진실 원천 아키텍처의 통합 테스트를 위한 포괄적인 전략을 제시합니다. 복잡한 분산 시스템의 안정성과 신뢰성을 보장하기 위해, 단위 테스트부터 통합 테스트, 부하 테스트, 그리고 실제 운영 환경 테스트까지 다단계 테스트 접근법을 적용합니다.

## 테스트 전략 원칙

### 1. 테스트 피라미드 (Test Pyramid)

```
    /\
   /  \     E2E 테스트 (5%)
  /____\    
 /      \   통합 테스트 (25%)
/__________\ 단위 테스트 (70%)
```

- **단위 테스트 (70%)**: 개별 컴포넌트의 기능적 정확성 검증
- **통합 테스트 (25%)**: 컴포넌트 간 상호작용 및 데이터 흐름 검증
- **E2E 테스트 (5%)**: 전체 시스템의 사용자 시나리오 검증

### 2. 테스트 분류

#### 기능적 테스트
- **정상 경로 테스트**: 예상된 사용자 시나리오 검증
- **예외 경로 테스트**: 오류 상황 및 예외 처리 검증
- **경계값 테스트**: 시스템 한계 조건 검증

#### 비기능적 테스트
- **성능 테스트**: 응답 시간, 처리량, 자원 사용량 검증
- **안정성 테스트**: 장기간 운영 시 시스템 안정성 검증
- **보안 테스트**: 데이터 보호 및 접근 제어 검증

#### 아키텍처 테스트
- **동기화 테스트**: 다중 진실 원천 간 데이터 일관성 검증
- **장애 복구 테스트**: 장애 상황에서의 자동 복구 능력 검증
- **확장성 테스트**: 부하 증가에 따른 시스템 확장 능력 검증

## 테스트 환경 구성

### 1. 테스트 환경 계층

```mermaid
graph TB
    subgraph "로컬 개발 환경"
        LOCAL[Local Testing]
        UNIT[Unit Tests]
        INTEGRATION[Integration Tests]
    end
    
    subgraph "CI/CD 환경"
        CI[Continuous Integration]
        AUTO[Automated Testing]
        BUILD[Build Verification]
    end
    
    subgraph "스테이징 환경"
        STAGING[Staging Environment]
        LOAD[Load Testing]
        SECURITY[Security Testing]
    end
    
    subgraph "프로덕션 환경"
        PROD[Production Environment]
        SMOKE[Smoke Tests]
        MONITOR[Monitoring Tests]
    end
    
    LOCAL --> CI
    CI --> STAGING
    STAGING --> PROD
```

### 2. 테스트 데이터 관리

```typescript
// 테스트 데이터 관리자
export class TestDataManager {
  private readonly testDataStores = new Map<string, TestDataStore>();
  
  constructor(
    private readonly database: TestDatabase,
    private readonly fileSystem: TestFileSystem
  ) {}
  
  async setupTestEnvironment(testSuite: string): Promise<TestEnvironment> {
    // 1. 테스트 데이터베이스 초기화
    const db = await this.createTestDatabase(testSuite);
    
    // 2. 테스트 파일 시스템 준비
    const fs = await this.createTestFileSystem(testSuite);
    
    // 3. 기본 테스트 데이터 생성
    await this.seedTestData(db, fs);
    
    return new TestEnvironment(db, fs);
  }
  
  async cleanupTestEnvironment(testSuite: string): Promise<void> {
    // 테스트 환경 정리
    await this.database.cleanup(testSuite);
    await this.fileSystem.cleanup(testSuite);
  }
  
  private async seedTestData(
    database: TestDatabase,
    fileSystem: TestFileSystem
  ): Promise<void> {
    // 기본 태스크 데이터 생성
    const tasks = this.generateTestTasks(100);
    await database.insertTasks(tasks);
    
    // 기본 tasks.md 파일 생성
    const tasksMd = this.generateTasksMdContent(tasks);
    await fileSystem.writeFile('tasks.md', tasksMd);
  }
}
```

## 단위 테스트 전략

### 1. 컴포넌트별 테스트

#### 상태 관리자 테스트
```typescript
describe('StateManager', () => {
  let stateManager: StateManager;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockCache: jest.Mocked<CacheProvider>;
  
  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockCache = createMockCache();
    stateManager = new StateManager(mockEventBus, mockCache);
  });
  
  describe('상태 업데이트', () => {
    it('유효한 상태 업데이트 시 이벤트 발행', async () => {
      // Arrange
      const taskId = 'task-1';
      const currentState = createTestTask({ id: taskId, status: 'pending' });
      const newState = { ...currentState, status: 'in_progress' };
      
      // Act
      await stateManager.updateState(taskId, currentState, newState);
      
      // Assert
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'state.updated',
          aggregateId: taskId,
          data: { previousState: currentState, newState }
        })
      );
    });
    
    it('충돌 감지 시 ConcurrencyConflictError 발생', async () => {
      // Arrange
      const taskId = 'task-1';
      const expectedVersion = 2;
      const actualVersion = 3;
      
      jest.spyOn(stateManager, 'getCurrentVersion')
         .mockResolvedValue(actualVersion);
      
      // Act & Assert
      await expect(
        stateManager.updateStateWithVersion(taskId, {}, {}, expectedVersion)
      ).rejects.toThrow(ConcurrencyConflictError);
    });
  });
});
```

#### 동기화 코디네이터 테스트
```typescript
describe('SyncCoordinator', () => {
  let syncCoordinator: SyncCoordinator;
  let mockConflictDetector: jest.Mocked<ConflictDetector>;
  let mockConflictResolver: jest.Mocked<ConflictResolver>;
  let mockStateManager: jest.Mocked<StateManager>;
  
  beforeEach(() => {
    mockConflictDetector = createMockConflictDetector();
    mockConflictResolver = createMockConflictResolver();
    mockStateManager = createMockStateManager();
    
    syncCoordinator = new SyncCoordinator(
      mockConflictDetector,
      mockConflictResolver,
      mockStateManager
    );
  });
  
  describe('충돌 해결', () => {
    it('자동 해결 가능한 충돌 처리', async () => {
      // Arrange
      const localState = createTestTask({ title: 'Local Title' });
      const remoteState = createTestTask({ title: 'Remote Title' });
      const baseState = createTestTask({ title: 'Base Title' });
      
      const conflict = new FieldConflict('title', 'Local Title', 'Remote Title', 'Base Title');
      const resolution = new AutoResolution('title', 'Merged Title');
      
      mockConflictDetector.detectConflicts.mockResolvedValue([conflict]);
      mockConflictResolver.resolve.mockResolvedValue([resolution]);
      
      // Act
      const result = await syncCoordinator.resolveConflicts(localState, remoteState, baseState);
      
      // Assert
      expect(result.resolved).toBe(true);
      expect(result.resolvedState.title).toBe('Merged Title');
      expect(mockConflictResolver.resolve).toHaveBeenCalledWith([conflict]);
    });
    
    it('수동 개입 필요한 충돌 처리', async () => {
      // Arrange
      const conflict = new ComplexConflict('structure', {}, {}, {});
      const resolution = new ManualResolutionRequired(conflict);
      
      mockConflictDetector.detectConflicts.mockResolvedValue([conflict]);
      mockConflictResolver.resolve.mockResolvedValue([resolution]);
      
      // Act
      const result = await syncCoordinator.resolveConflicts({}, {}, {});
      
      // Assert
      expect(result.resolved).toBe(false);
      expect(result.requiresManualIntervention).toBe(true);
    });
  });
});
```

### 2. 테스트 유틸리티

```typescript
// 테스트 데이터 생성기
export class TestDataGenerator {
  static createTask(overrides?: Partial<Task>): Task {
    return {
      id: faker.datatype.uuid(),
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      status: faker.helpers.arrayElement(['pending', 'in_progress', 'completed']),
      priority: faker.helpers.arrayElement(['low', 'medium', 'high']),
      origin: faker.helpers.arrayElement(['ai', 'manual', 'imported']),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      version: faker.datatype.number({ min: 1, max: 10 }),
      checksum: faker.datatype.hexadecimal(32),
      ...overrides
    };
  }
  
  static createTasks(count: number, overrides?: Partial<Task>): Task[] {
    return Array.from({ length: count }, () => this.createTask(overrides));
  }
  
  static createChangeEvent(overrides?: Partial<ChangeEvent>): ChangeEvent {
    return {
      id: faker.datatype.uuid(),
      type: faker.helpers.arrayElement(['task.created', 'task.updated', 'task.deleted']),
      aggregateId: faker.datatype.uuid(),
      aggregateType: 'task',
      version: faker.datatype.number({ min: 1 }),
      timestamp: faker.date.recent(),
      data: {},
      metadata: {},
      ...overrides
    };
  }
}
```

## 통합 테스트 전략

### 1. 컴포넌트 통합 테스트

#### 동기화 흐름 통합 테스트
```typescript
describe('Sync Flow Integration', () => {
  let testEnvironment: TestEnvironment;
  let syncCoordinator: SyncCoordinator;
  let fileWatcher: FileWatcher;
  let eventStore: EventStore;
  
  beforeAll(async () => {
    testEnvironment = await TestDataManager.setupTestEnvironment('sync-integration');
    syncCoordinator = testEnvironment.getSyncCoordinator();
    fileWatcher = testEnvironment.getFileWatcher();
    eventStore = testEnvironment.getEventStore();
  });
  
  afterAll(async () => {
    await TestDataManager.cleanupTestEnvironment('sync-integration');
  });
  
  it('파일 변경에서 상태 동기화까지의 전체 흐름', async () => {
    // Arrange
    const originalTask = TestDataGenerator.createTask({
      id: 'task-1',
      title: 'Original Title'
    });
    
    await testEnvironment.insertTask(originalTask);
    await testEnvironment.writeTasksMd([originalTask]);
    
    // Act - 파일 수정
    const updatedTask = { ...originalTask, title: 'Updated Title' };
    await testEnvironment.updateTasksMd([updatedTask]);
    
    // 파일 변경 감지 대기
    await fileWatcher.waitForChange(5000);
    
    // Assert
    const syncedTask = await testEnvironment.getTask('task-1');
    expect(syncedTask.title).toBe('Updated Title');
    
    // 이벤트 저장소 확인
    const events = await eventStore.getEvents('task-1');
    expect(events).toHaveLength(2); // created + updated
    expect(events[1].type).toBe('task.updated');
    expect(events[1].data.changes.title).toBe('Updated Title');
  });
  
  it('동시 수정 시 충돌 감지 및 해결', async () => {
    // Arrange
    const baseTask = TestDataGenerator.createTask({
      id: 'task-2',
      title: 'Base Title',
      description: 'Base Description'
    });
    
    await testEnvironment.insertTask(baseTask);
    await testEnvironment.writeTasksMd([baseTask]);
    
    // Act - 동시 수정 시뮬레이션
    const fileUpdate = { ...baseTask, title: 'File Updated Title' };
    const dbUpdate = { ...baseTask, description: 'DB Updated Description' };
    
    // 파일 수정 (약간의 지연으로 동시성 시뮬레이션)
    const filePromise = testEnvironment.updateTasksMd([fileUpdate]);
    await new Promise(resolve => setTimeout(resolve, 100));
    const dbPromise = testEnvironment.updateTask(dbUpdate);
    
    await Promise.all([filePromise, dbPromise]);
    
    // 동기화 대기
    await fileWatcher.waitForChange(5000);
    
    // Assert
    const finalTask = await testEnvironment.getTask('task-2');
    expect(finalTask.title).toBe('File Updated Title');
    expect(finalTask.description).toBe('DB Updated Description');
    
    // 충돌 해결 이벤트 확인
    const events = await eventStore.getEvents('task-2');
    const conflictEvents = events.filter(e => e.type === 'conflict.resolved');
    expect(conflictEvents.length).toBeGreaterThan(0);
  });
});
```

#### 이벤트 기반 아키텍처 통합 테스트
```typescript
describe('Event-Driven Architecture Integration', () => {
  let testEnvironment: TestEnvironment;
  let eventBus: EventBus;
  let commandHandler: CommandHandler;
  let queryHandler: QueryHandler;
  
  beforeAll(async () => {
    testEnvironment = await TestDataManager.setupTestEnvironment('event-integration');
    eventBus = testEnvironment.getEventBus();
    commandHandler = testEnvironment.getCommandHandler();
    queryHandler = testEnvironment.getQueryHandler();
  });
  
  it('커맨드-이벤트-쿼리 흐름 통합', async () => {
    // Arrange
    const createTaskCommand = new CreateTaskCommand({
      title: 'Integration Test Task',
      description: 'Testing CQRS pattern'
    });
    
    // Act - 커맨드 실행
    const commandResult = await commandHandler.handle(createTaskCommand);
    
    // Assert - 커맨드 결과
    expect(commandResult.success).toBe(true);
    expect(commandResult.aggregateId).toBeDefined();
    
    // 이벤트 확인
    const events = await testEnvironment.getEventStore().getEvents(commandResult.aggregateId);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('task.created');
    
    // 쿼리로 데이터 확인
    const getTaskQuery = new GetTaskQuery(commandResult.aggregateId);
    const task = await queryHandler.handle(getTaskQuery);
    
    expect(task.title).toBe('Integration Test Task');
    expect(task.description).toBe('Testing CQRS pattern');
  });
});
```

### 2. 데이터베이스 통합 테스트

```typescript
describe('Database Integration', () => {
  let testDatabase: TestDatabase;
  let transactionManager: TransactionManager;
  
  beforeAll(async () => {
    testDatabase = await TestDatabase.create('db-integration');
    transactionManager = new TransactionManager(testDatabase);
  });
  
  afterAll(async () => {
    await testDatabase.cleanup();
  });
  
  it('분산 트랜잭션 원자성 보장', async () => {
    // Arrange
    const task1 = TestDataGenerator.createTask({ id: 'task-1' });
    const task2 = TestDataGenerator.createTask({ id: 'task-2' });
    const task3 = TestDataGenerator.createTask({ id: 'task-3' });
    
    // Act & Assert - 성공 케이스
    await expect(
      transactionManager.executeInTransaction([
        () => testDatabase.insertTask(task1),
        () => testDatabase.insertTask(task2),
        () => testDatabase.insertTask(task3)
      ])
    ).resolves.not.toThrow();
    
    const allTasks = await testDatabase.getAllTasks();
    expect(allTasks).toHaveLength(3);
    
    // Act & Assert - 실패 케이스 (롤백)
    await testDatabase.clear();
    
    await expect(
      transactionManager.executeInTransaction([
        () => testDatabase.insertTask(task1),
        () => testDatabase.insertTask(task2),
        () => { throw new Error('Simulated failure'); },
        () => testDatabase.insertTask(task3)
      ])
    ).rejects.toThrow('Simulated failure');
    
    const rolledBackTasks = await testDatabase.getAllTasks();
    expect(rolledBackTasks).toHaveLength(0);
  });
});
```

## 성능 테스트 전략

### 1. 부하 테스트

```typescript
describe('Load Testing', () => {
  let testEnvironment: TestEnvironment;
  let loadGenerator: LoadGenerator;
  
  beforeAll(async () => {
    testEnvironment = await TestDataManager.setupTestEnvironment('load-testing');
    loadGenerator = new LoadGenerator(testEnvironment);
  });
  
  it('대량 동시 요청 처리', async () => {
    // Arrange
    const concurrentUsers = 100;
    const requestsPerUser = 10;
    const targetResponseTime = 100; // ms
    
    // Act
    const results = await loadGenerator.executeConcurrentLoad({
      scenario: 'task-update',
      concurrentUsers,
      requestsPerUser,
      duration: 60000 // 1분
    });
    
    // Assert
    expect(results.averageResponseTime).toBeLessThan(targetResponseTime);
    expect(results.successRate).toBeGreaterThan(0.99); // 99% 이상 성공
    expect(results.errorRate).toBeLessThan(0.01); // 1% 미만 오류
  });
  
  it('대량 데이터 동기화 성능', async () => {
    // Arrange
    const taskCount = 10000;
    const tasks = TestDataGenerator.createTasks(taskCount);
    
    // Act
    const startTime = Date.now();
    await testEnvironment.insertTasks(tasks);
    await testEnvironment.writeTasksMd(tasks);
    
    // 동기화 트리거
    await testEnvironment.triggerSync();
    
    const endTime = Date.now();
    const syncTime = endTime - startTime;
    
    // Assert
    expect(syncTime).toBeLessThan(30000); // 30초 이내
    expect(await testEnvironment.verifyDataConsistency()).toBe(true);
  });
});
```

### 2. 스트레스 테스트

```typescript
describe('Stress Testing', () => {
  let testEnvironment: TestEnvironment;
  
  beforeAll(async () => {
    testEnvironment = await TestDataManager.setupTestEnvironment('stress-testing');
  });
  
  it('시스템 한계 테스트', async () => {
    // Arrange
    const maxConcurrentUsers = 1000;
    const incrementStep = 100;
    
    for (let users = incrementStep; users <= maxConcurrentUsers; users += incrementStep) {
      // Act
      const results = await testEnvironment.executeLoadTest({
        concurrentUsers: users,
        duration: 30000 // 30초
      });
      
      // Assert
      console.log(`Users: ${users}, Avg Response: ${results.averageResponseTime}ms, Error Rate: ${results.errorRate}%`);
      
      // 성능 저하가 심각하면 중단
      if (results.errorRate > 0.1 || results.averageResponseTime > 1000) {
        console.log(`System limit reached at ${users} concurrent users`);
        break;
      }
    }
  });
  
  it('장기간 안정성 테스트', async () => {
    // Arrange
    const testDuration = 3600000; // 1시간
    const monitoringInterval = 60000; // 1분
    
    // Act
    const startTime = Date.now();
    const metrics: SystemMetrics[] = [];
    
    while (Date.now() - startTime < testDuration) {
      const metric = await testEnvironment.collectSystemMetrics();
      metrics.push(metric);
      
      // 메모리 누수 감지
      if (metric.memoryUsage > 1024 * 1024 * 1024) { // 1GB
        throw new Error('Memory leak detected');
      }
      
      await new Promise(resolve => setTimeout(resolve, monitoringInterval));
    }
    
    // Assert
    const avgMemoryUsage = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
    const maxMemoryUsage = Math.max(...metrics.map(m => m.memoryUsage));
    
    expect(avgMemoryUsage).toBeLessThan(512 * 1024 * 1024); // 512MB 평균
    expect(maxMemoryUsage).toBeLessThan(1024 * 1024 * 1024); // 1GB 최대
  });
});
```

## 장애 복구 테스트

### 1. 서킷 브레이커 테스트

```typescript
describe('Circuit Breaker Testing', () => {
  let circuitBreaker: CircuitBreaker;
  let mockService: jest.Mocked<ExternalService>;
  
  beforeEach(() => {
    mockService = createMockExternalService();
    circuitBreaker = new CircuitBreaker({
      threshold: 5,
      timeout: 60000
    });
  });
  
  it('서비스 장애 시 서킷 브레이커 동작', async () => {
    // Arrange - 서비스 장애 시뮬레이션
    mockService.call.mockRejectedValue(new Error('Service unavailable'));
    
    // Act - 임계값 도달까지 실패 반복
    for (let i = 0; i < 5; i++) {
      await expect(
        circuitBreaker.execute(() => mockService.call())
      ).rejects.toThrow('Service unavailable');
    }
    
    // Assert - 서킷 브레이커 열림
    await expect(
      circuitBreaker.execute(() => mockService.call())
    ).rejects.toThrow('Circuit breaker is open');
    
    // 서비스 복구 후 타임아웃 대기
    mockService.call.mockResolvedValue('success');
    await new Promise(resolve => setTimeout(resolve, 61000)); // 61초 대기
    
    // 서킷 브레이커 반열림 상태에서 성공
    await expect(
      circuitBreaker.execute(() => mockService.call())
    ).resolves.toBe('success');
  });
});
```

### 2. 자동 복구 테스트

```typescript
describe('Auto Recovery Testing', () => {
  let recoveryManager: AutoRecoveryManager;
  let testEnvironment: TestEnvironment;
  
  beforeAll(async () => {
    testEnvironment = await TestDataManager.setupTestEnvironment('recovery-testing');
    recoveryManager = testEnvironment.getRecoveryManager();
  });
  
  it('데이터베이스 연결 장애 자동 복구', async () => {
    // Arrange
    await testEnvironment.simulateDatabaseFailure();
    
    // Act - 장애 감지 대기
    const failure = await testEnvironment.waitForFailureDetection(10000);
    
    // Assert - 자동 복구 시도
    expect(failure).toBeDefined();
    expect(failure.type).toBe('database_connection');
    
    const recoveryResult = await recoveryManager.handleFailure(failure);
    expect(recoveryResult.success).toBe(true);
    
    // 복구 후 정상 작동 확인
    await expect(testEnvironment.verifyDatabaseConnection()).resolves.toBe(true);
  });
  
  it('파일 시스템 장애 자동 복구', async () => {
    // Arrange
    await testEnvironment.simulateFileSystemFailure();
    
    // Act
    const failure = await testEnvironment.waitForFailureDetection(10000);
    const recoveryResult = await recoveryManager.handleFailure(failure);
    
    // Assert
    expect(recoveryResult.success).toBe(true);
    expect(await testEnvironment.verifyFileSystemAccess()).resolves.toBe(true);
  });
});
```

## E2E 테스트 전략

### 1. 사용자 시나리오 테스트

```typescript
describe('End-to-End User Scenarios', () => {
  let testEnvironment: TestEnvironment;
  let userInterface: TestUserInterface;
  
  beforeAll(async () => {
    testEnvironment = await TestDataManager.setupTestEnvironment('e2e-testing');
    userInterface = new TestUserInterface(testEnvironment);
  });
  
  it('태스크 생성부터 완료까지의 전체 라이프사이클', async () => {
    // 1. 사용자 로그인
    await userInterface.login('test-user', 'password');
    
    // 2. 새 태스크 생성
    const taskData = {
      title: 'E2E Test Task',
      description: 'Testing complete task lifecycle',
      priority: 'high'
    };
    
    const createdTask = await userInterface.createTask(taskData);
    expect(createdTask.id).toBeDefined();
    expect(createdTask.status).toBe('pending');
    
    // 3. 태스크 상태 변경
    const updatedTask = await userInterface.updateTaskStatus(createdTask.id, 'in_progress');
    expect(updatedTask.status).toBe('in_progress');
    
    // 4. 태스크 완료
    const completedTask = await userInterface.updateTaskStatus(createdTask.id, 'completed');
    expect(completedTask.status).toBe('completed');
    expect(completedTask.completedAt).toBeDefined();
    
    // 5. 데이터 일관성 검증
    const fileContent = await testEnvironment.readTasksMd();
    const dbTask = await testEnvironment.getTask(createdTask.id);
    
    expect(fileContent).toContain('E2E Test Task');
    expect(dbTask.status).toBe('completed');
    
    // 이벤트 히스토리 확인
    const events = await testEnvironment.getEventStore().getEvents(createdTask.id);
    expect(events.map(e => e.type)).toEqual([
      'task.created',
      'task.updated',
      'task.updated'
    ]);
  });
  
  it('다중 사용자 동시 작업 시나리오', async () => {
    // Arrange
    const user1 = await userInterface.createUser('user1');
    const user2 = await userInterface.createUser('user2');
    
    const task = await userInterface.createTask({
      title: 'Collaboration Task',
      description: 'Testing multi-user collaboration'
    });
    
    // Act - 동시 수정 시도
    const user1Update = user1.updateTask(task.id, { title: 'User1 Title' });
    const user2Update = user2.updateTask(task.id, { description: 'User2 Description' });
    
    await Promise.all([user1Update, user2Update]);
    
    // Assert - 충돌 해결 확인
    const finalTask = await userInterface.getTask(task.id);
    
    // 자동 병합 또는 수동 해결 결과 확인
    expect(finalTask.title || finalTask.description).toBeDefined();
    
    // 충돌 해결 이벤트 확인
    const events = await testEnvironment.getEventStore().getEvents(task.id);
    const conflictEvents = events.filter(e => e.type.includes('conflict'));
    expect(conflictEvents.length).toBeGreaterThan(0);
  });
});
```

## 테스트 자동화 및 CI/CD 통합

### 1. GitHub Actions 워크플로우

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: zyflow_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup test environment
        run: npm run test:setup
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/zyflow_test
          REDIS_URL: redis://localhost:6379
      
      - name: Cleanup test environment
        run: npm run test:cleanup
        if: always()

  load-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run load tests
        run: npm run test:load
      
      - name: Upload load test results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: test-results/load/
```

### 2. 테스트 실행 스크립트

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "jest --config jest.unit.config.js",
    "test:integration": "jest --config jest.integration.config.js",
    "test:e2e": "jest --config jest.e2e.config.js",
    "test:load": "k6 run tests/load/scenarios.js",
    "test:setup": "ts-node scripts/setup-test-environment.ts",
    "test:cleanup": "ts-node scripts/cleanup-test-environment.ts",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

## 테스트 결과 보고

### 1. 테스트 대시보드

```typescript
// 테스트 결과 수집기
export class TestResultCollector {
  private readonly results = new Map<string, TestSuiteResult>();
  
  async collectResults(): Promise<TestDashboard> {
    const unitResults = await this.getUnitTestResults();
    const integrationResults = await this.getIntegrationTestResults();
    const e2eResults = await this.getE2ETestResults();
    const performanceResults = await this.getPerformanceTestResults();
    
    return {
      summary: this.generateSummary([unitResults, integrationResults, e2eResults, performanceResults]),
      unitTests: unitResults,
      integrationTests: integrationResults,
      e2eTests: e2eResults,
      performanceTests: performanceResults,
      trends: await this.getTrendData(),
      coverage: await this.getCoverageReport()
    };
  }
  
  private generateSummary(results: TestSuiteResult[]): TestSummary {
    const totalTests = results.reduce((sum, r) => sum + r.total, 0);
    const passedTests = results.reduce((sum, r) => sum + r.passed, 0);
    const failedTests = results.reduce((sum, r) => sum + r.failed, 0);
    const skippedTests = results.reduce((sum, r) => sum + r.skipped, 0);
    
    return {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      skipped: skippedTests,
      passRate: (passedTests / totalTests) * 100,
      duration: results.reduce((sum, r) => sum + r.duration, 0)
    };
  }
}
```

### 2. 품질 게이트

```typescript
// 품질 게이트 정의
export class QualityGate {
  private readonly thresholds = {
    unitTestPassRate: 95, // 95% 이상 통과
    integrationTestPassRate: 90, // 90% 이상 통과
    e2eTestPassRate: 85, // 85% 이상 통과
    codeCoverage: 70, // 70% 이상 커버리지
    performanceThreshold: {
      averageResponseTime: 100, // 100ms 이하
      errorRate: 0.01, // 1% 미만
      throughput: 1000 // 1000 TPS 이상
    }
  };
  
  async evaluate(results: TestDashboard): Promise<QualityGateResult> {
    const evaluations: GateEvaluation[] = [];
    
    // 단위 테스트 평가
    evaluations.push(this.evaluateUnitTests(results.unitTests));
    
    // 통합 테스트 평가
    evaluations.push(this.evaluateIntegrationTests(results.integrationTests));
    
    // E2E 테스트 평가
    evaluations.push(this.evaluateE2ETests(results.e2eTests));
    
    // 코드 커버리지 평가
    evaluations.push(this.evaluateCoverage(results.coverage));
    
    // 성능 평가
    evaluations.push(this.evaluatePerformance(results.performanceTests));
    
    const passed = evaluations.every(e => e.passed);
    const failedEvaluations = evaluations.filter(e => !e.passed);
    
    return {
      passed,
      evaluations,
      failedEvaluations,
      summary: passed 
        ? 'All quality gates passed' 
        : `Failed gates: ${failedEvaluations.map(e => e.name).join(', ')}`
    };
  }
}
```

## 결론

이 통합 테스트 전략은 ZyFlow 단일 진실 원천 아키텍처의 안정성과 신뢰성을 보장하기 위한 포괄적인 접근법을 제공합니다. 다단계 테스트 피라미드를 통해 다양한 수준에서 시스템을 검증하고, 자동화된 CI/CD 파이프라인을 통해 지속적인 품질 관리를 실현할 수 있습니다.

성공적인 테스트 전략 실행을 위한 핵심 요소:

1. **포괄적인 테스트 커버리지**: 단위 테스트부터 E2E 테스트까지 모든 수준에서의 검증
2. **자동화된 테스트 실행**: CI/CD 파이프라인을 통한 지속적인 테스트 자동화
3. **실제 환경 시뮬레이션**: 프로덕션과 유사한 환경에서의 현실적인 테스트
4. **품질 게이트**: 명확한 품질 기준을 통한 배포 결정 자동화
5. **지속적인 개선**: 테스트 결과를 통한 시스템 품질 지속적 개선

이 전략을 통해 ZyFlow는 안정적이고 신뢰성 있는 단일 진실 원천 아키텍처를 구축하고 유지할 수 있을 것입니다.