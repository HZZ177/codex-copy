from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from backend.app.agent import AgentRunner
from backend.app.agent.checkpoint import SQLiteCheckpointSaver
from backend.app.agent.factory import AgentFactory
from backend.app.agent.middleware.tool_call_limit import ToolCallLimitMiddleware
from backend.app.agent.runtime_settings import AgentRuntimeSettings
from backend.app.model import ModelSettings
from backend.app.storage import init_database
from backend.app.tools import FunctionTool, ToolExecutionContext, ToolRegistry


class RecordingAgentFactory(AgentFactory):
    def __init__(self, model: Any) -> None:
        super().__init__()
        self.model = model
        self.requested_models: list[str] = []
        self.created_tool_counts: list[int] = []
        self.created_middleware: list[tuple[Any, ...]] = []

    def get_or_create_llm(
        self,
        settings: ModelSettings,
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        streaming: bool = True,
        **kwargs: Any,
    ) -> Any:
        self.requested_models.append(model)
        return self.model

    def create_agent(
        self,
        *,
        model: Any,
        tools: list[Any],
        system_prompt: Any,
        checkpointer: Any,
        middleware: tuple[Any, ...] = (),
        state_schema: type[Any] | None = None,
        name: str = "desktop_agent",
    ) -> Any:
        self.created_tool_counts.append(len(tools))
        self.created_middleware.append(middleware)
        return super().create_agent(
            model=model,
            tools=tools,
            system_prompt=system_prompt,
            checkpointer=checkpointer,
            middleware=middleware,
            state_schema=state_schema,
            name=name,
        )


def _tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        FunctionTool(
            name="read_file",
            description="读取文件",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda args, context: {"content": f"content:{args['path']}"},
        )
    )
    return registry


def _runner(
    tmp_path: Path,
    *,
    registry: ToolRegistry | None = None,
    model: Any | None = None,
    runtime_settings_provider: Any | None = None,
) -> tuple[AgentRunner, RecordingAgentFactory]:
    factory = RecordingAgentFactory(model or FakeListChatModel(responses=["ok"]))
    runner = AgentRunner(
        model_settings_provider=lambda: ModelSettings(
            base_url="http://model.test/v1",
            api_key="test-key",
            model="fake-default",
        ),
        runtime_settings_provider=runtime_settings_provider,
        checkpointer=SQLiteCheckpointSaver(init_database(tmp_path / "app.db")),
        tool_registry=registry or ToolRegistry(),
        default_system_prompt="系统提示",
        factory=factory,
    )
    return runner, factory


def test_agent_runner_requests_runtime_model(tmp_path) -> None:
    runner, factory = _runner(tmp_path)

    agent = runner.create_agent(
        model="qwen-coder",
        system_prompt=None,
        tool_context=ToolExecutionContext(
            session_id="ses_1",
            user_id="user_1",
            workspace_root=tmp_path,
            turn_index=1,
            trace_id="trace_1",
        ),
    )

    assert agent is not None
    assert factory.requested_models == ["qwen-coder"]


def test_agent_runner_uses_runtime_middleware_settings(tmp_path) -> None:
    runner, factory = _runner(
        tmp_path,
        runtime_settings_provider=lambda: AgentRuntimeSettings(
            tool_call_limit={"enabled": True, "max_tool_calls": 3, "exit_behavior": "error"}
        ),
    )

    runner.create_agent(
        model="qwen-coder",
        system_prompt=None,
        tool_context=ToolExecutionContext(
            session_id="ses_1",
            user_id="user_1",
            workspace_root=tmp_path,
            turn_index=1,
            trace_id="trace_1",
        ),
    )

    tool_limit = next(
        item for item in factory.created_middleware[-1] if isinstance(item, ToolCallLimitMiddleware)
    )
    assert tool_limit.max_tool_calls == 3


def test_agent_runner_resets_tool_limit_middleware_between_agent_creations(tmp_path) -> None:
    runner, factory = _runner(
        tmp_path,
        runtime_settings_provider=lambda: AgentRuntimeSettings(
            tool_call_limit={"enabled": True, "max_tool_calls": 2, "exit_behavior": "error"}
        ),
    )
    tool_context = ToolExecutionContext(
        session_id="ses_1",
        user_id="user_1",
        workspace_root=tmp_path,
        turn_index=1,
        trace_id="trace_1",
    )

    runner.create_agent(model="qwen-coder", system_prompt=None, tool_context=tool_context)
    first_tool_limit = next(
        item for item in factory.created_middleware[-1] if isinstance(item, ToolCallLimitMiddleware)
    )
    first_tool_limit.tool_call_count = 2

    runner.create_agent(model="qwen-coder", system_prompt=None, tool_context=tool_context)
    second_tool_limit = next(
        item for item in factory.created_middleware[-1] if isinstance(item, ToolCallLimitMiddleware)
    )

    assert second_tool_limit is not first_tool_limit
    assert second_tool_limit.tool_call_count == 0
    assert second_tool_limit.max_tool_calls == 2


def test_agent_runner_applies_runtime_tool_limit_changes_on_next_agent(tmp_path) -> None:
    current_settings = AgentRuntimeSettings(
        tool_call_limit={"enabled": True, "max_tool_calls": 2, "exit_behavior": "error"}
    )
    runner, factory = _runner(
        tmp_path,
        runtime_settings_provider=lambda: current_settings,
    )
    tool_context = ToolExecutionContext(
        session_id="ses_1",
        user_id="user_1",
        workspace_root=tmp_path,
        turn_index=1,
        trace_id="trace_1",
    )

    runner.create_agent(model="qwen-coder", system_prompt=None, tool_context=tool_context)
    current_settings = AgentRuntimeSettings(
        tool_call_limit={"enabled": True, "max_tool_calls": 5, "exit_behavior": "error"}
    )
    runner.create_agent(model="qwen-coder", system_prompt=None, tool_context=tool_context)

    limits = [
        next(
            item for item in middleware if isinstance(item, ToolCallLimitMiddleware)
        ).max_tool_calls
        for middleware in factory.created_middleware
    ]
    assert limits == [2, 5]


@pytest.mark.asyncio
async def test_agent_runner_checkpoint_records_messages(tmp_path) -> None:
    runner, _factory = _runner(tmp_path)
    agent = runner.create_agent(
        model="qwen-coder",
        system_prompt=None,
        tool_context=ToolExecutionContext(
            session_id="ses_1",
            user_id="user_1",
            workspace_root=tmp_path,
            turn_index=1,
            trace_id="trace_1",
        ),
    )

    await agent.ainvoke(
        {"messages": [{"role": "user", "content": "你好"}]},
        config={"configurable": {"thread_id": "ses_1", "checkpoint_ns": ""}},
    )

    checkpoint = await runner.checkpointer.aget_tuple(
        {"configurable": {"thread_id": "ses_1", "checkpoint_ns": ""}}
    )
    messages = checkpoint.checkpoint["channel_values"]["messages"]
    assert [message.type for message in messages] == ["human", "ai"]
    assert [message.content for message in messages] == ["你好", "ok"]


def test_agent_runner_exports_registered_tools_to_langchain_agent(tmp_path) -> None:
    runner, factory = _runner(tmp_path, registry=_tool_registry())

    agent = runner.create_agent(
        model="qwen-coder",
        system_prompt="自定义提示",
        tool_context=ToolExecutionContext(
            session_id="ses_1",
            user_id="user_1",
            workspace_root=tmp_path,
            turn_index=1,
            trace_id="trace_1",
        ),
    )

    graph = agent.get_graph()
    assert graph is not None
    assert runner.tool_registry.names() == ["read_file"]
    assert factory.created_tool_counts == [1]


def test_agent_runner_can_disable_registered_tools(tmp_path) -> None:
    runner, factory = _runner(tmp_path, registry=_tool_registry())

    agent = runner.create_agent(
        model="qwen-coder",
        system_prompt="自定义提示",
        tool_context=ToolExecutionContext(
            session_id="ses_1",
            user_id="user_1",
            workspace_root=tmp_path,
            turn_index=1,
            trace_id="trace_1",
        ),
        enable_tools=False,
    )

    assert agent is not None
    assert runner.tool_registry.names() == ["read_file"]
    assert factory.created_tool_counts == [0]
