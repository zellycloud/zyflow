"""Tests for OpenSpec parser."""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory

from zyflow_agents.openspec_parser import (
    parse_tasks_file,
    read_proposal,
    read_design,
    read_spec,
    read_tasks,
    OpenSpecContext,
    Task,
    TaskGroup,
    ParsedTasks,
)


SAMPLE_TASKS_MD = """# Tasks: Sample Feature Implementation

## Phase 1: Setup

### 1.1 Project Structure
- [x] Create directory structure
- [x] Initialize package.json
- [ ] Add dependencies

### 1.2 Configuration
- [ ] Create config file
- [ ] Add environment variables

## Phase 2: Implementation

### 2.1 Core Features
- [ ] Implement feature A
- [ ] Implement feature B
- [x] Write tests
"""


def test_parse_tasks_file_basic():
    """Test basic parsing of tasks.md content."""
    result = parse_tasks_file("test-change", SAMPLE_TASKS_MD)

    assert result.change_id == "test-change"
    assert result.title == "Sample Feature Implementation"
    assert len(result.groups) == 4


def test_parse_tasks_file_counts():
    """Test task counting."""
    result = parse_tasks_file("test-change", SAMPLE_TASKS_MD)

    assert result.total_tasks == 8
    assert result.completed_tasks == 3
    assert result.progress == 38  # 3/8 = 37.5% rounded


def test_parse_tasks_file_groups():
    """Test group parsing."""
    result = parse_tasks_file("test-change", SAMPLE_TASKS_MD)

    # Check first group
    group1 = result.groups[0]
    assert group1.title == "1.1 Project Structure"
    assert group1.major_order == 1
    assert group1.sub_order == 1
    assert len(group1.tasks) == 3

    # Check task completion status
    assert group1.tasks[0].completed is True
    assert group1.tasks[1].completed is True
    assert group1.tasks[2].completed is False


def test_parse_tasks_file_task_details():
    """Test individual task details."""
    result = parse_tasks_file("test-change", SAMPLE_TASKS_MD)

    task = result.groups[0].tasks[0]
    assert task.title == "Create directory structure"
    assert task.completed is True
    assert task.line_number > 0
    assert task.group_id == "group-1"


def test_parse_tasks_file_empty():
    """Test parsing empty content."""
    result = parse_tasks_file("empty-change", "")

    assert result.change_id == "empty-change"
    assert result.total_tasks == 0
    assert result.progress == 0


def test_parse_tasks_file_no_tasks():
    """Test parsing content with headers but no tasks."""
    content = """# Tasks: No Tasks Yet

## Phase 1: Planning

### 1.1 Research
No tasks defined yet.
"""
    result = parse_tasks_file("no-tasks", content)

    assert result.total_tasks == 0
    assert len(result.groups) == 1


class TestFileReading:
    """Tests for file reading functions."""

    def test_read_proposal(self):
        """Test reading proposal.md."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir)
            proposal_content = "# Change: Test\n\nThis is a proposal."
            (change_dir / "proposal.md").write_text(proposal_content)

            result = read_proposal(change_dir)
            assert result == proposal_content

    def test_read_proposal_not_found(self):
        """Test reading non-existent proposal.md."""
        with TemporaryDirectory() as tmpdir:
            result = read_proposal(Path(tmpdir))
            assert result is None

    def test_read_design(self):
        """Test reading design.md."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir)
            design_content = "# Design\n\nArchitecture details."
            (change_dir / "design.md").write_text(design_content)

            result = read_design(change_dir)
            assert result == design_content

    def test_read_spec(self):
        """Test reading spec.md from specs directory."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir)
            specs_dir = change_dir / "specs" / "my-spec"
            specs_dir.mkdir(parents=True)
            spec_content = "# Spec: My Spec\n\nRequirements here."
            (specs_dir / "spec.md").write_text(spec_content)

            result = read_spec(change_dir)
            assert result == spec_content

    def test_read_tasks(self):
        """Test reading tasks.md."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir)
            (change_dir / "tasks.md").write_text(SAMPLE_TASKS_MD)

            result = read_tasks(change_dir)
            assert result == SAMPLE_TASKS_MD


class TestOpenSpecContext:
    """Tests for OpenSpecContext class."""

    def test_load_full_context(self):
        """Test loading complete OpenSpec context."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir) / "test-change"
            change_dir.mkdir()

            # Create all files
            (change_dir / "proposal.md").write_text("# Proposal")
            (change_dir / "design.md").write_text("# Design")
            (change_dir / "tasks.md").write_text(SAMPLE_TASKS_MD)

            specs_dir = change_dir / "specs" / "test-spec"
            specs_dir.mkdir(parents=True)
            (specs_dir / "spec.md").write_text("# Spec")

            context = OpenSpecContext.load(change_dir)

            assert context.change_id == "test-change"
            assert context.proposal == "# Proposal"
            assert context.design == "# Design"
            assert context.spec == "# Spec"
            assert context.tasks is not None
            assert context.tasks.total_tasks == 8

    def test_load_partial_context(self):
        """Test loading partial OpenSpec context (missing some files)."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir) / "partial-change"
            change_dir.mkdir()

            # Only create proposal
            (change_dir / "proposal.md").write_text("# Proposal Only")

            context = OpenSpecContext.load(change_dir)

            assert context.proposal == "# Proposal Only"
            assert context.design is None
            assert context.spec is None
            assert context.tasks is None

    def test_get_system_prompt_addition(self):
        """Test generating system prompt addition."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir) / "prompt-test"
            change_dir.mkdir()

            (change_dir / "proposal.md").write_text("Proposal content")
            (change_dir / "tasks.md").write_text(SAMPLE_TASKS_MD)

            context = OpenSpecContext.load(change_dir)
            prompt = context.get_system_prompt_addition()

            assert "# OpenSpec Context: prompt-test" in prompt
            assert "## Proposal" in prompt
            assert "Proposal content" in prompt
            assert "## Current Tasks" in prompt
            assert "Progress: 38%" in prompt

    def test_get_pending_tasks(self):
        """Test getting pending tasks."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir) / "pending-test"
            change_dir.mkdir()
            (change_dir / "tasks.md").write_text(SAMPLE_TASKS_MD)

            context = OpenSpecContext.load(change_dir)
            pending = context.get_pending_tasks()

            assert len(pending) == 5  # 8 total - 3 completed
            assert all(not t.completed for t in pending)

    def test_get_pending_tasks_no_tasks(self):
        """Test getting pending tasks when no tasks file exists."""
        with TemporaryDirectory() as tmpdir:
            change_dir = Path(tmpdir) / "no-tasks"
            change_dir.mkdir()

            context = OpenSpecContext.load(change_dir)
            pending = context.get_pending_tasks()

            assert pending == []
