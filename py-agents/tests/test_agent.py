"""Tests for ZyFlow agent factory."""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, MagicMock, patch

from zyflow_agents.agent import (
    AgentConfig,
    ModelType,
    ZyFlowAgent,
    create_zyflow_agent,
    create_agent_from_config,
    MODEL_IDS,
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


def test_model_ids():
    """Test model IDs are defined."""
    assert MODEL_IDS[ModelType.CLAUDE_SONNET] == "claude-sonnet-4-20250514"
    assert MODEL_IDS[ModelType.CLAUDE_HAIKU] == "claude-haiku-4-20250514"
    assert MODEL_IDS[ModelType.CLAUDE_OPUS] == "claude-opus-4-20250514"


def test_agent_config_defaults():
    """Test AgentConfig defaults."""
    config = AgentConfig(
        project_path="/test",
        change_id="test-change",
    )

    assert config.model_type == ModelType.CLAUDE_SONNET
    assert config.temperature == 0.0
    assert config.max_tokens == 4096
    assert config.zyflow_api_url == "http://localhost:3000"
    assert config.include_proposal is True
    assert config.include_design is True
    assert config.include_spec is True
    assert config.sync_on_complete is True
    assert config.tools == []


@patch("zyflow_agents.agent.ChatAnthropic")
def test_create_zyflow_agent(mock_chat, change_dir):
    """Test creating a ZyFlow agent."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    assert isinstance(agent, ZyFlowAgent)
    assert agent.config.change_id == change_id
    mock_chat.assert_called_once()


@patch("zyflow_agents.agent.ChatAnthropic")
def test_create_agent_from_config(mock_chat, change_dir):
    """Test creating agent from config."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    config = AgentConfig(
        project_path=str(project_path),
        change_id=change_id,
        model_type=ModelType.CLAUDE_HAIKU,
        temperature=0.5,
    )

    agent = create_agent_from_config(config)

    assert isinstance(agent, ZyFlowAgent)
    assert agent.config.model_type == ModelType.CLAUDE_HAIKU


@patch("zyflow_agents.agent.ChatAnthropic")
def test_agent_system_prompt(mock_chat, change_dir):
    """Test agent system prompt generation."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    prompt = agent.system_prompt

    assert "expert software engineer" in prompt
    assert "OpenSpec Context" in prompt
    assert "test-change" in prompt


@patch("zyflow_agents.agent.ChatAnthropic")
def test_agent_add_tool(mock_chat, change_dir):
    """Test adding tools to agent."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    mock_tool = MagicMock()
    agent.add_tool(mock_tool)

    assert mock_tool in agent._tools


@patch("zyflow_agents.agent.ChatAnthropic")
def test_agent_set_tools(mock_chat, change_dir):
    """Test setting tools on agent."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    tools = [MagicMock(), MagicMock()]
    agent.set_tools(tools)

    assert len(agent._tools) == 2


@patch("zyflow_agents.agent.ChatAnthropic")
def test_agent_get_progress(mock_chat, change_dir):
    """Test getting agent progress."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    progress = agent.get_progress()

    assert progress["total"] == 2
    assert progress["completed"] == 0
    assert progress["pending"] == 2
    assert progress["progress"] == 0


@patch("zyflow_agents.agent.ChatAnthropic")
def test_agent_on_task_complete_callback(mock_chat, change_dir):
    """Test task completion callback."""
    project_path, change_id = change_dir
    mock_chat.return_value = MagicMock()

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    callback = MagicMock()
    agent.on_task_complete(callback)

    assert agent._on_task_complete == callback


@pytest.mark.asyncio
@patch("zyflow_agents.agent.ChatAnthropic")
async def test_agent_execute_task(mock_chat, change_dir):
    """Test executing a task."""
    project_path, change_id = change_dir

    # Setup mock model
    mock_model = MagicMock()
    mock_response = MagicMock()
    mock_response.content = "Task completed successfully"
    mock_model.ainvoke = AsyncMock(return_value=mock_response)
    mock_chat.return_value = mock_model

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
    )

    result = await agent.execute_task("Test task description")

    assert result == "Task completed successfully"
    mock_model.ainvoke.assert_called_once()


@pytest.mark.asyncio
@patch("zyflow_agents.agent.ChatAnthropic")
async def test_agent_execute_task_with_tools(mock_chat, change_dir):
    """Test executing a task with tools."""
    project_path, change_id = change_dir

    # Setup mock model
    mock_model = MagicMock()
    mock_bound_model = MagicMock()
    mock_response = MagicMock()
    mock_response.content = "Task with tools completed"
    mock_bound_model.ainvoke = AsyncMock(return_value=mock_response)
    mock_model.bind_tools = MagicMock(return_value=mock_bound_model)
    mock_chat.return_value = mock_model

    agent = create_zyflow_agent(
        project_path=str(project_path),
        change_id=change_id,
        tools=[MagicMock()],
    )

    result = await agent.execute_task("Test task")

    assert result == "Task with tools completed"
    mock_model.bind_tools.assert_called_once()
