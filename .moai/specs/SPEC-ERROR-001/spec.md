---
spec_id: SPEC-ERROR-001
title: Global Error Handler Implementation
priority: High
status: Planned
created: 2026-02-01
assigned: manager-ddd
phase: 5
dependencies: [SPEC-MIGR-001, SPEC-VISIBILITY-001]
related_specs: []
tags: [error-handling, error-boundary, monitoring, resilience, user-experience]
metrics:
  error_types_covered: 6
  component_count: 5
  test_coverage_target: 85
  priority_high: true
---

# SPEC-ERROR-001: Global Error Handler Implementation

## Executive Summary

구현 글로벌 에러 핸들링 시스템을 통해 ZyFlow의 모든 에러 타입을 일관되게 처리하고, 사용자에게 명확한 피드백을 제공하며, 자동 복구 메커니즘을 지원합니다.

Implement a centralized, robust global error handling system that covers all error types across ZyFlow, provides clear user feedback in Korean and English, and enables automatic recovery mechanisms.

---

## Environment

**Frontend Environment:**
- React 19 with concurrent rendering
- TypeScript 5.9 with strict mode
- Vite development server and production build
- TailwindCSS 4 for styling
- React Query for server state management

**Backend Environment:**
- Express.js API server
- SQLite database with Drizzle ORM
- Server-Sent Events (SSE) for real-time streaming
- Node.js 20+ runtime

**Network Environment:**
- HTTP/HTTPS REST API endpoints
- WebSocket/SSE connections for real-time updates
- Cross-origin requests with CORS
- Network instability scenarios (slow connections, timeouts)

**Browser Environment:**
- Chrome 120+, Firefox 121+, Safari 17+
- Modern JavaScript features (Promises, async/await)
- LocalStorage for persistence
- Service Worker support for offline handling

---

## Assumptions

**Technical Assumptions:**
1. React components use suspense and error boundaries for error isolation
2. All async operations (API calls, task execution) return Promise-based results
3. SSE connection can be interrupted and requires reconnection logic
4. Error messages are structured with error codes and severity levels
5. Component state can be safely serialized for error context

**User Behavior Assumptions:**
1. Users expect immediate error notification (within 100ms)
2. Users will attempt recovery (retry) if action failed
3. Users need clear explanation of what went wrong and why
4. Users may switch between Korean and English language contexts
5. Users may leave application during error state and return later

**System Assumptions:**
1. Error logging service is available for monitoring
2. Database is resilient and provides transaction rollback
3. Network errors are temporary and will eventually resolve
4. External service failures do not affect core platform functionality
5. Task execution failures do not corrupt existing data

---

## Requirements

### Ubiquitous Requirements (System-Wide Always Active)

Req-Error-001: The system **shall** validate all user inputs and provide clear error messages for invalid data in both Korean and English.
```
- Validation occurs before API call
- Error message includes field name, current value, and correction guidance
- Toast notification displays error for 5 seconds (dismissible)
```

Req-Error-002: The system **shall** log all errors with timestamp, error code, severity, and context information for debugging.
```
- Error logs stored in memory (50 entries) and localStorage (500 entries)
- Log format: [TIMESTAMP] [SEVERITY] [CODE] [MESSAGE] [CONTEXT]
- Manual export available for troubleshooting
```

Req-Error-003: The system **shall** provide consistent error message format across all components and API responses.
```
- Format: { code: string, message: string, details?: object, severity: 'info'|'warning'|'error'|'critical' }
- All API responses include error code for programmatic handling
- User-facing messages are localized to user's language preference
```

Req-Error-004: The system **shall** capture error context (component name, props, state) automatically when exceptions occur.
```
- Context captured by Error Boundary
- Includes: component tree, user actions before error, application state
- Context available in error detail panel for developers
```

### Event-Driven Requirements (Trigger-Response)

Req-Error-005: **When** API request fails (4xx or 5xx response), the system **shall** classify error and show appropriate user message.
```
- 4xx errors: Input validation or resource not found
- 5xx errors: Server error, suggest retry after delay
- Network timeout: Prompt user to retry or continue without data
- Response time: Error notification within 100ms
```

Req-Error-006: **When** React component throws uncaught exception, the system **shall** catch error in boundary and display recovery UI.
```
- Error Boundary wraps major sections (Flow, Tasks, Git, Settings)
- Recovery options: Retry, Reset State, Navigate to Home
- Error details available in collapsed details panel
```

Req-Error-007: **When** task execution fails in TaskExecutionDialog, the system **shall** provide error details and recovery options.
```
- Display error message with task name and failure reason
- Show execution log with error stack trace (dev mode)
- Options: Retry, Edit Task, Skip Task, Stop Execution
```

Req-Error-008: **When** SSE connection disconnects, the system **shall** attempt automatic reconnection with exponential backoff.
```
- Initial retry: 1 second
- Max interval: 30 seconds
- Max attempts: 10 before showing connection lost message
- Manual reconnect button available
```

Req-Error-009: **When** network error occurs (no internet connection), the system **shall** show offline mode and queue operations.
```
- Detect offline state and show banner
- Queue API requests for execution when online
- Disable operations requiring network connection
```

Req-Error-010: **When** SPEC parsing fails in dashboard, the system **shall** show error details and recovery options.
```
- Display which file failed to parse (spec.md, plan.md, acceptance.md)
- Show parsing error with line number and context
- Options: View File, Refresh, Report Issue
```

Req-Error-011: **When** state management error occurs (Zustand update fails), the system **shall** detect and notify user.
```
- Detect mutation errors in store update
- Show "State Update Failed" toast with retry button
- Revert to previous stable state automatically
```

Req-Error-012: **When** SSE event parsing fails, the system **shall** log error and continue processing next events.
```
- Catch JSON parse errors on SSE messages
- Log malformed message for debugging
- Send recovery message to server to skip corrupted event
```

### State-Driven Requirements (Conditional)

Req-Error-013: **While** user is in TaskExecutionDialog, **the system shall** display real-time error feedback without closing dialog.
```
- Errors shown in toast or inline message
- Dialog remains open for recovery or retry
- User can scroll through error logs
```

Req-Error-014: **While** application is in offline mode, **the system shall** disable create/update operations and show queue status.
```
- Read-only mode for all data operations
- Show pending operations count and timestamp
- Auto-sync when connection restored
```

Req-Error-015: **While** error recovery is in progress, **the system shall** disable user actions and show loading state.
```
- Gray out buttons during recovery
- Show progress indicator (spinner or progress bar)
- Estimated time if known (for long operations)
```

Req-Error-016: **IF** multiple errors occur simultaneously, **the system shall** prioritize by severity and show aggregated error summary.
```
- Critical errors shown immediately
- Warning/Info errors grouped and shown after critical ones
- Max 3 error notifications visible at once
```

### Unwanted Behavior Requirements (Prohibited Actions)

Req-Error-017: The system **shall not** suppress errors silently; all errors **must** be logged and visible to user or developer.
```
- No console.log-only error handling
- No discarded Promise rejections
- All errors must reach Error Boundary or error logger
```

Req-Error-018: The system **shall not** show sensitive information (API keys, database credentials) in error messages to users.
```
- Sanitize error messages before display
- Keep full error details in server logs only
- Development-only error details in collapsed panel
```

Req-Error-019: The system **shall not** allow error recovery to leave application in corrupted state.
```
- All recovery operations are transactional
- Rollback on any recovery action failure
- Database consistency verified before recovery completion
```

Req-Error-020: The system **shall not** create error messages in system language only; all messages **must** support user's language preference.
```
- Error code references i18n translation keys
- Missing translations show English fallback
- Language preference persisted per user
```

### Optional Requirements (Nice-to-Have Features)

Req-Error-021: **Where** user has enabled detailed logging, **the system should** capture performance metrics with errors.
```
- Track API response time
- Memory usage at time of error
- Component render count before error
```

Req-Error-022: **Where** error occurs repeatedly, **the system should** suggest common solutions or documentation links.
```
- Track error frequency per error code
- Link to troubleshooting guide if available
- Suggest related FAQ articles
```

Req-Error-023: **Where** user has reporting enabled, **the system should** send error telemetry to monitoring service.
```
- Aggregate error statistics for product insights
- Filter sensitive data before sending
- User consent required for error reporting
```

---

## Specifications

### Error Classification System

**Error Hierarchy:**
```
ErrorType
├── NetworkError
│   ├── ConnectionError (offline, CORS, network unreachable)
│   ├── TimeoutError (request timeout, SSE timeout)
│   └── ResponseError (4xx, 5xx status codes)
├── ComponentError
│   ├── RenderError (React component throw)
│   ├── HookError (custom hook exception)
│   └── BoundaryError (error boundary catch)
├── ValidationError
│   ├── InputValidation (form field validation)
│   ├── SchemaValidation (data structure mismatch)
│   └── TypeValidation (type mismatch)
├── StateError
│   ├── StoreMutationError (Zustand update failure)
│   ├── ContextError (React Context value missing)
│   └── SyncError (state synchronization failure)
├── TaskError
│   ├── ExecutionError (task run failed)
│   ├── ParsingError (SPEC file parse failed)
│   └── TimeoutError (task execution timeout)
└── SSEError
    ├── ConnectionError (SSE connection lost)
    ├── ParsingError (JSON parse failed)
    └── EventHandlerError (event processing exception)
```

**Error Codes (Format: XXXX):**
- ERR_NETWORK_1000: Connection failed
- ERR_NETWORK_1001: Request timeout
- ERR_NETWORK_1002: Invalid response
- ERR_COMPONENT_2000: Render error
- ERR_VALIDATION_3000: Input validation failed
- ERR_VALIDATION_3001: Schema validation failed
- ERR_STATE_4000: State mutation failed
- ERR_TASK_5000: Task execution failed
- ERR_SSE_6000: SSE connection lost

### Error Context Structure

```typescript
interface ErrorContext {
  // Error identification
  code: string;                    // e.g., "ERR_NETWORK_1000"
  message: string;                 // User-friendly message
  severity: 'info' | 'warning' | 'error' | 'critical';

  // Timestamps
  timestamp: number;               // Unix milliseconds

  // Location information
  component?: string;              // React component name
  function?: string;               // Function where error occurred
  line?: number;                   // Line number in source

  // Error details
  originalError?: Error;           // Original thrown error
  stack?: string;                  // Stack trace

  // Context data
  userAction?: string;             // What user was doing
  applicationState?: object;       // Relevant app state snapshot
  requestData?: object;            // Request that failed (sanitized)

  // Recovery information
  recoverable: boolean;            // Can user retry/recover?
  suggestedActions: string[];      // Available recovery options

  // Metadata
  isDevelopment: boolean;          // Running in dev mode?
  userId?: string;                 // Which user encountered error
}
```

### Error Display Component

**Error Toast Notification:**
- Position: Top-right of viewport
- Duration: 5 seconds (dismissible)
- Content: Error icon + message + action button (if retry available)
- Multiple toasts: Stack vertically, max 3 visible
- Language: User's language preference (Korean/English)

**Error Dialog (for critical errors):**
- Modal overlay with semi-transparent background
- Title: Error type (e.g., "Connection Error")
- Message: Detailed explanation and recovery suggestions
- Actions: Retry, Reset, Navigate Home, Close
- Expandable details section with stack trace (dev mode)
- Copy error code button for support tickets

**Error Boundary:**
- Fallback UI: "Something went wrong" message + recovery actions
- Headings: "We're having trouble"
- Subtext: "Try refreshing the page or come back later"
- Action buttons: Refresh, Home, Report Issue

### API Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERR_NETWORK_1002",
    "message": "Failed to fetch task details",
    "details": {
      "endpoint": "/api/tasks/123",
      "httpStatus": 500,
      "retryAfter": 5000
    },
    "timestamp": 1706745600000
  }
}
```

### Error Recovery Strategies

**Network Errors:**
1. Automatic retry with exponential backoff (1s, 2s, 4s, 8s max)
2. Manual retry button in toast
3. Queue offline operations for later execution
4. Show "Offline Mode" banner with manual reconnect

**Component Errors:**
1. Error Boundary catches and shows fallback UI
2. "Try Again" button to retry render
3. "Go to Home" button to reset state
4. Error details available for developers

**Validation Errors:**
1. Show field-level error message below input
2. Highlight field with red border
3. Focus moved to first invalid field
4. Clear error on user edit

**Task Execution Errors:**
1. Stop execution and show error details
2. Retry button to run task again
3. Skip task to continue with next
4. Cancel entire batch execution
5. Execution log preserved for review

**SSE Connection Errors:**
1. Attempt automatic reconnection (exponential backoff)
2. Show connection status indicator
3. Manual reconnect button in header
4. Queue operations while disconnected
5. Sync queued operations when reconnected

---

## Technical Approach

### Component Architecture

**1. GlobalErrorBoundary (Root Level)**
- Wraps entire application
- Catches unhandled exceptions from all child components
- Renders fallback UI with recovery options
- Logs error and captures context
- Does not catch:
  - Event handler errors (use try-catch)
  - Async errors (use .catch() or try-catch)
  - Server-side errors (use API error handling)

**2. ErrorContext + ErrorProvider**
- Global error state management (Zustand store)
- Methods: addError(), clearError(), clearAll()
- Tracks: active errors, error history, error queue
- Integration with error display components

**3. ErrorDisplay Component**
- Toast notifications (top-right stack)
- Error dialog for critical errors
- Inline error messages for form validation
- Error detail panel (dev mode with stack trace)

**4. useAsyncError Hook**
- For throwing async errors in async/await code
- Requires Error Boundary to catch
- Usage: catch block calls useAsyncError(error)

**5. useErrorHandler Hook**
- For handling errors in event handlers
- Shows error toast, logs context
- Provides retry callback
- Usage: onClick={() => handleUserAction().catch(useErrorHandler())}

### Error Handling Patterns

**API Call Pattern:**
```typescript
async function fetchTasks() {
  try {
    const response = await api.get('/tasks');
    if (!response.ok) {
      const error = await response.json();
      handleError({
        code: error.code,
        message: error.message,
        action: 'retry'
      });
      return;
    }
    return response.data;
  } catch (error) {
    handleError({
      code: 'ERR_NETWORK_1000',
      message: 'Failed to fetch tasks',
      recoverable: true,
      action: 'retry'
    });
  }
}
```

**Component Error Pattern:**
```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <TaskExecutionDialog />
</ErrorBoundary>
```

**Event Handler Pattern:**
```typescript
const handleSubmit = async (data) => {
  try {
    await api.post('/tasks', data);
  } catch (error) {
    errorHandler.show({
      message: error.message,
      action: 'retry',
      onRetry: () => handleSubmit(data)
    });
  }
};
```

**SSE Error Pattern:**
```typescript
const handleSSEMessage = (data) => {
  try {
    const parsed = JSON.parse(data);
    processEvent(parsed);
  } catch (error) {
    errorLogger.log({
      code: 'ERR_SSE_6001',
      message: 'Failed to parse SSE event',
      originalError: error
    });
    // Continue processing, don't break stream
  }
};
```

### Integration Points

**1. useSwarm Hook Integration:**
- Catch errors from task execution
- Display error in TaskExecutionDialog
- Provide retry mechanism
- Persist error log to localStorage

**2. TaskExecutionDialog Integration:**
- Show real-time error feedback
- Display execution log with errors highlighted
- Provide recovery actions (retry, skip, stop)
- Maintain dialog open during error state

**3. API Client Integration:**
- Intercept all HTTP responses
- Classify errors by status code
- Add retry logic with exponential backoff
- Normalize error response format

**4. SSE Connection Integration:**
- Detect connection loss
- Attempt automatic reconnection
- Queue events while disconnected
- Sync on reconnection

**5. State Management (Zustand):**
- Detect mutation errors
- Automatically rollback on failure
- Show error notification
- Maintain consistency

### Development Workflow

**Error Testing Strategy:**
1. Unit tests for error classification logic
2. Component tests for Error Boundary behavior
3. Integration tests for API error handling
4. E2E tests for user error recovery flow
5. Error scenario tests (network timeout, server error, etc.)

**Error Monitoring:**
1. Client-side error logging to localStorage
2. Optional server-side error collection
3. Error dashboard showing frequency and patterns
4. Developer console for detailed debugging

---

## Success Metrics

### Coverage Metrics
- 6 error types fully handled (Network, Component, Validation, State, Task, SSE)
- 5 error handling components implemented (Boundary, Context, Display, Hooks, Recovery)
- 23 error codes defined with i18n support
- 100% of API endpoints return standardized error format

### User Experience Metrics
- Error notification latency: < 100ms
- Error message clarity: Users correctly identify issue without help
- Recovery success rate: 80%+ of errors recoverable by user action
- Language support: 100% of error messages translated to Korean/English

### Quality Metrics
- Test coverage: 85%+ for error handling code
- Error logging: All errors logged with context
- Recovery mechanisms: Tested for 10+ error scenarios
- Memory usage: Error log limited to 50 in-memory entries

### Operational Metrics
- SSE reconnection success rate: 95%+ within 10 attempts
- Offline mode sync accuracy: 100% data consistency
- Error rate trend: Decrease over time as issues are fixed
- User-reported errors: Captured and tracked

---

## Traceability

**Related Components:**
- Error Boundary: Wraps Flow, Tasks, Git, Settings sections
- TaskExecutionDialog: Shows task-specific errors
- useSwarm Hook: Handles execution errors
- API Client: Intercepts HTTP errors
- SSE Handler: Manages connection errors

**Related Files:**
- `src/components/errors/ErrorBoundary.tsx`
- `src/components/errors/ErrorDisplay.tsx`
- `src/hooks/useErrorHandler.ts`
- `src/api/error-interceptor.ts`
- `src/stores/errorStore.ts`

**Dependencies:**
- React 19 (Error Boundary, suspense)
- TypeScript 5.9 (type safety)
- Zustand (state management)
- React Query (API state)
- TailwindCSS (styling)

