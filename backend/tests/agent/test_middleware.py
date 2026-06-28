from __future__ import annotations

import pytest
from langchain.agents.middleware import ToolCallRequest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from backend.app.agent.runtime_settings import AgentRuntimeSettings, AutoTitleRuntimeSettings
from backend.app.agent.middleware import (
    AutoTitleMiddleware,
    DuplicateToolCallGuardMiddleware,
    DuplicateToolForceStopError,
    ToolCallLimitExceededError,
    ToolCallLimitMiddleware,
    ToolErrorHandlingMiddleware,
    build_default_middleware,
)
from backend.app.core.request_context import reset_request_context, set_request_context
from backend.app.events import DomainEvent, DomainEventType, EventDispatcher
from backend.app.storage import StorageRepositories, init_database


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def _request() -> ToolCallRequest:
    return ToolCallRequest(
        tool_call={"id": "call_1", "name": "read_file", "args": {"path": "a.txt"}},
        tool=None,
        state={},
        runtime=None,
    )


@pytest.mark.asyncio
async def test_tool_error_handling_middleware_returns_error_tool_message() -> None:
    middleware = ToolErrorHandlingMiddleware()

    async def failing_handler(request: ToolCallRequest) -> ToolMessage:
        raise RuntimeError("boom")

    result = await middleware.awrap_tool_call(_request(), failing_handler)

    assert isinstance(result, ToolMessage)
    assert result.status == "error"
    assert result.tool_call_id == "call_1"
    assert "boom" in result.content


@pytest.mark.asyncio
async def test_duplicate_tool_call_guard_stops_repeated_same_args() -> None:
    middleware = DuplicateToolCallGuardMiddleware(max_repeats=2)

    async def handler(request: ToolCallRequest) -> ToolMessage:
        return ToolMessage(content="ok", tool_call_id="call_1")

    await middleware.awrap_tool_call(_request(), handler)
    await middleware.awrap_tool_call(_request(), handler)

    with pytest.raises(DuplicateToolForceStopError):
        await middleware.awrap_tool_call(_request(), handler)


@pytest.mark.asyncio
async def test_tool_call_limit_middleware_blocks_calls_after_limit() -> None:
    middleware = ToolCallLimitMiddleware(max_tool_calls=2)

    async def handler(request: ToolCallRequest) -> ToolMessage:
        return ToolMessage(content="ok", tool_call_id="call_1")

    await middleware.awrap_tool_call(_request(), handler)
    await middleware.awrap_tool_call(_request(), handler)

    with pytest.raises(ToolCallLimitExceededError) as exc_info:
        await middleware.awrap_tool_call(_request(), handler)

    assert exc_info.value.max_tool_calls == 2
    assert exc_info.value.attempted_count == 3


@pytest.mark.asyncio
async def test_tool_call_limit_middleware_counts_failed_tool_calls() -> None:
    middleware = ToolCallLimitMiddleware(max_tool_calls=1)

    async def failing_handler(request: ToolCallRequest) -> ToolMessage:
        raise RuntimeError("tool failed")

    with pytest.raises(RuntimeError):
        await middleware.awrap_tool_call(_request(), failing_handler)

    with pytest.raises(ToolCallLimitExceededError) as exc_info:
        await middleware.awrap_tool_call(_request(), failing_handler)

    assert exc_info.value.max_tool_calls == 1
    assert exc_info.value.attempted_count == 2


@pytest.mark.asyncio
async def test_tool_error_handling_does_not_swallow_force_stop_errors() -> None:
    middleware = ToolErrorHandlingMiddleware()

    async def limit_handler(request: ToolCallRequest) -> ToolMessage:
        raise ToolCallLimitExceededError(max_tool_calls=1, attempted_count=2)

    async def duplicate_handler(request: ToolCallRequest) -> ToolMessage:
        raise DuplicateToolForceStopError(tool_name="read_file", repeat_count=4)

    with pytest.raises(ToolCallLimitExceededError):
        await middleware.awrap_tool_call(_request(), limit_handler)

    with pytest.raises(DuplicateToolForceStopError):
        await middleware.awrap_tool_call(_request(), duplicate_handler)


def test_build_default_middleware_honors_auto_title_config(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    disabled = build_default_middleware(
        AgentRuntimeSettings(auto_title={"enabled": False}),
        repositories=repositories,
        dispatcher=EventDispatcher(),
    )
    enabled = build_default_middleware(
        AgentRuntimeSettings(auto_title={"enabled": True}),
        repositories=repositories,
        dispatcher=EventDispatcher(),
    )

    assert not any(isinstance(item, AutoTitleMiddleware) for item in disabled)
    assert any(isinstance(item, AutoTitleMiddleware) for item in enabled)


@pytest.mark.asyncio
async def test_auto_title_middleware_schedules_background_title_update(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    session = repositories.sessions.create(
        session_id="ses_auto_title",
        user_id="local-user",
        scene_id="desktop-agent",
        title="默认标题",
    )
    events: list[DomainEvent] = []
    scheduled = []

    async def collect(event: DomainEvent) -> None:
        events.append(event)

    def schedule(coro):
        scheduled.append(coro)
        return object()

    token = set_request_context(
        session_id=session.id,
        active_session_id=session.id,
        user_id=session.user_id,
    )
    try:
        middleware = AutoTitleMiddleware(
            settings=AutoTitleRuntimeSettings(enabled=True),
            repositories=repositories,
            dispatcher=EventDispatcher([collect]),
            title_service=FakeTitleService(repositories, title="自动标题"),
            schedule_task=schedule,
        )

        await middleware.aafter_agent(
            {"messages": [HumanMessage(content="问题"), AIMessage(content="回答")]},
            runtime=None,
        )
        assert len(scheduled) == 1
        await scheduled[0]
    finally:
        reset_request_context(token)

    assert len(events) == 1
    assert events[0].event_type == DomainEventType.SESSION_TITLE_UPDATED.value
    assert events[0].payload["title"] == "自动标题"
    assert events[0].payload["session"]["title_source"] == "auto"


@pytest.mark.asyncio
async def test_auto_title_middleware_skips_when_disabled(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    session = repositories.sessions.create(
        session_id="ses_disabled_title",
        user_id="local-user",
        scene_id="desktop-agent",
        title="默认标题",
    )
    scheduled = []
    token = set_request_context(session_id=session.id, active_session_id=session.id)
    try:
        middleware = AutoTitleMiddleware(
            settings=AutoTitleRuntimeSettings(enabled=False),
            repositories=repositories,
            dispatcher=EventDispatcher(),
            title_service=FakeTitleService(repositories, title="不应生成"),
            schedule_task=lambda coro: scheduled.append(coro),
        )

        await middleware.aafter_agent(
            {"messages": [HumanMessage(content="问题"), AIMessage(content="回答")]},
            runtime=None,
        )
    finally:
        reset_request_context(token)

    assert scheduled == []


@pytest.mark.asyncio
async def test_auto_title_middleware_isolates_background_failure(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    session = repositories.sessions.create(
        session_id="ses_title_failure",
        user_id="local-user",
        scene_id="desktop-agent",
        title="默认标题",
    )
    scheduled = []

    def schedule(coro):
        scheduled.append(coro)
        return object()

    token = set_request_context(session_id=session.id, active_session_id=session.id)
    try:
        middleware = AutoTitleMiddleware(
            settings=AutoTitleRuntimeSettings(enabled=True),
            repositories=repositories,
            dispatcher=EventDispatcher(),
            title_service=FailingTitleService(),
            schedule_task=schedule,
        )

        await middleware.aafter_agent(
            {"messages": [HumanMessage(content="问题"), AIMessage(content="回答")]},
            runtime=None,
        )
        assert len(scheduled) == 1
        await scheduled[0]
    finally:
        reset_request_context(token)

    assert repositories.sessions.get(session.id).title == "默认标题"


class FakeTitleService:
    def __init__(self, repositories: StorageRepositories, *, title: str) -> None:
        self.repositories = repositories
        self.title = title

    async def generate_and_update_session_title(self, *, session_id, messages, settings):
        return self.repositories.sessions.update_title_if_auto_allowed(
            session_id,
            title=self.title,
            only_when_default_title=settings.only_when_default_title,
        )


class FailingTitleService:
    async def generate_and_update_session_title(self, *, session_id, messages, settings):
        raise RuntimeError("title failure")
