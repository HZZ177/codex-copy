from backend.app.core.time import to_iso_z, utc_now
from backend.app.storage import (
    MODEL_DEFAULT_CHAT,
    MODEL_DEFAULT_FAST,
    ModelProviderRecord,
    StorageRepositories,
    init_database,
    legacy_model_provider_from_settings,
)


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def _provider() -> ModelProviderRecord:
    now = to_iso_z(utc_now())
    return ModelProviderRecord(
        id="provider-1",
        name="主模型",
        base_url="https://api.example/v1",
        api_key="sk-secret",
        enabled=True,
        models=["qwen-coder", "deepseek-coder"],
        model_enabled={"qwen-coder": True, "deepseek-coder": False},
        health={"qwen-coder": {"status": "healthy"}},
        created_at=now,
        updated_at=now,
    )


def test_model_provider_repository_crud_and_model_default(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()

    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_CHAT,
        provider_id=provider.id,
        model="qwen-coder",
    )

    saved = repositories.model_providers.get(provider.id)
    assert saved == provider
    assert repositories.model_providers.list() == [provider]
    assert repositories.model_providers.get_model_default(MODEL_DEFAULT_CHAT) is not None
    assert repositories.model_providers.get_model_default(MODEL_DEFAULT_CHAT).model == "qwen-coder"

    assert repositories.model_providers.delete(provider.id) is True
    assert repositories.model_providers.get(provider.id) is None
    assert repositories.model_providers.get_model_default(MODEL_DEFAULT_CHAT) is None


def test_model_provider_repository_saves_chat_and_fast_defaults(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()

    repositories.model_providers.upsert(provider)

    assert repositories.model_providers.get_model_default(MODEL_DEFAULT_CHAT) is None
    assert repositories.model_providers.get_model_default(MODEL_DEFAULT_FAST) is None

    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_CHAT,
        provider_id=provider.id,
        model="qwen-coder",
    )
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_FAST,
        provider_id=provider.id,
        model="deepseek-coder",
    )

    default_chat = repositories.model_providers.get_model_default(MODEL_DEFAULT_CHAT)
    fast = repositories.model_providers.get_model_default(MODEL_DEFAULT_FAST)

    assert default_chat is not None
    assert default_chat.scope == MODEL_DEFAULT_CHAT
    assert default_chat.model == "qwen-coder"
    assert fast is not None
    assert fast.scope == MODEL_DEFAULT_FAST
    assert fast.model == "deepseek-coder"


def test_model_provider_repository_rejects_invalid_model_default_scope(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()
    repositories.model_providers.upsert(provider)

    try:
        repositories.model_providers.set_model_default(
            scope="assistant",
            provider_id=provider.id,
            model="qwen-coder",
        )
    except ValueError as exc:
        assert "unknown model default scope" in str(exc)
    else:
        raise AssertionError("invalid model default should be rejected")


def test_model_provider_repository_rejects_empty_default_values(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    provider = _provider()
    repositories.model_providers.upsert(provider)

    for scope, model in [("", "qwen-coder"), (MODEL_DEFAULT_CHAT, "  ")]:
        try:
            repositories.model_providers.set_model_default(
                scope=scope,
                provider_id=provider.id,
                model=model,
            )
        except ValueError:
            pass
        else:
            raise AssertionError("empty model default values should be rejected")


def test_legacy_settings_can_map_to_single_provider() -> None:
    provider = legacy_model_provider_from_settings(
        {
            "base_url": "https://api.example/v1/",
            "api_key": "sk-secret",
            "model": "qwen-coder",
        }
    )

    assert provider is not None
    assert provider.id == "legacy-openai-compatible"
    assert provider.base_url == "https://api.example/v1"
    assert provider.api_key == "sk-secret"
    assert provider.models == ["qwen-coder"]
    assert provider.model_enabled == {"qwen-coder": True}


def test_empty_legacy_settings_do_not_create_fake_provider() -> None:
    assert legacy_model_provider_from_settings({}) is None
