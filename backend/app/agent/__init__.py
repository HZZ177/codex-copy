"""Agent runtime package for the kt-agentloop rewrite."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.agent.runner import AgentAssemblyError, AgentRunner
    from backend.app.agent.side_task_model import (
        SideTaskLLM,
        SideTaskModelError,
        create_side_task_llm,
    )

__all__ = [
    "AgentAssemblyError",
    "AgentRunner",
    "SideTaskLLM",
    "SideTaskModelError",
    "create_side_task_llm",
]


def __getattr__(name: str):
    if name in {"AgentAssemblyError", "AgentRunner"}:
        from backend.app.agent.runner import AgentAssemblyError, AgentRunner

        exports = {
            "AgentAssemblyError": AgentAssemblyError,
            "AgentRunner": AgentRunner,
        }
        return exports[name]
    if name in {"SideTaskLLM", "SideTaskModelError", "create_side_task_llm"}:
        from backend.app.agent.side_task_model import (
            SideTaskLLM,
            SideTaskModelError,
            create_side_task_llm,
        )

        exports = {
            "SideTaskLLM": SideTaskLLM,
            "SideTaskModelError": SideTaskModelError,
            "create_side_task_llm": create_side_task_llm,
        }
        return exports[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
