"""DeepAgent factory for ZyFlow OpenSpec execution."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from .middleware.openspec import OpenSpecMiddleware, create_openspec_middleware
from .openspec_parser import OpenSpecContext


class ModelType(str, Enum):
    """Supported model types."""

    CLAUDE_SONNET = "claude-sonnet"
    CLAUDE_HAIKU = "claude-haiku"
    CLAUDE_OPUS = "claude-opus"


MODEL_IDS = {
    ModelType.CLAUDE_SONNET: "claude-sonnet-4-20250514",
    ModelType.CLAUDE_HAIKU: "claude-haiku-4-20250514",
    ModelType.CLAUDE_OPUS: "claude-opus-4-20250514",
}


@dataclass
class AgentConfig:
    """Configuration for ZyFlow agent."""

    project_path: str
    change_id: str
    model_type: ModelType = ModelType.CLAUDE_SONNET
    temperature: float = 0.0
    max_tokens: int = 4096
    zyflow_api_url: str = "http://localhost:3000"
    include_proposal: bool = True
    include_design: bool = True
    include_spec: bool = True
    sync_on_complete: bool = True
    tools: list[Any] = field(default_factory=list)


class ZyFlowAgent:
    """Agent for executing OpenSpec tasks with LLM."""

    def __init__(
        self,
        config: AgentConfig,
        middleware: OpenSpecMiddleware,
        model: ChatAnthropic,
    ):
        """Initialize the agent.

        Args:
            config: Agent configuration
            middleware: OpenSpec middleware
            model: LLM model instance
        """
        self.config = config
        self.middleware = middleware
        self.model = model
        self._system_prompt: Optional[str] = None
        self._tools: list[Any] = config.tools.copy()
        self._on_task_complete: Optional[Callable] = None

    @property
    def system_prompt(self) -> str:
        """Get the system prompt with OpenSpec context."""
        if self._system_prompt is None:
            base_prompt = """You are an expert software engineer assistant working on a ZyFlow project.

Your job is to complete tasks according to the OpenSpec specification provided below.

## Guidelines
1. Follow the specification exactly as described
2. Complete one task at a time
3. Write clean, maintainable code
4. Add appropriate tests when implementing features
5. Handle errors gracefully
6. Keep code consistent with existing patterns in the codebase

## Task Completion
When you complete a task, clearly indicate which task you've finished.
The system will automatically track your progress.
"""
            openspec_context = self.middleware.get_system_prompt_addition()
            self._system_prompt = f"{base_prompt}\n\n{openspec_context}"
        return self._system_prompt

    def add_tool(self, tool: Any) -> None:
        """Add a tool to the agent.

        Args:
            tool: Tool to add
        """
        self._tools.append(tool)

    def set_tools(self, tools: list[Any]) -> None:
        """Set the agent's tools.

        Args:
            tools: List of tools
        """
        self._tools = tools.copy()

    def on_task_complete(self, callback: Callable) -> None:
        """Set callback for task completion.

        Args:
            callback: Callback function(task_title, task_id)
        """
        self._on_task_complete = callback

    async def execute_task(
        self,
        task_description: str,
        additional_context: Optional[str] = None,
    ) -> str:
        """Execute a single task.

        Args:
            task_description: Description of the task to execute
            additional_context: Optional additional context

        Returns:
            Agent's response/output
        """
        messages = [
            SystemMessage(content=self.system_prompt),
        ]

        user_message = f"Please complete the following task:\n\n{task_description}"
        if additional_context:
            user_message += f"\n\nAdditional context:\n{additional_context}"

        messages.append(HumanMessage(content=user_message))

        # Bind tools if available
        model = self.model
        if self._tools:
            model = model.bind_tools(self._tools)

        # Get response
        response = await model.ainvoke(messages)

        return response.content if isinstance(response.content, str) else str(response.content)

    async def execute_next_task(self) -> Optional[dict]:
        """Execute the next pending task.

        Returns:
            Task result dict or None if no tasks pending
        """
        next_todo = self.middleware.get_next_todo()
        if next_todo is None:
            return None

        # Execute the task
        output = await self.execute_task(next_todo.title)

        # Mark as complete if configured
        if self.config.sync_on_complete:
            await self.middleware.on_task_complete(next_todo.title)

        # Call callback if set
        if self._on_task_complete:
            self._on_task_complete(next_todo.title, next_todo.id)

        return {
            "task_id": next_todo.id,
            "task_title": next_todo.title,
            "output": output,
            "completed": True,
        }

    async def run_all_tasks(self) -> list[dict]:
        """Run all pending tasks sequentially.

        Returns:
            List of task results
        """
        results = []

        while True:
            result = await self.execute_next_task()
            if result is None:
                break
            results.append(result)

        return results

    def get_progress(self) -> dict:
        """Get current progress.

        Returns:
            Progress dict with total, completed, pending counts
        """
        state = self.middleware.to_dict()
        return {
            "total": state["total_tasks"],
            "completed": state["completed_tasks"],
            "pending": state["total_tasks"] - state["completed_tasks"],
            "progress": state["progress"],
        }


def create_zyflow_agent(
    project_path: str,
    change_id: str,
    model_type: ModelType = ModelType.CLAUDE_SONNET,
    temperature: float = 0.0,
    max_tokens: int = 4096,
    zyflow_api_url: str = "http://localhost:3000",
    include_proposal: bool = True,
    include_design: bool = True,
    include_spec: bool = True,
    sync_on_complete: bool = True,
    tools: Optional[list[Any]] = None,
) -> ZyFlowAgent:
    """Create a ZyFlow agent instance.

    Args:
        project_path: Path to the project root
        change_id: OpenSpec change ID
        model_type: Type of model to use
        temperature: Model temperature
        max_tokens: Maximum tokens for response
        zyflow_api_url: ZyFlow API base URL
        include_proposal: Include proposal in context
        include_design: Include design in context
        include_spec: Include spec in context
        sync_on_complete: Sync with ZyFlow on task complete
        tools: Optional list of tools

    Returns:
        Configured ZyFlowAgent instance
    """
    config = AgentConfig(
        project_path=project_path,
        change_id=change_id,
        model_type=model_type,
        temperature=temperature,
        max_tokens=max_tokens,
        zyflow_api_url=zyflow_api_url,
        include_proposal=include_proposal,
        include_design=include_design,
        include_spec=include_spec,
        sync_on_complete=sync_on_complete,
        tools=tools or [],
    )

    # Create middleware
    middleware = create_openspec_middleware(
        project_path=project_path,
        change_id=change_id,
        zyflow_api_url=zyflow_api_url,
        include_proposal=include_proposal,
        include_design=include_design,
        include_spec=include_spec,
        sync_on_complete=sync_on_complete,
    )

    # Create model
    model = ChatAnthropic(
        model=MODEL_IDS[model_type],
        temperature=temperature,
        max_tokens=max_tokens,
    )

    return ZyFlowAgent(config=config, middleware=middleware, model=model)


def create_agent_from_config(config: AgentConfig) -> ZyFlowAgent:
    """Create agent from config object.

    Args:
        config: Agent configuration

    Returns:
        Configured ZyFlowAgent instance
    """
    return create_zyflow_agent(
        project_path=config.project_path,
        change_id=config.change_id,
        model_type=config.model_type,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        zyflow_api_url=config.zyflow_api_url,
        include_proposal=config.include_proposal,
        include_design=config.include_design,
        include_spec=config.include_spec,
        sync_on_complete=config.sync_on_complete,
        tools=config.tools,
    )
