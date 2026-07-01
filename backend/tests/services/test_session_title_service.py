from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from backend.app.agent.runtime_settings import AutoTitleRuntimeSettings
from backend.app.core.time import to_iso_z, utc_now
from backend.app.services.session_title_service import SessionTitleService
from backend.app.storage import (
    MODEL_DEFAULT_FAST,
    ModelProviderRecord,
    StorageRepositories,
    init_database,
)


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def _configure_fast_model(repositories: StorageRepositories) -> None:
    now = to_iso_z(utc_now())
    provider = ModelProviderRecord(
        id="provider-fast",
        name="快速模型",
        base_url="https://fast.example/v1",
        api_key="sk-fast",
        enabled=True,
        models=["fast-title"],
        model_enabled={"fast-title": True},
        health={},
        created_at=now,
        updated_at=now,
    )
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="fast-title",
    )


@pytest.mark.asyncio
async def test_session_title_service_prompts_expected_length_with_fast_model(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _configure_fast_model(repositories)
    factory = FakeFactory(FakeLLM("《一个特别长的自动标题输出。》\n解释不应保留"))
    service = SessionTitleService(repositories, factory=factory, retry_delays=())

    title = await service.generate_title(
        [
            HumanMessage(content="怎么配置模型？"),
            AIMessage(content="可以在设置里选择供应商和模型。"),
        ],
        max_title_length=8,
    )

    assert title == "一个特别长的自动标题输出"
    assert factory.calls[0]["model"] == "fast-title"
    assert factory.calls[0]["streaming"] is False
    assert factory.calls[0]["max_tokens"] == 80
    assert "标题期望不超过 8 个中文字符" in factory.llm.messages[0][0].content


@pytest.mark.asyncio
async def test_session_title_service_falls_back_to_fixed_fifty_character_limit(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _configure_fast_model(repositories)
    raw_title = (
        "这是一个超过五十个字符的自动标题输出用于验证代码侧只保留固定兜底截断"
        "而不是按照配置长度截断并且继续补充更多内容"
    )
    factory = FakeFactory(FakeLLM(raw_title))
    service = SessionTitleService(repositories, factory=factory, retry_delays=())

    title = await service.generate_title(
        [HumanMessage(content="问题"), AIMessage(content="回答")],
        max_title_length=8,
    )

    assert title == raw_title[:50]
    assert len(title) == 50


@pytest.mark.asyncio
async def test_session_title_service_returns_none_when_fast_model_missing(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    factory = FakeFactory(FakeLLM("不会调用"))
    service = SessionTitleService(repositories, factory=factory, retry_delays=())

    title = await service.generate_title(
        [HumanMessage(content="问题"), AIMessage(content="回答")],
        max_title_length=20,
    )

    assert title is None
    assert factory.calls == []


@pytest.mark.asyncio
async def test_session_title_service_rejects_empty_cleaned_title(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _configure_fast_model(repositories)
    service = SessionTitleService(repositories, factory=FakeFactory(FakeLLM("。")), retry_delays=())

    title = await service.generate_title(
        [HumanMessage(content="问题"), AIMessage(content="回答")],
        max_title_length=20,
    )

    assert title is None


@pytest.mark.asyncio
async def test_session_title_service_returns_none_when_llm_fails(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _configure_fast_model(repositories)
    llm = FailingLLM()
    service = SessionTitleService(
        repositories,
        factory=FakeFactory(llm),
        retry_delays=(0,),
        sleep=fast_sleep,
    )

    title = await service.generate_title(
        [HumanMessage(content="问题"), AIMessage(content="回答")],
        max_title_length=20,
    )

    assert title is None
    assert llm.calls == 2


@pytest.mark.asyncio
async def test_session_title_service_updates_only_auto_candidate_title(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _configure_fast_model(repositories)
    session = repositories.sessions.create(
        session_id="ses_auto",
        user_id="local-user",
        scene_id="desktop-agent",
        title="怎么配置模型？",
    )
    service = SessionTitleService(
        repositories,
        factory=FakeFactory(FakeLLM("模型配置说明")),
        retry_delays=(),
    )

    updated = await service.generate_and_update_session_title(
        session_id=session.id,
        messages=[HumanMessage(content="怎么配置模型？"), AIMessage(content="打开设置即可。")],
        settings=AutoTitleRuntimeSettings(enabled=True, only_when_default_title=True),
    )

    assert updated is not None
    assert updated.title == "模型配置说明"
    assert updated.title_source == "auto"


@pytest.mark.asyncio
async def test_session_title_service_does_not_overwrite_manual_title(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    _configure_fast_model(repositories)
    session = repositories.sessions.create(
        session_id="ses_manual",
        user_id="local-user",
        scene_id="desktop-agent",
        title="默认标题",
    )
    repositories.sessions.update(session.id, title="手动标题", title_source="manual")
    service = SessionTitleService(
        repositories,
        factory=FakeFactory(FakeLLM("自动标题")),
        retry_delays=(),
    )

    updated = await service.generate_and_update_session_title(
        session_id=session.id,
        messages=[HumanMessage(content="问题"), AIMessage(content="回答")],
        settings=AutoTitleRuntimeSettings(enabled=True, only_when_default_title=False),
    )

    assert updated is None
    assert repositories.sessions.get(session.id).title == "手动标题"


class FakeLLM:
    def __init__(self, content: str) -> None:
        self.content = content
        self.messages = []

    async def ainvoke(self, messages):
        self.messages.append(messages)
        return AIMessage(content=self.content)


class FailingLLM:
    def __init__(self) -> None:
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        raise RuntimeError("llm failed")


class FakeFactory:
    def __init__(self, llm: FakeLLM) -> None:
        self.llm = llm
        self.calls = []

    def get_or_create_llm(self, settings, **kwargs):
        self.calls.append({"settings": settings, **kwargs})
        return self.llm


async def fast_sleep(delay: float) -> None:
    return None
