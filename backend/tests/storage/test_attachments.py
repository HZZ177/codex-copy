from backend.app.storage import StorageRepositories, init_database


def _repositories(tmp_path) -> StorageRepositories:
    return StorageRepositories(init_database(tmp_path / "app.db"))


def test_attachment_create_and_get(tmp_path):
    repositories = _repositories(tmp_path)

    record = repositories.attachments.create(
        user_id="user-1",
        type="image",
        source="path",
        name="sample.png",
        path=str(tmp_path / "sample.png"),
        mime_type="image/png",
        size=12,
    )

    loaded = repositories.attachments.get(record.id)
    assert loaded == record
    assert loaded is not None
    assert loaded.id == record.id


def test_attachment_claim_for_session(tmp_path):
    repositories = _repositories(tmp_path)
    session = repositories.sessions.create(
        session_id="session-1",
        user_id="user-1",
        scene_id="scene-1",
    )
    record = repositories.attachments.create(
        user_id="user-1",
        type="image",
        source="pasted",
        name="sample.png",
        path=str(tmp_path / "sample.png"),
        mime_type="image/png",
        size=12,
    )

    repositories.attachments.claim_for_session(
        [record.id],
        session_id=session.id,
        user_id="user-1",
    )

    loaded = repositories.attachments.get(record.id)
    assert loaded is not None
    assert loaded.session_id == session.id
