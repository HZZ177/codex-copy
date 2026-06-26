from contextvars import copy_context
from pathlib import Path

import pytest

from backend.app.agent.tool_call_preset import ToolCallPreset, ToolCallPresetItem
from backend.app.core.request_context import (
    consume_tool_call_preset,
    get_keydex_snapshot,
    get_skill_catalog,
    get_tool_call_preset,
    reset_request_context,
    set_request_context,
)
from backend.app.keydex import KeydexWorkspaceRuntimeCache


def test_tool_call_preset_serializes_force_calls() -> None:
    preset = ToolCallPreset(
        type="force",
        calls=[ToolCallPresetItem(name="load_skill", args={"skill_name": "dev-plan"})],
        metadata={"origin": "slash"},
    )

    assert preset.to_dict() == {
        "type": "force",
        "producer": "skill_activation",
        "calls": [{"name": "load_skill", "args": {"skill_name": "dev-plan"}}],
        "metadata": {"origin": "slash"},
    }


def test_force_tool_call_preset_requires_non_empty_args() -> None:
    with pytest.raises(ValueError, match="non-empty args"):
        ToolCallPreset(type="force", calls=[ToolCallPresetItem(name="load_skill", args={})])


def test_tool_call_preset_rejects_unapproved_producer() -> None:
    with pytest.raises(ValueError, match="producer"):
        ToolCallPreset(
            type="force",
            calls=[ToolCallPresetItem(name="load_skill", args={"skill_name": "dev-plan"})],
            producer="ui_action",  # type: ignore[arg-type]
        )


def test_request_context_get_and_consume_tool_call_preset(tmp_path: Path) -> None:
    preset = ToolCallPreset(
        type="force",
        calls=[ToolCallPresetItem(name="load_skill", args={"skill_name": "dev-plan"})],
    )
    snapshot = _snapshot(tmp_path)
    token = set_request_context(
        trace_id="trace-1",
        tool_call_preset=preset,
        skill_catalog=snapshot.skill_catalog,
        keydex_snapshot=snapshot,
    )
    try:
        assert get_tool_call_preset() is preset
        assert get_skill_catalog() is snapshot.skill_catalog
        assert get_keydex_snapshot() is snapshot
        assert consume_tool_call_preset() is preset
        assert get_tool_call_preset() is None
        assert consume_tool_call_preset() is None
    finally:
        reset_request_context(token)

    assert get_tool_call_preset() is None
    assert get_skill_catalog() is None
    assert get_keydex_snapshot() is None


def test_tool_call_preset_consumption_survives_copied_context(
    tmp_path: Path,
) -> None:
    preset = ToolCallPreset(
        type="force",
        calls=[ToolCallPresetItem(name="load_skill", args={"skill_name": "dev-plan"})],
    )
    token = set_request_context(tool_call_preset=preset)
    copied_context = copy_context()
    try:
        assert copied_context.run(get_tool_call_preset) is preset
        assert copied_context.run(consume_tool_call_preset) is preset
        assert get_tool_call_preset() is None
        assert consume_tool_call_preset() is None
    finally:
        reset_request_context(token)


def test_request_context_reset_restores_outer_preset(tmp_path: Path) -> None:
    outer = ToolCallPreset(
        type="force",
        calls=[ToolCallPresetItem(name="load_skill", args={"skill_name": "outer"})],
    )
    inner = ToolCallPreset(
        type="force",
        calls=[ToolCallPresetItem(name="load_skill", args={"skill_name": "inner"})],
    )
    outer_token = set_request_context(tool_call_preset=outer)
    try:
        inner_token = set_request_context(tool_call_preset=inner)
        assert get_tool_call_preset() is inner
        reset_request_context(inner_token)
        assert get_tool_call_preset() is outer
    finally:
        reset_request_context(outer_token)


def _snapshot(tmp_path: Path):
    skill_dir = tmp_path / "repo" / ".keydex" / "skills" / "dev-plan"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: dev-plan\ndescription: Use this skill.\n---\n",
        encoding="utf-8",
    )
    return KeydexWorkspaceRuntimeCache().get_snapshot(tmp_path / "repo")
