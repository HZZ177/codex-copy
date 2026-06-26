from fastapi.testclient import TestClient

from backend.app.core.config import AppSettings
from backend.app.main import create_app


def test_app_import_and_health_response(tmp_path) -> None:
    client = TestClient(create_app(AppSettings(data_dir=tmp_path / "data")))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": "0.1.0",
        "protocol_version": "2026-06-15",
    }


def test_unknown_api_path_returns_404(tmp_path) -> None:
    client = TestClient(create_app(AppSettings(data_dir=tmp_path / "data")))

    response = client.get("/api/missing")

    assert response.status_code == 404
