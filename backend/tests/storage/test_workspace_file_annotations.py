from __future__ import annotations

import time

import pytest

from backend.app.storage import StorageRepositories, init_database


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def test_workspace_file_annotations_create_update_delete_and_order(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    repositories.workspaces.create(
        workspace_id="ws_1",
        root_path=workspace_root,
        name="workspace",
    )

    first = repositories.workspace_file_annotations.create(
        annotation_id="ann_001",
        scope_type="session",
        scope_id="ses_1",
        workspace_id="ws_1",
        path="src/main.py",
        anchor_type="file",
        comment="Review the whole file",
    )
    second = repositories.workspace_file_annotations.create(
        annotation_id="ann_002",
        scope_type="session",
        scope_id="ses_1",
        workspace_id="ws_1",
        path="src/main.py",
        anchor_type="selection",
        selected_text="print('ok')",
        line_start=2,
        line_end=2,
        column_start=1,
        column_end=12,
        comment="Explain this line",
        content_hash="abc123",
    )

    listed = repositories.workspace_file_annotations.list(
        scope_type="session",
        scope_id="ses_1",
        path="src/main.py",
    )
    assert {record.id for record in listed} == {first.id, second.id}
    assert second.selected_text == "print('ok')"
    assert second.line_start == 2
    assert second.content_hash == "abc123"

    time.sleep(0.01)
    updated = repositories.workspace_file_annotations.update(
        first.id,
        scope_type="session",
        scope_id="ses_1",
        anchor_type="file",
        comment="Updated file-level note",
    )

    assert updated is not None
    assert updated.comment == "Updated file-level note"
    assert updated.updated_at >= first.updated_at
    listed_after_update = repositories.workspace_file_annotations.list(
        scope_type="session",
        scope_id="ses_1",
        path="src/main.py",
    )
    assert listed_after_update[0].id == first.id

    assert repositories.workspace_file_annotations.delete(
        first.id,
        scope_type="session",
        scope_id="ses_1",
    )
    assert repositories.workspace_file_annotations.get(
        first.id,
        scope_type="session",
        scope_id="ses_1",
    ) is None
    assert [
        record.id
        for record in repositories.workspace_file_annotations.list(
            scope_type="session",
            scope_id="ses_1",
            path="src/main.py",
        )
    ] == [second.id]


def test_workspace_file_annotations_are_isolated_by_scope_and_path(tmp_path) -> None:
    repositories = _repositories(tmp_path)
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    repositories.workspaces.create(
        workspace_id="ws_1",
        root_path=workspace_root,
        name="workspace",
    )
    repositories.workspace_file_annotations.create(
        annotation_id="ann_session",
        scope_type="session",
        scope_id="ses_1",
        workspace_id="ws_1",
        path="README.md",
        anchor_type="file",
        comment="Session note",
    )
    repositories.workspace_file_annotations.create(
        annotation_id="ann_workspace",
        scope_type="workspace",
        scope_id="ws_1",
        workspace_id="ws_1",
        path="README.md",
        anchor_type="file",
        comment="Workspace note",
    )
    repositories.workspace_file_annotations.create(
        annotation_id="ann_other_path",
        scope_type="session",
        scope_id="ses_1",
        workspace_id="ws_1",
        path="docs/README.md",
        anchor_type="file",
        comment="Other path note",
    )

    session_records = repositories.workspace_file_annotations.list(
        scope_type="session",
        scope_id="ses_1",
        path="README.md",
    )
    workspace_records = repositories.workspace_file_annotations.list(
        scope_type="workspace",
        scope_id="ws_1",
        path="README.md",
    )

    assert [record.id for record in session_records] == ["ann_session"]
    assert [record.id for record in workspace_records] == ["ann_workspace"]


@pytest.mark.parametrize(
    "payload",
    [
        {"path": "../outside.py", "anchor_type": "file", "comment": "bad path"},
        {"path": "src/main.py", "anchor_type": "file", "comment": " "},
        {"path": "src/main.py", "anchor_type": "unknown", "comment": "bad anchor"},
        {
            "path": "src/main.py",
            "anchor_type": "selection",
            "comment": "missing text",
        },
        {
            "path": "src/main.py",
            "anchor_type": "selection",
            "selected_text": "x",
            "line_start": 3,
            "line_end": 2,
            "comment": "bad range",
        },
    ],
)
def test_workspace_file_annotations_validate_payload(tmp_path, payload) -> None:
    repositories = _repositories(tmp_path)

    with pytest.raises(ValueError):
        repositories.workspace_file_annotations.create(
            scope_type="session",
            scope_id="ses_1",
            workspace_id="ws_1",
            **payload,
        )
