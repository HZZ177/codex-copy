from pathlib import Path

from backend.app.keydex import load_keydex_workspace_profile, merge_keydex_manifest


def test_load_profile_without_keydex_returns_default_disabled_workspace_layer(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()

    profile = load_keydex_workspace_profile(workspace_root)

    assert profile.workspace_root == workspace_root.resolve()
    assert profile.keydex_root == (workspace_root / ".keydex").resolve()
    assert profile.active_layers[0].scope == "workspace"
    assert profile.active_layers[0].enabled is False
    assert profile.active_layers[0].manifest == {
        "schema_version": 1,
        "skills": {"enabled": True},
    }
    assert profile.skills_enabled is False
    assert profile.skills_root is None
    assert profile.diagnostics == []


def test_load_profile_uses_default_manifest_when_keydex_json_is_absent(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "repo"
    keydex_root = workspace_root / ".keydex"
    keydex_root.mkdir(parents=True)

    profile = load_keydex_workspace_profile(workspace_root)

    assert profile.active_layers[0].enabled is True
    assert profile.active_layers[0].manifest == {
        "schema_version": 1,
        "skills": {"enabled": True},
    }
    assert profile.skills_enabled is True
    assert profile.skills_root == (keydex_root / "skills").resolve()
    assert profile.diagnostics == []


def test_load_profile_honors_skills_disabled_flag(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    keydex_root = workspace_root / ".keydex"
    keydex_root.mkdir(parents=True)
    (keydex_root / "keydex.json").write_text(
        '{"schema_version": 1, "skills": {"enabled": false}}',
        encoding="utf-8",
    )

    profile = load_keydex_workspace_profile(workspace_root)

    assert profile.active_layers[0].manifest["skills"]["enabled"] is False
    assert profile.skills_enabled is False
    assert profile.skills_root is None
    assert profile.diagnostics == []


def test_load_profile_records_invalid_json_and_disables_skills(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    keydex_root = workspace_root / ".keydex"
    keydex_root.mkdir(parents=True)
    (keydex_root / "keydex.json").write_text("{invalid", encoding="utf-8")

    profile = load_keydex_workspace_profile(workspace_root)

    assert profile.active_layers[0].enabled is True
    assert profile.active_layers[0].manifest["skills"]["enabled"] is False
    assert profile.skills_enabled is False
    assert profile.skills_root is None
    assert len(profile.diagnostics) == 1
    assert profile.diagnostics[0].code == "keydex_manifest_invalid"
    assert profile.diagnostics[0].severity == "error"
    assert profile.diagnostics[0].path == ".keydex/keydex.json"


def test_merge_manifest_records_unknown_fields_as_warnings() -> None:
    diagnostics = []

    manifest = merge_keydex_manifest(
        {
            "schema_version": 1,
            "future": True,
            "skills": {"enabled": True, "mode": "workspace"},
        },
        diagnostics,
    )

    assert manifest == {"schema_version": 1, "skills": {"enabled": True}}
    assert [diagnostic.severity for diagnostic in diagnostics] == ["warning", "warning"]
    assert [diagnostic.details["field"] for diagnostic in diagnostics] == [
        "future",
        "skills.mode",
    ]
