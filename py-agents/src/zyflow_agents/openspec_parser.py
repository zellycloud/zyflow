"""OpenSpec parser for tasks.md and other OpenSpec files."""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Task:
    """A single task from tasks.md."""

    id: str
    title: str
    completed: bool
    line_number: int
    group_id: str
    indent: int = 0


@dataclass
class TaskGroup:
    """A group of tasks (e.g., ### 1.1 Section Title)."""

    id: str
    title: str
    tasks: list[Task] = field(default_factory=list)
    major_order: int = 1
    major_title: str = ""
    sub_order: int = 1


@dataclass
class ParsedTasks:
    """Parsed tasks.md file."""

    change_id: str
    title: str
    groups: list[TaskGroup] = field(default_factory=list)

    @property
    def total_tasks(self) -> int:
        """Total number of tasks."""
        return sum(len(g.tasks) for g in self.groups)

    @property
    def completed_tasks(self) -> int:
        """Number of completed tasks."""
        return sum(sum(1 for t in g.tasks if t.completed) for g in self.groups)

    @property
    def progress(self) -> int:
        """Progress percentage (0-100)."""
        if self.total_tasks == 0:
            return 0
        return round((self.completed_tasks / self.total_tasks) * 100)


def parse_tasks_file(change_id: str, content: str) -> ParsedTasks:
    """Parse tasks.md content into structured data.

    Args:
        change_id: The change ID (directory name)
        content: Raw content of tasks.md

    Returns:
        ParsedTasks object with parsed groups and tasks
    """
    lines = content.split("\n")
    result = ParsedTasks(change_id=change_id, title=change_id)

    current_major_order = 0
    current_major_title = ""
    current_sub_order = 0
    current_group: Optional[TaskGroup] = None
    group_count = 0

    for line_num, line in enumerate(lines, start=1):
        # Title (# Tasks: ...)
        title_match = re.match(r"^#\s+(?:Tasks:\s+)?(.+)$", line)
        if title_match:
            result.title = title_match.group(1).strip()
            continue

        # Phase header (## Phase N: Title)
        phase_match = re.match(r"^##\s+(?:Phase\s+)?(\d+)[:.]?\s*(.*)$", line)
        if phase_match:
            current_major_order = int(phase_match.group(1))
            current_major_title = phase_match.group(2).strip() or f"Phase {current_major_order}"
            current_sub_order = 0
            continue

        # Subsection header (### N.N Title)
        subsection_match = re.match(r"^###\s+(\d+)\.(\d+)\s+(.+)$", line)
        if subsection_match:
            major = int(subsection_match.group(1))
            sub = int(subsection_match.group(2))
            title = subsection_match.group(3).strip()

            if major != current_major_order:
                current_major_order = major
                current_major_title = f"Phase {major}"

            current_sub_order = sub
            group_count += 1

            current_group = TaskGroup(
                id=f"group-{group_count}",
                title=f"{major}.{sub} {title}",
                major_order=current_major_order,
                major_title=current_major_title,
                sub_order=current_sub_order,
            )
            result.groups.append(current_group)
            continue

        # Task item (- [ ] or - [x])
        task_match = re.match(r"^(\s*)-\s+\[([ xX])\]\s+(.+)$", line)
        if task_match and current_group is not None:
            indent = len(task_match.group(1))
            completed = task_match.group(2).lower() == "x"
            title = task_match.group(3).strip()

            task_num = len(current_group.tasks) + 1
            task_id = f"task-group-{group_count}-{task_num}"

            task = Task(
                id=task_id,
                title=title,
                completed=completed,
                line_number=line_num,
                group_id=current_group.id,
                indent=indent,
            )
            current_group.tasks.append(task)

    return result


def read_proposal(change_dir: Path) -> Optional[str]:
    """Read proposal.md content.

    Args:
        change_dir: Path to the change directory

    Returns:
        Content of proposal.md or None if not found
    """
    proposal_path = change_dir / "proposal.md"
    if proposal_path.exists():
        return proposal_path.read_text(encoding="utf-8")
    return None


def read_design(change_dir: Path) -> Optional[str]:
    """Read design.md content.

    Args:
        change_dir: Path to the change directory

    Returns:
        Content of design.md or None if not found
    """
    design_path = change_dir / "design.md"
    if design_path.exists():
        return design_path.read_text(encoding="utf-8")
    return None


def read_spec(change_dir: Path) -> Optional[str]:
    """Read the first spec.md content from specs/ directory.

    Args:
        change_dir: Path to the change directory

    Returns:
        Content of the first spec.md or None if not found
    """
    specs_dir = change_dir / "specs"
    if not specs_dir.exists():
        return None

    for spec_folder in specs_dir.iterdir():
        if spec_folder.is_dir():
            spec_file = spec_folder / "spec.md"
            if spec_file.exists():
                return spec_file.read_text(encoding="utf-8")

    return None


def read_tasks(change_dir: Path) -> Optional[str]:
    """Read tasks.md content.

    Args:
        change_dir: Path to the change directory

    Returns:
        Content of tasks.md or None if not found
    """
    tasks_path = change_dir / "tasks.md"
    if tasks_path.exists():
        return tasks_path.read_text(encoding="utf-8")
    return None


@dataclass
class OpenSpecContext:
    """Complete OpenSpec context for a change."""

    change_id: str
    change_dir: Path
    proposal: Optional[str] = None
    design: Optional[str] = None
    spec: Optional[str] = None
    tasks: Optional[ParsedTasks] = None

    @classmethod
    def load(cls, change_dir: Path) -> "OpenSpecContext":
        """Load all OpenSpec files from a change directory.

        Args:
            change_dir: Path to the change directory

        Returns:
            OpenSpecContext with all available files loaded
        """
        change_id = change_dir.name

        context = cls(change_id=change_id, change_dir=change_dir)
        context.proposal = read_proposal(change_dir)
        context.design = read_design(change_dir)
        context.spec = read_spec(change_dir)

        tasks_content = read_tasks(change_dir)
        if tasks_content:
            context.tasks = parse_tasks_file(change_id, tasks_content)

        return context

    def get_system_prompt_addition(self) -> str:
        """Generate system prompt addition with OpenSpec context.

        Returns:
            Formatted string to add to system prompt
        """
        parts = [f"# OpenSpec Context: {self.change_id}\n"]

        if self.proposal:
            parts.append("## Proposal\n")
            parts.append(self.proposal)
            parts.append("\n")

        if self.design:
            parts.append("## Design\n")
            parts.append(self.design)
            parts.append("\n")

        if self.spec:
            parts.append("## Spec\n")
            parts.append(self.spec)
            parts.append("\n")

        if self.tasks:
            parts.append("## Current Tasks\n")
            parts.append(f"Progress: {self.tasks.progress}% ({self.tasks.completed_tasks}/{self.tasks.total_tasks})\n\n")
            for group in self.tasks.groups:
                parts.append(f"### {group.title}\n")
                for task in group.tasks:
                    status = "[x]" if task.completed else "[ ]"
                    parts.append(f"- {status} {task.title}\n")
                parts.append("\n")

        return "".join(parts)

    def get_pending_tasks(self) -> list[Task]:
        """Get list of pending (uncompleted) tasks.

        Returns:
            List of uncompleted Task objects
        """
        if not self.tasks:
            return []

        pending = []
        for group in self.tasks.groups:
            for task in group.tasks:
                if not task.completed:
                    pending.append(task)
        return pending
