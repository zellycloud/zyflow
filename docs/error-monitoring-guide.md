# Error Monitoring Guide

Guide for using the Error Dashboard and monitoring error metrics.

## Error Dashboard Overview

The Error Dashboard provides real-time monitoring, analytics, and management of error logs in ZyFlow.

### Accessing the Dashboard

```typescript
// Navigate to error dashboard
import ErrorDashboard from '@/components/monitoring/ErrorDashboard'

// Add to your routing
<Route path="/admin/errors" element={<ErrorDashboard />} />
```

### Dashboard Features

1. **Error History** - View recent errors in chronological order
2. **Error Statistics** - Track metrics and trends
3. **Filtering & Search** - Find specific errors quickly
4. **Export** - Export errors as JSON or CSV
5. **Detail Panel** - View comprehensive error information

## Dashboard Components

### Error History List

Displays up to 20 most recent errors with quick info:

**Columns:**
- Severity icon (critical/error/warning/info)
- Error code (e.g., ERR_NETWORK_1000)
- Error type badge (Network, Component, etc.)
- Error message (truncated)
- Component name
- Timestamp (relative time)
- Recovery status icon

**Sorting:** Newest first (most recent)

**Selection:** Click any error to view full details in right panel

### Error Statistics Panel

Shows key metrics and trends:

**Metrics:**
- **Total Errors** - Total errors in current filter
- **Recovery Rate** - % of errors marked recoverable
- **Avg Recovery Time** - Average time to recover from error
- **Trend (24h)** - Increasing/decreasing/stable trend

**Charts:**
- **By Severity** - Horizontal bars showing distribution (Critical, Error, Warning, Info)
- **Top 5 Errors** - Most frequent error codes with counts
- **Hourly Trend** - Stacked bar chart of errors over 24 hours

### Error Filters

Advanced filtering options:

**Search:**
- Full-text search across error code, message, component, function

**Filters:**
- Error Type (Network, Component, Validation, etc.)
- Severity (Critical, Error, Warning, Info)
- Component Name
- Date Range (Start and End date)

**Quick Actions:**
- Reset all filters
- Clear advanced filters

### Error Detail Panel

Full information about selected error:

**Display:**
- Error code (copyable)
- Full error message
- Type and severity
- Recovery status
- Component/function location
- User action that triggered error
- Recovery time
- Suggested actions
- Stack trace (expandable)
- Application state (expandable)
- Log timestamp

## Using Filters and Search

### Search Examples

**By Error Code:**
```
ERR_NETWORK_1001
```
Find all request timeout errors

**By Message:**
```
timeout
```
Find errors with "timeout" in message

**By Component:**
```
TaskExecutionDialog
```
Find errors from specific component

**By Function:**
```
fetchTasks
```
Find errors from specific function

### Advanced Filtering

**Network Errors in Last 24 Hours:**
1. Error Type: Network
2. Date Range: Last 24 hours
3. View results

**Critical Errors from Specific Component:**
1. Severity: Critical
2. Component: TaskExecutor
3. View results

**Recent Validation Errors:**
1. Error Type: Validation
2. Severity: Warning
3. Date Range: Last 1 hour
4. View results

**Recoverable Errors:**
1. Search: (leave blank)
2. View results - all errors show recovery status

## Exporting Error Logs

### JSON Export

```json
{
  "exportedAt": "2026-02-01T12:00:00.000Z",
  "filters": {
    "searchText": "",
    "errorType": "NETWORK",
    "dateRange": [
      "2026-02-01",
      "2026-02-02"
    ]
  },
  "errorCount": 42,
  "errors": [
    {
      "code": "ERR_NETWORK_1001",
      "message": "Request timeout",
      "type": "NETWORK",
      "severity": "error",
      "timestamp": 1738406400000,
      "component": "TaskList",
      "recoverable": true
    }
  ],
  "statistics": {
    "total": 42,
    "byType": {
      "NETWORK": 42,
      "COMPONENT": 0,
      ...
    }
  }
}
```

**Use Cases:**
- Share with support team
- Analyze error patterns
- Generate reports
- Archive historical data

### CSV Export

```csv
Timestamp,Code,Message,Type,Severity,Component,Function,Recoverable
2026-02-01T12:00:00Z,ERR_NETWORK_1001,Request timeout,NETWORK,error,TaskList,loadTasks,Yes
2026-02-01T12:05:00Z,ERR_NETWORK_1002,Server error (500),NETWORK,error,APIClient,request,Yes
```

**Use Cases:**
- Import into spreadsheet for analysis
- Generate pivot tables
- Create custom charts
- Share with non-technical stakeholders

## Understanding Metrics

### Total Errors

**What:** Count of all errors matching current filters

**Interpretation:**
- 0 errors: System working normally
- 1-10 errors: Few isolated issues
- 10-100 errors: Moderate issues, investigate
- 100+ errors: Significant problems, urgent attention needed

**Actions:**
- High count: Check for patterns, identify root cause
- Increasing: Trend toward problem
- Stable: Issues being managed

### Recovery Rate

**What:** Percentage of errors that user can recover from

**Interpretation:**
- 90-100%: Good - Most errors are recoverable
- 70-90%: Acceptable - Need to improve error handling
- 50-70%: Poor - Many unrecoverable errors
- <50%: Critical - Design error handling strategy

**Formula:**
```
Recovery Rate = (Recoverable Errors / Total Errors) × 100%
```

**Actions:**
- Low rate: Add recovery options to more errors
- High rate: Users can self-recover from issues

### Average Recovery Time

**What:** Average time (ms) to recover from errors

**Interpretation:**
- <100ms: Excellent - Quick recovery
- 100-500ms: Good - Acceptable recovery time
- 500-2000ms: Fair - Notable delay
- >2000ms: Poor - Users wait too long

**Actions:**
- High time: Optimize recovery logic
- Low time: Users experience minimal disruption

### Trend (24h)

**What:** Error frequency trend over last 24 hours

**Symbols:**
- 📈 Increasing - Error count rising (negative)
- 📉 Decreasing - Error count falling (positive)
- ➡️ Stable - Error count steady

**Interpretation:**
- Increasing: Problem getting worse
- Decreasing: Issues resolving
- Stable: Issue plateau, requires intervention

**Actions:**
- Increasing: Immediate investigation needed
- Decreasing: Continue monitoring
- Stable: Still problematic, address root cause

## Reading Charts

### Severity Distribution

Shows proportion of errors by severity level.

**Example:**
```
Critical: 30%  🔴
Error:    40%  🟠
Warning:  20%  🟡
Info:     10%  🔵
```

**Interpretation:**
- High critical %: Urgent issues
- High error %: Significant problems
- High warning %: Degraded but working
- High info %: Informational, low impact

**Actions:**
- >30% critical: Address immediately
- >50% error: High priority fixes needed
- >70% warning: Improve stability

### Top 5 Errors

Most frequently occurring error codes.

**Example:**
```
1. ERR_NETWORK_1001  45 occurrences
2. ERR_NETWORK_1002  32 occurrences
3. ERR_VALIDATION_3000  18 occurrences
4. ERR_COMPONENT_2000  12 occurrences
5. ERR_STATE_4000  8 occurrences
```

**Interpretation:**
- Top error is responsibility
- High frequency = significant impact

**Actions:**
- Investigate root cause of top errors
- Improve error recovery for frequent errors
- Optimize or fix underlying issues

### Hourly Trend Chart

Stacked bar chart showing error count by hour.

**What It Shows:**
- Each bar = 1 hour
- Bar segments = severity levels (red, orange, yellow, blue)
- Height = total error count in that hour

**Interpretation:**
- Spikes at certain hours: Time-correlated issues
- Consistent baseline: Ongoing problem
- Trending up: Situation worsening
- Trending down: Issues resolving

**Examples:**
- Spike at 2pm: Scheduled task causing errors
- Morning spikes: Peak usage time issues
- Evening decline: Fewer users, fewer errors

## Creating Custom Reports

### Error Pattern Analysis

```typescript
// Find errors from specific component
filters.component = 'TaskExecutionDialog'

// Find errors in time window
filters.dateRange = [new Date('2026-02-01'), new Date('2026-02-02')]

// Export for analysis
handleExportJSON()
```

### Error Comparison

1. Export JSON
2. Open in text editor or JSON viewer
3. Compare statistics:
   - Same error code across time periods?
   - Severity changes?
   - Recovery rate improving?

### Trend Analysis

```typescript
// Check 24-hour trend
// Look for patterns:
// - Time-of-day patterns?
// - Correlation with deployments?
// - Correlation with traffic?
```

## Best Practices

### Daily Monitoring

- Check dashboard first thing in morning
- Note error count trend
- Investigate any spikes
- Review top errors

### Weekly Analysis

- Export week's errors
- Analyze error patterns
- Review recovery rates
- Plan fixes for top errors

### Monthly Review

- Compare month-over-month metrics
- Identify trends
- Celebrate improvements
- Set goals for next month

### Issue Triage

When investigating high error count:

1. **Identify:** Top 5 errors to address
2. **Classify:** By component/type
3. **Prioritize:** By frequency and impact
4. **Assign:** To team members
5. **Track:** Resolution progress

## Troubleshooting Dashboard

### No Errors Shown

**Possible Causes:**
- No errors occurred (good!)
- Filters too restrictive
- Errors cleared manually

**Solution:**
- Reset filters
- Check date range
- Verify error logging enabled

### Dashboard Loading Slowly

**Possible Causes:**
- Too many errors in memory
- Browser performance issue
- Large export operation

**Solution:**
- Clear old errors
- Use restrictive date filter
- Restart browser
- Check available memory

### Export File Too Large

**Possible Causes:**
- Too many errors selected
- Date range too wide

**Solution:**
- Use narrower date range
- Filter by error type
- Export in multiple batches

### Missing Error Details

**Possible Causes:**
- Error context not captured
- Stack trace truncated
- Application state too large

**Solution:**
- Check error logging configuration
- Use manual retry with dev tools open
- Review code for sufficient context

## Performance Optimization

### For Large Error Volumes

**Dashboard Settings:**
- View only recent 24 hours
- Filter by error type
- Limit to specific components

**Export Strategy:**
- Export weekly instead of monthly
- Use CSV for large volumes
- Archive old exports

### For Better Performance

```typescript
// Limit error history in memory
const HISTORY_LIMIT = 50

// Batch export operations
const BATCH_SIZE = 100

// Pagination for large lists
const ITEMS_PER_PAGE = 20
```

## Integration with Support

### Creating Support Tickets

When exporting for support:

1. Export relevant errors as JSON
2. Include dashboard screenshot
3. Describe steps to reproduce
4. Attach exported file
5. Note error frequency and impact

### Sample Support Message

```
Subject: Intermittent timeout errors in Task Execution

Summary:
- Error Code: ERR_NETWORK_1001
- Frequency: 15 errors in last 24 hours
- Component: TaskExecutor
- Impact: Users cannot run tasks, affects 30% of operations
- Trend: Increasing

Attached: error-export-2026-02-01.json

Steps to reproduce:
1. Create new task
2. Execute task
3. Wait for API response
4. See timeout error
```

## Configuration

### Error Dashboard Settings

```typescript
// src/config/error-dashboard.ts
export const ERROR_DASHBOARD_CONFIG = {
  // History limit
  maxHistoryItems: 20,

  // Export limits
  maxExportSize: 50000,

  // Auto-refresh
  refreshInterval: 5000, // ms

  // Chart settings
  hourlyTrendPoints: 24, // 24-hour view
  topErrorsCount: 5,

  // Storage limits
  maxMemoryErrors: 50,
  maxStorageErrors: 500,
}
```
