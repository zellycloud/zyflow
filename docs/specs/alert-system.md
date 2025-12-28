# Zyflow Alert System - Open Specification

> Version: 1.0.0
> Status: Draft
> Created: 2024-12-28

## Overview

개발자의 다중 서비스 알림(GitHub Actions, Vercel, Supabase, Sentry 등)을 통합 수집하고, AI Agent가 자동 분석 및 해결을 시도하며, 처리 과정을 모니터링할 수 있는 시스템.

---

## Goals

| Goal | Description |
|------|-------------|
| **G1** | 이메일 알림 의존도 제거 |
| **G2** | 단일 인터페이스에서 모든 알림 확인 |
| **G3** | Agent 기반 자동 분류 및 해결 |
| **G4** | 처리 과정 투명성 확보 |
| **G5** | 외부 서비스 로그와 연결 (복제 X) |

---

## Design Decisions

| 항목 | 결정 | 이유 |
|------|------|------|
| 알림 보관 기간 | **90일** | Slack 무료 플랜과 동일, 충분한 히스토리 |
| Agent 분석 범위 | **모든 케이스** | 학습 데이터 축적, 점진적 개선 |
| Auto-fix PR | **리뷰 대기** | 안전성 우선, 사용자 확인 필요 |
| Multi-repo | **지원** | 프로젝트별 그룹핑 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        External Services                      │
├──────────────────────────────────────────────────────────────┤
│  GitHub Actions  │  Vercel  │  Supabase  │  Sentry  │  ...  │
└────────┬─────────┴────┬─────┴─────┬──────┴────┬─────┴───────┘
         │              │           │           │
         ▼              ▼           ▼           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Webhook Gateway                            │
│                   /api/webhooks/:source                       │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Alert Processor                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Parser    │→ │  Classifier │→ │  Action Dispatcher  │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└────────────────────────────┬─────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │  Storage  │  │   Agent   │  │  Notifier │
       │ (SQLite)  │  │  Handler  │  │  (Slack)  │
       └───────────┘  └───────────┘  └───────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │  Auto-Fixer   │
                    │  (PR/Retry/   │
                    │   Rollback)   │
                    └───────────────┘
```

---

## Data Models

### Alert

```typescript
interface Alert {
  id: string;                    // uuid
  source: AlertSource;           // 'github' | 'vercel' | 'sentry' | 'supabase'
  type: string;                  // 'build.failed' | 'deploy.error' | 'error.new'
  severity: Severity;            // 'critical' | 'warning' | 'info'
  status: AlertStatus;           // 'pending' | 'processing' | 'resolved' | 'ignored'

  title: string;                 // 요약 제목
  summary?: string;              // Agent 분석 요약
  externalUrl?: string;          // 원본 서비스 링크

  payload: Record<string, any>;  // 원본 webhook 데이터
  metadata: {
    repo?: string;
    branch?: string;
    commit?: string;
    environment?: string;
    projectId?: string;          // Zyflow 프로젝트 연결
  };

  analysis?: AlertAnalysis;      // Agent 분석 결과

  resolution?: {
    type: 'auto' | 'manual';
    action: string;              // 'pr_created' | 'retried' | 'rolled_back' | 'ignored'
    details?: string;
    prUrl?: string;
  };

  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  expiresAt: string;             // createdAt + 90일
}

type AlertSource = 'github' | 'vercel' | 'sentry' | 'supabase' | 'custom';
type Severity = 'critical' | 'warning' | 'info';
type AlertStatus = 'pending' | 'processing' | 'resolved' | 'ignored';
```

### Alert Analysis

```typescript
interface AlertAnalysis {
  alertId: string;

  // 분석 결과
  rootCause?: string;            // 추정 원인
  relatedFiles?: string[];       // 관련 파일
  suggestedFix?: string;         // 제안 수정

  // 자동 수정 가능 여부
  autoFixable: boolean;
  autoFixAction?: 'retry' | 'rollback' | 'patch';
  confidence: number;            // 0-1

  // 참고 정보
  similarAlerts?: string[];      // 유사한 과거 alert IDs
  documentation?: string;        // 관련 문서 링크

  analyzedAt: string;
}
```

### Activity Log

```typescript
interface ActivityLog {
  id: string;
  alertId?: string;              // 연관 alert (optional)

  actor: 'system' | 'agent' | 'user';
  action: string;                // 'webhook.received' | 'analysis.started' | 'pr.created'
  description: string;

  metadata?: Record<string, any>;

  createdAt: string;
}
```

### Webhook Config

```typescript
interface WebhookConfig {
  id: string;
  source: AlertSource;
  name: string;                  // 사용자 지정 이름

  endpoint: string;              // 생성된 webhook URL
  secret?: string;               // webhook 검증용 (암호화 저장)
  enabled: boolean;

  rules: {
    include?: string[];          // 포함할 이벤트 타입
    exclude?: string[];          // 제외할 이벤트 타입
    severityMap?: Record<string, Severity>;
  };

  // 연결된 프로젝트들
  projectIds?: string[];

  createdAt: string;
  updatedAt: string;
}
```

### Notification Config

```typescript
interface NotificationConfig {
  id: string;

  // Slack 설정
  slack?: {
    webhookUrl: string;          // 암호화 저장
    channel?: string;
    enabled: boolean;
  };

  // 알림 규칙
  rules: {
    onCritical: boolean;         // critical 알림 시
    onAutoFix: boolean;          // 자동 수정 완료 시
    onAll: boolean;              // 모든 알림
  };

  createdAt: string;
  updatedAt: string;
}
```

---

## Database Schema (SQLite)

```sql
-- Alerts 테이블
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'ignored')),

  title TEXT NOT NULL,
  summary TEXT,
  external_url TEXT,

  payload TEXT NOT NULL,         -- JSON
  metadata TEXT,                 -- JSON
  analysis TEXT,                 -- JSON
  resolution TEXT,               -- JSON

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  expires_at TEXT NOT NULL       -- created_at + 90 days
);

CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_source ON alerts(source);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);
CREATE INDEX idx_alerts_expires_at ON alerts(expires_at);

-- Activity Logs 테이블
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  alert_id TEXT,

  actor TEXT NOT NULL CHECK (actor IN ('system', 'agent', 'user')),
  action TEXT NOT NULL,
  description TEXT NOT NULL,

  metadata TEXT,                 -- JSON

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

CREATE INDEX idx_activity_logs_alert_id ON activity_logs(alert_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- Webhook Configs 테이블
CREATE TABLE webhook_configs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  name TEXT NOT NULL,

  endpoint TEXT NOT NULL,
  secret TEXT,                   -- 암호화됨
  enabled INTEGER NOT NULL DEFAULT 1,

  rules TEXT,                    -- JSON
  project_ids TEXT,              -- JSON array

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notification Config 테이블 (싱글톤)
CREATE TABLE notification_config (
  id TEXT PRIMARY KEY DEFAULT 'default',

  slack_webhook_url TEXT,        -- 암호화됨
  slack_channel TEXT,
  slack_enabled INTEGER NOT NULL DEFAULT 0,

  rule_on_critical INTEGER NOT NULL DEFAULT 1,
  rule_on_autofix INTEGER NOT NULL DEFAULT 1,
  rule_on_all INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 만료된 알림 자동 삭제 (앱에서 주기적으로 실행)
-- DELETE FROM alerts WHERE expires_at < datetime('now');
```

---

## API Endpoints

### Webhooks (External → Zyflow)

```
POST /api/webhooks/github
POST /api/webhooks/vercel
POST /api/webhooks/sentry
POST /api/webhooks/supabase
POST /api/webhooks/custom/:configId
```

**Response:**
```json
{
  "success": true,
  "alertId": "uuid"
}
```

### Alerts

```
GET    /api/alerts
  Query: source, severity, status, limit, offset, projectId

GET    /api/alerts/:id

PATCH  /api/alerts/:id
  Body: { status: 'resolved' | 'ignored' }

POST   /api/alerts/:id/retry
  Response: { success: true, workflowRunUrl: "..." }

POST   /api/alerts/:id/analyze
  Response: { success: true, analysis: AlertAnalysis }

GET    /api/alerts/stats
  Response: { total, bySeverity, bySource, byStatus }
```

### Activity Logs

```
GET    /api/activities
  Query: alertId, actor, limit, offset
```

### Webhook Configs

```
GET    /api/webhook-configs

POST   /api/webhook-configs
  Body: { source, name, rules?, projectIds? }
  Response: { id, endpoint, secret }

PATCH  /api/webhook-configs/:id
  Body: { name?, enabled?, rules?, projectIds? }

DELETE /api/webhook-configs/:id

POST   /api/webhook-configs/:id/regenerate-secret
  Response: { secret }
```

### Notification Config

```
GET    /api/notification-config

PATCH  /api/notification-config
  Body: { slack?, rules? }

POST   /api/notification-config/test
  Response: { success: true }
```

---

## Webhook Parsers

### GitHub Actions

```typescript
interface GitHubWorkflowPayload {
  action: 'completed' | 'requested' | 'in_progress';
  workflow_run: {
    id: number;
    name: string;
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
    html_url: string;
    head_branch: string;
    head_sha: string;
  };
  repository: {
    full_name: string;
  };
}

function parseGitHubWebhook(payload: GitHubWorkflowPayload): Partial<Alert> {
  const isFailure = payload.workflow_run.conclusion === 'failure';

  return {
    source: 'github',
    type: `workflow.${payload.workflow_run.conclusion || payload.action}`,
    severity: isFailure ? 'critical' : 'info',
    title: `${payload.workflow_run.name} - ${payload.workflow_run.conclusion || payload.action}`,
    externalUrl: payload.workflow_run.html_url,
    metadata: {
      repo: payload.repository.full_name,
      branch: payload.workflow_run.head_branch,
      commit: payload.workflow_run.head_sha,
    },
    payload,
  };
}
```

### Vercel

```typescript
interface VercelDeploymentPayload {
  type: 'deployment.created' | 'deployment.error' | 'deployment.succeeded' | 'deployment.canceled';
  deployment: {
    id: string;
    name: string;
    url: string;
    inspectorUrl: string;
    target: 'production' | 'preview';
    meta?: {
      githubRepo?: string;
      githubBranch?: string;
      githubCommitSha?: string;
    };
  };
}

function parseVercelWebhook(payload: VercelDeploymentPayload): Partial<Alert> {
  const isError = payload.type === 'deployment.error';

  return {
    source: 'vercel',
    type: payload.type,
    severity: isError ? 'critical' : 'info',
    title: `Deploy ${payload.deployment.name} - ${payload.type.replace('deployment.', '')}`,
    externalUrl: payload.deployment.inspectorUrl,
    metadata: {
      repo: payload.deployment.meta?.githubRepo,
      branch: payload.deployment.meta?.githubBranch,
      commit: payload.deployment.meta?.githubCommitSha,
      environment: payload.deployment.target,
    },
    payload,
  };
}
```

### Sentry

```typescript
interface SentryIssuePayload {
  action: 'created' | 'resolved' | 'assigned' | 'ignored';
  data: {
    issue: {
      id: string;
      title: string;
      culprit: string;
      level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
      permalink: string;
      project: {
        slug: string;
        name: string;
      };
    };
  };
}

function parseSentryWebhook(payload: SentryIssuePayload): Partial<Alert> {
  const severityMap: Record<string, Severity> = {
    fatal: 'critical',
    error: 'warning',
    warning: 'info',
    info: 'info',
    debug: 'info',
  };

  return {
    source: 'sentry',
    type: `issue.${payload.action}`,
    severity: severityMap[payload.data.issue.level] || 'info',
    title: payload.data.issue.title,
    externalUrl: payload.data.issue.permalink,
    metadata: {
      environment: payload.data.issue.project.slug,
    },
    payload,
  };
}
```

### Supabase

```typescript
interface SupabaseWebhookPayload {
  type: string;                  // 'db.error' | 'auth.user.created' | etc
  project_id: string;
  timestamp: string;
  message?: string;
  details?: Record<string, any>;
}

function parseSupabaseWebhook(payload: SupabaseWebhookPayload): Partial<Alert> {
  const isError = payload.type.includes('error') || payload.type.includes('failed');

  return {
    source: 'supabase',
    type: payload.type,
    severity: isError ? 'warning' : 'info',
    title: payload.message || payload.type,
    metadata: {
      environment: payload.project_id,
    },
    payload,
  };
}
```

---

## Agent Integration

### Analysis Prompt Template

```markdown
Analyze this alert and provide structured findings:

**Alert:**
- Source: {{source}}
- Type: {{type}}
- Title: {{title}}

**Payload:**
{{payload}}

**Repository Context (if available):**
{{repoContext}}

**Instructions:**
1. Identify the root cause
2. List related files if applicable
3. Suggest a fix
4. Determine if auto-fixable (retry, rollback, or code patch)
5. Rate your confidence (0-1)

**Output Format (JSON):**
{
  "rootCause": "...",
  "relatedFiles": ["..."],
  "suggestedFix": "...",
  "autoFixable": true/false,
  "autoFixAction": "retry" | "rollback" | "patch" | null,
  "confidence": 0.0-1.0,
  "documentation": "..." // optional
}
```

### Risk Assessment

자동 수정 전 위험도를 평가하여 승인 방식을 결정한다.

```typescript
interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  autoApprove: boolean;
  requiresReview: boolean;
  reason: string;
}
```

| 위험도 | 예시 | 자동 승인 | PR 필요 |
|--------|------|----------|---------|
| **Low** | 재시도, 캐시 클리어, 린트/포맷 수정, unused import 제거 | ✅ 바로 실행 | ❌ |
| **Medium** | 타입 에러 수정, optional chaining 추가, 의존성 업데이트 | ❌ | ✅ 리뷰 대기 |
| **High** | 로직 변경, DB 스키마, 보안 관련, 인증 코드 | ❌ | ✅ 리뷰 필수 + 라벨 |

#### Low Risk (자동 승인) 조건

Actions:
- `retry` - 워크플로우 재실행
- `cache_clear` - 캐시 정리
- `rerun_tests` - 테스트 재실행

Patterns (suggestedFix 매칭):
- 린트/포맷팅 수정
- import 순서 정리
- trailing space/comma 정리
- unused import/variable 제거

#### High Risk (리뷰 필수) 조건

Patterns:
- security, auth, password, secret, token
- database, schema, migration
- delete, remove, drop
- payment, billing, credit

Files:
- `.env*`
- `config/(prod|production)/*`
- `**/migration/**`
- `schema.(ts|sql)`

#### Risk Assessment 로직

```typescript
function assessRisk(analysis: AlertAnalysis): RiskAssessment {
  const { autoFixAction, relatedFiles, suggestedFix } = analysis;

  // Low Risk Actions - 자동 승인
  const lowRiskActions = ['retry', 'cache_clear', 'rerun_tests'];

  const lowRiskPatterns = [
    /lint\s*(fix|error)/i,
    /format(ting)?/i,
    /import\s*order/i,
    /trailing\s*(space|comma)/i,
    /unused\s*(import|variable)/i,
  ];

  // High Risk - 리뷰 필수
  const highRiskPatterns = [
    /security/i,
    /auth(entication)?/i,
    /password|secret|token/i,
    /database|schema|migration/i,
    /delete|remove|drop/i,
    /payment|billing|credit/i,
  ];

  const highRiskFiles = [
    /\.env/,
    /config\/(prod|production)/,
    /migration/,
    /schema\.(ts|sql)/,
  ];

  // 판정
  if (lowRiskActions.includes(autoFixAction)) {
    return {
      level: 'low',
      autoApprove: true,
      requiresReview: false,
      reason: `Safe action: ${autoFixAction}`,
    };
  }

  if (lowRiskPatterns.some(p => p.test(suggestedFix || ''))) {
    return {
      level: 'low',
      autoApprove: true,
      requiresReview: false,
      reason: 'Code style fix only',
    };
  }

  if (highRiskPatterns.some(p => p.test(suggestedFix || '')) ||
      relatedFiles?.some(f => highRiskFiles.some(p => p.test(f)))) {
    return {
      level: 'high',
      autoApprove: false,
      requiresReview: true,
      reason: 'Sensitive code or files affected',
    };
  }

  return {
    level: 'medium',
    autoApprove: false,
    requiresReview: true,
    reason: 'Code logic change',
  };
}
```

### Auto-Fix Actions

| Action | Trigger Condition | Risk Level | Implementation |
|--------|------------------|------------|----------------|
| **retry** | `autoFixAction === 'retry'` | Low | GitHub API: 워크플로우 재실행, 바로 실행 |
| **rollback** | `autoFixAction === 'rollback'` + `confidence >= 0.8` | Medium | Vercel API: 이전 배포 복원, 리뷰 대기 |
| **patch (low)** | `autoFixAction === 'patch'` + `riskLevel === 'low'` | Low | Git: 바로 커밋 & 푸시, Slack 알림 |
| **patch (medium/high)** | `autoFixAction === 'patch'` + `riskLevel !== 'low'` | Medium/High | Git: PR 생성, 리뷰 대기 |
| **escalate** | 나머지 모든 케이스 | - | Slack 알림 + 상세 분석 결과 첨부 |

### Auto-Fix Flow

```
Alert 수신
    ↓
Agent 분석 (confidence, autoFixAction)
    ↓
Risk Assessment
    ↓
┌─────────────────────────────────────────────┐
│                                             │
▼                    ▼                    ▼
[Low Risk]       [Medium Risk]       [High Risk]
    │                 │                   │
    ▼                 ▼                   ▼
바로 실행          PR 생성             PR 생성
(retry/patch)     리뷰 대기         + 🔴 라벨 추가
    │                 │                   │
    ▼                 │                   │
Slack 알림           └─────────┬─────────┘
"✅ 자동 해결"                 ▼
                         Slack 알림
                     "👀 리뷰 필요: [PR링크]"
```

---

## Slack Notification Format

### Critical Alert

```
🔴 *Critical Alert*

*Build Failed* - GitHub Actions
Repository: `zyflow/main`
Branch: `feature/new-ui`

> TypeScript compilation error in AlertList.tsx

[View on GitHub](url) | [View in Zyflow](url)
```

### Auto-Fix Completed

```
🟢 *Auto-Fixed*

*Type Error* resolved via PR

Repository: `zyflow/main`
Action: Created fix PR #143

[Review PR](url) | [View Details](url)
```

---

## UI Components

### AlertCenter (Sidebar)

위치: 사이드바 메뉴 아이템으로 추가

```
src/components/alerts/
├── AlertCenter.tsx           # 메인 컨테이너
├── AlertList.tsx             # 알림 목록
├── AlertItem.tsx             # 개별 알림 카드
├── AlertDetail.tsx           # 상세 뷰
├── AlertTimeline.tsx         # Activity 타임라인
├── AlertFilters.tsx          # 필터 UI
├── AlertStats.tsx            # 통계 요약
├── AlertSettings.tsx         # 설정 패널
└── hooks/
    ├── useAlerts.ts          # 알림 데이터 훅
    ├── useAlertActions.ts    # 액션 훅 (retry, ignore 등)
    └── useWebhookConfigs.ts  # Webhook 설정 훅
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] DB 스키마 마이그레이션
- [ ] Webhook 엔드포인트 구현 (`/api/webhooks/*`)
- [ ] GitHub, Vercel 파서 구현
- [ ] Alert CRUD API
- [ ] 기본 AlertList UI
- [ ] 사이드바에 Alerts 메뉴 추가

### Phase 2: Core Features (Week 2)

- [ ] Sentry, Supabase 파서 추가
- [ ] AlertDetail 뷰
- [ ] ActivityTimeline 컴포넌트
- [ ] Webhook 설정 UI
- [ ] 만료 알림 자동 삭제 (90일)

### Phase 3: Notifications (Week 3)

- [ ] Slack 알림 연동
- [ ] Notification 설정 UI
- [ ] 알림 테스트 기능
- [ ] 필터 및 검색 기능

### Phase 4: Agent Integration (Week 4)

- [ ] Alert 분석 Agent 프롬프트
- [ ] 분석 결과 저장 및 표시
- [ ] 유사 Alert 매칭 로직
- [ ] Auto-fix: retry 구현

### Phase 5: Advanced Auto-Fix (Week 5)

- [ ] Auto-fix: rollback 구현
- [ ] Auto-fix: PR 생성 (리뷰 대기)
- [ ] 통계 대시보드
- [ ] 성능 최적화

---

## Security

| 항목 | 구현 |
|------|------|
| Webhook 검증 | HMAC-SHA256 signature 검증 (GitHub, Vercel) |
| Secret 저장 | AES-256 암호화 후 DB 저장 |
| Rate Limiting | 소스당 100 req/min |
| Payload 크기 | 최대 1MB |
| HTTPS Only | Webhook endpoint는 HTTPS만 허용 |

---

## Metrics & Monitoring

추적할 메트릭:

- `alerts.received` - 수신된 알림 수 (by source)
- `alerts.resolved` - 해결된 알림 수 (by resolution type)
- `alerts.auto_fixed` - 자동 해결된 알림 수
- `agent.analysis_time` - Agent 분석 소요 시간
- `webhook.latency` - Webhook 처리 지연

---

## Future Considerations

- [ ] 이메일 알림 옵션 추가
- [ ] 모바일 푸시 알림
- [ ] Alert 패턴 학습 및 예측
- [ ] 팀 협업 기능 (할당, 코멘트)
- [ ] 커스텀 webhook 파서 UI
- [ ] Grafana/Datadog 연동

---

## Appendix: External Service Webhook Setup

### GitHub Actions

1. Repository → Settings → Webhooks → Add webhook
2. Payload URL: `https://your-domain/api/webhooks/github`
3. Content type: `application/json`
4. Secret: Zyflow에서 생성된 secret
5. Events: "Workflow runs" 선택

### Vercel

1. Project → Settings → Webhooks → Add
2. URL: `https://your-domain/api/webhooks/vercel`
3. Events: `deployment.created`, `deployment.error`, `deployment.succeeded`

### Sentry

1. Settings → Integrations → Webhooks
2. Callback URL: `https://your-domain/api/webhooks/sentry`
3. 또는 Slack 연동 후 Zyflow로 전달

### Supabase

1. Project → Database → Webhooks (Database Webhooks 기능)
2. 또는 Edge Functions로 커스텀 알림 구현
