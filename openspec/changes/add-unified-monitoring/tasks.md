# add-unified-monitoring Tasks

## Phase 1: Alert System Completion ✅

### Group 1-1: Webhook Infrastructure

- [x] task-1-1-1: Webhook receiver endpoints
  - Created `server/routes/webhooks.ts`
  - POST /api/alerts/webhooks/github (GitHub Actions)
  - POST /api/alerts/webhooks/vercel (Vercel deployments)
  - POST /api/alerts/webhooks/sentry (Sentry issues)
  - POST /api/alerts/webhooks/supabase (Supabase alerts)
  - POST /api/alerts/webhooks/custom/:configId (Custom webhooks)
  - Source-specific payload parsers

- [x] task-1-1-2: Webhook signature verification
  - Created `server/utils/webhook-verify.ts`
  - GitHub: HMAC-SHA256 with X-Hub-Signature-256
  - Vercel: HMAC-SHA1 with x-vercel-signature
  - Sentry: HMAC-SHA256 with Sentry-Hook-Signature
  - Supabase: Custom HMAC-SHA256 verification
  - Timing-safe comparison

- [x] task-1-1-3: Secret encryption utility
  - Created `server/utils/crypto.ts`
  - AES-256-GCM encryption for webhook secrets
  - Secure key derivation (PBKDF2, 100k iterations)
  - encrypt/decrypt/safeDecrypt functions
  - maskValue/maskUrl for UI display
  - generateSecret/generateApiKey utilities

### Group 1-2: Configuration API

- [x] task-1-2-1: Webhook config CRUD endpoints
  - Extended `server/routes/alerts.ts`
  - GET /api/alerts/webhook-configs
  - POST /api/alerts/webhook-configs
  - PATCH /api/alerts/webhook-configs/:id
  - DELETE /api/alerts/webhook-configs/:id
  - POST /api/alerts/webhook-configs/:id/regenerate-secret

- [x] task-1-2-2: Notification config API endpoints
  - Extended `server/routes/alerts.ts`
  - GET /api/alerts/notification-config (nested format for frontend)
  - PATCH /api/alerts/notification-config
  - POST /api/alerts/notification-config/test

### Group 1-3: Slack Integration

- [x] task-1-3-1: Slack notification sender service
  - Created `server/services/slackNotifier.ts`
  - Block Kit message builder
  - Severity-based color coding (critical=red, warning=yellow, info=blue)
  - Project group routing (zellyy vs jayoo)
  - Rate limiting (1 msg/sec)
  - Error handling and test notification

- [x] task-1-3-2: Slack configuration UI update
  - UI already complete in `src/components/alerts/AlertSettings.tsx`
  - Webhook URL input with validation
  - Notification rules (onCritical, onAutofix, onAll)
  - Test notification button
  - Webhook endpoints management

---

## Phase 2: Docker Deployment ✅

### Group 2-1: Container Configuration

- [x] task-2-1-1: Multi-stage Dockerfile
  - Created `Dockerfile`
  - Build stage: node:20-alpine with native module support
  - Production stage: minimal runtime with non-root user (zyflow)
  - Health check: curl /api/health (30s interval)
  - Native modules: better-sqlite3, node-pty rebuild

- [x] task-2-1-2: Docker Compose configuration
  - Created `docker-compose.yml`
  - zyflow-server service on port 3100
  - Volume: zyflow-data:/app/data (SQLite persistence)
  - Environment variables from .env
  - Health check and restart policy (unless-stopped)
  - JSON logging with rotation (10m, 3 files)

- [x] task-2-1-3: Production environment template
  - Created `.env.production.template`
  - All required env vars documented
  - SECRET_KEY, SLACK_WEBHOOK_URL
  - Webhook secrets (GitHub, Vercel, Sentry, Supabase)
  - GEMINI_API_KEY for Phase 3

### Group 2-2: Path & Configuration

- [x] task-2-2-1: Database path configuration
  - Modified `server/tasks/db/client.ts`
  - DATA_DIR env var support for Docker
  - Fallback to ~/.zyflow/tasks.db for local dev

- [x] task-2-2-2: Config path configuration
  - Modified `server/config.ts`
  - DATA_DIR env var support (same as DB)
  - Consistent path: Docker=/app/data, Local=~/.zyflow

### Group 2-3: Deployment Infrastructure

- [x] task-2-3-1: Nginx reverse proxy configuration
  - Created `nginx/zyflow.conf`
  - HTTPS with TLS 1.2/1.3, HSTS
  - Rate limiting: API 30r/s, Webhooks 10r/s
  - WebSocket proxy (/ws) with 24h timeout
  - Static file caching (7 days)
  - Security headers (X-Frame-Options, CSP, etc.)

- [x] task-2-3-2: Deployment scripts
  - Created `scripts/deploy.sh`
  - Commands: setup, build, start, stop, restart
  - logs, status, backup, update
  - Auto SECRET_KEY generation
  - Database backup with 7-day retention
  - Docker Compose v1/v2 compatibility

---

## Phase 3: Auto-Fix Agent

### Group 3-1: Error Analysis

- [ ] task-3-1-1: Error parser and classifier
  - Create `server/agents/error-analyzer.ts`
  - Parse CI logs (build errors, test failures, lint errors)
  - Classify error types (syntax, type, logic, runtime)
  - Extract code locations (file, line, column)
  - Calculate confidence score

- [ ] task-3-1-2: Gemini API client
  - Create `server/ai/gemini-client.ts`
  - Direct API integration (@google/generative-ai)
  - Model: gemini-2.0-flash for analysis
  - Rate limiting (60 req/min)
  - Streaming response support
  - Error handling and retry

- [ ] task-3-1-3: Error analysis prompt templates
  - Create `server/agents/prompts/error-analysis.ts`
  - Build failure analysis prompt
  - Test failure analysis prompt
  - Type error analysis prompt
  - Runtime error analysis prompt
  - Structured output format (JSON)

### Group 3-2: Fix Generation

- [ ] task-3-2-1: Fix generation service
  - Create `server/agents/fix-generator.ts`
  - Code patch generation from analysis
  - Multi-file change support
  - Git diff format output
  - Rollback capability

- [ ] task-3-2-2: Fix validation pipeline
  - Create `server/agents/fix-validator.ts`
  - Syntax validation (parse check)
  - Type check (tsc --noEmit)
  - Lint check (eslint --fix-dry-run)
  - Test run (vitest --run affected)
  - Validation result aggregation

- [ ] task-3-2-3: Auto-merge policy implementation
  - Create `server/agents/merge-policy.ts`
  - CI status check (GitHub Actions)
  - Policy rules by error source
  - Supabase Security/Performance exception
  - Auto-merge trigger

### Group 3-3: PR Workflow

- [ ] task-3-3-1: Automatic PR workflow orchestration
  - Create `server/agents/pr-workflow.ts`
  - Branch creation (auto-fix/{alert-id})
  - Commit changes with message
  - PR creation with template
  - Label assignment ([auto-fix], [gemini])
  - CI status monitoring

- [ ] task-3-3-2: Error detection integration
  - Create `server/agents/error-detector.ts`
  - Wire webhook alerts to error analyzer
  - Trigger auto-fix on new alerts
  - Update alert status on completion

### Group 3-4: Integration

- [ ] task-3-4-1: Alert-Agent integration
  - Extend `server/services/alertProcessor.ts`
  - Connect alerts to error analyzer
  - Auto-fix trigger based on severity
  - Status update flow
  - Activity logging

- [ ] task-3-4-2: Agent execution monitoring
  - Create `server/agents/agent-monitor.ts`
  - Track agent run history
  - Success/failure metrics
  - API cost tracking
  - Create `src/components/agents/AgentDashboard.tsx`
  - Agent run history table
  - Success rate chart
  - Cost summary
