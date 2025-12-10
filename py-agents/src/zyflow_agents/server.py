"""FastAPI bridge server for ZyFlow agents."""

import asyncio
import json
import logging
import os
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .agent import ModelType
from .execution import ExecutionEngine, ExecutionStatus, get_engine

logger = logging.getLogger(__name__)


class SessionStatus(str, Enum):
    """Agent session status."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class ExecuteRequest(BaseModel):
    """Request to execute a change."""

    change_id: str = Field(..., description="OpenSpec change ID to execute")
    project_path: Optional[str] = Field(None, description="Project path (defaults to cwd)")
    model: str = Field("claude-sonnet", description="Model to use (claude-sonnet, claude-haiku, claude-opus)")


class ExecuteResponse(BaseModel):
    """Response after starting execution."""

    session_id: str
    status: str
    message: str


class SessionInfo(BaseModel):
    """Information about an agent session."""

    session_id: str
    change_id: str
    status: str
    created_at: str
    updated_at: str
    project_path: str = ""
    current_task: Optional[str] = None
    completed_tasks: int = 0
    total_tasks: int = 0
    error: Optional[str] = None


# Store for active execution tasks
active_tasks: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("🚀 ZyFlow Agents server starting...")
    yield
    # Shutdown
    logger.info("👋 ZyFlow Agents server shutting down...")
    # Cancel active tasks
    for task in active_tasks.values():
        task.cancel()


app = FastAPI(
    title="ZyFlow Agents API",
    description="LangGraph + DeepAgents integration for ZyFlow",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_model_type(model: str) -> ModelType:
    """Convert model string to ModelType enum."""
    model_map = {
        "claude-sonnet": ModelType.CLAUDE_SONNET,
        "claude-haiku": ModelType.CLAUDE_HAIKU,
        "claude-opus": ModelType.CLAUDE_OPUS,
    }
    return model_map.get(model, ModelType.CLAUDE_SONNET)


def session_to_info(state) -> SessionInfo:
    """Convert execution state to SessionInfo."""
    return SessionInfo(
        session_id=state.session_id,
        change_id=state.change_id,
        status=state.status.value,
        created_at=state.created_at,
        updated_at=state.updated_at,
        project_path=state.project_path,
        current_task=state.current_task,
        completed_tasks=state.completed_tasks,
        total_tasks=state.total_tasks,
        error=state.error,
    )


@app.get("/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "zyflow-agents",
        "version": "0.1.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/agents/execute", response_model=ExecuteResponse)
async def execute_change(
    request: ExecuteRequest,
    background_tasks: BackgroundTasks,
) -> ExecuteResponse:
    """Start executing an OpenSpec change."""
    session_id = str(uuid.uuid4())

    # Determine project path
    project_path = request.project_path or os.getcwd()

    # Validate change exists
    change_dir = Path(project_path) / "openspec" / "changes" / request.change_id
    if not change_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Change not found: {request.change_id}",
        )

    # Get engine
    engine = get_engine()

    # Create session
    state = engine.create_session(
        session_id=session_id,
        change_id=request.change_id,
        project_path=project_path,
    )

    # Start execution in background
    async def run_execution():
        async for event in engine.execute(session_id):
            # Events are yielded for streaming, background just runs through
            pass

    task = asyncio.create_task(run_execution())
    active_tasks[session_id] = task

    return ExecuteResponse(
        session_id=session_id,
        status=state.status.value,
        message=f"Session created for change '{request.change_id}' ({state.total_tasks} tasks)",
    )


@app.get("/api/agents/sessions", response_model=list[SessionInfo])
async def list_sessions() -> list[SessionInfo]:
    """List all agent sessions."""
    engine = get_engine()
    return [session_to_info(s) for s in engine.list_sessions()]


@app.get("/api/agents/sessions/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str) -> SessionInfo:
    """Get information about a specific session."""
    engine = get_engine()
    state = engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_to_info(state)


@app.post("/api/agents/sessions/{session_id}/stop")
async def stop_session(session_id: str) -> dict[str, str]:
    """Stop a running session."""
    engine = get_engine()
    state = engine.get_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    if state.status not in [ExecutionStatus.PENDING, ExecutionStatus.RUNNING]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot stop session in {state.status.value} status",
        )

    # Send stop signal
    engine.stop_session(session_id)

    # Cancel background task
    if session_id in active_tasks:
        active_tasks[session_id].cancel()
        del active_tasks[session_id]

    return {"message": "Session stopped", "session_id": session_id}


@app.post("/api/agents/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Resume a stopped session."""
    engine = get_engine()
    state = engine.get_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    if state.status != ExecutionStatus.STOPPED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resume session in {state.status.value} status",
        )

    # Resume execution
    async def run_execution():
        async for event in engine.execute(session_id):
            pass

    task = asyncio.create_task(run_execution())
    active_tasks[session_id] = task

    return {"message": "Session resumed", "session_id": session_id}


@app.delete("/api/agents/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, str]:
    """Delete a session."""
    engine = get_engine()

    if not engine.delete_session(session_id):
        state = engine.get_session(session_id)
        if state and state.status == ExecutionStatus.RUNNING:
            raise HTTPException(status_code=400, detail="Cannot delete running session")
        raise HTTPException(status_code=404, detail="Session not found")

    # Clean up background task
    if session_id in active_tasks:
        active_tasks[session_id].cancel()
        del active_tasks[session_id]

    return {"message": "Session deleted", "session_id": session_id}


@app.get("/api/agents/sessions/{session_id}/stream")
async def stream_session(session_id: str):
    """Stream session events via SSE."""
    engine = get_engine()
    state = engine.get_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        async for event in engine.stream_events(session_id):
            yield {
                "event": event.type,
                "data": json.dumps(event.to_dict()),
            }

    return EventSourceResponse(event_generator())


@app.get("/api/agents/sessions/{session_id}/logs")
async def get_session_logs(session_id: str) -> dict[str, Any]:
    """Get execution logs for a session."""
    engine = get_engine()
    state = engine.get_session(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "results": [r.to_dict() for r in state.results],
        "total_tasks": state.total_tasks,
        "completed_tasks": state.completed_tasks,
        "status": state.status.value,
    }


def main():
    """Run the server."""
    import uvicorn

    logging.basicConfig(level=logging.INFO)

    uvicorn.run(
        "zyflow_agents.server:app",
        host="0.0.0.0",
        port=3002,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
