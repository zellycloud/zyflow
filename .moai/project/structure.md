---
project: zyflow
document: project-structure
updated: 2026-01-29
---

# ZyFlow Project Structure and Module Organization

## Directory Hierarchy

### Root Level Structure

```
zyflow/
├── src/                    # React frontend (Vite)
├── server/                 # Express API server
├── mcp-server/            # MCP server for Claude Code
├── packages/              # Public npm packages
├── .moai/                 # MoAI SPEC system
├── .claude/               # Claude Code configuration
├── dist/                  # Build output
├── node_modules/          # Dependencies
├── .git/                  # Git repository
└── Configuration files    # package.json, tsconfig.json, etc.
```

## Core Directories

### /src - React Frontend

Vite-powered React 19 application with TailwindCSS 4 styling.

```
src/
├── components/            # React components
│   ├── flow/             # Flow dashboard UI
│   │   ├── ChangeList.tsx         # List of SPECs and changes
│   │   ├── ChangeDetail.tsx       # SPEC detail with tabs
│   │   ├── PipelineBar.tsx        # TAG progress visualization
│   │   ├── StageContent.tsx       # TAG-based task content
│   │   ├── TaskCard.tsx           # Individual task card
│   │   ├── SpecProgressBar.tsx    # Progress bar component
│   │   └── __tests__/             # Component tests
│   │
│   ├── git/              # Git workflow UI
│   │   ├── BranchSelector.tsx
│   │   ├── CommitDialog.tsx
│   │   └── __tests__/
│   │
│   └── ui/               # Common UI components
│       ├── Button.tsx
│       ├── Dialog.tsx
│       ├── Input.tsx
│       └── ... (shadcn/ui components)
│
├── hooks/                # React Query hooks
│   ├── useFlowChanges.ts         # Fetch flow changes
│   ├── useTaskList.ts            # Fetch task list
│   ├── useAgentSession.ts        # Claude Code session
│   └── ...
│
├── api/                  # API client layer
│   ├── flow.ts                   # Flow endpoints
│   ├── tasks.ts                  # Task endpoints
│   ├── git.ts                    # Git endpoints
│   └── client.ts                 # Fetch wrapper
│
├── types/                # TypeScript type definitions
│   ├── spec.ts                   # SPEC types
│   ├── task.ts                   # Task types
│   ├── flow.ts                   # Flow types
│   └── api.ts                    # API response types
│
├── constants/            # Constants and configurations
│   ├── stages.ts                 # 7-stage pipeline
│   ├── stage-config.ts           # Stage definitions
│   └── ...
│
├── test/                 # Test utilities
│   └── test-utils.tsx            # Testing library setup
│
├── App.tsx              # Main app component
├── main.tsx             # React entry point
└── index.css            # Global styles
```

### /server - Express API Server

Backend API routes and business logic.

```
server/
├── routes/               # Express route handlers
│   ├── flow.ts                   # SPEC and flow endpoints
│   │   ├── GET /api/flow/changes         # List SPECs
│   │   ├── GET /api/flow/changes/:id     # SPEC details
│   │   └── POST /api/flow/changes        # Create SPEC
│   │
│   ├── changes.ts                # Change management
│   │   ├── GET /api/changes              # List changes
│   │   ├── GET /api/changes/:id          # Change details
│   │   └── PUT /api/changes/:id/archive  # Archive
│   │
│   ├── projects.ts               # Project management
│   │   ├── GET /api/projects             # List projects
│   │   ├── GET /api/projects/:id         # Project details
│   │   └── POST /api/projects/:id/sync   # Sync SPEC
│   │
│   └── git.ts                    # Git operations
│       ├── GET /api/git/status           # Git status
│       ├── POST /api/git/commit          # Create commit
│       └── POST /api/git/push            # Push changes
│
├── tasks/                # Task management module
│   └── db/
│       ├── schema.ts             # Drizzle schema definition
│       │   ├── tasks table        # Task records
│       │   ├── changes table      # Change records
│       │   └── origin enum        # 'spec' | 'inbox'
│       │
│       └── client.ts             # Database queries
│           ├── createTask()
│           ├── updateTaskStatus()
│           ├── listTasks()
│           └── ...
│
├── git/                  # Git operation handlers
│   ├── git-client.ts             # Git command executor
│   ├── branch-manager.ts         # Branch management
│   └── commit-formatter.ts       # Commit message builder
│
├── agents/               # AI agent integrations
│   ├── error-detector.ts
│   ├── post-task-agent.ts
│   └── ...
│
├── sync-tasks.ts         # Sync SPEC files to DB
│   ├── syncSpecTagsFromFile()     # Parse plan.md → DB
│   ├── syncSpecAcceptanceFromFile() # Parse acceptance.md
│   └── scanMoaiSpecs()            # Discover .moai/specs/
│
├── flow-sync.ts          # Flow-specific sync logic
│
├── watcher.ts            # Multi-project file watcher
│   ├── WatcherManager              # Manages project watchers
│   ├── Watch .moai/specs/          # Trigger on changes
│   └── Sync to DB                  # Update database
│
├── app.ts                # Express app setup
│   ├── Middleware (CORS, JSON)
│   ├── Route registration
│   └── Error handling
│
└── server.ts             # Server entry point
    ├── Start HTTP server
    ├── Initialize watcher
    └── Setup MCP connection
```

### /mcp-server - MCP Server for Claude Code

MCP tools accessible from Claude Code CLI.

```
mcp-server/
├── index.ts              # Main MCP tool definitions
│   ├── zyflow_list_changes           # List SPECs
│   ├── zyflow_get_tasks              # Get TAG tasks
│   ├── zyflow_get_next_task          # Next incomplete task
│   ├── zyflow_get_task_context       # Task details
│   ├── zyflow_mark_complete          # Mark task done
│   ├── zyflow_mark_incomplete        # Revert task
│   ├── zyflow_execute_change         # Run SPEC
│   ├── task_create                   # Create task
│   ├── task_list                     # List tasks
│   ├── task_update                   # Update task
│   └── ... (14 total tools)
│
├── moai-spec-tools.ts    # SPEC-specific tool implementation
│   ├── getMoaiSpecs()
│   ├── getMoaiTasks()
│   ├── updateMoaiTask()
│   └── ...
│
├── parser.ts             # SPEC parsing for MCP
│   ├── parsePlanFile()              # Extract TAG chain
│   ├── parseAcceptanceFile()        # Extract Gherkin
│   └── parseSpecFile()              # Extract EARS
│
├── moai-spec-tools.test.ts # Tool tests
├── index.test.ts         # Main tool tests
└── ...test.ts            # Other tool tests
```

### /packages/zyflow-parser - @zyflow/parser npm Package

Reusable SPEC parsing library.

```
packages/zyflow-parser/
├── src/
│   ├── moai-parser.ts    # MoAI SPEC parsing
│   │   ├── parsePlanFile()       # TAG chain extraction
│   │   ├── parseAcceptanceFile() # Gherkin extraction
│   │   ├── parseSpecFile()       # EARS extraction
│   │   └── parseTasksFile()      # Legacy tasks.md
│   │
│   ├── moai-types.ts     # TypeScript definitions
│   │   ├── SpecDocument
│   │   ├── TagChain
│   │   ├── AcceptanceCriteria
│   │   └── ParseResult
│   │
│   ├── validators/       # Validation functions
│   │   ├── validateSpecStructure()
│   │   ├── validateTagChain()
│   │   └── validateGherkin()
│   │
│   └── index.ts          # Public exports
│
└── tests/
    ├── moai-parser.test.ts       # Parser tests
    ├── validators.test.ts        # Validator tests
    └── fixtures/                 # Test data
        ├── valid-spec.md
        ├── valid-plan.md
        └── ...
```

### /.moai - MoAI SPEC System

MoAI configuration and SPEC documents.

```
.moai/
├── specs/                # SPEC documents (organized by domain)
│   ├── SPEC-MIGR-001/    # Migration SPEC
│   │   ├── spec.md       # EARS requirements
│   │   ├── plan.md       # TAG chain (15 TAGs)
│   │   └── acceptance.md # Gherkin criteria (8 ACs)
│   │
│   ├── SPEC-TEST-001/    # Testing SPEC
│   ├── SPEC-ARCH-001/    # Architecture SPEC
│   └── ... (other SPECs)
│
├── config/               # Project configuration
│   ├── sections/
│   │   ├── quality.yaml          # TRUST 5 settings
│   │   ├── user.yaml             # User preferences
│   │   └── language.yaml         # Language settings
│   │
│   └── settings.json             # Claude Code settings
│
├── project/              # Project documentation
│   ├── product.md                # Project description
│   ├── structure.md              # This file
│   └── ... (other docs)
│
├── memory/               # Agent memory (checkpoints)
│   └── checkpoints/
│       ├── ddd/
│       │   ├── SPEC-MIGR-001.checkpoint
│       │   └── ... (other checkpoints)
│       └── ... (other memory)
│
└── memory/               # Project artifacts
    └── ... (generated files)
```

### /.claude - Claude Code Configuration

Claude Code skills, commands, and rules.

```
.claude/
├── skills/               # MoAI skills
│   ├── moai-foundation-claude/     # Claude Code authoring kit
│   ├── moai-workflow-ddd/          # DDD workflow
│   ├── moai-tool-ast-grep/         # AST-Grep tool
│   ├── moai-workflow-testing/      # Testing workflow
│   ├── moai-foundation-quality/    # Quality orchestrator
│   └── ... (other skills)
│
├── commands/             # Slash commands
│   ├── moai-plan/                  # /moai:1-plan command
│   ├── moai-run/                   # /moai:2-run command
│   ├── moai-sync/                  # /moai:3-sync command
│   └── ... (other commands)
│
├── agents/               # Sub-agents
│   ├── manager-spec/               # SPEC creation agent
│   ├── manager-ddd/                # DDD implementation agent
│   ├── expert-backend/             # Backend development
│   └── ... (other agents)
│
├── rules/                # Development rules
│   ├── moai/
│   │   ├── core/
│   │   │   └── moai-constitution.md    # Core principles
│   │   ├── workflow/
│   │   │   ├── spec-workflow.md        # 3-phase workflow
│   │   │   └── workflow-modes.md       # Workflow modes
│   │   └── development/
│   │       ├── skill-authoring.md
│   │       └── coding-standards.md
│   │
│   ├── core/
│   │   └── moai-constitution.md
│   │
│   └── development/
│       └── coding-standards.md
│
└── hooks/                # Event hooks
    ├── hooks.json
    └── ... (hook implementations)
```

## Database Schema

### SQLite Database (.zyflow/tasks.db)

```
Table: tasks
├── id: INTEGER PRIMARY KEY
├── display_id: TEXT UNIQUE           # Readable ID (SPEC-001-TAG-001)
├── title: TEXT NOT NULL
├── description: TEXT
├── status: TEXT (pending|in-progress|complete|blocked)
├── priority: TEXT (low|medium|high)
├── tags: TEXT (CSV)
├── origin: TEXT (spec|inbox|imported)
├── spec_id: TEXT NULLABLE            # Reference to SPEC ID
├── spec_path: TEXT NULLABLE          # Path to .moai/specs/SPEC-ID/
├── tag_id: TEXT NULLABLE             # TAG identifier (TAG-001)
├── tag_scope: TEXT NULLABLE          # TAG scope description
├── tag_dependencies: TEXT NULLABLE   # Comma-separated TAG IDs
├── created_at: TIMESTAMP
├── updated_at: TIMESTAMP
└── completed_at: TIMESTAMP NULLABLE

Table: changes
├── id: TEXT PRIMARY KEY              # SPEC ID
├── title: TEXT NOT NULL
├── description: TEXT
├── status: TEXT (active|archived)
├── spec_path: TEXT                   # Path to .moai/specs/SPEC-ID/
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

Index: tasks(spec_id)
Index: tasks(origin, spec_id)
Index: tasks(display_id)
Index: changes(created_at)

FTS5 Virtual Table: tasks_fts
├── Indexed: title, description, tags
└── Used for full-text search
```

## File Organization Guidelines

### Adding New Features

1. **Frontend Component**: Add to `src/components/` directory with corresponding test
2. **API Route**: Add to `server/routes/` with typed request/response
3. **Database**: Update schema in `server/tasks/db/schema.ts`, add queries in `client.ts`
4. **MCP Tool**: Add to `mcp-server/index.ts` with tool definition and test
5. **Types**: Add to `src/types/` or `packages/zyflow-parser/src/moai-types.ts`

### Naming Conventions

- **Files**: kebab-case (e.g., `change-list.tsx`)
- **Directories**: kebab-case (e.g., `/components/flow/`)
- **Functions**: camelCase (e.g., `parsePlanFile()`)
- **Types**: PascalCase (e.g., `TagChain`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `STAGES`)
- **CSS Classes**: kebab-case (e.g., `task-card-header`)

### Import Path Aliases

```typescript
// Configured in tsconfig.json and vite.config.ts
import { Button } from '@/components/ui'
import { useFlowChanges } from '@/hooks'
import { type TaskType } from '@/types'
```

## Build and Deployment

### Build Artifacts

- `dist/` - Vite build output
- `dist/index.html` - Entry point
- `dist/assets/` - CSS and JS bundles

### Development Server

- Frontend: `http://localhost:5173` (Vite dev server)
- Backend: `http://localhost:3001` (Express server)
- MCP Server: stdio connection (no HTTP)

### Production Deployment

1. Run `npm run build` (TypeScript + Vite)
2. Start `npm run server` (Express + MCP)
3. Serve `dist/` as static files

## Configuration Reference

### .moai/config/sections/quality.yaml
- TRUST 5 framework settings
- Test coverage targets (85%)
- LSP quality gates

### .moai/config/sections/language.yaml
- conversation_language: English
- code_comments: English
- git_commit_messages: English

### vite.config.ts
- Entry point: `src/main.tsx`
- Build output: `dist/`
- Backend API: `http://localhost:3001/api`

## Testing Strategy

### Unit Tests
- Location: `**/__tests__/*.test.ts(x)`
- Framework: Vitest
- Coverage: 85%+ target

### Component Tests
- Location: `src/components/**/*.test.tsx`
- Framework: Vitest + @testing-library/react

### Integration Tests
- Location: `server/**/__tests__/*.test.ts`
- Framework: Vitest
- Database: SQLite in-memory for tests

### E2E Tests
- Location: `tests/e2e/`
- Framework: Playwright
- Scope: Critical user workflows

---

**Last Updated**: 2026-01-29
**Maintained By**: ZyFlow Development Team
