# Alert System 설계

## Overview

Alert System은 외부 서비스(GitHub, Vercel, Sentry, Supabase)의 웹훅을 통합 수신하고, AI Agent가 자동 분석 및 해결을 시도하는 시스템입니다.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Zyflow Server                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Webhook Gateway                        │   │
│  │  /api/alerts/webhooks/github                              │   │
│  │  /api/alerts/webhooks/vercel                              │   │
│  │  /api/alerts/webhooks/sentry                              │   │
│  │  /api/alerts/webhooks/supabase                            │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Alert Processor                         │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐    │   │
│  │  │   Parser   │ │  Analyzer  │ │  Risk Assessor     │    │   │
│  │  │            │→│ (AI Agent) │→│                    │    │   │
│  │  └────────────┘ └────────────┘ └────────────────────┘    │   │
│  │                                        │                  │   │
│  │                         ┌──────────────┼───────────┐      │   │
│  │                         ▼              ▼           ▼      │   │
│  │                  ┌──────────┐  ┌──────────┐ ┌──────────┐ │   │
│  │                  │ Auto-Fix │  │  Slack   │ │WebSocket │ │   │
│  │                  │ Executor │  │ Notifier │ │Broadcast │ │   │
│  │                  └──────────┘  └──────────┘ └──────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      SQLite DB                            │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌────────────────────┐    │   │
│  │  │  alerts  │ │activity_logs │ │   webhook_configs  │    │   │
│  │  └──────────┘ └──────────────┘ └────────────────────┘    │   │
│  │  ┌─────────────────────────┐                              │   │
│  │  │   notification_config   │                              │   │
│  │  └─────────────────────────┘                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Webhook 수신
   External Service → Webhook Gateway → Parser

2. Alert 생성 & 분석
   Parser → DB Insert → Background Process → Agent Analyzer

3. 위험도 평가 & 자동 수정
   Analyzer → Risk Assessor → Auto-Fix Executor (조건부)

4. 알림 발송
   Auto-Fix → Slack Notifier (조건부)
           → WebSocket Broadcast (항상)
```

## Database Schema

### alerts 테이블

```sql
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,           -- 'github' | 'vercel' | 'sentry' | 'supabase'
  type TEXT NOT NULL,             -- 'workflow.failure' | 'deployment.error' 등
  severity TEXT NOT NULL,         -- 'critical' | 'warning' | 'info'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'resolved' | 'ignored'

  title TEXT NOT NULL,
  summary TEXT,
  external_url TEXT,

  payload TEXT NOT NULL,          -- JSON: 원본 웹훅 데이터
  metadata TEXT,                  -- JSON: { repo, branch, commit, environment }
  analysis TEXT,                  -- JSON: AlertAnalysis
  resolution TEXT,                -- JSON: { type, action, details, prUrl }

  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  resolved_at INTEGER,
  expires_at INTEGER NOT NULL     -- created_at + 90일
);
```

### activity_logs 테이블

```sql
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  alert_id TEXT,
  actor TEXT NOT NULL,            -- 'system' | 'agent' | 'user'
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,                  -- JSON
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);
```

### webhook_configs 테이블

```sql
CREATE TABLE webhook_configs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  secret TEXT,                    -- 암호화 저장
  enabled INTEGER NOT NULL DEFAULT 1,
  rules TEXT,                     -- JSON
  project_ids TEXT,               -- JSON array
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
```

### notification_config 테이블

```sql
CREATE TABLE notification_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  slack_webhook_url TEXT,         -- 암호화 저장
  slack_channel TEXT,
  slack_enabled INTEGER NOT NULL DEFAULT 0,
  rule_on_critical INTEGER NOT NULL DEFAULT 1,
  rule_on_autofix INTEGER NOT NULL DEFAULT 1,
  rule_on_all INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
```

## Agent Analysis

### 분석 프로세스

```typescript
function analyzeAlert(alert: Alert): AlertAnalysis {
  // 1. 소스별 패턴 매칭
  const patterns = getPatterns(alert.source)

  // 2. payload에서 에러 정보 추출
  const errorInfo = extractErrorInfo(alert.payload, alert.source)

  // 3. Root cause 추정
  const rootCause = determineRootCause(errorInfo, patterns)

  // 4. 자동 수정 가능 여부 판단
  const autoFixable = checkAutoFixable(rootCause, patterns)

  // 5. 신뢰도 계산
  const confidence = calculateConfidence(rootCause, patterns)

  return {
    alertId: alert.id,
    rootCause,
    suggestedFix,
    autoFixable,
    autoFixAction,
    confidence,
    analyzedAt: new Date().toISOString()
  }
}
```

### 소스별 패턴

| Source | 패턴 | Auto-fix Action |
|--------|------|-----------------|
| GitHub | Build failed | retry_workflow |
| GitHub | Test failed | retry_workflow |
| GitHub | Type error | lint_fix |
| Vercel | Deployment error | redeploy |
| Vercel | Build failed | - (수동 검토) |
| Sentry | Fatal error | - (수동 검토) |
| Sentry | Error | - (분석 제공) |
| Supabase | Database error | - (수동 검토) |

## Risk Assessment

### 평가 기준

```typescript
function assessRisk(alert: Alert, analysis: AlertAnalysis): RiskAssessment {
  let level: 'low' | 'medium' | 'high' = 'medium'

  // High Risk 조건
  if (alert.severity === 'critical') level = 'high'
  if (metadata.environment === 'production') level = 'high'
  if (analysis.confidence < 0.5) level = 'high'

  // Low Risk 조건
  if (alert.severity === 'info') level = 'low'
  if (analysis.confidence >= 0.8 && lintPatterns.test(analysis.suggestedFix)) level = 'low'

  // 권장 조치 결정
  const recommendation = getRecommendation(level, analysis.autoFixable)

  return { level, recommendation, shouldAutoFix }
}
```

### 권장 조치 매트릭스

| 위험도 | autoFixable | 권장 조치 |
|--------|-------------|-----------|
| low | true | auto_approve |
| low | false | pr_with_review |
| medium | true | pr_with_review |
| medium | false | pr_with_required_review |
| high | * | manual_review |

## WebSocket Integration

### 함수 주입 패턴

```typescript
// server/routes/alerts.ts
let broadcastAlert: ((data: unknown) => void) | null = null

export function setBroadcastAlert(fn: (data: unknown) => void): void {
  broadcastAlert = fn
}

// server/app.ts
import { setBroadcastAlert } from './routes/alerts.js'

setBroadcastAlert((data) => {
  emit('alert', data)  // WebSocket broadcast
})
```

### 이벤트 타입

```typescript
// alert.created
{ type: 'alert.created', alert: Alert }

// alert.processed
{ type: 'alert.processed', alert: Alert, result: ProcessingResult }
```

## UI Components

### Component Tree

```
AlertCenter
├── Header (title, stats, filters, settings button)
├── AlertList
│   └── AlertItem (반복)
├── AlertDetail (선택 시)
│   ├── Header (제목, 뒤로가기)
│   ├── BasicInfo (severity, status, source)
│   ├── Metadata (repo, branch, commit)
│   ├── Analysis (rootCause, suggestedFix, confidence)
│   ├── Resolution (해결 정보)
│   ├── ActivityTimeline
│   └── Actions (Analyze, Process, Ignore, Resolve)
└── AlertSettings (설정 모드)
    ├── WebhookSettings
    └── NotificationSettings
```

### Hooks

```typescript
// 데이터 조회
useAlerts(filter?)       // Alert 목록
useAlert(alertId)        // Alert 상세
useAlertStats()          // 통계
useActivityLogs(filter?) // Activity 로그
useWebhookConfigs()      // Webhook 설정
useNotificationConfig()  // 알림 설정

// 뮤테이션
useUpdateAlertStatus()   // 상태 변경
useIgnoreAlert()         // Alert 무시
useAnalyzeAlert()        // 분석 트리거
useProcessAlert()        // 전체 처리 트리거
useCreateWebhookConfig() // Webhook 생성
useUpdateWebhookConfig() // Webhook 수정
useDeleteWebhookConfig() // Webhook 삭제
useUpdateNotificationConfig() // 알림 설정 수정
useTestSlackNotification()    // Slack 테스트
```

## Security Considerations

1. **Webhook Secret 검증**: HMAC-SHA256 서명 검증 (GitHub, Vercel)
2. **Secret 저장**: AES-256 암호화 후 DB 저장
3. **Rate Limiting**: 소스당 100 req/min
4. **Payload 크기**: 최대 1MB

## Performance Considerations

1. **백그라운드 처리**: Webhook 응답 후 비동기 분석
2. **인덱스**: status, source, severity, created_at에 인덱스
3. **만료 정리**: 90일 이상 된 Alert 자동 삭제
4. **캐싱**: React Query로 클라이언트 캐싱
