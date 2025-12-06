"""Tests for the FastAPI server."""

import pytest
from fastapi.testclient import TestClient

from zyflow_agents.server import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
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


def test_execute_change_creates_session(client: TestClient):
    """Test that executing a change creates a new session."""
    response = client.post(
        "/api/agents/execute",
        json={"change_id": "test-change", "cli_profile": "claude"},
    )
    assert response.status_code == 200

    data = response.json()
    assert "session_id" in data
    assert data["status"] == "pending"
    assert "test-change" in data["message"]


def test_list_sessions_empty(client: TestClient):
    """Test listing sessions when none exist."""
    # Use a fresh client to avoid state from other tests
    fresh_client = TestClient(app)
    # Clear sessions (this is a simple in-memory store)
    from zyflow_agents.server import sessions
    sessions.clear()

    response = fresh_client.get("/api/agents/sessions")
    assert response.status_code == 200
    assert response.json() == []


def test_list_sessions_after_create(client: TestClient):
    """Test listing sessions after creating one."""
    from zyflow_agents.server import sessions
    sessions.clear()

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={"change_id": "list-test-change"},
    )
    session_id = create_response.json()["session_id"]

    # List sessions
    response = client.get("/api/agents/sessions")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 1
    assert data[0]["session_id"] == session_id
    assert data[0]["change_id"] == "list-test-change"


def test_get_session(client: TestClient):
    """Test getting a specific session."""
    from zyflow_agents.server import sessions
    sessions.clear()

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={"change_id": "get-test-change"},
    )
    session_id = create_response.json()["session_id"]

    # Get the session
    response = client.get(f"/api/agents/sessions/{session_id}")
    assert response.status_code == 200

    data = response.json()
    assert data["session_id"] == session_id
    assert data["change_id"] == "get-test-change"
    assert data["status"] == "pending"


def test_get_session_not_found(client: TestClient):
    """Test getting a non-existent session."""
    response = client.get("/api/agents/sessions/nonexistent-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_stop_session(client: TestClient):
    """Test stopping a session."""
    from zyflow_agents.server import sessions
    sessions.clear()

    # Create a session
    create_response = client.post(
        "/api/agents/execute",
        json={"change_id": "stop-test-change"},
    )
    session_id = create_response.json()["session_id"]

    # Stop the session
    response = client.post(f"/api/agents/sessions/{session_id}/stop")
    assert response.status_code == 200

    # Verify status changed
    get_response = client.get(f"/api/agents/sessions/{session_id}")
    assert get_response.json()["status"] == "stopped"


def test_resume_session(client: TestClient):
    """Test resuming a stopped session."""
    from zyflow_agents.server import sessions
    sessions.clear()

    # Create and stop a session
    create_response = client.post(
        "/api/agents/execute",
        json={"change_id": "resume-test-change"},
    )
    session_id = create_response.json()["session_id"]
    client.post(f"/api/agents/sessions/{session_id}/stop")

    # Resume the session
    response = client.post(f"/api/agents/sessions/{session_id}/resume")
    assert response.status_code == 200

    # Verify status changed
    get_response = client.get(f"/api/agents/sessions/{session_id}")
    assert get_response.json()["status"] == "running"


def test_delete_session(client: TestClient):
    """Test deleting a session."""
    from zyflow_agents.server import sessions
    sessions.clear()

    # Create and stop a session (can't delete running sessions)
    create_response = client.post(
        "/api/agents/execute",
        json={"change_id": "delete-test-change"},
    )
    session_id = create_response.json()["session_id"]
    client.post(f"/api/agents/sessions/{session_id}/stop")

    # Delete the session
    response = client.delete(f"/api/agents/sessions/{session_id}")
    assert response.status_code == 200

    # Verify session is gone
    get_response = client.get(f"/api/agents/sessions/{session_id}")
    assert get_response.status_code == 404
