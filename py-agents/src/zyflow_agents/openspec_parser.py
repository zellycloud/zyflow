"""OpenSpec parser for tasks.md and other OpenSpec files.

순서 기반 displayId를 사용하여 안정적인 넘버링 제공.
tasks.md의 명시적 넘버링(task-1-1 등)은 무시하고,
순서 기반으로 displayId를 자동 생성 (1.1.1, 1.1.2, ...).
"""

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
    display_id: str = ""  # 표시용 ID (예: "1.1.1") - 순서 기반 자동 생성


@dataclass
class TaskGroup:
    """A group of tasks (e.g., ### 1.1 Section Title)."""

    id: str
    title: str
    tasks: list[Task] = field(default_factory=list)
    major_order: int = 1
    major_title: str = ""
    sub_order: int = 1
    display_id: str = ""  # 표시용 그룹 ID (예: "1.1")
    phase_index: int = 0  # Phase 내 순서 (0-based)
    group_index: int = 0  # 전체 그룹 순서 (0-based)


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

    핵심 원칙:
    1. tasks.md의 명시적 넘버링(task-1-1 등)은 무시
    2. 순서 기반으로 displayId 자동 생성 (1.1.1, 1.1.2, ...)
    3. lineNumber는 파일 참조용으로만 사용

    Args:
        change_id: The change ID (directory name)
        content: Raw content of tasks.md

    Returns:
        ParsedTasks object with parsed groups and tasks
    """
    lines = content.split("\n")
    result = ParsedTasks(change_id=change_id, title=change_id)

    # 정규식 패턴
    patterns = {
        # Phase/Major 섹션
        "major_sections": [
            re.compile(r"^##\s+Phase\s+(\d+)[:.]?\s*(.*)$", re.IGNORECASE),
            re.compile(r"^##\s+(\d+)\.\s*(.+)$"),
            re.compile(r"^##\s+(.+)$"),
        ],
        # 서브섹션
        "subsections": [
            re.compile(r"^#{3,4}\s+[\d.]+\s+(.+)$"),  # 숫자 무시하고 제목만
            re.compile(r"^#{3,4}\s+(.+)$"),
        ],
        # 태스크
        "tasks": [
            re.compile(r"^(\s*)-\s+\[([ xX])\]\s*(?:task-[\d-]+:\s*)?(.+)$"),  # task-X-X: 프리픽스 무시
            re.compile(r"^(\s*)-\s+\[([ xX])\]\s*[\d.]+\s+(.+)$"),  # 숫자 프리픽스 무시
            re.compile(r"^(\s*)-\s+\[([ xX])\]\s*(.+)$"),  # 일반 태스크
        ],
    }

    # 1단계: 원시 파싱 (그룹과 태스크 수집)
    raw_groups: list[TaskGroup] = []
    current_group: Optional[TaskGroup] = None

    for line_num, line in enumerate(lines, start=1):
        matched = False

        # Title (# Tasks: ...)
        title_match = re.match(r"^#\s+(?:Tasks:\s+)?(.+)$", line)
        if title_match:
            result.title = title_match.group(1).strip()
            continue

        # 메인 섹션(Phase) 확인
        for pattern in patterns["major_sections"]:
            match = pattern.match(line)
            if match:
                if current_group:
                    raw_groups.append(current_group)

                # Phase 제목 추출 (숫자는 무시)
                if match.lastindex and match.lastindex >= 2:
                    title = match.group(2).strip() if match.group(2) else line.replace("## ", "").strip()
                else:
                    title = match.group(1).strip() if match.group(1) else ""

                current_group = TaskGroup(
                    id="",  # 나중에 설정
                    title=title,
                    major_title=title,
                )
                matched = True
                break

        if matched:
            continue

        # 서브섹션 확인
        if line.startswith("###") or line.startswith("####"):
            for pattern in patterns["subsections"]:
                match = pattern.match(line)
                if match:
                    if current_group:
                        raw_groups.append(current_group)

                    title = match.group(1).strip() if match.group(1) else ""
                    parent_major_title = current_group.major_title if current_group else title

                    current_group = TaskGroup(
                        id="",  # 나중에 설정
                        title=title,
                        major_title=parent_major_title,
                    )
                    matched = True
                    break

        if matched:
            continue

        # 태스크 확인
        if current_group:
            for pattern in patterns["tasks"]:
                match = pattern.match(line)
                if match:
                    indent = len(match.group(1)) if match.group(1) else 0
                    completed = match.group(2).lower() == "x"
                    task_title = match.group(3).strip() if match.group(3) else ""

                    if task_title:
                        task = Task(
                            id="",  # 나중에 설정
                            title=task_title,
                            completed=completed,
                            line_number=line_num,
                            group_id="",  # 나중에 설정
                            indent=indent,
                        )
                        current_group.tasks.append(task)
                        matched = True
                        break

    # 마지막 그룹 저장
    if current_group:
        raw_groups.append(current_group)

    # 2단계: 태스크가 있는 그룹만 필터링
    groups_with_tasks = [g for g in raw_groups if g.tasks]

    # Phase 그룹화 (major_title 기준)
    phase_map: dict[str, dict] = {}
    phase_index = 0

    for group in groups_with_tasks:
        phase_name = group.major_title or "Default"
        if phase_name not in phase_map:
            phase_map[phase_name] = {"groups": [], "index": phase_index}
            phase_index += 1
        phase_map[phase_name]["groups"].append(group)

    # 3단계: displayId 할당
    global_group_index = 0

    for phase_name, phase_data in phase_map.items():
        phase_groups = phase_data["groups"]
        p_index = phase_data["index"]

        for g_index, group in enumerate(phase_groups):
            global_group_index += 1

            # 그룹 displayId: Phase.Group (1.1, 1.2, 2.1, ...)
            group_display_id = f"{p_index + 1}.{g_index + 1}"

            group.id = f"group-{global_group_index}"
            group.display_id = group_display_id
            group.phase_index = p_index
            group.group_index = g_index
            group.major_order = p_index + 1
            group.sub_order = g_index + 1

            # 태스크 displayId 할당
            for t_index, task in enumerate(group.tasks):
                # 태스크 displayId: Phase.Group.Task (1.1.1, 1.1.2, ...)
                task_display_id = f"{group_display_id}.{t_index + 1}"

                task.id = f"task-{global_group_index}-{t_index + 1}"
                task.display_id = task_display_id
                task.group_id = group.id

            result.groups.append(group)

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
                # displayId 사용
                parts.append(f"### {group.display_id} {group.title}\n")
                for task in group.tasks:
                    status = "[x]" if task.completed else "[ ]"
                    parts.append(f"- {status} {task.display_id} {task.title}\n")
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
