---
project: zyflow
version: 0.5.1
updated: 2026-01-29
---

# ZyFlow - MoAI SPEC-Based Development Flow Manager

## Project Identity

ZyFlow is a comprehensive software development flow management tool built on the MoAI-ADK SPEC system. It provides Claude Code integration, web dashboard, and MCP tools for managing development workflows using domain-driven development principles.

## Core Architecture

### Specification System

**MoAI SPEC System** (Primary)
- Format: Markdown-based (spec.md, plan.md, acceptance.md)
- Structure: EARS requirements, TAG chain tracking, Gherkin acceptance criteria
- Storage: `.moai/specs/SPEC-{DOMAIN}-{NUM}/` directories
- Features:
  - Automatic TAG dependency tracking
  - Plan-based progress visualization
  - Acceptance criteria verification
  - Built-in DDD methodology support

### Integration Layers

**Claude Code MCP Server**
- Real-time SPEC access and task management
- MCP tools for SPEC querying and task completion marking
- Bidirectional sync between Claude Code and local SPEC files
- Supports /moai plan, /moai run, /moai sync workflows

**Web Dashboard**
- React 19 + Vite frontend
- SQLite-backed task management
- Multi-project support with independent databases
- Real-time project watcher for SPEC file changes
- 7-stage pipeline visualization (Spec → Changes → Tasks → Code → Test → Commit → Docs)

**Parser Module**
- @zyflow/parser npm package
- Extracts SPEC structure (EARS, TAG chains, Gherkin)
- Validates markdown format and structure
- Provides TypeScript types for all SPEC documents

### Database Layer

**Task Storage**
- SQLite database per project (`.zyflow/tasks.db`)
- Schema supports both SPEC-originated and ad-hoc tasks
- Origin tracking: 'spec' for SPEC-derived, 'inbox' for manual creation
- FTS5 full-text search capability

**Multi-Project Watcher**
- Real-time monitoring of `.moai/specs/` directories
- Automatic synchronization of TAG chain changes
- Maintains consistency between files and database

## Key Features

### SPEC Management
- Full MoAI SPEC parsing and validation
- EARS requirement extraction with hierarchical structure
- TAG chain with dependency tracking and progress calculation
- Gherkin acceptance criteria with verification status
- Automatic SPEC discovery and registration

### Development Workflow
- DDD cycle automation (ANALYZE-PRESERVE-IMPROVE)
- Characterization test generation for legacy code
- Incremental refactoring support
- Quality gates and TRUST 5 validation

### Task Tracking
- Hierarchical task organization (Major → Sub → Task)
- Multiple origin types with clear distinction
- Kanban-style board with drag-and-drop
- Full-text search with FTS5
- Archive/restore functionality

### Git Integration
- Change-based branching strategy
- Automated commit generation
- Pull request creation
- Git blame and history tracking

### Monitoring and Observability
- Change log with replay capability
- Event-based architecture for extensibility
- Real-time status streaming via SSE
- Execution logs and history

## Technology Stack

### Frontend
- React 19
- Vite (build tool)
- TailwindCSS 4 (styling)
- React Query (data fetching)
- dnd-kit (drag and drop)

### Backend
- Express.js (API server)
- SQLite with better-sqlite3
- Drizzle ORM (database access)
- node-pty (terminal emulation for CLI execution)

### MCP Integration
- @modelcontextprotocol/sdk (MCP server)
- Claude Code CLI integration
- Real-time streaming and status reporting

### Development
- TypeScript 5.x
- Vitest (unit testing)
- @testing-library/react (component testing)
- Playwright (e2e testing)
- ESLint + Prettier (code formatting)

## Project Structure

```
zyflow/
├── src/                           # React frontend
│   ├── components/
│   │   ├── flow/               # SPEC dashboard UI
│   │   ├── git/                # Git workflow components
│   │   └── ui/                 # Common UI components
│   ├── hooks/                  # React Query hooks
│   ├── api/                    # API client
│   ├── types/                  # TypeScript types
│   └── constants/              # Constants (STAGES, configs)
│
├── server/                        # Express API server
│   ├── routes/                 # API routes (flow, changes, projects)
│   ├── tasks/                  # Task management (SQLite)
│   ├── git/                    # Git operation APIs
│   ├── agents/                 # AI agent integrations
│   └── watcher.ts              # Multi-project watcher
│
├── mcp-server/                    # MCP server for Claude Code
│   ├── index.ts                # Main MCP tool definitions
│   ├── moai-spec-tools.ts      # SPEC-specific tools
│   ├── parser.ts               # SPEC parsing in MCP
│   └── *.test.ts               # Tool tests
│
├── packages/
│   └── zyflow-parser/          # @zyflow/parser npm package
│       ├── src/
│       │   ├── moai-parser.ts   # MoAI SPEC parser
│       │   ├── moai-types.ts    # SPEC TypeScript types
│       │   └── validators/      # SPEC validators
│       └── tests/
│
├── .moai/                         # MoAI configuration
│   ├── specs/                  # SPEC documents (SPEC-MIGR-001, etc.)
│   ├── config/                 # Project config (quality, user, language)
│   └── project/                # Project documentation (this file)
│
└── .claude/                       # Claude Code configuration
    ├── skills/                 # MoAI skills
    ├── commands/               # Slash commands
    ├── agents/                 # Sub-agents
    └── rules/                  # Development rules
```

## Workflows

### Development Workflow (MoAI 3-Phase)

1. **Plan Phase** (`/moai plan`)
   - Create SPEC document with EARS requirements
   - Define acceptance criteria (Gherkin format)
   - Estimate task scope and dependencies
   - Output: `.moai/specs/SPEC-XXX/`

2. **Run Phase** (`/moai run SPEC-XXX`)
   - Execute ANALYZE-PRESERVE-IMPROVE cycle
   - Create characterization tests
   - Implement changes with behavior preservation
   - Output: Implemented features, passing tests

3. **Sync Phase** (`/moai sync SPEC-XXX`)
   - Generate API documentation
   - Update README and CHANGELOG
   - Create pull request
   - Output: Documentation, PR link

### Task Execution Workflow

1. User selects SPEC and tasks in dashboard
2. Initiates execution (Claude Code CLI or MCP)
3. SSE streaming provides real-time feedback
4. Task completion marked in plan.md and database
5. Progress bar updated in UI

## Quality and Compliance

### TRUST 5 Framework Integration
- **Testable**: Characterization tests for existing code
- **Readable**: Clear naming, English comments, proper formatting
- **Unified**: Consistent code style via Prettier + ESLint
- **Secured**: OWASP compliance, input validation, secret management
- **Trackable**: Conventional commits, issue references, change log

### Testing Strategy
- Unit tests for all SPEC parsing logic
- Integration tests for database sync
- Component tests for React UI
- Characterization tests for behavior preservation
- Target: 85%+ code coverage

### Build Quality Gates
- TypeScript strict mode enabled
- ESLint with max warnings threshold
- Vite build success required
- All tests passing before deployment

## Migration Status

**SPEC-MIGR-001: OpenSpec to MoAI SPEC Migration**
- Status: Completed (15/15 TAGs)
- Test Pass Rate: 95.9% (810/845 tests)
- Type Errors: 0
- Migration Impact: 51 files, 406 references
- Completion Date: 2026-01-29

### Key Achievements
- Full MoAI SPEC system integration
- 100% backward compatibility maintained
- Zero data loss during migration
- Improved development workflow
- Enhanced quality tracking

## Configuration Files

- `.moai/config/sections/quality.yaml` - TRUST 5 settings, test coverage targets
- `.moai/config/sections/user.yaml` - User preferences
- `.moai/config/sections/language.yaml` - Language settings
- `.moai/project/product.md` - This file (project description)
- `.moai/project/structure.md` - Project directory structure

## Future Enhancements

- Remote plugin support for distributed teams
- Performance optimization for large SPECs
- Multi-language SPEC support
- Advanced analytics and trends
- Custom workflow templates
- Integration with more AI providers

---

**Project maintained by**: Zellycloud
**License**: Private
**Last Updated**: 2026-01-29
