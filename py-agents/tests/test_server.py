"""Tests for the FastAPI server."""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory
from fastapi.testclient import TestClient

from zyflow_agents.server import app
from zyflow_agents.execution import get_engine


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


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    # Clear engine sessions before each test
    import zyflow_agents.execution as execution_module
    execution_module._engine = None
    return TestClient(app)


def test_health_check(client: TestClient):
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "zyflow-agents"
    assert data["version"] == "0.1.0"
    assert "timestamp" in data


def test_execute_change_creates_session(client: TestClient, change_dir):
    """Test that executing a change creates a new session."""
    project_path, change_id = change_dir
    response = client.post(
        "/api/agents/execute",
        json={
            "change_id": change_id,
            "project_path": str(project_path),
        },
    )
    assert response.status_code == 200

    data = response.json()
    assert "session_id" in data
    assert data["status"] == "pending"
    assert change_id in data["message"]


def test_execute_change_not_found(client: TestClient):
    """Test executing a non-existent change."""
    response = client.post(
        "/api/agents/execute",
        json={"change_id": "nonexistent-change"},
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_list_sessions_empty(client: TestClient):
    """Test listing sessions when none exist."""
    response = client.get("/api/agents/sessions")
    assert response.status_code == 200
    assert response.json() == []


def test_list_sessions_after_create(client: TestClient, change_dir):
    """Test listing sessions after creating one."""
    project_path, change_id = change_dir

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={
            "change_id": change_id,
            "project_path": str(project_path),
        },
    )
    session_id = create_response.json()["session_id"]

    # List sessions
    response = client.get("/api/agents/sessions")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 1
    assert data[0]["session_id"] == session_id
    assert data[0]["change_id"] == change_id


def test_get_session(client: TestClient, change_dir):
    """Test getting a specific session."""
    project_path, change_id = change_dir

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={
            "change_id": change_id,
            "project_path": str(project_path),
        },
    )
    session_id = create_response.json()["session_id"]

    # Get the session
    response = client.get(f"/api/agents/sessions/{session_id}")
    assert response.status_code == 200

    data = response.json()
    assert data["session_id"] == session_id
    assert data["change_id"] == change_id


def test_get_session_not_found(client: TestClient):
    """Test getting a non-existent session."""
    response = client.get("/api/agents/sessions/nonexistent-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_stop_session(client: TestClient, change_dir):
    """Test stopping a session."""
    project_path, change_id = change_dir

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={
            "change_id": change_id,
            "project_path": str(project_path),
        },
    )
    session_id = create_response.json()["session_id"]

    # Set status to running to allow stop
    engine = get_engine()
    state = engine.get_session(session_id)
    from zyflow_agents.execution import ExecutionStatus
    state.status = ExecutionStatus.RUNNING

    # Stop the session
    response = client.post(f"/api/agents/sessions/{session_id}/stop")
    assert response.status_code == 200
    assert response.json()["message"] == "Session stopped"


def test_stop_session_not_found(client: TestClient):
    """Test stopping a non-existent session."""
    response = client.post("/api/agents/sessions/nonexistent/stop")
    assert response.status_code == 404


def test_delete_session(client: TestClient, change_dir):
    """Test deleting a session."""
    project_path, change_id = change_dir

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={
            "change_id": change_id,
            "project_path": str(project_path),
        },
    )
    session_id = create_response.json()["session_id"]

    # Wait a moment for the session to be created
    import time
    time.sleep(0.1)

    # Set status to stopped to allow delete
    engine = get_engine()
    state = engine.get_session(session_id)
    from zyflow_agents.execution import ExecutionStatus
    state.status = ExecutionStatus.STOPPED

    # Delete the session
    response = client.delete(f"/api/agents/sessions/{session_id}")
    assert response.status_code == 200

    # Verify session is gone
    get_response = client.get(f"/api/agents/sessions/{session_id}")
    assert get_response.status_code == 404


def test_delete_session_not_found(client: TestClient):
    """Test deleting a non-existent session."""
    response = client.delete("/api/agents/sessions/nonexistent")
    assert response.status_code == 404


def test_get_session_logs(client: TestClient, change_dir):
    """Test getting session logs."""
    project_path, change_id = change_dir

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={
            "change_id": change_id,
            "project_path": str(project_path),
        },
    )
    session_id = create_response.json()["session_id"]

    # Get logs
    response = client.get(f"/api/agents/sessions/{session_id}/logs")
    assert response.status_code == 200

    data = response.json()
    assert data["session_id"] == session_id
    assert "results" in data
    assert "total_tasks" in data
    assert "completed_tasks" in data
