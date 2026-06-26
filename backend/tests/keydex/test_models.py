from pathlib import Path

from backend.app.keydex import (
    KeydexDiagnostic,
    KeydexLayer,
    KeydexWorkspaceProfile,
)


def test_keydex_diagnostic_serializes() -> None:
    diagnostic = KeydexDiagnostic(
        code="manifest_invalid",
        reason="invalid json",
        path=".keydex/keydex.json",
        severity="error",
        details={"line": 1},
    )

    assert diagnostic.to_dict() == {
        "code": "manifest_invalid",
        "reason": "invalid json",
        "path": ".keydex/keydex.json",
        "severity": "error",
        "details": {"line": 1},
    }


def test_keydex_layer_normalizes_root(tmp_path: Path) -> None:
    layer = KeydexLayer(
        scope="workspace",
        root=tmp_path / "repo" / ".keydex",
        enabled=True,
        manifest={"schema_version": 1},
    )

    assert layer.root.is_absolute()
    assert layer.root == (tmp_path / "repo" / ".keydex").resolve()


def test_keydex_workspace_profile_preserves_workspace_scope(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    keydex_root = workspace_root / ".keydex"
    skills_root = keydex_root / "skills"
    layer = KeydexLayer(
        scope="workspace",
        root=keydex_root,
        enabled=True,
        manifest={"schema_version": 1, "skills": {"enabled": True}},
    )

    profile = KeydexWorkspaceProfile(
        workspace_root=workspace_root,
        keydex_root=keydex_root,
        active_layers=[layer],
        skills_root=skills_root,
        skills_enabled=True,
    )

    assert profile.workspace_root == workspace_root.resolve()
    assert profile.keydex_root == keydex_root.resolve()
    assert profile.skills_root == skills_root.resolve()
    assert profile.active_layers == [layer]
    assert profile.active_layers[0].scope == "workspace"
