from fastapi.testclient import TestClient

from backend.app.core.config import AppSettings
from backend.app.main import create_app

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _client(tmp_path) -> TestClient:
    settings = AppSettings(data_dir=tmp_path / "data")
    return TestClient(create_app(settings))


def _create_workspace(client: TestClient, root) -> dict:
    return client.post(
        "/api/workspaces",
        json={"root_path": str(root), "name": root.name},
    ).json()["workspace"]


def _create_workspace_session(client: TestClient, workspace_id: str) -> dict:
    return client.post(
        "/api/sessions",
        json={"session_type": "workspace", "workspace_id": workspace_id},
    ).json()["session"]


def test_workspace_bound_tree_read_and_search(tmp_path) -> None:
    root = tmp_path / "workspace"
    src = root / "src"
    src.mkdir(parents=True)
    (src / "main.py").write_text("print('ok')\n", encoding="utf-8")
    (root / "README.md").write_text("# Hello\n", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        tree_response = client.get(f"/api/workspaces/{workspace['id']}/tree")
        read_response = client.get(
            f"/api/workspaces/{workspace['id']}/read",
            params={"path": "README.md"},
        )
        search_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "main"},
        )
        default_search_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": ""},
        )

    assert tree_response.status_code == 200
    assert [entry["path"] for entry in tree_response.json()["entries"]] == [
        "src",
        "README.md",
    ]
    assert read_response.status_code == 200
    assert read_response.json() == {
        "path": "README.md",
        "content": "# Hello\n",
        "encoding": "utf-8",
    }
    assert search_response.status_code == 200
    assert search_response.json()[0] == {
        "path": "src/main.py",
        "name": "main.py",
        "type": "file",
    }
    assert default_search_response.status_code == 200
    assert [entry["path"] for entry in default_search_response.json()[:2]] == [
        "src",
        "README.md",
    ]


def test_workspace_search_skips_generated_paths_but_includes_env_files(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / "src").mkdir()
    (root / "src" / "env_reader.py").write_text("print('safe')\n", encoding="utf-8")
    (root / "node_modules").mkdir()
    (root / "node_modules" / "env-package.js").write_text("ignored", encoding="utf-8")
    (root / ".venv").mkdir()
    (root / ".venv" / "env_tool.py").write_text("ignored", encoding="utf-8")
    (root / ".env").write_text("SECRET=ignored\n", encoding="utf-8")
    (root / ".env.local").write_text("SECRET=ignored\n", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "env", "limit": 20},
        )

    assert response.status_code == 200
    paths = [entry["path"] for entry in response.json()]
    assert "src/env_reader.py" in paths
    assert "node_modules/env-package.js" not in paths
    assert ".venv/env_tool.py" not in paths
    assert ".env" in paths
    assert ".env.local" in paths


def test_workspace_search_still_skips_remaining_sensitive_file_names(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / ".npmrc").write_text("//registry.example/:_authToken=ignored\n", encoding="utf-8")
    (root / "id_rsa").write_text("PRIVATE KEY", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        npmrc_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "npmrc", "limit": 20},
        )
        key_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "id_rsa", "limit": 20},
        )

    assert npmrc_response.status_code == 200
    assert key_response.status_code == 200
    assert ".npmrc" not in [entry["path"] for entry in npmrc_response.json()]
    assert "id_rsa" not in [entry["path"] for entry in key_response.json()]


def test_workspace_search_matches_only_entry_names_not_parent_paths(tmp_path) -> None:
    root = tmp_path / "workspace"
    (root / "backend" / "app" / "core").mkdir(parents=True)
    (root / "backend" / "app" / "core" / "config.py").write_text("VALUE = 1\n", encoding="utf-8")
    (root / "frontend").mkdir(parents=True)
    (root / "frontend" / "backend_notes.md").write_text("notes\n", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "backend", "limit": 20},
        )

    assert response.status_code == 200
    paths = [entry["path"] for entry in response.json()]
    assert "backend" in paths
    assert "frontend/backend_notes.md" in paths
    assert "backend/app" not in paths
    assert "backend/app/core/config.py" not in paths


def test_workspace_search_includes_image_file_suffixes(tmp_path) -> None:
    root = tmp_path / "workspace"
    assets = root / "docs" / "assets"
    assets.mkdir(parents=True)
    (assets / "pixel.png").write_bytes(PNG_BYTES)
    (assets / "cover.jpg").write_bytes(b"jpg")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        png_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "png", "limit": 20},
        )
        dotted_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": ".png", "limit": 20},
        )
        jpg_response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "jpg", "limit": 20},
        )

    assert png_response.status_code == 200
    assert dotted_response.status_code == 200
    assert jpg_response.status_code == 200
    assert "docs/assets/pixel.png" in [entry["path"] for entry in png_response.json()]
    assert "docs/assets/pixel.png" in [entry["path"] for entry in dotted_response.json()]
    assert "docs/assets/cover.jpg" in [entry["path"] for entry in jpg_response.json()]


def test_workspace_search_includes_requested_binary_archive_and_pdf_suffixes(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    expected_by_query = {
        "exe": "tool.exe",
        "jar": "plugin.jar",
        "zip": "bundle.zip",
        "tar": "source.tar",
        "gz": "dump.gz",
        "7z": "dataset.7z",
        "rar": "photos.rar",
        "pdf": "manual.pdf",
    }
    for path in expected_by_query.values():
        (root / path).write_bytes(b"binary")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        responses = {
            query: client.get(
                f"/api/workspaces/{workspace['id']}/search",
                params={"q": query, "limit": 20},
            )
            for query in expected_by_query
        }

    for query, response in responses.items():
        assert response.status_code == 200
        assert expected_by_query[query] in [entry["path"] for entry in response.json()]


def test_workspace_search_default_limit_returns_fifty_results(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    for index in range(55):
        (root / f"match-{index:02d}.txt").write_text("x", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        response = client.get(
            f"/api/workspaces/{workspace['id']}/search",
            params={"q": "match"},
        )

    assert response.status_code == 200
    assert len(response.json()) == 50


def test_session_bound_workspace_tree_read_and_search(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / "note.md").write_text("session bound", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        session = _create_workspace_session(client, workspace["id"])
        tree_response = client.get(f"/api/sessions/{session['id']}/workspace/tree")
        read_response = client.get(
            f"/api/sessions/{session['id']}/workspace/read",
            params={"path": "note.md"},
        )
        search_response = client.get(
            f"/api/sessions/{session['id']}/workspace/search",
            params={"q": "note"},
        )

    assert tree_response.status_code == 200
    assert tree_response.json()["entries"][0]["path"] == "note.md"
    assert read_response.status_code == 200
    assert read_response.json()["content"] == "session bound"
    assert search_response.status_code == 200
    assert search_response.json()[0]["path"] == "note.md"


def test_session_workspace_rejects_chat_session(tmp_path) -> None:
    with _client(tmp_path) as client:
        session = client.post("/api/sessions", json={"session_type": "chat"}).json()["session"]
        response = client.get(f"/api/sessions/{session['id']}/workspace/tree")

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "session_not_workspace"


def test_workspace_media_returns_image_data_url(tmp_path) -> None:
    root = tmp_path / "workspace"
    assets = root / "docs" / "assets"
    assets.mkdir(parents=True)
    (assets / "pixel.png").write_bytes(PNG_BYTES)

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        response = client.get(
            f"/api/workspaces/{workspace['id']}/media",
            params={"path": "docs/assets/pixel.png"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["path"] == "docs/assets/pixel.png"
    assert payload["media_type"] == "image/png"
    assert payload["size"] == len(PNG_BYTES)
    assert payload["data_url"].startswith("data:image/png;base64,")


def test_workspace_media_rejects_non_images(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / "note.txt").write_text("not an image", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        response = client.get(
            f"/api/workspaces/{workspace['id']}/media",
            params={"path": "note.txt"},
        )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "workspace_unsupported_media"


def test_workspace_api_rejects_paths_outside_bound_root(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        response = client.get(
            f"/api/workspaces/{workspace['id']}/read",
            params={"path": "../secret.txt"},
        )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "workspace_path_forbidden"


def test_workspace_api_no_longer_accepts_arbitrary_root_parameter(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()

    with _client(tmp_path) as client:
        response = client.get(
            "/api/workspace/read",
            params={"root": str(root), "path": "README.md"},
        )

    assert response.status_code == 404
