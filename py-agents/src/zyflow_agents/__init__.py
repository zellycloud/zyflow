"""ZyFlow Agents - LangGraph + DeepAgents integration for ZyFlow."""

from .agent import (
    AgentConfig,
    ModelType,
    ZyFlowAgent,
    create_agent_from_config,
    create_zyflow_agent,
)
from .execution import (
    ExecutionEngine,
    ExecutionEvent,
    ExecutionResult,
    ExecutionState,
    ExecutionStatus,
    create_engine,
    get_engine,
)
from .middleware.openspec import (
    OpenSpecMiddleware,
    OpenSpecMiddlewareConfig,
    TodoItem,
    create_openspec_middleware,
)
from .openspec_parser import (
    OpenSpecContext,
    ParsedTasks,
    Task,
    TaskGroup,
    parse_tasks_file,
)

__version__ = "0.1.0"

__all__ = [
    # Agent
    "AgentConfig",
    "ModelType",
    "ZyFlowAgent",
    "create_agent_from_config",
    "create_zyflow_agent",
    # Execution
    "ExecutionEngine",
    "ExecutionEvent",
    "ExecutionResult",
    "ExecutionState",
    "ExecutionStatus",
    "create_engine",
    "get_engine",
    # Middleware
    "OpenSpecMiddleware",
    "OpenSpecMiddlewareConfig",
    "TodoItem",
    "create_openspec_middleware",
    # Parser
    "OpenSpecContext",
    "ParsedTasks",
    "Task",
    "TaskGroup",
    "parse_tasks_file",
]
