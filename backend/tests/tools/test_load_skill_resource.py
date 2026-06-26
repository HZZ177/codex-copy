from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.core.request_context import reset_request_context, set_request_context
from backend.app.keydex.models import KeydexWorkspaceProfile
from backend.app.keydex.skills import KEYDEX_SKILL_MAX_RESOURCE_BYTES, discover_workspace_skills
from backend.app.tools.skill import run_load_skill


def _write_skill(workspace: Path, name: str = "dev-plan") -> Path:
    skill_dir = workspace / ".keydex" / "skills" / name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "\n".join(
            [
                "---",
                f"name: {name}",
                "description: Build a structured development plan.",
                "---",
                "",
                "# Dev Plan",
            ]
        ),
        encoding="utf-8",
    )
    return skill_dir


def _catalog(workspace: Path):
    profile = KeydexWorkspaceProfile(
        workspace_root=workspace,
        keydex_root=workspace / ".keydex",
        skills_root=workspace / ".keydex" / "skills",
    )
    return discover_workspace_skills(profile)


def _payload(command) -> dict:
    return json.loads(command.update["messages"][0].content)


async def _run_with_catalog(workspace: Path, resource_path: str):
    token = set_request_context(skill_catalog=_catalog(workspace))
    try:
        return await run_load_skill(
            skill_name="dev-plan",
            resource_path=resource_path,
            tool_call_id="call_1",
        )
    finally:
        reset_request_context(token)


@pytest.mark.asyncio
async def test_load_skill_resource_reads_valid_text_file(tmp_path: Path) -> None:
    skill_dir = _write_skill(tmp_path)
    resource = skill_dir / "references" / "guide.md"
    resource.parent.mkdir()
    resource.write_text("resource guide", encoding="utf-8")

    command = await _run_with_catalog(tmp_path, "references/guide.md")

    payload = _payload(command)
    assert payload["found"] is True
    assert payload["loaded"] is True
    assert payload["injected"] is False
    assert payload["content"] == "resource guide"
    assert "pending_skill_activations" not in command.update


@pytest.mark.asyncio
async def test_load_skill_resource_rejects_parent_escape(tmp_path: Path) -> None:
    _write_skill(tmp_path)
    (tmp_path / ".keydex" / "skills" / "secret.md").write_text("secret", encoding="utf-8")

    command = await _run_with_catalog(tmp_path, "../secret.md")

    payload = _payload(command)
    assert payload["code"] == "skill_resource_forbidden"
    assert payload["loaded"] is False


@pytest.mark.asyncio
async def test_load_skill_resource_rejects_missing_file(tmp_path: Path) -> None:
    _write_skill(tmp_path)

    command = await _run_with_catalog(tmp_path, "references/missing.md")

    payload = _payload(command)
    assert payload["code"] == "skill_resource_not_found"
    assert payload["loaded"] is False


@pytest.mark.asyncio
async def test_load_skill_resource_rejects_directory(tmp_path: Path) -> None:
    skill_dir = _write_skill(tmp_path)
    (skill_dir / "references").mkdir()

    command = await _run_with_catalog(tmp_path, "references")

    payload = _payload(command)
    assert payload["code"] == "skill_resource_not_file"
    assert payload["loaded"] is False


@pytest.mark.asyncio
async def test_load_skill_resource_rejects_too_large_file(tmp_path: Path) -> None:
    skill_dir = _write_skill(tmp_path)
    resource = skill_dir / "large.txt"
    resource.write_text("x" * (KEYDEX_SKILL_MAX_RESOURCE_BYTES + 1), encoding="utf-8")

    command = await _run_with_catalog(tmp_path, "large.txt")

    payload = _payload(command)
    assert payload["code"] == "skill_resource_too_large"
    assert payload["loaded"] is False


@pytest.mark.asyncio
async def test_load_skill_resource_rejects_non_utf8_file(tmp_path: Path) -> None:
    skill_dir = _write_skill(tmp_path)
    resource = skill_dir / "binary.bin"
    resource.write_bytes(b"\xff\xfe\xfd")

    command = await _run_with_catalog(tmp_path, "binary.bin")

    payload = _payload(command)
    assert payload["code"] == "skill_resource_not_text"
    assert payload["loaded"] is False
