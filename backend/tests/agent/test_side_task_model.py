from typing import Any

from backend.app.agent.factory import AgentFactory
from backend.app.agent.side_task_model import SideTaskModelError, create_side_task_llm
from backend.app.core.time import to_iso_z, utc_now
from backend.app.model import ModelSettings
from backend.app.storage import (
    MODEL_DEFAULT_CHAT,
    MODEL_DEFAULT_FAST,
    ModelProviderRecord,
    StorageRepositories,
    init_database,
)


class RecordingFactory(AgentFactory):
    def __init__(self, *, fail: bool = False) -> None:
        super().__init__()
        self.fail = fail
        self.calls: list[dict[str, Any]] = []

    def get_or_create_llm(
        self,
        settings: ModelSettings,
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        streaming: bool = True,
        **kwargs: Any,
    ) -> object:
        self.calls.append(
            {
                "settings": settings,
                "model": model,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "streaming": streaming,
                "kwargs": kwargs,
            }
        )
        if self.fail:
            raise RuntimeError("boom")
        return {"model": model}


def test_create_side_task_llm_uses_fast_default_without_streaming(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="fast-model",
    )
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_CHAT,
        provider_id=provider.id,
        model="main-model",
    )
    factory = RecordingFactory()

    result = create_side_task_llm(
        repositories,
        factory=factory,
        temperature=0.1,
        max_tokens=128,
    )

    assert result.scope == MODEL_DEFAULT_FAST
    assert result.provider_id == provider.id
    assert result.model == "fast-model"
    assert result.llm == {"model": "fast-model"}
    assert factory.calls[0]["model"] == "fast-model"
    assert factory.calls[0]["settings"].base_url == provider.base_url
    assert factory.calls[0]["settings"].api_key == provider.api_key
    assert factory.calls[0]["temperature"] == 0.1
    assert factory.calls[0]["max_tokens"] == 128
    assert factory.calls[0]["streaming"] is False


def test_create_side_task_llm_fails_when_fast_default_is_missing(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    factory = RecordingFactory()

    error = _capture_error(lambda: create_side_task_llm(repositories, factory=factory))

    assert error.code == "model_default_not_configured"
    assert error.scope == MODEL_DEFAULT_FAST
    assert factory.calls == []


def test_create_side_task_llm_wraps_factory_failure(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="fast-model",
    )

    error = _capture_error(
        lambda: create_side_task_llm(repositories, factory=RecordingFactory(fail=True))
    )

    assert error.code == "side_task_model_create_failed"
    assert error.details["provider_id"] == provider.id
    assert error.details["model"] == "fast-model"


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def _provider() -> ModelProviderRecord:
    now = to_iso_z(utc_now())
    return ModelProviderRecord(
        id="provider-1",
        name="测试供应商",
        base_url="https://api.example/v1",
        api_key="sk-secret",
        enabled=True,
        models=["main-model", "fast-model"],
        model_enabled={},
        health={},
        created_at=now,
        updated_at=now,
    )


def _capture_error(call) -> SideTaskModelError:
    try:
        call()
    except SideTaskModelError as exc:
        return exc
    raise AssertionError("expected SideTaskModelError")
