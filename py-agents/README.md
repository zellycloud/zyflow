# ZyFlow Agents

LangGraph + DeepAgents integration for ZyFlow - AI-powered OpenSpec task execution.

## Overview

ZyFlow Agents provides an intelligent agent system that can:
- Execute OpenSpec change proposals automatically
- Track progress through LangGraph state management
- Integrate with multiple AI CLI tools (Claude, Gemini, Qwen, etc.)
- Stream real-time execution updates via SSE

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ZyFlow Web UI                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ AgentPage   │  │  AgentChat   │  │    AgentSidebar       │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                    useAgentSession (SSE)                        │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Express API Server (:3001)                    │
│  ┌────────────────────┐  ┌─────────────────────────────────────┐ │
│  │  /api/agents/*     │  │  CLI Adapter (Process Manager)      │ │
│  │  (proxy to Python) │  │  - Claude Code                      │ │
│  └─────────┬──────────┘  │  - Gemini CLI                       │ │
│            │             │  - Qwen Code CLI                    │ │
│            │             │  - Kilo Code CLI                    │ │
│            │             └─────────────────────────────────────┘ │
└────────────┼────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Python FastAPI Server (:3002)                   │
│  ┌───────────────────┐  ┌───────────────────────────────────┐    │
│  │   Session Manager │  │        LangGraph Engine           │    │
│  │   - Create        │  │  ┌─────────────────────────────┐  │    │
│  │   - Stop          │  │  │     OpenSpecState           │  │    │
│  │   - Resume        │  │  │  - tasks, context, results  │  │    │
│  │   - Stream        │  │  └─────────────────────────────┘  │    │
│  └───────────────────┘  │                                   │    │
│                         │  ┌─────────────────────────────┐  │    │
│  ┌───────────────────┐  │  │   SqliteSaver (checkpoint)  │  │    │
│  │ OpenSpec Parser   │  │  └─────────────────────────────┘  │    │
│  │ - tasks.md        │  │                                   │    │
│  │ - proposal.md     │  └───────────────────────────────────┘    │
│  │ - design.md       │                                           │
│  │ - spec.md         │  ┌───────────────────────────────────┐    │
│  └───────────────────┘  │      DeepAgents Integration       │    │
│                         │  - Middleware stack               │    │
│                         │  - Tool orchestration             │    │
│                         │  - Claude/GPT model binding       │    │
│                         └───────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Setup

### Prerequisites
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) package manager

### Installation

```bash
# From project root
npm run py:install

# Or directly
cd py-agents && uv sync
```

## Running the Server

```bash
# From project root
npm run py:server

# Or directly
cd py-agents && uv run python -m zyflow_agents.server
```

The server runs on `http://localhost:3002`.

## Running with Node.js Server

```bash
# Run all servers (Vite + Express + Python)
npm run dev:full
```

## API Endpoints

### Health Check
- `GET /health` - Check server status

### Agent Sessions
- `POST /api/agents/execute` - Start executing an OpenSpec change
- `GET /api/agents/sessions` - List all sessions
- `GET /api/agents/sessions/{id}` - Get session info
- `POST /api/agents/sessions/{id}/stop` - Stop a session
- `POST /api/agents/sessions/{id}/resume` - Resume a stopped session
- `DELETE /api/agents/sessions/{id}` - Delete a session
- `GET /api/agents/sessions/{id}/stream` - Stream session events (SSE)

### Execute Request Body

```json
{
  "change_id": "add-feature-x",
  "project_path": "/path/to/project",
  "initial_prompt": "Optional initial message"
}
```

### SSE Event Types

```typescript
type SSEEvent =
  | { type: 'task_start'; task_id: string; task_title: string }
  | { type: 'task_complete'; task_id: string; task_title: string }
  | { type: 'agent_response'; content: string }
  | { type: 'llm_response'; output: string }
  | { type: 'error'; error: string }
  | { type: 'session_complete' }
  | { type: 'session_stopped' }
```

## Testing

```bash
# From project root
npm run test:py

# Or directly
cd py-agents && uv run pytest
```

## Project Structure

```
py-agents/
├── src/zyflow_agents/
│   ├── __init__.py
│   ├── server.py          # FastAPI server with SSE streaming
│   ├── graph.py           # LangGraph state graph builder
│   ├── openspec_parser.py # OpenSpec markdown parser
│   ├── middleware/        # Agent middleware (OpenSpec context)
│   ├── tools/             # Agent tools
│   └── utils/             # Utilities
├── tests/
│   └── test_server.py     # Server tests
│   └── test_openspec_parser.py
│   └── test_graph.py
└── pyproject.toml         # Project configuration (uv)
```

## Integration with ZyFlow

The Python agent server integrates with ZyFlow through:

1. **Express Proxy**: All `/api/agents/*` requests are proxied from Express (:3001) to FastAPI (:3002)
2. **MCP Tools**: New MCP tools for Claude Code integration:
   - `zyflow_execute_change` - Start agent execution
   - `zyflow_get_agent_status` - Check execution status
   - `zyflow_stop_agent` - Stop running agent
   - `zyflow_resume_agent` - Resume from checkpoint
3. **Task Sync**: Agent marks tasks complete via ZyFlow MCP tools, which updates tasks.md
