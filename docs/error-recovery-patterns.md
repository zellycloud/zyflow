# Error Recovery Patterns

Comprehensive patterns for error recovery and resilience in ZyFlow.

## Network Error Recovery

### Pattern 1: Exponential Backoff Retry

Used for transient network errors that may resolve with time.

```typescript
async function retryWithBackoff(
  operation: () => Promise<any>,
  maxAttempts: number = 5
): Promise<any> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      const delay = Math.min(
        1000 * Math.pow(2, attempt - 1),
        30000 // Max 30 seconds
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// Usage
const data = await retryWithBackoff(
  () => api.get('/tasks'),
  5 // Retry up to 5 times
)
```

### Pattern 2: Offline Mode with Operation Queue

Queue operations while offline and sync when reconnected.

```typescript
const useOfflineQueue = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<PendingOperation[]>([])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Sync queued operations
      syncQueue()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const queueOperation = useCallback((operation: PendingOperation) => {
    if (isOnline) {
      return operation.execute()
    }
    setQueue((prev) => [...prev, operation])
  }, [isOnline])

  const syncQueue = useCallback(async () => {
    for (const operation of queue) {
      try {
        await operation.execute()
      } catch (error) {
        console.error('Failed to sync operation:', error)
      }
    }
    setQueue([])
  }, [queue])

  return { isOnline, queueOperation, syncQueue }
}
```

### Pattern 3: Circuit Breaker for Cascading Failures

Prevent cascading failures by breaking circuit after repeated failures.

```typescript
class CircuitBreaker {
  private failureCount = 0
  private lastFailureTime = 0
  private readonly threshold = 5
  private readonly timeout = 60000 // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open')
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

  private isOpen(): boolean {
    return (
      this.failureCount >= this.threshold &&
      Date.now() - this.lastFailureTime < this.timeout
    )
  }

  private onSuccess(): void {
    this.failureCount = 0
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
  }
}
```

## Component Error Recovery

### Pattern 1: Error Boundary with Retry

```typescript
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  retryCount: number
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, retryCount: 0 }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState((state) => ({
      hasError: false,
      error: null,
      retryCount: state.retryCount + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={this.handleRetry}>Retry</button>
          <button onClick={() => window.location.href = '/'}>
            Go to Home
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

### Pattern 2: Suspense with Error Fallback

```typescript
function App() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<Loading />}>
        <TaskList />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## Validation Error Recovery

### Pattern 1: Field-Level Validation with Clear Feedback

```typescript
interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

function validateForm(data: FormData): ValidationResult {
  const errors: Record<string, string> = {}

  if (!data.projectName?.trim()) {
    errors.projectName = 'Project name is required'
  }

  if (data.projectName.length < 3) {
    errors.projectName = 'Project name must be at least 3 characters'
  }

  if (!data.description?.trim()) {
    errors.description = 'Description is required'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

function FormField({ name, value, error, onChange }: FormFieldProps) {
  return (
    <div>
      <input
        name={name}
        value={value}
        onChange={onChange}
        className={error ? 'border-red-500' : ''}
      />
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}
```

## State Error Recovery

### Pattern 1: Automatic Rollback on Mutation Failure

```typescript
const useRolledBackState = <T,>(initialState: T) => {
  const [state, setState] = useState(T)
  const previousStateRef = useRef(T)

  const updateState = useCallback((newState: T) => {
    previousStateRef.current = state
    try {
      // Validate new state
      validateState(newState)
      setState(newState)
    } catch (error) {
      // Rollback to previous state
      setState(previousStateRef.current)
      console.error('State update failed, rolled back:', error)
    }
  }, [state])

  return [state, updateState] as const
}
```

### Pattern 2: State Synchronization with Conflict Resolution

```typescript
async function syncState(
  localState: AppState,
  remoteState: AppState
): Promise<AppState> {
  const merged: AppState = { ...localState }

  // Merge remote changes with local state
  for (const [key, remoteValue] of Object.entries(remoteState)) {
    const localValue = localState[key as keyof AppState]

    if (typeof remoteValue === 'number' && typeof localValue === 'number') {
      // Take the maximum for counters
      merged[key as keyof AppState] = Math.max(localValue, remoteValue)
    } else if (typeof remoteValue === 'object' && typeof localValue === 'object') {
      // Deep merge for objects
      merged[key as keyof AppState] = {
        ...localValue,
        ...remoteValue,
      }
    } else {
      // Prefer remote for other types
      merged[key as keyof AppState] = remoteValue
    }
  }

  return merged
}
```

## Task Execution Error Recovery

### Pattern 1: Graceful Failure Handling

```typescript
async function executeTaskWithRecovery(
  task: Task,
  onProgress: (message: string) => void
): Promise<TaskResult> {
  try {
    onProgress(`Executing task: ${task.name}`)
    const result = await executeTask(task)
    return result
  } catch (error) {
    onProgress(`Task failed: ${error.message}`)

    // Attempt recovery
    const recovery = await getRecoveryStrategy(error)
    if (recovery) {
      onProgress(`Attempting recovery: ${recovery.name}`)
      try {
        return await recovery.execute(task)
      } catch (recoveryError) {
        onProgress(`Recovery failed: ${recoveryError.message}`)
        throw new Error(`Task failed and recovery failed: ${recoveryError.message}`)
      }
    }

    throw error
  }
}
```

### Pattern 2: Batch Task Execution with Partial Failure Handling

```typescript
async function executeBatch(
  tasks: Task[]
): Promise<{ succeeded: Task[]; failed: Array<{ task: Task; error: Error }> }> {
  const results = { succeeded: [] as Task[], failed: [] as Array<{ task: Task; error: Error }> }

  for (const task of tasks) {
    try {
      await executeTask(task)
      results.succeeded.push(task)
    } catch (error) {
      results.failed.push({ task, error: error as Error })

      // Decide whether to continue
      if (isFatalError(error)) {
        break
      }
    }
  }

  return results
}
```

## SSE Connection Error Recovery

### Pattern 1: Automatic Reconnection with Exponential Backoff

```typescript
class SSEConnection {
  private eventSource: EventSource | null = null
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 10
  private reconnectDelay = 1000

  connect(url: string): void {
    this.eventSource = new EventSource(url)

    this.eventSource.addEventListener('message', (event) => {
      this.handleMessage(event)
      this.reconnectAttempts = 0
      this.reconnectDelay = 1000
    })

    this.eventSource.addEventListener('error', () => {
      this.handleConnectionError()
    })
  }

  private handleConnectionError(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts exceeded')
      return
    }

    this.reconnectAttempts++
    console.log(
      `Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    )

    setTimeout(() => {
      this.eventSource?.close()
      this.connect((this.eventSource as any).url)
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      30000 // Max 30 seconds
    )
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data)
      this.processEvent(data)
    } catch (error) {
      console.error('Failed to parse SSE event:', error)
      // Continue processing other events
    }
  }

  private processEvent(data: unknown): void {
    // Handle event
  }
}
```

## Error Reporting and Analytics

### Pattern 1: Error Analytics Collection

```typescript
interface ErrorAnalytics {
  trackError(error: ErrorContext): void
  getErrorStats(): ErrorStats
  exportReport(): void
}

class ErrorAnalyticsService implements ErrorAnalytics {
  private errors: ErrorContext[] = []

  trackError(error: ErrorContext): void {
    this.errors.push(error)

    // Send to monitoring service
    if (shouldReportError(error)) {
      this.reportToMonitoring(error)
    }
  }

  private shouldReportError(error: ErrorContext): boolean {
    // Filter based on severity, frequency, etc.
    return error.severity === 'critical' || error.severity === 'error'
  }

  private reportToMonitoring(error: ErrorContext): void {
    // Send sanitized error to backend
    fetch('/api/errors', {
      method: 'POST',
      body: JSON.stringify(sanitizeError(error)),
    }).catch(() => {
      // Fail silently to avoid cascading errors
    })
  }

  getErrorStats(): ErrorStats {
    return calculateErrorStats(this.errors)
  }

  exportReport(): void {
    const data = {
      timestamp: new Date().toISOString(),
      errors: this.errors,
      stats: this.getErrorStats(),
    }
    downloadJSON(data, 'error-report.json')
  }
}
```
