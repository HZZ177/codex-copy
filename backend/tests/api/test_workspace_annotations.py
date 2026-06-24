from fastapi.testclient import TestClient

from backend.app.core.config import AppSettings
from backend.app.main import create_app


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


def _anchor(**overrides) -> dict:
    anchor = {
        "version": 2,
        "kind": "source-range",
        "sourceStart": 0,
        "sourceEnd": 11,
        "selectedText": "print('ok')",
        "sourceText": "print('ok')",
        "contentHash": "hash-1",
        "lineStart": 1,
        "lineEnd": 1,
        "columnStart": 1,
        "columnEnd": 12,
        "createdInView": "source",
    }
    anchor.update(overrides)
    return anchor


def test_session_workspace_annotation_crud(tmp_path) -> None:
    root = tmp_path / "workspace"
    src = root / "src"
    src.mkdir(parents=True)
    (src / "main.py").write_text("print('ok')\nprint('done')\n", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        session = _create_workspace_session(client, workspace["id"])
        create_response = client.post(
            f"/api/sessions/{session['id']}/workspace/annotations",
            json={
                "path": "src/main.py",
                "anchor_type": "selection",
                "selected_text": "print('ok')",
                "line_start": 1,
                "line_end": 1,
                "column_start": 1,
                "column_end": 12,
                "comment": "Please explain this print",
                "content_hash": "hash-1",
                "anchor_json": _anchor(),
            },
        )
        annotation_id = create_response.json()["id"]
        list_response = client.get(
            f"/api/sessions/{session['id']}/workspace/annotations",
            params={"path": "src/main.py"},
        )
        update_response = client.patch(
            f"/api/sessions/{session['id']}/workspace/annotations/{annotation_id}",
            json={"comment": "Updated comment"},
        )
        delete_response = client.delete(
            f"/api/sessions/{session['id']}/workspace/annotations/{annotation_id}",
        )
        list_after_delete_response = client.get(
            f"/api/sessions/{session['id']}/workspace/annotations",
            params={"path": "src/main.py"},
        )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["scope_type"] == "session"
    assert created["scope_id"] == session["id"]
    assert created["workspace_id"] == workspace["id"]
    assert created["path"] == "src/main.py"
    assert created["anchor_type"] == "selection"
    assert created["selected_text"] == "print('ok')"
    assert created["line_start"] == 1
    assert created["column_end"] == 12
    assert created["comment"] == "Please explain this print"
    assert create_response.json()["content_hash"] == "hash-1"
    assert created["anchor_json"] == _anchor()

    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [annotation_id]

    assert update_response.status_code == 200
    assert update_response.json()["comment"] == "Updated comment"
    assert update_response.json()["selected_text"] == "print('ok')"
    assert update_response.json()["anchor_json"] == _anchor()

    assert delete_response.status_code == 204
    assert list_after_delete_response.status_code == 200
    assert list_after_delete_response.json() == []


def test_workspace_annotations_are_isolated_from_session_scope(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / "README.md").write_text("# Notes\n", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        session = _create_workspace_session(client, workspace["id"])
        workspace_create = client.post(
            f"/api/workspaces/{workspace['id']}/annotations",
            json={"path": "README.md", "anchor_type": "file", "comment": "Workspace note"},
        )
        session_create = client.post(
            f"/api/sessions/{session['id']}/workspace/annotations",
            json={"path": "README.md", "anchor_type": "file", "comment": "Session note"},
        )
        workspace_list = client.get(
            f"/api/workspaces/{workspace['id']}/annotations",
            params={"path": "README.md"},
        )
        session_list = client.get(
            f"/api/sessions/{session['id']}/workspace/annotations",
            params={"path": "README.md"},
        )

    assert workspace_create.status_code == 201
    assert session_create.status_code == 201
    assert [item["id"] for item in workspace_list.json()] == [workspace_create.json()["id"]]
    assert [item["id"] for item in session_list.json()] == [session_create.json()["id"]]


def test_workspace_annotation_api_validates_paths_and_payloads(tmp_path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / "note.md").write_text("note\n", encoding="utf-8")
    outside = tmp_path / "secret.md"
    outside.write_text("secret\n", encoding="utf-8")

    with _client(tmp_path) as client:
        workspace = _create_workspace(client, root)
        forbidden = client.post(
            f"/api/workspaces/{workspace['id']}/annotations",
            json={"path": "../secret.md", "anchor_type": "file", "comment": "bad"},
        )
        empty_comment = client.post(
            f"/api/workspaces/{workspace['id']}/annotations",
            json={"path": "note.md", "anchor_type": "file", "comment": " "},
        )
        bad_range = client.post(
            f"/api/workspaces/{workspace['id']}/annotations",
            json={
                "path": "note.md",
                "anchor_type": "selection",
                "selected_text": "note",
                "line_start": 3,
                "line_end": 2,
                "comment": "bad range",
            },
        )
        bad_anchor = client.post(
            f"/api/workspaces/{workspace['id']}/annotations",
            json={
                "path": "note.md",
                "anchor_type": "selection",
                "selected_text": "note",
                "comment": "bad anchor",
                "anchor_json": _anchor(
                    sourceEnd=0,
                    selectedText="note",
                    sourceText="note",
                    lineStart=1,
                    lineEnd=1,
                    columnEnd=5,
                ),
            },
        )
        legacy_selection = client.post(
            f"/api/workspaces/{workspace['id']}/annotations",
            json={
                "path": "note.md",
                "anchor_type": "selection",
                "selected_text": "note",
                "comment": "legacy selection",
            },
        )

    assert forbidden.status_code == 403
    assert forbidden.json()["detail"]["code"] == "workspace_path_forbidden"
    assert empty_comment.status_code == 400
    assert empty_comment.json()["detail"]["code"] == "workspace_annotation_invalid"
    assert bad_range.status_code == 400
    assert bad_range.json()["detail"]["code"] == "workspace_annotation_invalid"
    assert bad_anchor.status_code == 400
    assert bad_anchor.json()["detail"]["code"] == "workspace_annotation_invalid"
    assert legacy_selection.status_code == 201
    assert legacy_selection.json()["anchor_json"] is None


def test_session_annotation_api_requires_workspace_session(tmp_path) -> None:
    with _client(tmp_path) as client:
        session = client.post("/api/sessions", json={"session_type": "chat"}).json()["session"]
        response = client.get(
            f"/api/sessions/{session['id']}/workspace/annotations",
            params={"path": "README.md"},
        )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "session_not_workspace"
