from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import BaseMessage

from backend.app.agent.factory import AgentFactory, agent_factory
from backend.app.agent.middleware.common import _session_payload, _state_messages
from backend.app.agent.runtime_settings import AutoTitleRuntimeSettings
from backend.app.core.logger import logger
from backend.app.core.request_context import get_active_session_id, get_session_id, get_user_id
from backend.app.events import DomainEventType, EventDispatcher
from backend.app.services.session_title_service import SessionTitleService
from backend.app.storage import StorageRepositories


class AutoTitleMiddleware(AgentMiddleware):
    """会话标题后台生成中间件。"""

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
            logger.debug("[AutoTitleMiddleware] 跳过自动标题：缺少会话ID")
            return None
        messages = _state_messages(state)
        if not messages:
            logger.debug(f"[AutoTitleMiddleware] 跳过自动标题：无消息 | 会话ID={session_id}")
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
            f"[AutoTitleMiddleware] 已启动后台标题任务 | 会话ID={session_id} | 任务ID={id(task)}"
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
                f"会话ID={session_id} | 错误={exc}"
            )
