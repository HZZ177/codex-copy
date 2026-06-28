from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from langchain.agents.middleware import AgentMiddleware, ToolCallRequest
from langchain_core.messages import BaseMessage
from langchain_core.messages import ToolMessage
from langgraph.types import Command

from backend.app.agent.factory import AgentFactory, agent_factory
from backend.app.agent.runtime_settings import (
    AgentRuntimeSettings,
    AutoTitleRuntimeSettings,
    default_agent_runtime_settings,
)
from backend.app.agent.skill_activation_middleware import SkillActivationInjectionMiddleware
from backend.app.agent.tool_call_preset_middleware import ToolCallPresetMiddleware
from backend.app.core.logger import logger
from backend.app.core.request_context import get_active_session_id, get_session_id, get_user_id
from backend.app.events import DomainEventType, EventDispatcher
from backend.app.services.session_title_service import SessionTitleService
from backend.app.storage import SessionRecord, StorageRepositories


class DuplicateToolForceStopError(RuntimeError):
    def __init__(self, *, tool_name: str, repeat_count: int) -> None:
        super().__init__(
            f"工具 `{tool_name}` 使用相同参数连续调用已达 {repeat_count} 次，已强制终止本轮对话"
        )
        self.tool_name = tool_name
        self.repeat_count = repeat_count


class ToolCallLimitExceededError(RuntimeError):
    def __init__(self, *, max_tool_calls: int, attempted_count: int) -> None:
        super().__init__(
            f"本轮工具调用已达到上限 {max_tool_calls} 次，已阻止第 {attempted_count} 次工具调用"
        )
        self.max_tool_calls = max_tool_calls
        self.attempted_count = attempted_count


class ToolCallLimitMiddleware(AgentMiddleware):
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
                f"limit={self.max_tool_calls} | attempted={self.tool_call_count} | "
                f"tool={tool_call.get('name') or 'unknown_tool'}"
            )
            raise ToolCallLimitExceededError(
                max_tool_calls=self.max_tool_calls,
                attempted_count=self.tool_call_count,
            )
        return await handler(request)


class AutoTitleMiddleware(AgentMiddleware):
    def __init__(
        self,
        *,
        settings: AutoTitleRuntimeSettings,
        repositories: StorageRepositories,
        dispatcher: EventDispatcher,
        http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
        factory: AgentFactory = agent_factory,
        schedule_task: Callable[[Awaitable[None]], Any] | None = None,
        title_service: SessionTitleService | None = None,
    ) -> None:
        self.settings = settings
        self.repositories = repositories
        self.dispatcher = dispatcher
        self.http_transport = http_transport
        self.factory = factory
        self._schedule_task = schedule_task or asyncio.create_task
        self._title_service = title_service

    async def aafter_agent(self, state: Any, runtime: Any) -> dict | None:
        if not self.settings.enabled:
            return None
        session_id = get_session_id()
        if not session_id:
            logger.debug("[AutoTitleMiddleware] 跳过自动标题：缺少 session_id")
            return None
        messages = _state_messages(state)
        if not messages:
            logger.debug(
                f"[AutoTitleMiddleware] 跳过自动标题：无消息 | session_id={session_id}"
            )
            return None
        task = self._schedule_task(
            self._generate_and_publish_title(
                session_id=session_id,
                active_session_id=get_active_session_id(),
                user_id=get_user_id(),
                messages=messages,
            )
        )
        logger.debug(
            f"[AutoTitleMiddleware] 已启动后台标题任务 | session_id={session_id} | task={id(task)}"
        )
        return None

    async def _generate_and_publish_title(
        self,
        *,
        session_id: str,
        active_session_id: str,
        user_id: str,
        messages: list[BaseMessage],
    ) -> None:
        try:
            service = self._title_service or SessionTitleService(
                self.repositories,
                factory=self.factory,
                http_transport=self.http_transport,
            )
            session = await service.generate_and_update_session_title(
                session_id=session_id,
                messages=messages,
                settings=self.settings,
            )
            if session is None:
                return
            await self.dispatcher.emit_event(
                event_type=DomainEventType.SESSION_TITLE_UPDATED.value,
                source="auto_title_middleware",
                payload={
                    "session_id": session.id,
                    "title": session.title,
                    "session": _session_payload(session),
                },
                user_id=user_id or session.user_id,
                original_session_id=session.id,
                active_session_id=active_session_id or session.active_session_id or session.id,
            )
        except Exception as exc:
            logger.opt(exception=True).warning(
                f"[AutoTitleMiddleware] 自动标题生成失败，主对话不受影响 | "
                f"session_id={session_id} | error={exc}"
            )


class ToolErrorHandlingMiddleware(AgentMiddleware):
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        try:
            return await handler(request)
        except (DuplicateToolForceStopError, ToolCallLimitExceededError):
            raise
        except Exception as exc:
            tool_call = request.tool_call or {}
            logger.opt(exception=True).error(
                f"[AgentMiddleware] 工具调用异常已转换为 ToolMessage | "
                f"tool={tool_call.get('name') or '-'} | error={exc}"
            )
            return ToolMessage(
                content=json.dumps(
                    {
                        "code": "tool_execution_failed",
                        "message": str(exc),
                        "type": type(exc).__name__,
                    },
                    ensure_ascii=False,
                ),
                tool_call_id=str(tool_call.get("id") or ""),
                name=str(tool_call.get("name") or ""),
                status="error",
            )


class DuplicateToolCallGuardMiddleware(AgentMiddleware):
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
                f"tool={tool_name or 'unknown_tool'} | repeat_count={self._repeat_count}"
            )
            raise DuplicateToolForceStopError(
                tool_name=tool_name or "unknown_tool",
                repeat_count=self._repeat_count,
            )
        return await handler(request)


def build_default_middleware(
    runtime_settings: AgentRuntimeSettings | None = None,
    *,
    repositories: StorageRepositories | None = None,
    dispatcher: EventDispatcher | None = None,
    model_http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
) -> tuple[AgentMiddleware, ...]:
    settings = runtime_settings or default_agent_runtime_settings()
    middlewares: list[AgentMiddleware] = [
        ToolCallPresetMiddleware(),
        SkillActivationInjectionMiddleware(),
    ]
    if settings.auto_title.enabled:
        if repositories is None or dispatcher is None:
            logger.warning("[AgentMiddleware] 自动标题已启用但缺少运行时依赖，跳过装配")
        else:
            middlewares.append(
                AutoTitleMiddleware(
                    settings=settings.auto_title,
                    repositories=repositories,
                    dispatcher=dispatcher,
                    http_transport=model_http_transport,
                )
            )
    if settings.tool_call_limit.enabled:
        middlewares.append(
            ToolCallLimitMiddleware(
                max_tool_calls=settings.tool_call_limit.max_tool_calls,
            )
        )
    middlewares.extend(
        [
            ToolErrorHandlingMiddleware(),
        ]
    )
    if settings.duplicate_tool_call_guard.enabled:
        middlewares.append(
            DuplicateToolCallGuardMiddleware(
                max_repeats=settings.duplicate_tool_call_guard.max_repeats,
            )
        )
    return tuple(middlewares)


def _tool_signature(tool_call: Any) -> str:
    name = str(tool_call.get("name") or "")
    args = tool_call.get("args") or {}
    try:
        args_text = json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        args_text = str(args)
    return f"{name}:{args_text}"


def _state_messages(state: Any) -> list[BaseMessage]:
    if isinstance(state, dict):
        raw_messages = state.get("messages") or []
    else:
        raw_messages = getattr(state, "messages", [])
    return [message for message in list(raw_messages or []) if isinstance(message, BaseMessage)]


def _session_payload(record: SessionRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "user_id": record.user_id,
        "scene_id": record.scene_id,
        "status": record.status,
        "title": record.title,
        "title_source": record.title_source,
        "session_tag": record.session_tag,
        "active_session_id": record.active_session_id,
        "parent_session_id": record.parent_session_id,
        "child_session_id": record.child_session_id,
        "source_trace_id": record.source_trace_id,
        "workspace_id": record.workspace_id,
        "session_type": record.session_type,
        "cwd": record.cwd,
        "workspace_roots": record.workspace_roots,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "is_debug": record.is_debug,
        "is_scheduled": record.is_scheduled,
    }
