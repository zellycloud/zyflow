# Error Handling Guide

Comprehensive guide to error handling in ZyFlow, including architecture, implementation patterns, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Error Types and Codes](#error-types-and-codes)
3. [Core Components](#core-components)
4. [Error Handling Patterns](#error-handling-patterns)
5. [Integration Points](#integration-points)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Architecture Overview

ZyFlow implements a layered error handling system with multiple defense mechanisms:

### Layer 1: Error Classification and Logging
- All errors are classified by type (Network, Component, Validation, State, Task, SSE)
- Error logger captures context, stack traces, and recovery information
- In-memory log stores 50 recent errors; localStorage persists 500 entries

### Layer 2: Error Capture and Display
- Global Error Boundary catches all render errors
- Error Context tracks active and queued errors
- Toast notifications display to users within 100ms

### Layer 3: Recovery and Retry
- Automatic exponential backoff for network errors
- Manual retry options available for all recoverable errors
- State rollback on mutation failures

### Layer 4: Monitoring and Analytics
- Error dashboard tracks metrics and trends
- Error statistics calculated over time periods
- Export capability for support and analysis

## Error Types and Codes

### Network Errors (1000-1002)

| Code | Message | Severity | Recoverable | Cause |
|------|---------|----------|-------------|-------|
| ERR_NETWORK_1000 | Connection failed | ERROR | Yes | Network unreachable, CORS, offline |
| ERR_NETWORK_1001 | Request timeout | ERROR | Yes | Server slow, network latency |
| ERR_NETWORK_1002 | Invalid response | ERROR | Yes | Server error (5xx) |

**Recovery Strategy:**
- Automatic retry with exponential backoff (1s, 2s, 4s, 8s max)
- Show offline banner if connection lost
- Queue operations while offline
- Manual reconnect button available

### Component Errors (2000-2001)

| Code | Message | Severity | Recoverable | Cause |
|------|---------|----------|-------------|-------|
| ERR_COMPONENT_2000 | Render error | ERROR | Yes | Uncaught exception in component |
| ERR_COMPONENT_2001 | Hook error | ERROR | No | Misuse of React hooks |

**Recovery Strategy:**
- Error Boundary catches and shows fallback UI
- "Retry" button attempts to re-render
- "Go to Home" navigates to root
- Error details available for debugging

### Validation Errors (3000-3001)

| Code | Message | Severity | Recoverable | Cause |
|------|---------|----------|-------------|-------|
| ERR_VALIDATION_3000 | Input validation failed | WARNING | Yes | Invalid form input |
| ERR_VALIDATION_3001 | Schema validation failed | ERROR | Yes | Data structure mismatch |

**Recovery Strategy:**
- Display inline error messages below field
- Highlight field with red border
- Clear error on user edit
- Focus moved to first invalid field

### State Errors (4000-4001)

| Code | Message | Severity | Recoverable | Cause |
|------|---------|----------|-------------|-------|
| ERR_STATE_4000 | State mutation failed | ERROR | Yes | Zustand store update failure |
| ERR_STATE_4001 | Context value missing | CRITICAL | No | Context provider not found |

**Recovery Strategy:**
- Automatic rollback to previous state
- Show "State Update Failed" toast with retry
- For missing context, show fallback UI

### Task Errors (5000-5002)

| Code | Message | Severity | Recoverable | Cause |
|------|---------|----------|-------------|-------|
| ERR_TASK_5000 | Task execution failed | ERROR | Yes | Task script error |
| ERR_TASK_5001 | SPEC parsing failed | ERROR | Yes | Invalid SPEC file |
| ERR_TASK_5002 | Task timeout | ERROR | Yes | Task runs too long |

**Recovery Strategy:**
- Display execution log with error highlighting
- Retry button to run task again
- Skip option to continue with next task
- Cancel entire batch if needed

### SSE Errors (6000-6002)

| Code | Message | Severity | Recoverable | Cause |
|------|---------|----------|-------------|-------|
| ERR_SSE_6000 | SSE connection lost | ERROR | Yes | Server disconnection |
| ERR_SSE_6001 | Event parsing failed | WARNING | Yes | Invalid JSON in event |
| ERR_SSE_6002 | Event handler error | ERROR | Yes | Error processing event |

**Recovery Strategy:**
- Automatic reconnection with exponential backoff
- Queue events while disconnected
- Sync queued events on reconnection
- Manual reconnect button if needed

## Core Components

### ErrorBoundary

Class component that catches React render errors:

```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <YourComponent />
</ErrorBoundary>
```

**Lifecycle:**
1. Component throws error during render
2. Error Boundary catches it in getDerivedStateFromError()
3. componentDidCatch() logs error and captures context
4. Fallback UI displays with recovery actions

### Error Context and Store

Zustand store manages global error state:

```typescript
import { useErrorStore } from '@/stores/errorStore'

const { addError, clearError, getErrors } = useErrorStore()

// Add error
addError({
  code: 'ERR_NETWORK_1000',
  message: 'Connection failed',
  type: ErrorType.NETWORK,
  severity: ErrorSeverity.ERROR,
  recoverable: true,
})

// Get errors by type
const networkErrors = getErrors({ type: ErrorType.NETWORK })
```

### Error Logger

Captures and persists error logs:

```typescript
import { getErrorLogger } from '@/utils/error-logger'

const logger = getErrorLogger()

// Log error
logger.log({
  code: 'ERR_NETWORK_1001',
  message: 'Request timeout',
  timestamp: Date.now(),
  stack: error.stack,
})

// Get history
const recent = logger.getHistory(20)
const all = logger.getAllErrors()
```

### Error Display Components

#### ErrorToast

```typescript
<ErrorToast
  error={error}
  onDismiss={() => clearError(error.id)}
  autoClose={5000}
/>
```

#### ErrorDialog

```typescript
<ErrorDialog
  error={error}
  onRetry={handleRetry}
  onClose={() => setShowDialog(false)}
/>
```

#### InlineError

```typescript
<InlineError
  message="Field is required"
  visible={showError}
/>
```

## Error Handling Patterns

### API Call Pattern

```typescript
async function fetchData() {
  try {
    const response = await api.get('/endpoint')
    if (!response.ok) {
      throw new Error(response.statusText)
    }
    return response.data
  } catch (error) {
    errorStore.addError({
      code: 'ERR_NETWORK_1001',
      message: 'Failed to fetch data',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
    })
  }
}
```

### Event Handler Pattern

```typescript
const handleSubmit = async (data) => {
  try {
    await submitForm(data)
  } catch (error) {
    errorStore.addError({
      code: 'ERR_VALIDATION_3000',
      message: error.message,
      type: ErrorType.VALIDATION,
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userAction: 'clicked Submit',
    })
  }
}
```

### Component Render Pattern

```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <TaskExecutionDialog />
</ErrorBoundary>
```

### State Mutation Pattern

```typescript
const updateStore = useCallback(() => {
  try {
    const newState = { ...state, updated: true }
    validateState(newState)
    setState(newState)
  } catch (error) {
    errorStore.addError({
      code: 'ERR_STATE_4000',
      message: 'State update failed',
      type: ErrorType.STATE,
      recoverable: true,
    })
  }
}, [state])
```

### SSE Handling Pattern

```typescript
const handleSSEMessage = (event) => {
  try {
    const data = JSON.parse(event.data)
    processEvent(data)
  } catch (error) {
    errorLogger.log({
      code: 'ERR_SSE_6001',
      message: 'Failed to parse event',
      type: ErrorType.SSE,
      severity: ErrorSeverity.WARNING,
    })
    // Continue processing next event
  }
}
```

## Integration Points

### API Client

The API client automatically intercepts errors:

```typescript
// In src/api/client.ts
api.interceptors.response.use(
  response => response,
  error => {
    const errorContext = classifyError(error)
    errorLogger.log(errorContext)
    errorStore.addError(errorContext)
    return Promise.reject(error)
  }
)
```

### useSwarm Hook

Task execution errors are captured:

```typescript
const { execute, error } = useSwarm()

// Error automatically logged and displayed
await execute({ ...task })
```

### useNetworkStatus Hook

Network connectivity is monitored:

```typescript
const { isOnline } = useNetworkStatus()

if (!isOnline) {
  // Show offline banner
  // Queue operations
  // Disable create/update
}
```

### useSSEConnection Hook

SSE reconnection is handled:

```typescript
const { isConnected, reconnect } = useSSEConnection()

if (!isConnected) {
  // Show connection status
  // Attempt auto-reconnect
  // Provide manual reconnect button
}
```

## Best Practices

### 1. Error Context

Always capture context when logging errors:

```typescript
logger.log({
  code: 'ERR_NETWORK_1001',
  message: 'Failed to fetch',
  component: 'TaskList',
  function: 'loadTasks',
  userAction: 'clicked Load button',
  applicationState: { taskCount: 10 },
  recoverable: true,
  suggestedActions: ['Retry', 'Check network'],
})
```

### 2. Error Messages

Write clear, actionable error messages:

- ✅ "Connection failed. Please check your internet connection and try again."
- ❌ "Error 1001"
- ✅ "Task execution timeout after 30 seconds"
- ❌ "Timeout"

### 3. Recovery Options

Always provide recovery options for recoverable errors:

```typescript
{
  recoverable: true,
  suggestedActions: [
    'Retry operation',
    'Check configuration',
    'Contact support'
  ]
}
```

### 4. Severity Levels

Use appropriate severity levels:

- **CRITICAL**: Prevents application function, requires immediate attention
- **ERROR**: Feature broken, significant impact
- **WARNING**: Degraded functionality, user can continue
- **INFO**: Non-critical information

### 5. Error Deduplication

Prevent toast spam from identical errors:

```typescript
// Error store automatically deduplicates based on:
// code + component + function
```

### 6. Sensitive Data

Never log sensitive information:

```typescript
// ❌ Bad
{
  message: `Failed to authenticate with password: ${password}`
}

// ✅ Good
{
  message: 'Failed to authenticate'
}
```

## Troubleshooting

### Errors Not Displaying

1. Check if ErrorBoundary wraps your component
2. Verify error logger is initialized
3. Check browser console for errors in error handling code
4. Ensure error store is accessible

### Duplicate Error Messages

1. Error deduplication is working (prevents identical errors)
2. Different errors are treated separately
3. Check error codes are correct

### Lost Error Context

1. Ensure errorStore is hydrated from localStorage
2. Check in-memory log limit (50 entries)
3. Check localStorage limit (500 entries)
4. Clear old errors periodically

### Offline Mode Not Working

1. Verify useNetworkStatus hook is initialized
2. Check OfflineModeBanner is rendered
3. Verify offline queue is being populated
4. Check sync logic when coming back online

### Recovery Not Happening

1. Ensure error is marked as `recoverable: true`
2. Verify suggestedActions are provided
3. Check recovery callbacks are properly connected
4. Verify retry logic is working
