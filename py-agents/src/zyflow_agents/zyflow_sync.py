"""ZyFlow synchronization utilities for task status updates."""

import re
from pathlib import Path
from typing import Optional

import httpx


class ZyFlowSyncError(Exception):
    """Error during ZyFlow synchronization."""

    pass


class ZyFlowClient:
    """Client for ZyFlow API communication."""

    def __init__(self, base_url: str = "http://localhost:3000"):
        """Initialize the client.

        Args:
            base_url: Base URL of ZyFlow API server
        """
        self.base_url = base_url.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=30.0,
            )
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def mark_task_complete(
        self,
        change_id: str,
        task_id: str,
    ) -> bool:
        """Mark a task as complete via ZyFlow API.

        Args:
            change_id: The change ID
            task_id: The task ID to mark complete

        Returns:
            True if successful
        """
        client = await self._get_client()
        try:
            response = await client.patch(
                f"/api/tasks/{change_id}/{task_id}",
            )
            response.raise_for_status()
            return True
        except httpx.HTTPError as e:
            raise ZyFlowSyncError(f"Failed to mark task complete: {e}") from e

    async def sync_change(self, change_id: str) -> dict:
        """Trigger sync for a specific change.

        Args:
            change_id: The change ID to sync

        Returns:
            Sync result
        """
        client = await self._get_client()
        try:
            response = await client.post(
                f"/api/flow/changes/{change_id}/sync",
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise ZyFlowSyncError(f"Failed to sync change: {e}") from e

    async def get_change_tasks(self, change_id: str) -> dict:
        """Get tasks for a change.

        Args:
            change_id: The change ID

        Returns:
            Tasks data
        """
        client = await self._get_client()
        try:
            response = await client.get(
                f"/api/changes/{change_id}/tasks",
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise ZyFlowSyncError(f"Failed to get change tasks: {e}") from e


def update_tasks_file(
    tasks_path: Path,
    task_title: str,
    completed: bool = True,
) -> bool:
    """Update a task's completion status in tasks.md file.

    Args:
        tasks_path: Path to tasks.md file
        task_title: Title of the task to update
        completed: Whether to mark as completed

    Returns:
        True if task was found and updated
    """
    if not tasks_path.exists():
        raise ZyFlowSyncError(f"Tasks file not found: {tasks_path}")

    content = tasks_path.read_text(encoding="utf-8")
    lines = content.split("\n")

    # Escape special regex characters in task title
    escaped_title = re.escape(task_title)

    # Pattern to match task line
    pattern = rf"^(\s*)-\s+\[([ xX])\]\s+{escaped_title}\s*$"

    updated = False
    for i, line in enumerate(lines):
        match = re.match(pattern, line)
        if match:
            indent = match.group(1)
            checkbox = "x" if completed else " "
            lines[i] = f"{indent}- [{checkbox}] {task_title}"
            updated = True
            break

    if updated:
        tasks_path.write_text("\n".join(lines), encoding="utf-8")

    return updated


def update_tasks_file_by_line(
    tasks_path: Path,
    line_number: int,
    completed: bool = True,
) -> bool:
    """Update a task's completion status by line number.

    Args:
        tasks_path: Path to tasks.md file
        line_number: Line number of the task (1-indexed)
        completed: Whether to mark as completed

    Returns:
        True if task was updated
    """
    if not tasks_path.exists():
        raise ZyFlowSyncError(f"Tasks file not found: {tasks_path}")

    content = tasks_path.read_text(encoding="utf-8")
    lines = content.split("\n")

    # Convert to 0-indexed
    idx = line_number - 1
    if idx < 0 or idx >= len(lines):
        return False

    line = lines[idx]

    # Check if it's a task line
    match = re.match(r"^(\s*)-\s+\[([ xX])\]\s+(.+)$", line)
    if not match:
        return False

    indent = match.group(1)
    task_title = match.group(3)
    checkbox = "x" if completed else " "

    lines[idx] = f"{indent}- [{checkbox}] {task_title}"
    tasks_path.write_text("\n".join(lines), encoding="utf-8")

    return True


class TaskSynchronizer:
    """Synchronizer for keeping ZyFlow and tasks.md in sync."""

    def __init__(
        self,
        project_path: Path,
        change_id: str,
        zyflow_client: Optional[ZyFlowClient] = None,
    ):
        """Initialize the synchronizer.

        Args:
            project_path: Path to the project root
            change_id: The change ID
            zyflow_client: Optional ZyFlow API client
        """
        self.project_path = Path(project_path)
        self.change_id = change_id
        self.zyflow_client = zyflow_client or ZyFlowClient()
        self.tasks_path = (
            self.project_path / "openspec" / "changes" / change_id / "tasks.md"
        )

    async def mark_complete(
        self,
        task_title: str,
        line_number: Optional[int] = None,
        sync_api: bool = True,
        max_retries: int = 3,
    ) -> bool:
        """Mark a task as complete in both file and API.

        Args:
            task_title: Title of the task
            line_number: Optional line number for precise update
            sync_api: Whether to also sync via API
            max_retries: Maximum retry attempts for API calls

        Returns:
            True if successful
        """
        # Update file first (primary source of truth)
        if line_number:
            file_updated = update_tasks_file_by_line(
                self.tasks_path, line_number, completed=True
            )
        else:
            file_updated = update_tasks_file(
                self.tasks_path, task_title, completed=True
            )

        if not file_updated:
            raise ZyFlowSyncError(f"Failed to update task in file: {task_title}")

        # Sync via API with retries
        if sync_api:
            last_error = None
            for attempt in range(max_retries):
                try:
                    await self.zyflow_client.sync_change(self.change_id)
                    return True
                except ZyFlowSyncError as e:
                    last_error = e
                    if attempt < max_retries - 1:
                        # Wait before retry (exponential backoff)
                        import asyncio
                        await asyncio.sleep(2 ** attempt)

            # Log warning but don't fail - file is already updated
            print(f"Warning: API sync failed after {max_retries} attempts: {last_error}")

        return file_updated

    async def mark_incomplete(
        self,
        task_title: str,
        line_number: Optional[int] = None,
        sync_api: bool = True,
    ) -> bool:
        """Mark a task as incomplete.

        Args:
            task_title: Title of the task
            line_number: Optional line number for precise update
            sync_api: Whether to also sync via API

        Returns:
            True if successful
        """
        if line_number:
            file_updated = update_tasks_file_by_line(
                self.tasks_path, line_number, completed=False
            )
        else:
            file_updated = update_tasks_file(
                self.tasks_path, task_title, completed=False
            )

        if sync_api and file_updated:
            try:
                await self.zyflow_client.sync_change(self.change_id)
            except ZyFlowSyncError:
                pass  # File is already updated

        return file_updated

    async def close(self):
        """Close the synchronizer and its client."""
        await self.zyflow_client.close()
