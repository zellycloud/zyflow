# ZyFlow Agents

LangGraph + DeepAgents integration for ZyFlow.

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
│   ├── server.py          # FastAPI server
│   ├── middleware/        # Agent middleware
│   ├── tools/             # Agent tools
│   └── utils/             # Utilities
├── tests/
│   └── test_server.py     # Server tests
└── pyproject.toml         # Project configuration
```
