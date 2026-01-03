"""Execution engine for ZyFlow agents."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Callable, Optional

from .agent import ModelType, ZyFlowAgent, create_zyflow_agent
from .middleware.openspec import TodoItem
from .openspec_parser import OpenSpecContext

logger = logging.getLogger(__name__)


class ExecutionStatus(str, Enum):
    """Status of execution."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


@dataclass
class ExecutionEvent:
    """Event emitted during execution."""

    type: str
    timestamp: str
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "type": self.type,
            "timestamp": self.timestamp,
            "data": self.data,
        }


@dataclass
class ExecutionResult:
    """Result of task execution."""

    task_id: str
    task_title: str
    status: str
    output: str = ""
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "task_id": self.task_id,
            "task_title": self.task_title,
            "status": self.status,
            "output": self.output,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


@dataclass
class ExecutionState:
    """State of an execution session."""

    session_id: str
    change_id: str
    project_path: str
    status: ExecutionStatus = ExecutionStatus.PENDING
    current_task: Optional[str] = None
    total_tasks: int = 0
    completed_tasks: int = 0
    results: list[ExecutionResult] = field(default_factory=list)
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "session_id": self.session_id,
            "change_id": self.change_id,
            "project_path": self.project_path,
            "status": self.status.value,
            "current_task": self.current_task,
            "total_tasks": self.total_tasks,
            "completed_tasks": self.completed_tasks,
            "results": [r.to_dict() for r in self.results],
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class ExecutionEngine:
    """Engine for executing OpenSpec tasks with agents."""

    def __init__(
        self,
        model_type: ModelType = ModelType.CLAUDE_SONNET,
        zyflow_api_url: str = "http://localhost:3000",
        tools: Optional[list[Any]] = None,
    ):
        """Initialize the execution engine.

        Args:
            model_type: Type of model to use
            zyflow_api_url: ZyFlow API base URL
            tools: Optional list of tools for agents
        """
        self.model_type = model_type
        self.zyflow_api_url = zyflow_api_url
        self.tools = tools or []
        self._sessions: dict[str, ExecutionState] = {}
        self._agents: dict[str, ZyFlowAgent] = {}
        self._stop_flags: dict[str, bool] = {}
        self._event_queues: dict[str, asyncio.Queue] = {}

    def create_session(
        self,
        session_id: str,
        change_id: str,
        project_path: str,
    ) -> ExecutionState:
        """Create a new execution session.

        Args:
            session_id: Unique session identifier
            change_id: OpenSpec change ID
            project_path: Path to the project

        Returns:
            New execution state
        """
        # Load context to get task counts
        change_dir = Path(project_path) / "openspec" / "changes" / change_id
        context = OpenSpecContext.load(change_dir)

        state = ExecutionState(
            session_id=session_id,
            change_id=change_id,
            project_path=project_path,
            total_tasks=context.tasks.total_tasks if context.tasks else 0,
            completed_tasks=context.tasks.completed_tasks if context.tasks else 0,
        )

        self._sessions[session_id] = state
        self._stop_flags[session_id] = False
        self._event_queues[session_id] = asyncio.Queue()

        return state

    def get_session(self, session_id: str) -> Optional[ExecutionState]:
        """Get session state.

        Args:
            session_id: Session ID

        Returns:
            Session state or None
        """
        return self._sessions.get(session_id)

    def list_sessions(self) -> list[ExecutionState]:
        """List all sessions.

        Returns:
            List of session states
        """
        return list(self._sessions.values())

    def delete_session(self, session_id: str) -> bool:
        """Delete a session.

        Args:
            session_id: Session ID

        Returns:
            True if deleted
        """
        if session_id in self._sessions:
            session = self._sessions[session_id]
            if session.status == ExecutionStatus.RUNNING:
                return False

            del self._sessions[session_id]
            self._stop_flags.pop(session_id, None)
            self._event_queues.pop(session_id, None)
            self._agents.pop(session_id, None)
            return True
        return False

    def stop_session(self, session_id: str) -> bool:
        """Stop a running session.

        Args:
            session_id: Session ID

        Returns:
            True if stop signal sent
        """
        if session_id in self._sessions:
            session = self._sessions[session_id]
            if session.status == ExecutionStatus.RUNNING:
                self._stop_flags[session_id] = True
                return True
        return False

    async def _emit_event(self, session_id: str, event: ExecutionEvent):
        """Emit an event.

        Args:
            session_id: Session ID
            event: Event to emit
        """
        if session_id in self._event_queues:
            await self._event_queues[session_id].put(event)

    async def execute(
        self,
        session_id: str,
    ) -> AsyncGenerator[ExecutionEvent, None]:
        """Execute all pending tasks for a session.

        Args:
            session_id: Session ID to execute

        Yields:
            Execution events
        """
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        try:
            # Update status
            session.status = ExecutionStatus.RUNNING
            session.updated_at = datetime.utcnow().isoformat()

            yield ExecutionEvent(
                type="session_start",
                timestamp=session.updated_at,
                data=session.to_dict(),
            )

            # Create agent
            agent = create_zyflow_agent(
                project_path=session.project_path,
                change_id=session.change_id,
                model_type=self.model_type,
                zyflow_api_url=self.zyflow_api_url,
                tools=self.tools,
            )
            self._agents[session_id] = agent

            # Execute tasks
            while not self._stop_flags.get(session_id, False):
                # Get next task
                next_todo = agent.middleware.get_next_todo()
                if next_todo is None:
                    break

                # Emit task start
                session.current_task = next_todo.title
                session.updated_at = datetime.utcnow().isoformat()

                yield ExecutionEvent(
                    type="task_start",
                    timestamp=session.updated_at,
                    data={
                        "task_id": next_todo.id,
                        "task_title": next_todo.title,
                    },
                )

                # Execute task
                started_at = datetime.utcnow().isoformat()
                try:
                    output = await agent.execute_task(next_todo.title)

                    # Mark complete
                    await agent.middleware.on_task_complete(next_todo.title)

                    completed_at = datetime.utcnow().isoformat()

                    result = ExecutionResult(
                        task_id=next_todo.id,
                        task_title=next_todo.title,
                        status="completed",
                        output=output,
                        started_at=started_at,
                        completed_at=completed_at,
                    )

                    session.results.append(result)
                    session.completed_tasks += 1
                    session.updated_at = completed_at

                    yield ExecutionEvent(
                        type="task_complete",
                        timestamp=completed_at,
                        data=result.to_dict(),
                    )

                except Exception as e:
                    completed_at = datetime.utcnow().isoformat()

                    result = ExecutionResult(
                        task_id=next_todo.id,
                        task_title=next_todo.title,
                        status="failed",
                        error=str(e),
                        started_at=started_at,
                        completed_at=completed_at,
                    )

                    session.results.append(result)
                    session.updated_at = completed_at

                    yield ExecutionEvent(
                        type="task_failed",
                        timestamp=completed_at,
                        data=result.to_dict(),
                    )

                    # Stop on first failure
                    session.status = ExecutionStatus.FAILED
                    session.error = str(e)
                    break

            # Determine final status
            if self._stop_flags.get(session_id, False):
                session.status = ExecutionStatus.STOPPED
            elif session.status != ExecutionStatus.FAILED:
                session.status = ExecutionStatus.COMPLETED

            session.current_task = None
            session.updated_at = datetime.utcnow().isoformat()

            yield ExecutionEvent(
                type="session_end",
                timestamp=session.updated_at,
                data=session.to_dict(),
            )

        except Exception as e:
            session.status = ExecutionStatus.FAILED
            session.error = str(e)
            session.updated_at = datetime.utcnow().isoformat()

            logger.error(f"Execution error: {e}")

            yield ExecutionEvent(
                type="session_error",
                timestamp=session.updated_at,
                data={
                    "error": str(e),
                    "session": session.to_dict(),
                },
            )

        finally:
            # Cleanup
            self._stop_flags.pop(session_id, None)
            self._agents.pop(session_id, None)

    async def stream_events(
        self,
        session_id: str,
        timeout: float = 30.0,
    ) -> AsyncGenerator[ExecutionEvent, None]:
        """Stream events for a session.

        Args:
            session_id: Session ID
            timeout: Timeout between events

        Yields:
            Execution events
        """
        if session_id not in self._event_queues:
            self._event_queues[session_id] = asyncio.Queue()

        queue = self._event_queues[session_id]

        # Send initial state
        session = self._sessions.get(session_id)
        if session:
            yield ExecutionEvent(
                type="status",
                timestamp=datetime.utcnow().isoformat(),
                data=session.to_dict(),
            )

        # Stream events
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=timeout)
                yield event

                # Stop if session ended
                if event.type in ["session_end", "session_error"]:
                    break

            except asyncio.TimeoutError:
                # Send keepalive
                yield ExecutionEvent(
                    type="ping",
                    timestamp=datetime.utcnow().isoformat(),
                )


# Global engine instance
_engine: Optional[ExecutionEngine] = None


def get_engine() -> ExecutionEngine:
    """Get or create the global execution engine.

    Returns:
        ExecutionEngine instance
    """
    global _engine
    if _engine is None:
        _engine = ExecutionEngine()
    return _engine


def create_engine(
    model_type: ModelType = ModelType.CLAUDE_SONNET,
    zyflow_api_url: str = "http://localhost:3000",
    tools: Optional[list[Any]] = None,
) -> ExecutionEngine:
    """Create a new execution engine.

    Args:
        model_type: Type of model to use
        zyflow_api_url: ZyFlow API base URL
        tools: Optional list of tools

    Returns:
        New ExecutionEngine instance
    """
    return ExecutionEngine(
        model_type=model_type,
        zyflow_api_url=zyflow_api_url,
        tools=tools,
    )
