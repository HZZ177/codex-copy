from backend.app.core.time import to_iso_z, utc_now
from backend.app.model import ModelSelectionError, resolve_model_default, resolve_model_selection
from backend.app.storage import (
    MODEL_DEFAULT_CHAT,
    MODEL_DEFAULT_FAST,
    ModelProviderRecord,
    StorageRepositories,
    init_database,
)


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def _provider(**overrides) -> ModelProviderRecord:
    now = to_iso_z(utc_now())
    return ModelProviderRecord(
        id=overrides.pop("id", "provider-1"),
        name=overrides.pop("name", "测试供应商"),
        base_url=overrides.pop("base_url", "https://api.example/v1"),
        api_key=overrides.pop("api_key", "sk-secret"),
        enabled=overrides.pop("enabled", True),
        models=overrides.pop("models", ["qwen-coder", "deepseek-coder"]),
        model_enabled=overrides.pop("model_enabled", {}),
        health=overrides.pop("health", {}),
        created_at=now,
        updated_at=now,
        **overrides,
    )


def test_resolve_model_default_returns_model_settings(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="qwen-coder",
    )

    resolved = resolve_model_default(repositories, MODEL_DEFAULT_FAST)

    assert resolved.scope == MODEL_DEFAULT_FAST
    assert resolved.provider_id == provider.id
    assert resolved.provider_name == provider.name
    assert resolved.settings.base_url == provider.base_url
    assert resolved.settings.api_key == provider.api_key
    assert resolved.settings.model == "qwen-coder"


def test_resolve_model_selection_requires_explicit_provider_and_model(tmp_path) -> None:
    repositories = _repositories(tmp_path)

    error = _capture_error(
        lambda: resolve_model_selection(repositories, provider_id="", model="qwen-coder")
    )

    assert error.code == "model_selection_required"
    assert error.scope == "chat"
    assert error.details["provider_id"] is None
    assert error.details["model"] == "qwen-coder"


def test_resolve_model_selection_allows_same_model_name_across_providers(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider_a = _provider(id="provider-a", name="供应商 A", models=["shared-model"])
    provider_b = _provider(id="provider-b", name="供应商 B", models=["shared-model"])
    repositories.model_providers.upsert(provider_a)
    repositories.model_providers.upsert(provider_b)

    resolved = resolve_model_selection(repositories, provider_id="provider-b", model="shared-model")

    assert resolved.provider_id == "provider-b"
    assert resolved.provider_name == "供应商 B"
    assert resolved.settings.base_url == provider_b.base_url
    assert resolved.settings.model == "shared-model"


def test_resolve_model_default_reports_missing_fast_default(tmp_path) -> None:
    repositories = _repositories(tmp_path)

    error = _capture_error(lambda: resolve_model_default(repositories, MODEL_DEFAULT_FAST))

    assert error.code == "model_default_not_configured"
    assert error.scope == MODEL_DEFAULT_FAST


def test_resolve_model_default_rejects_disabled_provider_and_model(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    disabled_provider = _provider(id="disabled-provider", enabled=False)
    disabled_model_provider = _provider(
        id="disabled-model-provider", model_enabled={"deepseek-coder": False}
    )
    repositories.model_providers.upsert(disabled_provider)
    repositories.model_providers.upsert(disabled_model_provider)

    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_CHAT,
        provider_id=disabled_provider.id,
        model="qwen-coder",
    )
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=disabled_model_provider.id,
        model="deepseek-coder",
    )

    provider_error = _capture_error(lambda: resolve_model_default(repositories, MODEL_DEFAULT_CHAT))
    model_error = _capture_error(lambda: resolve_model_default(repositories, MODEL_DEFAULT_FAST))

    assert provider_error.code == "model_default_provider_disabled"
    assert model_error.code == "model_default_model_disabled"


def test_resolve_model_default_rejects_unknown_scope(tmp_path) -> None:
    repositories = _repositories(tmp_path)

    error = _capture_error(lambda: resolve_model_default(repositories, "assistant"))

    assert error.code == "model_default_unknown"
    assert error.details["expected"] == "default_chat, fast"


def _capture_error(call) -> ModelSelectionError:
    try:
        call()
    except ModelSelectionError as exc:
        return exc
    raise AssertionError("expected ModelSelectionError")
