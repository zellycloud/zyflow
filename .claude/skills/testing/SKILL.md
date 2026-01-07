# Testing Skill

테스트 작성 및 품질 보증을 위한 테스팅 스킬입니다.

## 핵심 역할

1. **단위 테스트 작성**: 함수/컴포넌트 수준 테스트
2. **통합 테스트 작성**: 모듈 간 상호작용 테스트
3. **E2E 테스트 작성**: 사용자 시나리오 테스트
4. **커버리지 관리**: 코드 커버리지 목표 달성

## 테스트 작성 가이드라인

### 📐 테스트 구조 (AAA 패턴)
```typescript
describe('ComponentName', () => {
  it('should [expected behavior] when [condition]', () => {
    // Arrange - 준비
    const input = 'test data';
    
    // Act - 실행
    const result = functionUnderTest(input);
    
    // Assert - 검증
    expect(result).toBe('expected output');
  });
});
```

### 📝 테스트 이름 규칙
```
should [동작] when [조건]
should return user data when valid id provided
should throw error when email is invalid
should update state when button clicked
```

### 🎯 테스트 범위 결정

| 테스트 유형 | 대상 | 비율 |
|------------|------|------|
| 단위 테스트 | 순수 함수, 유틸리티, 핵심 로직 | 70% |
| 통합 테스트 | API, DB 연동, 모듈 간 상호작용 | 20% |
| E2E 테스트 | 핵심 사용자 플로우 | 10% |

## 커버리지 기준

### 📊 최소 커버리지 요구사항

| 카테고리 | 최소 | 권장 |
|----------|------|------|
| Line Coverage | 70% | 80% |
| Branch Coverage | 60% | 75% |
| Function Coverage | 80% | 90% |
| Statement Coverage | 70% | 80% |

### 🎯 우선순위별 커버리지

```
🔴 Critical Path (필수 100%)
├── 인증/인가 로직
├── 결제/금융 로직
└── 데이터 무결성 로직

🟠 Core Features (최소 80%)
├── 핵심 비즈니스 로직
├── API 엔드포인트
└── 상태 관리 로직

🟡 Supporting Features (최소 70%)
├── UI 컴포넌트
├── 유틸리티 함수
└── 헬퍼 함수

🟢 Low Priority (최소 50%)
├── 설정/초기화 코드
├── 로깅/모니터링
└── 에러 핸들링 래퍼
```

## 테스트 유형별 가이드

### 🧪 단위 테스트

```typescript
// 순수 함수 테스트
describe('calculateTotal', () => {
  it('should sum all items correctly', () => {
    const items = [{ price: 100 }, { price: 200 }];
    expect(calculateTotal(items)).toBe(300);
  });
  
  it('should return 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });
  
  it('should handle negative values', () => {
    const items = [{ price: 100 }, { price: -50 }];
    expect(calculateTotal(items)).toBe(50);
  });
});
```

### 🔗 통합 테스트

```typescript
// API 통합 테스트
describe('UserAPI', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });
  
  it('should create user and return created data', async () => {
    const response = await api.post('/users', {
      name: 'Test User',
      email: 'test@example.com'
    });
    
    expect(response.status).toBe(201);
    expect(response.data.id).toBeDefined();
    expect(response.data.name).toBe('Test User');
  });
});
```

### 🌐 E2E 테스트

```typescript
// Playwright E2E 테스트
test('user login flow', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');
  
  // Fill credentials
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  
  // Submit form
  await page.click('[data-testid="submit"]');
  
  // Verify redirect to dashboard
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('h1')).toContainText('Welcome');
});
```

## 모킹 전략

### 📦 의존성 모킹
```typescript
// 외부 서비스 모킹
vi.mock('@/services/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true })
}));

// 시간 모킹
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-01'));
});

afterEach(() => {
  vi.useRealTimers();
});
```

### 🗄️ 데이터 모킹
```typescript
// Factory 패턴 사용
const createMockUser = (overrides = {}) => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  createdAt: new Date(),
  ...overrides
});
```

## 테스트 체크리스트

### ✅ 테스트 작성 전
- [ ] 테스트 대상 기능 명확히 정의
- [ ] 경계 조건 및 엣지 케이스 식별
- [ ] 모킹 전략 결정

### ✅ 테스트 작성 중
- [ ] AAA 패턴 적용
- [ ] 명확한 테스트 이름 사용
- [ ] 하나의 테스트에 하나의 assert

### ✅ 테스트 작성 후
- [ ] 커버리지 확인
- [ ] 테스트 실행 시간 확인 (단위 < 100ms)
- [ ] CI에서 안정적으로 실행되는지 확인

## CLI 명령어

```bash
# 전체 테스트 실행
npm run test

# 특정 파일 테스트
npm run test -- path/to/test.ts

# 커버리지 리포트
npm run test -- --coverage

# 워치 모드
npm run test -- --watch

# UI 모드 (Vitest)
npm run test -- --ui
```

## 테스트 안티패턴

### ❌ 피해야 할 것들

| 안티패턴 | 문제 | 해결 |
|----------|------|------|
| 테스트 간 의존성 | 순서에 따라 실패 | 독립적인 테스트 작성 |
| 하드코딩된 데이터 | 유지보수 어려움 | Factory 패턴 사용 |
| 구현 세부사항 테스트 | 리팩토링 시 깨짐 | 동작/결과 테스트 |
| 느린 테스트 | CI 병목 | 적절한 모킹 |
| 불안정한 테스트 (Flaky) | 신뢰도 저하 | 타이밍 이슈 해결 |
