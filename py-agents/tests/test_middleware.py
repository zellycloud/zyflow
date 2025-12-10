"""Tests for OpenSpec middleware."""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory

from zyflow_agents.middleware.openspec import (
    OpenSpecMiddleware,
    OpenSpecMiddlewareConfig,
    create_openspec_middleware,
    TodoItem,
)


SAMPLE_PROPOSAL = """# Change: Test Feature

## Summary
Adding a test feature.

## Motivation
We need this feature.
"""

SAMPLE_DESIGN = """# Design

## Architecture
Simple design.
"""

SAMPLE_TASKS = """# Tasks: Test Feature

## Phase 1: Setup

### 1.1 Initial Setup
- [x] Create project structure
- [ ] Add configuration
- [ ] Write tests
"""


@pytest.fixture
def change_dir():
    """Create a temporary change directory with sample files."""
    with TemporaryDirectory() as tmpdir:
        project_path = Path(tmpdir)
        change_dir = project_path / "openspec" / "changes" / "test-change"
        change_dir.mkdir(parents=True)

        (change_dir / "proposal.md").write_text(SAMPLE_PROPOSAL)
        (change_dir / "design.md").write_text(SAMPLE_DESIGN)
        (change_dir / "tasks.md").write_text(SAMPLE_TASKS)

        yield project_path, "test-change"


def test_create_middleware(change_dir):
    """Test creating middleware instance."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(str(project_path), change_id)

    assert middleware.config.change_id == change_id
    assert middleware.config.project_path == str(project_path)


def test_get_system_prompt_addition(change_dir):
    """Test generating system prompt addition."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(str(project_path), change_id)

    prompt = middleware.get_system_prompt_addition()

    assert "# OpenSpec Context" in prompt
    assert "test-change" in prompt
    assert "## Proposal" in prompt
    assert "## Design" in prompt
    assert "## Current Progress" in prompt
    assert "Total tasks: 3" in prompt


def test_get_system_prompt_without_proposal(change_dir):
    """Test system prompt without proposal."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(
        str(project_path),
        change_id,
        include_proposal=False,
    )

    prompt = middleware.get_system_prompt_addition()

    assert "## Proposal" not in prompt
    assert "## Design" in prompt


def test_get_initial_todos(change_dir):
    """Test getting initial todo list."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(str(project_path), change_id)

    todos = middleware.get_initial_todos()

    assert len(todos) == 3
    assert todos[0].title == "Create project structure"
    assert todos[0].completed is True
    assert todos[1].title == "Add configuration"
    assert todos[1].completed is False


def test_get_pending_todos(change_dir):
    """Test getting pending todos."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(str(project_path), change_id)

    pending = middleware.get_pending_todos()

    assert len(pending) == 2
    assert all(not t.completed for t in pending)


def test_get_next_todo(change_dir):
    """Test getting next todo."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(str(project_path), change_id)

    next_todo = middleware.get_next_todo()

    assert next_todo is not None
    assert next_todo.title == "Add configuration"
    assert next_todo.completed is False


def test_get_next_todo_all_complete():
    """Test getting next todo when all complete."""
    with TemporaryDirectory() as tmpdir:
        project_path = Path(tmpdir)
        change_dir = project_path / "openspec" / "changes" / "all-complete"
        change_dir.mkdir(parents=True)

        tasks = """# Tasks

## Phase 1

### 1.1 Done
- [x] Task 1
- [x] Task 2
"""
        (change_dir / "tasks.md").write_text(tasks)

        middleware = create_openspec_middleware(str(project_path), "all-complete")
        next_todo = middleware.get_next_todo()

        assert next_todo is None


def test_to_dict(change_dir):
    """Test converting middleware state to dict."""
    project_path, change_id = change_dir
    middleware = create_openspec_middleware(str(project_path), change_id)

    state = middleware.to_dict()

    assert state["change_id"] == change_id
    assert state["total_tasks"] == 3
    assert state["completed_tasks"] == 1
    assert state["progress"] == 33
    assert state["has_proposal"] is True
    assert state["has_design"] is True


def test_middleware_config_defaults():
    """Test middleware config defaults."""
    config = OpenSpecMiddlewareConfig(
        project_path="/test",
        change_id="test-change",
    )

    assert config.zyflow_api_url == "http://localhost:3001"
    assert config.sync_on_complete is True
    assert config.include_proposal is True
    assert config.include_design is True
    assert config.include_spec is True
