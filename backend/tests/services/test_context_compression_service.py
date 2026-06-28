from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from backend.app.agent.checkpoint import SQLiteCheckpointSaver
from backend.app.agent.runtime_settings import ContextCompressionRuntimeSettings
from backend.app.core.time import to_iso_z, utc_now
from backend.app.model import ModelSettings
from backend.app.services.context_compression_service import ContextCompressionService
from backend.app.storage import MODEL_DEFAULT_FAST, ModelProviderRecord, StorageRepositories, init_database


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def _provider() -> ModelProviderRecord:
    now = to_iso_z(utc_now())
    return ModelProviderRecord(
        id="provider-fast",
        name="快速供应商",
        base_url="https://api.example/v1",
        api_key="sk-fast",
        enabled=True,
        models=["fast-model"],
        model_enabled={"fast-model": True},
        health={},
        created_at=now,
        updated_at=now,
    )


def _checkpoint(checkpoint_id: str) -> dict:
    return {
        "v": 1,
        "id": checkpoint_id,
        "ts": f"2026-06-28T00:00:00+00:00:{checkpoint_id}",
        "channel_values": {
            "messages": [
                HumanMessage(content="旧问题"),
                AIMessage(content="旧回答"),
                HumanMessage(content="最近问题"),
                AIMessage(content="最近回答"),
            ]
        },
        "channel_versions": {},
        "versions_seen": {},
    }


def _prepare_source(tmp_path):
    repositories = _repositories(tmp_path)
    provider = _provider()
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="fast-model",
    )
    source = repositories.sessions.create(
        session_id="ses_source",
        user_id="local-user",
        scene_id="desktop-agent",
        title="源会话",
    )
    saver = SQLiteCheckpointSaver(repositories.db)
    saver.put(
        {"configurable": {"thread_id": source.id, "checkpoint_ns": ""}},
        _checkpoint("ckpt_1"),
        {},
        {},
    )
    repositories.trace_records.create(
        trace_id="trace_1",
        session_id=source.id,
        active_session_id=source.id,
        scene_id=source.scene_id,
        user_id=source.user_id,
        turn_index=2,
        root_node_id="root_1",
    )
    repositories.trace_records.finish(
        "trace_1",
        status="completed",
        output_checkpoint_id="ckpt_1",
        output_checkpoint_ns="",
    )
    for turn_index, question, answer in [
        (1, "旧问题", "旧回答"),
        (2, "最近问题", "最近回答"),
    ]:
        repositories.message_events.append(
            event_id=f"evt_user_{turn_index}",
            session_id=source.id,
            trace_record_id="trace_1",
            turn_index=turn_index,
            action="user_message",
            data={"session_id": source.id, "content": question},
        )
        repositories.message_events.append(
            event_id=f"evt_ai_{turn_index}",
            session_id=source.id,
            trace_record_id="trace_1",
            turn_index=turn_index,
            action="ai_message",
            data={"session_id": source.id, "content": answer},
        )
    return repositories, saver


@pytest.mark.asyncio
async def test_context_compression_skips_below_threshold(tmp_path) -> None:
    repositories, saver = _prepare_source(tmp_path)
    service = ContextCompressionService(repositories, checkpointer=saver, factory=FakeFactory("摘要"))

    outcome = await service.maybe_compress_after_turn(
        session_id="ses_source",
        trace_id="trace_1",
        turn_index=2,
        user_id="local-user",
        settings=ContextCompressionRuntimeSettings(
            enabled=True,
            context_window_tokens=100000,
            trigger_fraction=0.5,
            emergency_fraction=0.9,
            retain_rounds=1,
        ),
        latest_usage={"total_tokens": 20},
    )

    assert outcome.status == "skipped"
    assert outcome.reason == "below_threshold"
    assert repositories.sessions.get("ses_source").active_session_id == "ses_source"


@pytest.mark.asyncio
async def test_context_compression_skips_when_no_compressible_history(tmp_path) -> None:
    repositories, saver = _prepare_source(tmp_path)
    service = ContextCompressionService(repositories, checkpointer=saver, factory=FakeFactory("摘要"))

    outcome = await service.maybe_compress_after_turn(
        session_id="ses_source",
        trace_id="trace_1",
        turn_index=2,
        user_id="local-user",
        settings=ContextCompressionRuntimeSettings(
            enabled=True,
            context_window_tokens=1000,
            trigger_fraction=0.01,
            emergency_fraction=0.9,
            retain_rounds=3,
        ),
        latest_usage={"total_tokens": 20},
    )

    assert outcome.status == "skipped"
    assert outcome.reason == "no_compressible_history"
    assert repositories.sessions.get("ses_source").active_session_id == "ses_source"
    assert [event.action for event in repositories.message_events.list_by_session("ses_source")] == [
        "user_message",
        "ai_message",
        "user_message",
        "ai_message",
    ]


@pytest.mark.asyncio
async def test_context_compression_creates_active_branch_and_rewrites_checkpoint(tmp_path) -> None:
    repositories, saver = _prepare_source(tmp_path)
    service = ContextCompressionService(repositories, checkpointer=saver, factory=FakeFactory("压缩摘要"))

    outcome = await service.maybe_compress_after_turn(
        session_id="ses_source",
        trace_id="trace_1",
        turn_index=2,
        user_id="local-user",
        settings=ContextCompressionRuntimeSettings(
            enabled=True,
            context_window_tokens=1000,
            trigger_fraction=0.01,
            emergency_fraction=0.9,
            retain_rounds=1,
        ),
        latest_usage={"total_tokens": 20},
    )

    assert outcome.status == "compressed"
    assert outcome.target_session_id
    source = repositories.sessions.get("ses_source")
    assert source.active_session_id == outcome.target_session_id
    assert source.child_session_id == outcome.target_session_id
    target = repositories.sessions.get(outcome.target_session_id)
    assert target.parent_session_id == "ses_source"
    assert target.source_checkpoint_id == "ckpt_1"

    checkpoint = saver.get_tuple(
        {
            "configurable": {
                "thread_id": outcome.target_session_id,
                "checkpoint_ns": "",
                "checkpoint_id": "ckpt_1",
            }
        }
    )
    messages = checkpoint.checkpoint["channel_values"]["messages"]
    assert "压缩摘要" in messages[0].content
    assert [message.content for message in messages[1:]] == ["最近问题", "最近回答"]

    target_history = repositories.message_events.list_by_session(outcome.target_session_id)
    assert [event.action for event in target_history] == ["system_message", "user_message", "ai_message"]
    assert "压缩摘要" in target_history[0].data["content"]
    assert target_history[1].data["session_id"] == outcome.target_session_id
    source_history = repositories.message_events.list_by_session("ses_source")
    assert source_history[-1].action == "system_message"
    assert source_history[-1].data["compression"]["target_session_id"] == outcome.target_session_id


@pytest.mark.asyncio
async def test_context_compression_failure_does_not_switch_active_session(tmp_path) -> None:
    repositories, saver = _prepare_source(tmp_path)
    service = ContextCompressionService(repositories, checkpointer=saver, factory=FailingFactory())

    outcome = await service.maybe_compress_after_turn(
        session_id="ses_source",
        trace_id="trace_1",
        turn_index=2,
        user_id="local-user",
        settings=ContextCompressionRuntimeSettings(
            enabled=True,
            context_window_tokens=1000,
            trigger_fraction=0.01,
            emergency_fraction=0.9,
            retain_rounds=1,
        ),
        latest_usage={"total_tokens": 20},
    )

    assert outcome.status == "failed"
    assert repositories.sessions.get("ses_source").active_session_id == "ses_source"
    events = repositories.message_events.list_by_session("ses_source")
    assert events[-1].action == "system_message"
    assert events[-1].data["compression"]["kind"] == "context_compression_failed"


class FakeLLM:
    def __init__(self, content: str) -> None:
        self.content = content

    async def ainvoke(self, _messages: list[Any]) -> AIMessage:
        return AIMessage(content=self.content)


class FakeFactory:
    def __init__(self, content: str) -> None:
        self.content = content

    def get_or_create_llm(
        self,
        _settings: ModelSettings,
        **_kwargs: Any,
    ) -> FakeLLM:
        return FakeLLM(self.content)


class FailingLLM:
    async def ainvoke(self, _messages: list[Any]) -> AIMessage:
        raise RuntimeError("fast model failed")


class FailingFactory:
    def get_or_create_llm(
        self,
        _settings: ModelSettings,
        **_kwargs: Any,
    ) -> FailingLLM:
        return FailingLLM()
