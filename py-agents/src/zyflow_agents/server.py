"""FastAPI bridge server for ZyFlow agents."""

import asyncio
import os
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

from .openspec_parser import OpenSpecContext
from .graph import OpenSpecGraphRunner, create_initial_state


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
    project_path: str = ""
    current_task: Optional[str] = None
    completed_tasks: int = 0
    total_tasks: int = 0
    error: Optional[str] = None


class SessionControlRequest(BaseModel):
    """Request to control a session."""

    action: str = Field(..., description="Action: stop, resume")


# In-memory session store
sessions: dict[str, SessionInfo] = {}
session_events: dict[str, asyncio.Queue] = {}

# Graph runner instance
graph_runner: Optional[OpenSpecGraphRunner] = None


def get_graph_runner() -> OpenSpecGraphRunner:
    """Get or create the graph runner."""
    global graph_runner
    if graph_runner is None:
        graph_runner = OpenSpecGraphRunner()
    return graph_runner


async def emit_event(session_id: str, event_type: str, data: Any):
    """Emit an event to session stream."""
    if session_id in session_events:
        await session_events[session_id].put({
            "event": event_type,
            "data": data if isinstance(data, str) else str(data),
        })


async def run_graph_execution(session_id: str, change_id: str, project_path: str):
    """Run graph execution in background."""
    session = sessions.get(session_id)
    if not session:
        return

    try:
        # Update status to running
        session.status = SessionStatus.RUNNING
        session.updated_at = datetime.utcnow().isoformat()
        await emit_event(session_id, "status", session.model_dump_json())

        # Load OpenSpec context
        change_dir = Path(project_path) / "openspec" / "changes" / change_id
        if not change_dir.exists():
            raise ValueError(f"Change directory not found: {change_dir}")

        context = OpenSpecContext.load(change_dir)

        # Update task counts
        if context.tasks:
            session.total_tasks = context.tasks.total_tasks
            session.completed_tasks = context.tasks.completed_tasks

        # Create initial state
        runner = get_graph_runner()
        state = runner.create_session(session_id, context, project_path)

        # Run graph and stream events
        async for event in runner.arun(state):
            # Extract node name and state
            for node_name, node_state in event.items():
                if isinstance(node_state, dict):
                    # Update session info
                    if "status" in node_state:
                        session.status = SessionStatus(node_state["status"])
                    if "current_task_index" in node_state and "tasks" in node_state:
                        idx = node_state["current_task_index"]
                        if idx > 0 and idx <= len(node_state["tasks"]):
                            task = node_state["tasks"][idx - 1]
                            session.current_task = task.get("title")
                    if "task_results" in node_state:
                        completed = sum(
                            1 for r in node_state["task_results"]
                            if r.get("status") == "completed"
                        )
                        session.completed_tasks = completed

                    session.updated_at = datetime.utcnow().isoformat()

                    # Emit event
                    await emit_event(
                        session_id,
                        f"node:{node_name}",
                        session.model_dump_json(),
                    )

        # Final status
        session.status = SessionStatus.COMPLETED
        session.updated_at = datetime.utcnow().isoformat()
        await emit_event(session_id, "completed", session.model_dump_json())

    except Exception as e:
        session.status = SessionStatus.FAILED
        session.error = str(e)
        session.updated_at = datetime.utcnow().isoformat()
        await emit_event(session_id, "failed", session.model_dump_json())


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
async def execute_change(
    request: ExecuteRequest,
    background_tasks: BackgroundTasks,
) -> ExecuteResponse:
    """Start executing an OpenSpec change."""
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # Determine project path
    project_path = request.project_path or os.getcwd()

    # Validate change exists
    change_dir = Path(project_path) / "openspec" / "changes" / request.change_id
    if not change_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Change not found: {request.change_id}",
        )

    # Load context to get task counts
    context = OpenSpecContext.load(change_dir)
    total_tasks = context.tasks.total_tasks if context.tasks else 0
    completed_tasks = context.tasks.completed_tasks if context.tasks else 0

    # Create session
    session = SessionInfo(
        session_id=session_id,
        change_id=request.change_id,
        status=SessionStatus.PENDING,
        created_at=now,
        updated_at=now,
        project_path=project_path,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
    )
    sessions[session_id] = session
    session_events[session_id] = asyncio.Queue()

    # Start execution in background
    background_tasks.add_task(
        run_graph_execution,
        session_id,
        request.change_id,
        project_path,
    )

    return ExecuteResponse(
        session_id=session_id,
        status=SessionStatus.PENDING,
        message=f"Session created for change '{request.change_id}' ({total_tasks} tasks)",
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

    # Stop via graph runner
    runner = get_graph_runner()
    runner.stop(session_id)

    session.status = SessionStatus.STOPPED
    session.updated_at = datetime.utcnow().isoformat()

    await emit_event(session_id, "stopped", session.model_dump_json())

    return {"message": "Session stopped", "session_id": session_id}


@app.post("/api/agents/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Resume a stopped session from checkpoint."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    if session.status != SessionStatus.STOPPED:
        raise HTTPException(
            status_code=400, detail=f"Cannot resume session in {session.status} status"
        )

    session.status = SessionStatus.RUNNING
    session.updated_at = datetime.utcnow().isoformat()

    # Resume in background
    async def resume_execution():
        try:
            runner = get_graph_runner()
            state = runner.resume(session_id)
            if state:
                session.status = SessionStatus(state.get("status", "completed"))
                session.updated_at = datetime.utcnow().isoformat()
                await emit_event(session_id, "completed", session.model_dump_json())
        except Exception as e:
            session.status = SessionStatus.FAILED
            session.error = str(e)
            await emit_event(session_id, "failed", session.model_dump_json())

    background_tasks.add_task(resume_execution)

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
