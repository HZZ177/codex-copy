"""Agent runtime package for the kt-agentloop rewrite."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.agent.runner import AgentAssemblyError, AgentRunner

__all__ = [
    "AgentAssemblyError",
    "AgentRunner",
]


def __getattr__(name: str):
    if name in {"AgentAssemblyError", "AgentRunner"}:
        from backend.app.agent.runner import AgentAssemblyError, AgentRunner

        exports = {
            "AgentAssemblyError": AgentAssemblyError,
            "AgentRunner": AgentRunner,
        }
        return exports[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
