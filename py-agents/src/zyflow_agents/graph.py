"""LangGraph StateGraph builder for OpenSpec task execution."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Annotated, Any, Optional, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .openspec_parser import OpenSpecContext, Task


class TaskStatus(str, Enum):
    """Status of a task execution."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class TaskResult:
    """Result of executing a single task."""

    task_id: str
    status: TaskStatus
    output: str = ""
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class OpenSpecState(TypedDict):
    """State for OpenSpec graph execution."""

    # Session info
    session_id: str
    change_id: str
    project_path: str

    # OpenSpec context
    proposal: Optional[str]
    design: Optional[str]
    spec: Optional[str]

    # Task execution
    tasks: list[dict]  # Serialized Task objects
    current_task_index: int
    task_results: list[dict]  # Serialized TaskResult objects

    # Messages for LLM interaction
    messages: Annotated[list, add_messages]

    # Status
    status: str  # pending, running, completed, failed, stopped
    error: Optional[str]


def create_initial_state(
    session_id: str,
    context: OpenSpecContext,
    project_path: str,
) -> OpenSpecState:
    """Create initial state from OpenSpec context.

    Args:
        session_id: Unique session identifier
        context: Loaded OpenSpec context
        project_path: Path to the project

    Returns:
        Initial OpenSpecState
    """
    # Serialize tasks
    tasks = []
    if context.tasks:
        for group in context.tasks.groups:
            for task in group.tasks:
                tasks.append({
                    "id": task.id,
                    "title": task.title,
                    "completed": task.completed,
                    "line_number": task.line_number,
                    "group_id": task.group_id,
                })

    return OpenSpecState(
        session_id=session_id,
        change_id=context.change_id,
        project_path=project_path,
        proposal=context.proposal,
        design=context.design,
        spec=context.spec,
        tasks=tasks,
        current_task_index=0,
        task_results=[],
        messages=[],
        status="pending",
        error=None,
    )


def _find_next_pending_task(state: OpenSpecState) -> Optional[int]:
    """Find the index of the next pending task.

    Args:
        state: Current state

    Returns:
        Index of next pending task or None if all completed
    """
    for i, task in enumerate(state["tasks"]):
        if not task["completed"]:
            # Check if already processed
            processed_ids = {r["task_id"] for r in state["task_results"]}
            if task["id"] not in processed_ids:
                return i
    return None


def task_router(state: OpenSpecState) -> str:
    """Route to next task or end.

    Args:
        state: Current state

    Returns:
        Next node name or END
    """
    if state["status"] in ["failed", "stopped"]:
        return "finalize"

    next_idx = _find_next_pending_task(state)
    if next_idx is None:
        return "finalize"

    return "execute_task"


def execute_task_node(state: OpenSpecState) -> dict:
    """Execute the current task.

    This is a placeholder that will be replaced with actual LLM execution
    in Phase 3 (DeepAgents integration).

    Args:
        state: Current state

    Returns:
        State updates
    """
    next_idx = _find_next_pending_task(state)
    if next_idx is None:
        return {"status": "completed"}

    task = state["tasks"][next_idx]

    # Placeholder: Mark task as completed
    # In Phase 3, this will use DeepAgent to actually execute the task
    result = {
        "task_id": task["id"],
        "status": TaskStatus.COMPLETED.value,
        "output": f"Task '{task['title']}' executed (placeholder)",
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": datetime.utcnow().isoformat(),
    }

    # Update task as completed
    updated_tasks = state["tasks"].copy()
    updated_tasks[next_idx] = {**task, "completed": True}

    return {
        "tasks": updated_tasks,
        "current_task_index": next_idx + 1,
        "task_results": state["task_results"] + [result],
        "status": "running",
    }


def finalize_node(state: OpenSpecState) -> dict:
    """Finalize the graph execution.

    Args:
        state: Current state

    Returns:
        State updates
    """
    # Calculate final status
    all_completed = all(t["completed"] for t in state["tasks"])
    has_failures = any(
        r["status"] == TaskStatus.FAILED.value
        for r in state["task_results"]
    )

    if state["status"] == "stopped":
        final_status = "stopped"
    elif has_failures:
        final_status = "failed"
    elif all_completed:
        final_status = "completed"
    else:
        final_status = "completed"  # Partial completion

    return {"status": final_status}


def create_openspec_graph(checkpointer: Optional[SqliteSaver] = None) -> StateGraph:
    """Create the OpenSpec execution graph.

    Args:
        checkpointer: Optional SQLite checkpointer for persistence

    Returns:
        Compiled StateGraph
    """
    # Create graph builder
    builder = StateGraph(OpenSpecState)

    # Add nodes
    builder.add_node("execute_task", execute_task_node)
    builder.add_node("finalize", finalize_node)

    # Set entry point
    builder.set_entry_point("execute_task")

    # Add conditional edges
    builder.add_conditional_edges(
        "execute_task",
        task_router,
        {
            "execute_task": "execute_task",
            "finalize": "finalize",
        },
    )

    # Finalize goes to END
    builder.add_edge("finalize", END)

    # Compile with optional checkpointer
    if checkpointer:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()


class OpenSpecGraphRunner:
    """Runner for OpenSpec execution graphs."""

    def __init__(self, db_path: str = ".zyflow/agents.db"):
        """Initialize the runner.

        Args:
            db_path: Path to SQLite database for checkpoints
        """
        self.db_path = db_path
        self._checkpointer: Optional[SqliteSaver] = None
        self._graph: Optional[StateGraph] = None

    def _ensure_checkpointer(self) -> SqliteSaver:
        """Ensure checkpointer is initialized."""
        if self._checkpointer is None:
            # Ensure directory exists
            db_dir = Path(self.db_path).parent
            db_dir.mkdir(parents=True, exist_ok=True)

            # Create checkpointer
            import sqlite3
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._checkpointer = SqliteSaver(conn)
        return self._checkpointer

    def _ensure_graph(self) -> StateGraph:
        """Ensure graph is compiled."""
        if self._graph is None:
            checkpointer = self._ensure_checkpointer()
            self._graph = create_openspec_graph(checkpointer)
        return self._graph

    def create_session(
        self,
        session_id: str,
        context: OpenSpecContext,
        project_path: str,
    ) -> OpenSpecState:
        """Create a new execution session.

        Args:
            session_id: Unique session identifier
            context: Loaded OpenSpec context
            project_path: Path to the project

        Returns:
            Initial state
        """
        return create_initial_state(session_id, context, project_path)

    def run(
        self,
        state: OpenSpecState,
        config: Optional[dict] = None,
    ) -> OpenSpecState:
        """Run the graph to completion.

        Args:
            state: Initial state
            config: Optional LangGraph config

        Returns:
            Final state
        """
        graph = self._ensure_graph()

        if config is None:
            config = {"configurable": {"thread_id": state["session_id"]}}

        # Run graph
        final_state = None
        for event in graph.stream(state, config):
            final_state = event

        return final_state

    async def arun(
        self,
        state: OpenSpecState,
        config: Optional[dict] = None,
    ):
        """Run the graph asynchronously, yielding events.

        Args:
            state: Initial state
            config: Optional LangGraph config

        Yields:
            State update events
        """
        graph = self._ensure_graph()

        if config is None:
            config = {"configurable": {"thread_id": state["session_id"]}}

        # Stream events
        async for event in graph.astream(state, config):
            yield event

    def resume(
        self,
        session_id: str,
        config: Optional[dict] = None,
    ) -> OpenSpecState:
        """Resume execution from a checkpoint.

        Args:
            session_id: Session ID to resume
            config: Optional LangGraph config

        Returns:
            Final state after resuming
        """
        graph = self._ensure_graph()

        if config is None:
            config = {"configurable": {"thread_id": session_id}}

        # Resume from checkpoint
        final_state = None
        for event in graph.stream(None, config):
            final_state = event

        return final_state

    def get_state(self, session_id: str) -> Optional[OpenSpecState]:
        """Get current state for a session.

        Args:
            session_id: Session ID

        Returns:
            Current state or None if not found
        """
        graph = self._ensure_graph()
        config = {"configurable": {"thread_id": session_id}}

        try:
            state = graph.get_state(config)
            return state.values if state else None
        except Exception:
            return None

    def stop(self, session_id: str) -> bool:
        """Mark a session as stopped.

        Args:
            session_id: Session ID to stop

        Returns:
            True if stopped successfully
        """
        graph = self._ensure_graph()
        config = {"configurable": {"thread_id": session_id}}

        try:
            state = graph.get_state(config)
            if state and state.values:
                # Update state to stopped
                graph.update_state(config, {"status": "stopped"})
                return True
        except Exception:
            pass
        return False
