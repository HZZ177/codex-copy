from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ToolCallRequest
from langchain_core.messages import ToolMessage
from langgraph.types import Command

from backend.app.agent.middleware.common import ToolCallLimitExceededError
from backend.app.core.logger import logger


class ToolCallLimitMiddleware(AgentMiddleware):
    """限制单轮对话中的工具调用总次数。"""

    def __init__(self, *, max_tool_calls: int) -> None:
        if max_tool_calls < 1:
            raise ValueError("max_tool_calls must be greater than or equal to 1")
        self.max_tool_calls = max_tool_calls
        self.tool_call_count = 0

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        self.tool_call_count += 1
        if self.tool_call_count > self.max_tool_calls:
            tool_call = request.tool_call or {}
            logger.warning(
                f"[AgentMiddleware] 工具调用达到本轮上限 | "
                f"上限={self.max_tool_calls} | 当前次数={self.tool_call_count} | "
                f"工具={tool_call.get('name') or '未知工具'}"
            )
            raise ToolCallLimitExceededError(
                max_tool_calls=self.max_tool_calls,
                attempted_count=self.tool_call_count,
            )
        return await handler(request)
