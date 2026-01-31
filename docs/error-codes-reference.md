# Error Codes Reference

Complete reference for all 23 error codes in ZyFlow.

## Network Errors (1000-1002)

### ERR_NETWORK_1000: Connection Failed

**Description:** Network connection is unreachable, including offline state, CORS violations, and connection errors.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.network.connection_failed`
- Korean: `error.network.connection_failed_ko`

**Common Causes:**
- User device is offline
- DNS resolution failed
- Server unreachable
- CORS policy violation
- Firewall blocking connection

**Suggested Actions:**
- Check internet connection
- Retry after connection restored
- Check CORS configuration
- Contact support if persists

**Example:**

```typescript
{
  code: 'ERR_NETWORK_1000',
  message: 'Connection failed',
  type: ErrorType.NETWORK,
  severity: ErrorSeverity.ERROR,
  recoverable: true,
  suggestedActions: ['Check internet connection', 'Retry']
}
```

---

### ERR_NETWORK_1001: Request Timeout

**Description:** HTTP request did not complete within timeout period.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.network.request_timeout`
- Korean: `error.network.request_timeout_ko`

**Common Causes:**
- Server processing request slowly
- Network latency high
- Large file upload/download
- Server is overloaded

**Suggested Actions:**
- Retry operation
- Check server status
- Increase timeout if appropriate
- Try again during off-peak hours

**Example:**

```typescript
{
  code: 'ERR_NETWORK_1001',
  message: 'Request timeout after 30 seconds',
  type: ErrorType.NETWORK,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

### ERR_NETWORK_1002: Invalid Response

**Description:** Server returned an error response (5xx status codes).

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.network.invalid_response`
- Korean: `error.network.invalid_response_ko`

**Common Causes:**
- Server error (500, 502, 503, etc.)
- Service temporarily unavailable
- Internal server error
- Database connection error

**Suggested Actions:**
- Retry operation (automatic exponential backoff)
- Check server status page
- Try again in a few minutes
- Contact support if error persists

**Example:**

```typescript
{
  code: 'ERR_NETWORK_1002',
  message: 'Server error (500)',
  type: ErrorType.NETWORK,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

## Component Errors (2000-2001)

### ERR_COMPONENT_2000: Render Error

**Description:** Uncaught exception thrown during React component render.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.component.render_error`
- Korean: `error.component.render_error_ko`

**Common Causes:**
- Null/undefined property access
- Array map on non-array
- Missing required props
- Invalid state structure
- Type mismatch

**Suggested Actions:**
- Click "Retry" to attempt re-render
- Go to Home to reset state
- Check browser console for stack trace
- Review recent code changes

**Example:**

```typescript
{
  code: 'ERR_COMPONENT_2000',
  message: 'Cannot read property "map" of undefined',
  type: ErrorType.COMPONENT,
  severity: ErrorSeverity.ERROR,
  component: 'TaskList',
  recoverable: true
}
```

---

### ERR_COMPONENT_2001: Hook Error

**Description:** Invalid use of React hooks or custom hook error.

**Severity:** ERROR
**Recoverable:** No
**i18n Keys:**
- English: `error.component.hook_error`
- Korean: `error.component.hook_error_ko`

**Common Causes:**
- Hook called outside of component
- Hook called conditionally
- Hook called in class component
- Custom hook with invalid logic

**Suggested Actions:**
- Review hook usage guidelines
- Check React documentation
- Restart application
- Contact support

**Example:**

```typescript
{
  code: 'ERR_COMPONENT_2001',
  message: 'useAsyncError must be called in component',
  type: ErrorType.COMPONENT,
  severity: ErrorSeverity.ERROR,
  recoverable: false
}
```

---

## Validation Errors (3000-3001)

### ERR_VALIDATION_3000: Input Validation Failed

**Description:** User input fails validation checks.

**Severity:** WARNING
**Recoverable:** Yes
**i18n Keys:**
- English: `error.validation.input_failed`
- Korean: `error.validation.input_failed_ko`

**Common Causes:**
- Required field is empty
- Input format incorrect
- Value out of range
- Type mismatch

**Suggested Actions:**
- Review field error message
- Enter valid data
- Check field requirements
- Contact support if unsure

**Example:**

```typescript
{
  code: 'ERR_VALIDATION_3000',
  message: 'Field "projectName" is required',
  type: ErrorType.VALIDATION,
  severity: ErrorSeverity.WARNING,
  recoverable: true
}
```

---

### ERR_VALIDATION_3001: Schema Validation Failed

**Description:** Data structure does not match expected schema.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.validation.schema_failed`
- Korean: `error.validation.schema_failed_ko`

**Common Causes:**
- Unexpected property in data
- Missing required property
- Property type mismatch
- Invalid nested structure

**Suggested Actions:**
- Check data structure
- Review API response
- Validate input data
- Update schema if needed

**Example:**

```typescript
{
  code: 'ERR_VALIDATION_3001',
  message: 'Unexpected properties: unknown_field',
  type: ErrorType.VALIDATION,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

## State Errors (4000-4001)

### ERR_STATE_4000: State Mutation Failed

**Description:** Zustand store state update failed.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.state.mutation_failed`
- Korean: `error.state.mutation_failed_ko`

**Common Causes:**
- Invalid state object
- State mutation validation error
- Store not initialized
- Type mismatch in state

**Suggested Actions:**
- Retry operation
- Reset application state
- Check store initialization
- Contact support

**Example:**

```typescript
{
  code: 'ERR_STATE_4000',
  message: 'State mutation failed: Object is not valid',
  type: ErrorType.STATE,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

### ERR_STATE_4001: Context Value Missing

**Description:** React Context value is undefined or not provided.

**Severity:** CRITICAL
**Recoverable:** No
**i18n Keys:**
- English: `error.state.context_missing`
- Korean: `error.state.context_missing_ko`

**Common Causes:**
- Context Provider not found
- Component outside Provider scope
- Provider not initialized
- Missing dependency injection

**Suggested Actions:**
- Check Provider setup
- Verify Provider wraps component
- Restart application
- Contact support

**Example:**

```typescript
{
  code: 'ERR_STATE_4001',
  message: 'Context value is undefined',
  type: ErrorType.STATE,
  severity: ErrorSeverity.CRITICAL,
  recoverable: false
}
```

---

## Task Errors (5000-5002)

### ERR_TASK_5000: Task Execution Failed

**Description:** Task execution encountered an error.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.task.execution_failed`
- Korean: `error.task.execution_failed_ko`

**Common Causes:**
- Task script error
- Missing dependencies
- Invalid task configuration
- Environment issue

**Suggested Actions:**
- View execution log for details
- Retry task
- Check task configuration
- Contact support

**Example:**

```typescript
{
  code: 'ERR_TASK_5000',
  message: 'Task execution failed: Unknown error',
  type: ErrorType.TASK,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

### ERR_TASK_5001: SPEC Parsing Failed

**Description:** Failed to parse SPEC markdown file.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.task.parsing_failed`
- Korean: `error.task.parsing_failed_ko`

**Common Causes:**
- Invalid YAML frontmatter
- Malformed markdown
- Missing required sections
- Encoding issues

**Suggested Actions:**
- View parsing error details
- Review SPEC file syntax
- Fix identified issues
- Validate SPEC format

**Example:**

```typescript
{
  code: 'ERR_TASK_5001',
  message: 'Failed to parse spec.md: Invalid YAML frontmatter',
  type: ErrorType.TASK,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

### ERR_TASK_5002: Task Timeout

**Description:** Task execution exceeded timeout limit.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.task.timeout`
- Korean: `error.task.timeout_ko`

**Common Causes:**
- Task taking too long
- Infinite loop in task
- Network timeout in task
- Resource constraints

**Suggested Actions:**
- Retry task
- Optimize task performance
- Increase timeout if appropriate
- Check resource usage

**Example:**

```typescript
{
  code: 'ERR_TASK_5002',
  message: 'Task execution timeout after 30s',
  type: ErrorType.TASK,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

## SSE Errors (6000-6002)

### ERR_SSE_6000: SSE Connection Lost

**Description:** Server-Sent Events connection disconnected.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.sse.connection_lost`
- Korean: `error.sse.connection_lost_ko`

**Common Causes:**
- Server restarted
- Network disconnected
- Client disconnected
- Long-running connection timeout

**Suggested Actions:**
- Automatic reconnection in progress
- Manual reconnect if needed
- Check server status
- Check network connection

**Example:**

```typescript
{
  code: 'ERR_SSE_6000',
  message: 'SSE connection lost',
  type: ErrorType.SSE,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

### ERR_SSE_6001: Event Parsing Failed

**Description:** Failed to parse Server-Sent Event message.

**Severity:** WARNING
**Recoverable:** Yes
**i18n Keys:**
- English: `error.sse.parsing_failed`
- Korean: `error.sse.parsing_failed_ko`

**Common Causes:**
- Invalid JSON in event data
- Malformed event message
- Encoding issues
- Corrupted data transmission

**Suggested Actions:**
- Event is skipped, processing continues
- Check server event generation
- Verify data encoding
- Contact support if recurring

**Example:**

```typescript
{
  code: 'ERR_SSE_6001',
  message: 'Failed to parse SSE event: Invalid JSON',
  type: ErrorType.SSE,
  severity: ErrorSeverity.WARNING,
  recoverable: true
}
```

---

### ERR_SSE_6002: Event Handler Error

**Description:** Error processing Server-Sent Event.

**Severity:** ERROR
**Recoverable:** Yes
**i18n Keys:**
- English: `error.sse.handler_error`
- Korean: `error.sse.handler_error_ko`

**Common Causes:**
- Exception in event handler
- Event handler logic error
- State update in handler failed
- Resource error in handler

**Suggested Actions:**
- Event processing skipped
- Check event handler logic
- Check application state
- Verify resources available

**Example:**

```typescript
{
  code: 'ERR_SSE_6002',
  message: 'Event handler error',
  type: ErrorType.SSE,
  severity: ErrorSeverity.ERROR,
  recoverable: true
}
```

---

## Summary Table

| Code | Type | Severity | Recoverable |
|------|------|----------|-------------|
| ERR_NETWORK_1000 | Network | ERROR | Yes |
| ERR_NETWORK_1001 | Network | ERROR | Yes |
| ERR_NETWORK_1002 | Network | ERROR | Yes |
| ERR_COMPONENT_2000 | Component | ERROR | Yes |
| ERR_COMPONENT_2001 | Component | ERROR | No |
| ERR_VALIDATION_3000 | Validation | WARNING | Yes |
| ERR_VALIDATION_3001 | Validation | ERROR | Yes |
| ERR_STATE_4000 | State | ERROR | Yes |
| ERR_STATE_4001 | State | CRITICAL | No |
| ERR_TASK_5000 | Task | ERROR | Yes |
| ERR_TASK_5001 | Task | ERROR | Yes |
| ERR_TASK_5002 | Task | ERROR | Yes |
| ERR_SSE_6000 | SSE | ERROR | Yes |
| ERR_SSE_6001 | SSE | WARNING | Yes |
| ERR_SSE_6002 | SSE | ERROR | Yes |

---

## i18n Integration

All error messages support i18n with fallback to English:

```typescript
// src/locales/en.json
{
  "error.network.connection_failed": "Connection failed",
  "error.network.request_timeout": "Request timeout",
  ...
}

// src/locales/ko.json
{
  "error.network.connection_failed": "연결이 끊어졌습니다",
  "error.network.request_timeout": "요청 시간 초과",
  ...
}
```

Translation keys follow pattern: `error.[type].[error_name]`
