from pathlib import Path

import pytest

from backend.app.keydex.skills import (
    SkillDefinition,
    SkillResourcePathError,
    resolve_skill_resource_path,
)


def _skill(root_dir: Path) -> SkillDefinition:
    return SkillDefinition(
        name="dev-plan",
        description="Use this skill.",
        source="workspace",
        root_dir=root_dir,
        entry_file=root_dir / "SKILL.md",
        relative_entry=".keydex/skills/dev-plan/SKILL.md",
    )


def test_resolve_skill_resource_path_allows_paths_inside_skill_root(tmp_path: Path) -> None:
    skill_root = tmp_path / "repo" / ".keydex" / "skills" / "dev-plan"
    resource = skill_root / "references" / "guide.md"
    resource.parent.mkdir(parents=True)
    resource.write_text("guide", encoding="utf-8")

    resolved = resolve_skill_resource_path(_skill(skill_root), "references/guide.md")

    assert resolved == resource.resolve()


def test_resolve_skill_resource_path_rejects_parent_escape(tmp_path: Path) -> None:
    skill_root = tmp_path / "repo" / ".keydex" / "skills" / "dev-plan"
    skill_root.mkdir(parents=True)

    with pytest.raises(SkillResourcePathError) as exc_info:
        resolve_skill_resource_path(_skill(skill_root), "../secret.md")

    assert exc_info.value.code == "skill_resource_forbidden"


def test_resolve_skill_resource_path_rejects_absolute_paths(tmp_path: Path) -> None:
    skill_root = tmp_path / "repo" / ".keydex" / "skills" / "dev-plan"
    skill_root.mkdir(parents=True)

    with pytest.raises(SkillResourcePathError) as exc_info:
        resolve_skill_resource_path(_skill(skill_root), tmp_path / "outside.md")

    assert exc_info.value.code == "skill_resource_forbidden"
