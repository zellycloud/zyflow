"""Tests for execution engine."""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, MagicMock, patch

from zyflow_agents.execution import (
    ExecutionEngine,
    ExecutionEvent,
    ExecutionResult,
    ExecutionState,
    ExecutionStatus,
    create_engine,
    get_engine,
)


SAMPLE_PROPOSAL = """# Change: Test Feature

## Summary
Adding a test feature.
"""

SAMPLE_TASKS = """# Tasks: Test Feature

## Phase 1: Setup

### 1.1 Initial Setup
- [ ] Create project structure
- [ ] Add configuration
"""


@pytest.fixture
def change_dir():
    """Create a temporary change directory with sample files."""
    with TemporaryDirectory() as tmpdir:
        project_path = Path(tmpdir)
        change_dir = project_path / "openspec" / "changes" / "test-change"
        change_dir.mkdir(parents=True)

        (change_dir / "proposal.md").write_text(SAMPLE_PROPOSAL)
        (change_dir / "tasks.md").write_text(SAMPLE_TASKS)

        yield project_path, "test-change"


def test_execution_state_defaults():
    """Test ExecutionState defaults."""
    state = ExecutionState(
        session_id="test-session",
        change_id="test-change",
        project_path="/test",
    )

    assert state.status == ExecutionStatus.PENDING
    assert state.current_task is None
    assert state.total_tasks == 0
    assert state.completed_tasks == 0
    assert state.results == []
    assert state.error is None


def test_execution_state_to_dict():
    """Test ExecutionState to_dict."""
    state = ExecutionState(
        session_id="test-session",
        change_id="test-change",
        project_path="/test",
        total_tasks=5,
        completed_tasks=2,
    )

    data = state.to_dict()

    assert data["session_id"] == "test-session"
    assert data["change_id"] == "test-change"
    assert data["status"] == "pending"
    assert data["total_tasks"] == 5
    assert data["completed_tasks"] == 2


def test_execution_result_to_dict():
    """Test ExecutionResult to_dict."""
    result = ExecutionResult(
        task_id="task-1",
        task_title="Test Task",
        status="completed",
        output="Done!",
    )

    data = result.to_dict()

    assert data["task_id"] == "task-1"
    assert data["task_title"] == "Test Task"
    assert data["status"] == "completed"
    assert data["output"] == "Done!"


def test_execution_event_to_dict():
    """Test ExecutionEvent to_dict."""
    event = ExecutionEvent(
        type="task_start",
        timestamp="2024-01-01T00:00:00",
        data={"task_id": "task-1"},
    )

    data = event.to_dict()

    assert data["type"] == "task_start"
    assert data["timestamp"] == "2024-01-01T00:00:00"
    assert data["data"]["task_id"] == "task-1"


def test_create_engine():
    """Test creating execution engine."""
    engine = create_engine()

    assert isinstance(engine, ExecutionEngine)


def test_create_session(change_dir):
    """Test creating an execution session."""
    project_path, change_id = change_dir
    engine = create_engine()

    state = engine.create_session(
        session_id="test-session",
        change_id=change_id,
        project_path=str(project_path),
    )

    assert state.session_id == "test-session"
    assert state.change_id == change_id
    assert state.total_tasks == 2
    assert state.status == ExecutionStatus.PENDING


def test_get_session(change_dir):
    """Test getting a session."""
    project_path, change_id = change_dir
    engine = create_engine()

    engine.create_session(
        session_id="test-session",
        change_id=change_id,
        project_path=str(project_path),
    )

    state = engine.get_session("test-session")

    assert state is not None
    assert state.session_id == "test-session"


def test_get_session_not_found():
    """Test getting non-existent session."""
    engine = create_engine()
    state = engine.get_session("nonexistent")
    assert state is None


def test_list_sessions(change_dir):
    """Test listing sessions."""
    project_path, change_id = change_dir
    engine = create_engine()

    engine.create_session(
        session_id="session-1",
        change_id=change_id,
        project_path=str(project_path),
    )
    engine.create_session(
        session_id="session-2",
        change_id=change_id,
        project_path=str(project_path),
    )

    sessions = engine.list_sessions()

    assert len(sessions) == 2


def test_delete_session(change_dir):
    """Test deleting a session."""
    project_path, change_id = change_dir
    engine = create_engine()

    engine.create_session(
        session_id="test-session",
        change_id=change_id,
        project_path=str(project_path),
    )

    result = engine.delete_session("test-session")

    assert result is True
    assert engine.get_session("test-session") is None


def test_delete_running_session(change_dir):
    """Test cannot delete running session."""
    project_path, change_id = change_dir
    engine = create_engine()

    state = engine.create_session(
        session_id="test-session",
        change_id=change_id,
        project_path=str(project_path),
    )
    state.status = ExecutionStatus.RUNNING

    result = engine.delete_session("test-session")

    assert result is False
    assert engine.get_session("test-session") is not None


def test_stop_session(change_dir):
    """Test stopping a session."""
    project_path, change_id = change_dir
    engine = create_engine()

    state = engine.create_session(
        session_id="test-session",
        change_id=change_id,
        project_path=str(project_path),
    )
    state.status = ExecutionStatus.RUNNING

    result = engine.stop_session("test-session")

    assert result is True


def test_get_engine_singleton():
    """Test get_engine returns singleton."""
    import zyflow_agents.execution as execution_module

    # Reset the global
    execution_module._engine = None

    engine1 = get_engine()
    engine2 = get_engine()

    assert engine1 is engine2


@pytest.mark.asyncio
async def test_execute_session_not_found():
    """Test executing non-existent session."""
    engine = create_engine()

    with pytest.raises(ValueError, match="Session not found"):
        async for _ in engine.execute("nonexistent"):
            pass
