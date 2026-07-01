import asyncio
from typing import Any

import httpx
import openai
import pytest
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

from backend.app.agent.factory import AgentFactory
from backend.app.core.request_context import reset_request_context, set_request_context
from backend.app.model import ModelSettings
from backend.app.model.e2e_transport import E2E_MODEL_ID, create_e2e_model_transport
from backend.app.storage import StorageRepositories, init_database


@pytest.mark.asyncio
async def test_patched_chat_openai_logs_non_streaming_completion(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    captured_headers: dict[str, str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_headers.update(dict(request.headers))
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"role": "assistant", "content": "完成"}}],
                "usage": {
                    "prompt_tokens": 12,
                    "completion_tokens": 5,
                    "total_tokens": 17,
                    "prompt_tokens_details": {"cached_tokens": 3},
                },
            },
        )

    llm = _llm(
        repositories,
        http_transport=httpx.MockTransport(handler),
        streaming=False,
        model="logged-model",
    )
    token = _request_context()
    try:
        response = await llm.ainvoke([HumanMessage(content="你好")])
    finally:
        reset_request_context(token)

    records, total = repositories.llm_request_logs.list()
    assert response.content == "完成"
    assert total == 1
    record = records[0]
    assert record.status == "completed"
    assert record.trace_id == "trace_llm"
    assert record.session_id == "ses_llm"
    assert record.active_session_id == "ses_llm"
    assert record.turn_index == 3
    assert record.provider_id == "provider-1"
    assert record.provider_name == "测试供应商"
    assert record.model == "logged-model"
    assert record.request_preview == "这一轮用户消息"
    assert record.input_tokens == 12
    assert record.cache_read_tokens == 3
    assert record.output_tokens == 5
    assert record.total_tokens == 17
    assert record.response_preview == "完成"
    assert record.time_to_first_token == record.duration_ms
    assert captured_headers["ah-thread-id"] == "trace_llm"
    assert captured_headers["ah-trace-id"] == record.gateway_trace_id


@pytest.mark.asyncio
async def test_patched_chat_openai_logs_non_streaming_failure(tmp_path) -> None:
    repositories = _repositories(tmp_path)

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "bad request"}})

    llm = _llm(
        repositories,
        http_transport=httpx.MockTransport(handler),
        streaming=False,
        model="logged-model",
    )
    token = _request_context()
    try:
        with pytest.raises(openai.BadRequestError):
            await llm.ainvoke([HumanMessage(content="触发失败")])
    finally:
        reset_request_context(token)

    records, total = repositories.llm_request_logs.list()
    assert total == 1
    assert records[0].status == "failed"
    assert "bad request" in str(records[0].error_message)


@pytest.mark.asyncio
async def test_patched_chat_openai_logs_non_streaming_task_cancel(tmp_path) -> None:
    repositories = _repositories(tmp_path)

    async def handler(_request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "late"}}]},
        )

    llm = _llm(
        repositories,
        http_transport=httpx.MockTransport(handler),
        streaming=False,
        model="logged-model",
    )
    token = _request_context()
    try:
        task = asyncio.create_task(llm.ainvoke([HumanMessage(content="取消")]))
        await asyncio.sleep(0.1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    finally:
        reset_request_context(token)

    records, total = repositories.llm_request_logs.list()
    assert total == 1
    assert records[0].status == "cancelled"
    assert records[0].error_message == "CancelledError"


@pytest.mark.asyncio
async def test_patched_chat_openai_logs_agent_stream_close_as_cancelled(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    llm = _llm(
        repositories,
        http_transport=create_e2e_model_transport(delay_ms=100),
        streaming=True,
        model=E2E_MODEL_ID,
    )
    agent = create_agent(model=llm, tools=[], system_prompt="", name="logging_probe")
    stream = agent.astream_events(
        {"messages": [{"role": "user", "content": "请输出流式 Markdown 长文"}]},
        version="v2",
    )

    token = _request_context()
    try:
        async for event in stream:
            if event.get("event") == "on_chat_model_stream":
                await stream.aclose()
                break
    finally:
        reset_request_context(token)

    records, total = repositories.llm_request_logs.list()
    assert total == 1
    assert records[0].status == "cancelled"
    assert records[0].error_message == "GeneratorExit"
    assert records[0].response_preview
    assert records[0].time_to_first_token is not None
    assert records[0].duration_ms is not None
    assert records[0].time_to_first_token <= records[0].duration_ms


@pytest.mark.asyncio
async def test_patched_chat_openai_logs_streaming_completion_usage(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    llm = _llm(
        repositories,
        http_transport=create_e2e_model_transport(delay_ms=0),
        streaming=True,
        model=E2E_MODEL_ID,
    )
    token = _request_context()
    text = ""
    try:
        async for chunk in llm.astream([HumanMessage(content="请输出流式 Markdown 长文")]):
            if isinstance(chunk.content, str):
                text += chunk.content
    finally:
        reset_request_context(token)

    records, total = repositories.llm_request_logs.list()
    assert "最终检查点" in text
    assert total == 1
    record = records[0]
    assert record.status == "completed"
    assert record.input_tokens == 11
    assert record.output_tokens == 38
    assert record.total_tokens == 49
    assert record.response_preview.startswith("# 流式 Markdown 验收")
    assert record.time_to_first_token is not None
    assert record.time_to_first_token >= 0
    assert record.duration_ms is not None
    assert record.time_to_first_token <= record.duration_ms


def _repositories(tmp_path) -> StorageRepositories:
    repositories = StorageRepositories(init_database(tmp_path / "app.db"))
    repositories.sessions.create(
        session_id="ses_llm",
        user_id="local-user",
        scene_id="desktop-agent",
    )
    repositories.trace_records.create(
        trace_id="trace_llm",
        session_id="ses_llm",
        active_session_id="ses_llm",
        scene_id="desktop-agent",
        user_id="local-user",
        turn_index=3,
        root_node_id="trace_llm-root",
    )
    return repositories


def _request_context(user_message: str = "这一轮用户消息"):
    return set_request_context(
        trace_id="trace_llm",
        session_id="ses_llm",
        active_session_id="ses_llm",
        user_id="local-user",
        turn_index=3,
        user_message=user_message,
    )


def _llm(
    repositories: StorageRepositories,
    *,
    http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport,
    streaming: bool,
    model: str,
) -> Any:
    factory = AgentFactory()
    return factory.get_or_create_llm(
        ModelSettings(
            base_url="http://e2e-model.test/v1",
            api_key="sk-test",
            model=model,
        ),
        model=model,
        http_transport=http_transport,
        streaming=streaming,
        llm_request_logs=repositories.llm_request_logs,
        provider_id="provider-1",
        provider_name="测试供应商",
    )
