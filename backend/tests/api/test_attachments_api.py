from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.core.config import AppSettings
from backend.app.main import create_app


def test_upload_local_file_returns_stored_path_without_attachment_record(tmp_path) -> None:
    app = create_app(AppSettings(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        response = client.post(
            "/api/attachments/local-file?filename=notes.txt&source=pasted",
            content=b"plain text",
            headers={"content-type": "text/plain"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "notes.txt"
    assert body["source"] == "pasted"
    assert body["mime_type"] == "text/plain"
    assert body["size"] == len(b"plain text")
    stored_path = Path(body["path"])
    assert stored_path.exists()
    assert stored_path.read_bytes() == b"plain text"
    assert app.state.repositories.attachments.get(body["id"]) is None
