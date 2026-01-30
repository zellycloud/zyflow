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

## Phase 3: Auto-Fix Agent ✅

### Group 3-1: Error Analysis

- [x] task-3-1-1: Error parser and classifier
  - Created `server/agents/error-analyzer.ts`
  - Parse CI logs (TypeScript, ESLint, Vitest, Python)
  - Error types: syntax, type, logic, runtime, lint, test, build
  - Code location extraction (file, line, column)
  - Confidence scoring and priority calculation

- [x] task-3-1-2: Gemini API client
  - Created `server/ai/gemini-client.ts`
  - @google/generative-ai integration
  - Model: gemini-2.0-flash-exp
  - Rate limiting (60 req/min)
  - Streaming support, JSON generation
  - Retry with exponential backoff

- [x] task-3-1-3: Error analysis prompt templates
  - Created `server/agents/prompts/error-analysis.ts`
  - Build/type/runtime/lint/test error prompts
  - Batch error analysis prompt
  - PR description generation prompt
  - Structured JSON output format

### Group 3-2: Fix Generation

- [x] task-3-2-1: Fix generation service
  - Created `server/agents/fix-generator.ts`
  - AI-based code patch generation
  - Multi-file change support
  - Git diff format output
  - Rollback capability with RollbackInfo

- [x] task-3-2-2: Fix validation pipeline
  - Created `server/agents/fix-validator.ts`
  - Syntax check (esbuild)
  - Type check (tsc --noEmit)
  - Lint check (eslint --format json)
  - Test run (vitest --run)
  - Overall score calculation

- [x] task-3-2-3: Auto-merge policy implementation
  - Created `server/agents/merge-policy.ts`
  - Source-specific policies (GitHub, Vercel, Sentry, Supabase)
  - Supabase Security/Performance → manual approval
  - CI status check and waiting
  - Auto-merge via GitHub API

### Group 3-3: PR Workflow

- [x] task-3-3-1: Automatic PR workflow orchestration
  - Created `server/agents/pr-workflow.ts`
  - Branch creation (auto-fix/{alert-id})
  - Commit with structured message
  - PR creation with AI-generated description
  - Labels: [auto-fix], [gemini]
  - CI status monitoring

- [x] task-3-3-2: Error detection integration
  - Created `server/agents/error-detector.ts`
  - Webhook → Error analyzer → Fix generator
  - Auto-fix trigger with options (dryRun, skipValidation)
  - Alert status updates

### Group 3-4: Integration

- [x] task-3-4-1: Alert-Agent integration
  - Created `server/agents/alert-integration.ts`
  - Severity-based auto-trigger (critical, high)
  - Concurrent run limiting
  - Manual trigger support
  - Execution history tracking

- [x] task-3-4-2: Agent execution monitoring
  - Created `server/agents/agent-monitor.ts`
  - SQLite DB for run history (agent-monitor.db)
  - Daily metrics aggregation
  - AI cost tracking (Gemini token usage)
  - Overall stats API
