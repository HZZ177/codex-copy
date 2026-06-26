"""Local desktop tool protocol and registry."""

from backend.app.tools.base import (
    FunctionTool,
    LocalTool,
    ToolDefinitionError,
    ToolExecutionContext,
    ToolExecutionError,
    ToolExecutionResult,
)
from backend.app.tools.factory import create_default_tool_registry
from backend.app.tools.filesystem import create_filesystem_tools, register_filesystem_tools
from backend.app.tools.orchestrator import ToolOrchestrator
from backend.app.tools.patch import create_patch_tools, register_patch_tools
from backend.app.tools.plan import create_plan_tools, register_plan_tools
from backend.app.tools.registry import ToolRegistry, ToolRegistryError
from backend.app.tools.search import create_search_tools, register_search_tools
from backend.app.tools.shell import create_shell_tools, register_shell_tools
from backend.app.tools.skill import LOAD_SKILL_TOOL_NAME, load_skill, run_load_skill

__all__ = [
    "FunctionTool",
    "LOAD_SKILL_TOOL_NAME",
    "LocalTool",
    "ToolDefinitionError",
    "ToolExecutionContext",
    "ToolExecutionError",
    "ToolExecutionResult",
    "ToolOrchestrator",
    "ToolRegistry",
    "ToolRegistryError",
    "create_default_tool_registry",
    "create_filesystem_tools",
    "create_patch_tools",
    "create_plan_tools",
    "create_search_tools",
    "create_shell_tools",
    "load_skill",
    "register_filesystem_tools",
    "register_patch_tools",
    "register_plan_tools",
    "register_search_tools",
    "register_shell_tools",
    "run_load_skill",
]
