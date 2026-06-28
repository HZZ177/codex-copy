from fastapi.testclient import TestClient

from backend.app.core.config import AppSettings
from backend.app.main import create_app


def test_model_defaults_api_returns_missing_defaults(tmp_path) -> None:
    app = create_app(AppSettings(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        _create_provider(client)

        response = client.get("/api/settings/model-defaults")

    assert response.status_code == 200
    defaults = response.json()["defaults"]
    assert defaults["default_chat"]["configured"] is False
    assert defaults["default_chat"]["missing_reason"] == "not_configured"
    assert defaults["fast"]["configured"] is False
    assert defaults["fast"]["missing_reason"] == "not_configured"


def test_model_defaults_api_reads_and_writes_chat_and_fast_defaults(tmp_path) -> None:
    app = create_app(AppSettings(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        provider = _create_provider(client)

        response = client.put(
            "/api/settings/model-defaults",
            json={
                "defaults": {
                    "default_chat": {"provider_id": provider["id"], "model": "qwen-coder"},
                    "fast": {"provider_id": provider["id"], "model": "deepseek-coder"},
                }
            },
        )
        persisted = client.get("/api/settings/model-defaults")

    assert response.status_code == 200
    assert persisted.status_code == 200
    defaults = persisted.json()["defaults"]
    assert defaults["default_chat"]["configured"] is True
    assert defaults["default_chat"]["provider_id"] == provider["id"]
    assert defaults["default_chat"]["provider_name"] == "测试供应商"
    assert defaults["default_chat"]["model"] == "qwen-coder"
    assert defaults["fast"]["configured"] is True
    assert defaults["fast"]["provider_id"] == provider["id"]
    assert defaults["fast"]["model"] == "deepseek-coder"


def test_model_defaults_api_rejects_unknown_provider_and_model(tmp_path) -> None:
    app = create_app(AppSettings(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        provider = _create_provider(client)

        missing_provider = client.put(
            "/api/settings/model-defaults",
            json={"defaults": {"default_chat": {"provider_id": "missing", "model": "qwen-coder"}}},
        )
        missing_model = client.put(
            "/api/settings/model-defaults",
            json={"defaults": {"default_chat": {"provider_id": provider["id"], "model": "missing-model"}}},
        )

    assert missing_provider.status_code == 400
    assert missing_provider.json()["detail"]["code"] == "model_default_provider_not_found"
    assert missing_model.status_code == 400
    assert missing_model.json()["detail"]["code"] == "model_default_model_not_found"


def test_model_defaults_api_rejects_disabled_provider_and_model(tmp_path) -> None:
    app = create_app(AppSettings(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        disabled_provider = client.post(
            "/api/model-providers",
            json={
                "name": "停用供应商",
                "base_url": "http://disabled-provider.test/v1",
                "enabled": False,
                "models": ["qwen-coder"],
            },
        ).json()
        provider = _create_provider(client, model_enabled={"deepseek-coder": False})

        provider_response = client.put(
            "/api/settings/model-defaults",
            json={"defaults": {"default_chat": {"provider_id": disabled_provider["id"], "model": "qwen-coder"}}},
        )
        model_response = client.put(
            "/api/settings/model-defaults",
            json={"defaults": {"fast": {"provider_id": provider["id"], "model": "deepseek-coder"}}},
        )

    assert provider_response.status_code == 400
    assert provider_response.json()["detail"]["code"] == "model_default_provider_disabled"
    assert model_response.status_code == 400
    assert model_response.json()["detail"]["code"] == "model_default_model_disabled"


def test_model_defaults_api_clears_default_without_fallback(tmp_path) -> None:
    app = create_app(AppSettings(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        provider = _create_provider(client)
        client.put(
            "/api/settings/model-defaults",
            json={"defaults": {"default_chat": {"provider_id": provider["id"], "model": "qwen-coder"}}},
        )

        response = client.put("/api/settings/model-defaults", json={"defaults": {"default_chat": None}})

    assert response.status_code == 200
    assert response.json()["defaults"]["default_chat"]["configured"] is False
    assert response.json()["defaults"]["default_chat"]["missing_reason"] == "not_configured"


def _create_provider(
    client: TestClient,
    *,
    model_enabled: dict[str, bool] | None = None,
) -> dict:
    response = client.post(
        "/api/model-providers",
        json={
            "name": "测试供应商",
            "base_url": "http://provider.test/v1/",
            "api_key": "sk-secret",
            "models": ["qwen-coder", "deepseek-coder"],
            "model_enabled": model_enabled or {},
        },
    )
    assert response.status_code == 201
    return response.json()
