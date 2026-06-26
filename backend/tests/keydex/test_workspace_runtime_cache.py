from pathlib import Path

from backend.app.keydex import KeydexWorkspaceRuntimeCache


def _write_skill(skill_dir: Path, *, name: str, description: str = "Use this skill.") -> None:
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(
        f"""---
name: {name}
description: {description}
---

# {name}
""",
        encoding="utf-8",
    )


def test_runtime_cache_reuses_snapshot_for_same_normalized_workspace_root(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "repo"
    _write_skill(workspace_root / ".keydex" / "skills" / "dev-plan", name="dev-plan")
    cache = KeydexWorkspaceRuntimeCache()

    first = cache.get_snapshot(workspace_root / ".")
    second = cache.get_snapshot(workspace_root)

    assert second is first


def test_runtime_cache_force_reload_rebuilds_snapshot(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    _write_skill(workspace_root / ".keydex" / "skills" / "dev-plan", name="dev-plan")
    cache = KeydexWorkspaceRuntimeCache()

    first = cache.get_snapshot(workspace_root)
    second = cache.get_snapshot(workspace_root, force_reload=True)

    assert second is not first
    assert second.fingerprint == first.fingerprint


def test_runtime_cache_rebuilds_when_fingerprint_changes(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    skill_dir = workspace_root / ".keydex" / "skills" / "dev-plan"
    _write_skill(skill_dir, name="dev-plan")
    cache = KeydexWorkspaceRuntimeCache()
    first = cache.get_snapshot(workspace_root)

    _write_skill(skill_dir, name="dev-plan", description="Use this updated skill.")
    second = cache.get_snapshot(workspace_root)

    assert second is not first
    assert second.fingerprint != first.fingerprint
    assert second.skill_catalog.skills["dev-plan"].description == "Use this updated skill."


def test_runtime_cache_rebuilds_for_same_size_skill_entry_content_change(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    skill_dir = workspace_root / ".keydex" / "skills" / "dev-plan"
    _write_skill(skill_dir, name="dev-plan", description="Use skill A.")
    cache = KeydexWorkspaceRuntimeCache()
    first = cache.get_snapshot(workspace_root)

    _write_skill(skill_dir, name="dev-plan", description="Use skill B.")
    second = cache.get_snapshot(workspace_root)

    assert second is not first
    assert second.fingerprint != first.fingerprint
    assert second.skill_catalog.skills["dev-plan"].description == "Use skill B."


def test_runtime_cache_invalidate_rebuilds_single_workspace(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    _write_skill(workspace_root / ".keydex" / "skills" / "dev-plan", name="dev-plan")
    cache = KeydexWorkspaceRuntimeCache()
    first = cache.get_snapshot(workspace_root)

    cache.invalidate(workspace_root)
    second = cache.get_snapshot(workspace_root)

    assert second is not first


def test_runtime_cache_invalidate_all_rebuilds_snapshots(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    _write_skill(workspace_root / ".keydex" / "skills" / "dev-plan", name="dev-plan")
    cache = KeydexWorkspaceRuntimeCache()
    first = cache.get_snapshot(workspace_root)

    cache.invalidate_all()
    second = cache.get_snapshot(workspace_root)

    assert second is not first
