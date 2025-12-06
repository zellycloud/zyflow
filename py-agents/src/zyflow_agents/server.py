"""FastAPI bridge server for ZyFlow agents."""

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse


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
    project_path: str | None = Field(None, description="Project path (defaults to cwd)")
    cli_profile: str = Field("claude", description="CLI profile to use")


class ExecuteResponse(BaseModel):
    """Response after starting execution."""

    session_id: str
    status: SessionStatus
    message: str


class SessionInfo(BaseModel):
    """Information about an agent session."""

    session_id: str
    change_id: str
    status: SessionStatus
    created_at: str
    updated_at: str
    current_task: str | None = None
    completed_tasks: int = 0
    total_tasks: int = 0
    error: str | None = None


class SessionControlRequest(BaseModel):
    """Request to control a session."""

    action: str = Field(..., description="Action: stop, resume")


# In-memory session store (will be replaced with SQLite in Phase 2)
sessions: dict[str, SessionInfo] = {}
session_events: dict[str, asyncio.Queue] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("🚀 ZyFlow Agents server starting...")
    yield
    # Shutdown
    print("👋 ZyFlow Agents server shutting down...")


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
async def execute_change(request: ExecuteRequest) -> ExecuteResponse:
    """Start executing an OpenSpec change."""
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # Create session
    session = SessionInfo(
        session_id=session_id,
        change_id=request.change_id,
        status=SessionStatus.PENDING,
        created_at=now,
        updated_at=now,
    )
    sessions[session_id] = session
    session_events[session_id] = asyncio.Queue()

    # TODO: Phase 2 - Start LangGraph execution in background

    return ExecuteResponse(
        session_id=session_id,
        status=SessionStatus.PENDING,
        message=f"Session created for change '{request.change_id}'",
    )


@app.get("/api/agents/sessions", response_model=list[SessionInfo])
async def list_sessions() -> list[SessionInfo]:
    """List all agent sessions."""
    return list(sessions.values())


@app.get("/api/agents/sessions/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str) -> SessionInfo:
    """Get information about a specific session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]


@app.post("/api/agents/sessions/{session_id}/stop")
async def stop_session(session_id: str) -> dict[str, str]:
    """Stop a running session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    if session.status not in [SessionStatus.PENDING, SessionStatus.RUNNING]:
        raise HTTPException(
            status_code=400, detail=f"Cannot stop session in {session.status} status"
        )

    # TODO: Phase 3 - Implement graph interrupt
    session.status = SessionStatus.STOPPED
    session.updated_at = datetime.utcnow().isoformat()

    return {"message": "Session stopped", "session_id": session_id}


@app.post("/api/agents/sessions/{session_id}/resume")
async def resume_session(session_id: str) -> dict[str, str]:
    """Resume a stopped session from checkpoint."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    if session.status != SessionStatus.STOPPED:
        raise HTTPException(
            status_code=400, detail=f"Cannot resume session in {session.status} status"
        )

    # TODO: Phase 3 - Implement checkpoint resume
    session.status = SessionStatus.RUNNING
    session.updated_at = datetime.utcnow().isoformat()

    return {"message": "Session resumed", "session_id": session_id}


@app.delete("/api/agents/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, str]:
    """Delete a session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    if session.status == SessionStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot delete running session")

    del sessions[session_id]
    if session_id in session_events:
        del session_events[session_id]

    return {"message": "Session deleted", "session_id": session_id}


@app.get("/api/agents/sessions/{session_id}/stream")
async def stream_session(session_id: str):
    """Stream session events via SSE."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        if session_id not in session_events:
            session_events[session_id] = asyncio.Queue()

        queue = session_events[session_id]

        # Send initial status
        session = sessions[session_id]
        yield {
            "event": "status",
            "data": session.model_dump_json(),
        }

        # Stream events
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield event

                # Stop streaming if session ended
                if event.get("event") in ["completed", "failed", "stopped"]:
                    break
            except asyncio.TimeoutError:
                # Send keepalive
                yield {"event": "ping", "data": ""}

    return EventSourceResponse(event_generator())


def main():
    """Run the server."""
    import uvicorn

    uvicorn.run(
        "zyflow_agents.server:app",
        host="0.0.0.0",
        port=3002,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
