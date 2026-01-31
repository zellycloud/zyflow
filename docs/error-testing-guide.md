# Error Testing Guide

Comprehensive guide for testing error handling with 20+ scenarios.

## Test Strategy Overview

### Testing Pyramid

```
      Unit Tests (Error Classification)
     /        \
    /          \
   /            \
  / Component    \ Integration Tests
 /    Tests       \ (API, SSE, State)
/________________\
  E2E Tests
(User Workflows)
```

## Unit Tests: Error Classification

### Testing Error Code Mapping

```typescript
import { describe, it, expect } from 'vitest'
import { classifyError, mapHttpStatus } from '@/utils/error-classifier'
import { ErrorType, ErrorSeverity } from '@/types/errors'

describe('Error Classification', () => {
  it('maps 400 status to validation error', () => {
    const error = classifyError({
      status: 400,
      message: 'Bad request',
    })
    expect(error.type).toBe(ErrorType.VALIDATION)
  })

  it('maps 404 status to validation error', () => {
    const error = classifyError({
      status: 404,
      message: 'Not found',
    })
    expect(error.type).toBe(ErrorType.VALIDATION)
  })

  it('maps 500 status to network error', () => {
    const error = classifyError({
      status: 500,
      message: 'Internal server error',
    })
    expect(error.type).toBe(ErrorType.NETWORK)
  })

  it('maps network timeout to network error', () => {
    const error = classifyError({
      code: 'ETIMEDOUT',
      message: 'Request timeout',
    })
    expect(error.code).toBe('ERR_NETWORK_1001')
  })
})
```

### Testing Error Logger

```typescript
describe('ErrorLogger', () => {
  it('logs error with timestamp', () => {
    const logger = getErrorLogger()
    const error: ErrorContext = {
      code: 'ERR_NETWORK_1000',
      message: 'Connection failed',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.ERROR,
      timestamp: Date.now(),
      recoverable: true,
    }

    const logged = logger.log(error)
    expect(logged.timestamp).toBe(error.timestamp)
  })

  it('maintains max in-memory log size', () => {
    const logger = getErrorLogger()
    logger.clear()

    // Add 100 errors
    for (let i = 0; i < 100; i++) {
      logger.log({
        code: 'ERR_TEST',
        message: `Error ${i}`,
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        recoverable: true,
      })
    }

    const history = logger.getAllErrors()
    expect(history.length).toBeLessThanOrEqual(50) // Max in-memory
  })

  it('persists errors to localStorage', () => {
    const logger = getErrorLogger()
    logger.clear()

    logger.log({
      code: 'ERR_TEST',
      message: 'Test error',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.ERROR,
      timestamp: Date.now(),
      recoverable: true,
    })

    expect(localStorage.getItem('zyflow_error_logs_1')).toBeTruthy()
  })

  it('retrieves errors by type', () => {
    const logger = getErrorLogger()
    logger.clear()

    logger.log({
      code: 'ERR_NETWORK_1000',
      message: 'Network error',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.ERROR,
      timestamp: Date.now(),
      recoverable: true,
    })

    logger.log({
      code: 'ERR_COMPONENT_2000',
      message: 'Component error',
      type: ErrorType.COMPONENT,
      severity: ErrorSeverity.ERROR,
      timestamp: Date.now(),
      recoverable: true,
    })

    const networkErrors = logger.getErrorsByType(ErrorType.NETWORK)
    expect(networkErrors.length).toBe(1)
    expect(networkErrors[0].code).toBe('ERR_NETWORK_1000')
  })
})
```

## Component Tests: Error Boundary

### Testing Error Boundary Catch

```typescript
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '@/components/errors/ErrorBoundary'

describe('ErrorBoundary', () => {
  it('catches render error and displays fallback', () => {
    const ThrowingComponent = () => {
      throw new Error('Render error')
    }

    render(
      <ErrorBoundary fallback={<div>Error occurred</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Error occurred')).toBeInTheDocument()
  })

  it('logs error when boundary catches', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation()

    const ThrowingComponent = () => {
      throw new Error('Test error')
    }

    render(
      <ErrorBoundary fallback={<div>Error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(logSpy).toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('provides retry functionality', async () => {
    const { rerender } = render(
      <ErrorBoundary fallback={<button>Retry</button>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    const retryButton = screen.getByText('Retry')
    await userEvent.click(retryButton)

    rerender(
      <ErrorBoundary fallback={<button>Retry</button>}>
        <ValidComponent />
      </ErrorBoundary>
    )

    expect(screen.queryByText('Retry')).not.toBeInTheDocument()
  })
})
```

### Testing Error Display Components

```typescript
describe('ErrorToast', () => {
  it('displays error message', () => {
    const error: ErrorContext = {
      code: 'ERR_NETWORK_1000',
      message: 'Connection failed',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.ERROR,
      timestamp: Date.now(),
      recoverable: true,
    }

    render(
      <ErrorToast error={error} onDismiss={() => {}} />
    )

    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('auto-dismisses after timeout', async () => {
    const onDismiss = vi.fn()
    const error: ErrorContext = {
      code: 'ERR_NETWORK_1000',
      message: 'Connection failed',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.ERROR,
      timestamp: Date.now(),
      recoverable: true,
    }

    render(
      <ErrorToast error={error} onDismiss={onDismiss} autoClose={100} />
    )

    await new Promise(resolve => setTimeout(resolve, 150))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('shows severity icon', () => {
    const error: ErrorContext = {
      code: 'ERR_NETWORK_1000',
      message: 'Error',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.CRITICAL,
      timestamp: Date.now(),
      recoverable: true,
    }

    const { container } = render(
      <ErrorToast error={error} onDismiss={() => {}} />
    )

    expect(container.querySelector('[title="Critical"]')).toBeInTheDocument()
  })
})
```

## Integration Tests: API Error Handling

### Testing Retry Logic

```typescript
describe('API Retry Logic', () => {
  it('retries on timeout', async () => {
    const api = createMockAPI()
    let attempts = 0

    vi.spyOn(api, 'get').mockImplementation(async () => {
      attempts++
      if (attempts < 3) {
        throw new Error('TIMEOUT')
      }
      return { data: 'success' }
    })

    const result = await retryWithBackoff(() => api.get('/test'), 5)
    expect(result.data).toBe('success')
    expect(attempts).toBe(3)
  })

  it('fails after max retries', async () => {
    const api = createMockAPI()

    vi.spyOn(api, 'get').mockRejectedValue(new Error('TIMEOUT'))

    await expect(
      retryWithBackoff(() => api.get('/test'), 3)
    ).rejects.toThrow()
  })

  it('uses exponential backoff timing', async () => {
    const api = createMockAPI()
    const timings: number[] = []
    let lastTime = Date.now()

    vi.spyOn(api, 'get').mockImplementation(async () => {
      const now = Date.now()
      timings.push(now - lastTime)
      lastTime = now
      throw new Error('TIMEOUT')
    })

    await retryWithBackoff(() => api.get('/test'), 5)

    // Check exponential backoff: 1s, 2s, 4s, etc.
    expect(timings[1]).toBeGreaterThanOrEqual(900) // ~1s
    expect(timings[2]).toBeGreaterThanOrEqual(1900) // ~2s
  })
})
```

### Testing Offline Mode

```typescript
describe('Offline Mode', () => {
  it('queues operations when offline', async () => {
    const { queueOperation } = useOfflineQueue()

    // Simulate offline
    const operation = {
      execute: vi.fn().mockResolvedValue('success'),
    }

    // Should queue when offline
    queueOperation(operation)

    expect(operation.execute).not.toHaveBeenCalled()
  })

  it('syncs operations when online', async () => {
    const { queueOperation, syncQueue } = useOfflineQueue()

    const operation = {
      execute: vi.fn().mockResolvedValue('success'),
    }

    queueOperation(operation)
    await syncQueue()

    expect(operation.execute).toHaveBeenCalled()
  })
})
```

## Integration Tests: SSE Error Handling

### Testing Reconnection

```typescript
describe('SSE Reconnection', () => {
  it('reconnects on connection loss', async () => {
    const sseConnection = new SSEConnection()
    const connectSpy = vi.spyOn(sseConnection, 'connect')

    sseConnection.connect('/api/events')
    expect(connectSpy).toHaveBeenCalledWith('/api/events')

    // Simulate connection loss
    sseConnection.handleConnectionError()

    // Should eventually reconnect
    await vi.advanceTimersByTimeAsync(1000)
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  it('uses exponential backoff for reconnection', async () => {
    const sseConnection = new SSEConnection()
    const timings: number[] = []

    vi.useFakeTimers()

    // Simulate multiple connection failures
    for (let i = 0; i < 3; i++) {
      sseConnection.handleConnectionError()
      timings.push(sseConnection.getReconnectDelay())
    }

    expect(timings[0]).toBe(1000)
    expect(timings[1]).toBe(2000)
    expect(timings[2]).toBe(4000)

    vi.useRealTimers()
  })

  it('stops reconnecting after max attempts', async () => {
    const sseConnection = new SSEConnection()
    const connectSpy = vi.spyOn(sseConnection, 'connect')

    // Simulate 10 failed reconnection attempts
    for (let i = 0; i < 10; i++) {
      sseConnection.handleConnectionError()
    }

    // Should not attempt further reconnection
    expect(sseConnection.getReconnectAttempts()).toBe(10)
  })
})
```

## E2E Tests: User Error Recovery Workflows

### SCENARIO-001: Network Error with Retry

```typescript
describe('E2E: Network Error Recovery', () => {
  it('user retries failed API call', async () => {
    // Setup: Simulate API failure
    mockAPI.get('/tasks').mockRejectedValueOnce(
      new Error('Network error')
    ).mockResolvedValueOnce({ tasks: [] })

    await page.goto('/')
    await page.click('[data-testid="load-tasks"]')

    // Error toast appears
    const errorToast = await page.waitForSelector('[role="alert"]')
    expect(await errorToast.textContent()).toContain('Connection failed')

    // User clicks retry
    await page.click('[data-testid="error-retry"]')

    // Retry succeeds
    await page.waitForSelector('[data-testid="tasks-list"]')
  })
})
```

### SCENARIO-002: Component Error with Recovery

```typescript
describe('E2E: Component Error Recovery', () => {
  it('user can recover from component render error', async () => {
    await page.goto('/tasks')

    // Component throws error
    await page.evaluate(() => {
      throw new Error('Component render error')
    })

    // Error Boundary displays fallback
    const fallback = await page.waitForSelector('[data-testid="error-fallback"]')
    expect(await fallback.isVisible()).toBe(true)

    // User clicks retry
    await page.click('[data-testid="retry-button"]')

    // Component re-renders successfully
    await page.waitForSelector('[data-testid="tasks-list"]')
  })
})
```

## Error Scenario Checklist

### Network Errors (5 scenarios)
- [ ] Request timeout
- [ ] Connection failed
- [ ] Server error with retry success
- [ ] Server error with retry failure
- [ ] CORS error

### Component Errors (4 scenarios)
- [ ] Render error
- [ ] Hook error
- [ ] Retry successful
- [ ] Multiple errors

### Validation Errors (3 scenarios)
- [ ] Form field validation
- [ ] Schema validation
- [ ] Type validation

### State Errors (2 scenarios)
- [ ] Store mutation failure
- [ ] Missing context

### Task Errors (3 scenarios)
- [ ] Task execution failure
- [ ] SPEC parsing failure
- [ ] Task timeout

### SSE Errors (3 scenarios)
- [ ] Connection lost
- [ ] Event parsing error
- [ ] Reconnection success

### Offline Scenarios (2 scenarios)
- [ ] Offline operation queueing
- [ ] Offline to online sync

### Total: 22+ scenarios

## Test Coverage Goals

- **Unit Tests:** 90%+ coverage for error classification and logging
- **Component Tests:** 95%+ coverage for Error Boundary and display components
- **Integration Tests:** 85%+ coverage for API, SSE, and state error handling
- **E2E Tests:** All 22+ error scenarios tested
- **Overall:** 85%+ project coverage

## Performance Testing

### Error Logging Performance

```typescript
describe('Error Logger Performance', () => {
  it('logs 1000 errors in < 100ms', () => {
    const logger = getErrorLogger()
    const start = performance.now()

    for (let i = 0; i < 1000; i++) {
      logger.log({
        code: 'ERR_TEST',
        message: `Error ${i}`,
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now(),
        recoverable: true,
      })
    }

    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(100)
  })
})
```

## Running Tests

```bash
# Unit tests
npm run test:unit

# Component tests
npm run test:components

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```
