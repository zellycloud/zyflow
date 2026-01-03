"""OpenSpec middleware for agent execution."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from ..openspec_parser import OpenSpecContext, Task
from ..zyflow_sync import TaskSynchronizer, ZyFlowClient


@dataclass
class TodoItem:
    """A todo item for the agent."""

    id: str
    title: str
    completed: bool
    group_title: str
    line_number: int


@dataclass
class OpenSpecMiddlewareConfig:
    """Configuration for OpenSpec middleware."""

    project_path: str
    change_id: str
    zyflow_api_url: str = "http://localhost:3000"
    sync_on_complete: bool = True
    include_proposal: bool = True
    include_design: bool = True
    include_spec: bool = True


class OpenSpecMiddleware:
    """Middleware for injecting OpenSpec context into agent execution."""

    def __init__(self, config: OpenSpecMiddlewareConfig):
        """Initialize the middleware.

        Args:
            config: Middleware configuration
        """
        self.config = config
        self.project_path = Path(config.project_path)
        self.change_dir = self.project_path / "openspec" / "changes" / config.change_id
        self._context: Optional[OpenSpecContext] = None
        self._synchronizer: Optional[TaskSynchronizer] = None
        self._on_task_complete_callbacks: list[Callable[[Task], None]] = []

    def _ensure_context(self) -> OpenSpecContext:
        """Load OpenSpec context if not already loaded."""
        if self._context is None:
            self._context = OpenSpecContext.load(self.change_dir)
        return self._context

    def _ensure_synchronizer(self) -> TaskSynchronizer:
        """Create synchronizer if not already created."""
        if self._synchronizer is None:
            client = ZyFlowClient(self.config.zyflow_api_url)
            self._synchronizer = TaskSynchronizer(
                self.project_path,
                self.config.change_id,
                client,
            )
        return self._synchronizer

    def get_system_prompt_addition(self) -> str:
        """Generate system prompt addition with OpenSpec context.

        Returns:
            Formatted string to add to system prompt
        """
        context = self._ensure_context()

        parts = [
            "# OpenSpec Context",
            "",
            f"You are working on change: **{context.change_id}**",
            "",
        ]

        if self.config.include_proposal and context.proposal:
            parts.extend([
                "## Proposal",
                "",
                context.proposal,
                "",
            ])

        if self.config.include_design and context.design:
            parts.extend([
                "## Design",
                "",
                context.design,
                "",
            ])

        if self.config.include_spec and context.spec:
            parts.extend([
                "## Spec",
                "",
                context.spec,
                "",
            ])

        if context.tasks:
            parts.extend([
                "## Current Progress",
                "",
                f"- Total tasks: {context.tasks.total_tasks}",
                f"- Completed: {context.tasks.completed_tasks}",
                f"- Progress: {context.tasks.progress}%",
                "",
            ])

        parts.extend([
            "## Instructions",
            "",
            "1. Complete tasks in order as listed in the todo list",
            "2. Mark tasks as complete using the provided tools",
            "3. Follow the design and spec requirements",
            "4. Write clean, maintainable code",
            "5. Add tests for new functionality",
            "",
        ])

        return "\n".join(parts)

    def get_initial_todos(self) -> list[TodoItem]:
        """Get initial todo list from tasks.md.

        Returns:
            List of TodoItem objects
        """
        context = self._ensure_context()
        todos: list[TodoItem] = []

        if not context.tasks:
            return todos

        for group in context.tasks.groups:
            for task in group.tasks:
                todos.append(TodoItem(
                    id=task.id,
                    title=task.title,
                    completed=task.completed,
                    group_title=group.title,
                    line_number=task.line_number,
                ))

        return todos

    def get_pending_todos(self) -> list[TodoItem]:
        """Get only pending (uncompleted) todos.

        Returns:
            List of uncompleted TodoItem objects
        """
        return [t for t in self.get_initial_todos() if not t.completed]

    def get_next_todo(self) -> Optional[TodoItem]:
        """Get the next pending todo.

        Returns:
            Next TodoItem or None if all completed
        """
        pending = self.get_pending_todos()
        return pending[0] if pending else None

    async def on_task_complete(self, task_title: str, line_number: Optional[int] = None) -> bool:
        """Handle task completion.

        Args:
            task_title: Title of the completed task
            line_number: Optional line number for precise update

        Returns:
            True if sync was successful
        """
        if not self.config.sync_on_complete:
            return True

        synchronizer = self._ensure_synchronizer()

        try:
            result = await synchronizer.mark_complete(
                task_title,
                line_number=line_number,
                sync_api=True,
            )

            # Reload context to reflect changes
            self._context = None

            # Call registered callbacks
            for callback in self._on_task_complete_callbacks:
                try:
                    # Find the task object
                    context = self._ensure_context()
                    if context.tasks:
                        for group in context.tasks.groups:
                            for task in group.tasks:
                                if task.title == task_title:
                                    callback(task)
                                    break
                except Exception:
                    pass

            return result
        except Exception as e:
            print(f"Warning: Failed to sync task completion: {e}")
            return False

    def register_on_complete_callback(self, callback: Callable[[Task], None]):
        """Register a callback for task completion.

        Args:
            callback: Function to call when a task is completed
        """
        self._on_task_complete_callbacks.append(callback)

    async def close(self):
        """Close the middleware and release resources."""
        if self._synchronizer:
            await self._synchronizer.close()

    def to_dict(self) -> dict[str, Any]:
        """Convert middleware state to dictionary.

        Returns:
            Dictionary representation
        """
        context = self._ensure_context()
        return {
            "change_id": self.config.change_id,
            "project_path": str(self.project_path),
            "total_tasks": context.tasks.total_tasks if context.tasks else 0,
            "completed_tasks": context.tasks.completed_tasks if context.tasks else 0,
            "progress": context.tasks.progress if context.tasks else 0,
            "has_proposal": context.proposal is not None,
            "has_design": context.design is not None,
            "has_spec": context.spec is not None,
        }


def create_openspec_middleware(
    project_path: str,
    change_id: str,
    **kwargs,
) -> OpenSpecMiddleware:
    """Create an OpenSpec middleware instance.

    Args:
        project_path: Path to the project root
        change_id: The change ID to work on
        **kwargs: Additional configuration options

    Returns:
        Configured OpenSpecMiddleware instance
    """
    config = OpenSpecMiddlewareConfig(
        project_path=project_path,
        change_id=change_id,
        **kwargs,
    )
    return OpenSpecMiddleware(config)
