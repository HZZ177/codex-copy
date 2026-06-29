from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from backend.app.agent.context_compression_utils import CompressionMaterial
from backend.app.core.time import to_iso_z, utc_now
from backend.app.model import ModelSettings
from backend.app.services.context_compression_service import ContextCompressionService
from backend.app.storage import (
    MODEL_DEFAULT_FAST,
    ModelProviderRecord,
    StorageRepositories,
    init_database,
)


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


def _prepare_fast_model(repositories: StorageRepositories) -> None:
    provider = _provider()
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="fast-model",
    )


def _material(
    *, phase: str = "initial", existing_l1_content: str | None = None
) -> CompressionMaterial:
    return CompressionMaterial(
        phase=phase,
        existing_l1_message=None,
        existing_l2_message=None,
        existing_l1_content=existing_l1_content,
        existing_l2_content=None,
        compression_zone_messages=[
            HumanMessage(content="旧问题", id="h1"),
            AIMessage(content="旧回答", id="a1"),
        ],
        retain_zone_messages=[HumanMessage(content="最近问题", id="h2")],
        anchor_message_id="h2",
        trace_id="trace_1",
        trace_record_id="trace_1",
        original_session_id="ses_1",
        active_session_id="ses_1",
        scene_id="desktop-agent",
        scene_version_seq=None,
        side_event_metadata={"mode": "test"},
    )


@pytest.mark.asyncio
async def test_context_compression_service_initial_generates_l1_only(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _prepare_fast_model(repositories)
    llm = PromptAwareLLM()
    service = ContextCompressionService(repositories, factory=FakeFactory(llm))

    result = await service.generate_compression_result(material=_material())

    assert result.success is True
    assert result.phase == "initial"
    assert result.new_l1_content == "新的L1摘要"
    assert result.new_l2_content is None
    assert llm.calls == ["l1"]


@pytest.mark.asyncio
async def test_context_compression_service_second_generates_l1_and_l2(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _prepare_fast_model(repositories)
    llm = PromptAwareLLM()
    service = ContextCompressionService(repositories, factory=FakeFactory(llm))

    result = await service.generate_compression_result(
        material=_material(phase="second", existing_l1_content="上一轮L1摘要")
    )

    assert result.success is True
    assert result.phase == "second"
    assert result.new_l1_content == "新的L1摘要"
    assert result.new_l2_content == "新的L2摘要"
    assert sorted(llm.calls) == ["l1", "l2"]


@pytest.mark.asyncio
async def test_context_compression_service_reports_missing_fast_model_config(tmp_path) -> None:
    service = ContextCompressionService(
        _repositories(tmp_path), factory=FakeFactory(PromptAwareLLM())
    )

    result = await service.generate_compression_result(material=_material())

    assert result.success is False
    assert result.failure_reason.startswith("model_config_error:")


class PromptAwareLLM:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def ainvoke(self, messages: list[Any], config: dict[str, Any] | None = None) -> AIMessage:
        system_text = str(messages[0].content)
        if "L2区压缩任务" in system_text:
            self.calls.append("l2")
            return AIMessage(
                content="<context_compression:l2>\n新的L2摘要\n</context_compression:l2>",
                usage_metadata={"input_tokens": 3, "output_tokens": 2, "total_tokens": 5},
            )
        self.calls.append("l1")
        return AIMessage(
            content="<context_compression:l1>\n新的L1摘要\n</context_compression:l1>",
            usage_metadata={"input_tokens": 4, "output_tokens": 2, "total_tokens": 6},
        )


class FakeFactory:
    def __init__(self, llm: PromptAwareLLM) -> None:
        self.llm = llm

    def get_or_create_llm(
        self,
        _settings: ModelSettings,
        **_kwargs: Any,
    ) -> PromptAwareLLM:
        return self.llm
