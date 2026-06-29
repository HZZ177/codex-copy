from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ToolCallRequest
from langchain_core.messages import ToolMessage
from langgraph.types import Command

from backend.app.agent.middleware.common import DuplicateToolForceStopError, _tool_signature
from backend.app.core.logger import logger


class DuplicateToolCallGuardMiddleware(AgentMiddleware):
    """防止模型使用完全相同参数反复调用同一个工具。"""

    def __init__(self, *, max_repeats: int = 3) -> None:
        self.max_repeats = max(1, max_repeats)
        self._last_signature: str | None = None
        self._repeat_count = 0

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        tool_call = request.tool_call or {}
        tool_name = str(tool_call.get("name") or "")
        signature = _tool_signature(tool_call)
        if signature == self._last_signature:
            self._repeat_count += 1
        else:
            self._last_signature = signature
            self._repeat_count = 1

        if self._repeat_count > self.max_repeats:
            logger.warning(
                f"[AgentMiddleware] 检测到重复工具调用，强制终止 | "
                f"工具={tool_name or '未知工具'} | 重复次数={self._repeat_count}"
            )
            raise DuplicateToolForceStopError(
                tool_name=tool_name or "unknown_tool",
                repeat_count=self._repeat_count,
            )
        return await handler(request)
