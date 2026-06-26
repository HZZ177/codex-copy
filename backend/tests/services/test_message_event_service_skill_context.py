from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.core.config import AppSettings
from backend.app.events import TurnCompletedAggregator
from backend.app.keydex import KeydexWorkspaceRuntimeCache
from backend.app.services import ChatRequest, ChatService, MessageEventService
from backend.app.services.chat_service import SkillActivationRequest
from backend.app.storage import StorageRepositories, init_database


def _repositories(tmp_path: Path) -> StorageRepositories:
    repositories = StorageRepositories(init_database(tmp_path / "app.db"))
    repositories.sessions.create(
        session_id="ses-history",
        user_id="local-user",
        scene_id="desktop-agent",
    )
    return repositories


def _append(
    repositories: StorageRepositories,
    event_id: str,
    action: str,
    data: dict,
) -> None:
    repositories.message_events.append(
        event_id=event_id,
        session_id="ses-history",
        turn_index=1,
        action=action,
        data=data,
    )


def _write_skill(workspace: Path, name: str = "dev-plan") -> None:
    skill_dir = workspace / ".keydex" / "skills" / name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        f"""---
name: {name}
description: Build a structured development plan.
---

# {name}
This body must not be stored in contextItems.
""",
        encoding="utf-8",
    )


def test_message_event_service_restores_skill_activation_context_item(
    tmp_path: Path,
) -> None:
    repositories = _repositories(tmp_path)
    service = MessageEventService(repositories.message_events)

    _append(
        repositories,
        "evt_skill",
        "system_message",
        {
            "source": "skill_activation",
            "skill_name": "dev-plan",
            "skillName": "dev-plan",
            "skill_source": "workspace",
            "label": "/dev-plan",
            "description": "Build a structured development plan.",
            "metadata": {
                "id": "skill:dev-plan",
                "type": "skill",
                "label": "/dev-plan",
                "skill_name": "dev-plan",
                "source": "workspace",
                "description": "Build a structured development plan.",
            },
        },
    )
    _append(repositories, "evt_user", "user_message", {"content": "拆 issues"})

    messages = service.get_display_messages("ses-history")

    assert len(messages) == 1
    item = messages[0]["contextItems"][0]
    assert item["id"] == "skill:dev-plan"
    assert item["type"] == "skill"
    assert item["label"] == "/dev-plan"
    assert item["skill_name"] == "dev-plan"
    assert item["source"] == "workspace"
    assert item["description"] == "Build a structured development plan."
    assert "This body must not be stored" not in str(item)


@pytest.mark.asyncio
async def test_chat_service_emits_skill_activation_context_before_user_message(
    tmp_path: Path,
) -> None:
    repositories = StorageRepositories(init_database(tmp_path / "app.db"))
    service = ChatService(
        settings=AppSettings(data_dir=tmp_path / "data", workspace_root=tmp_path),
        repositories=repositories,
        agent_runner=object(),
        keydex_runtime_cache=KeydexWorkspaceRuntimeCache(),
    )
    workspace_root = tmp_path / "repo"
    _write_skill(workspace_root)
    workspace = repositories.workspaces.create(workspace_id="ws-project", root_path=workspace_root)
    session = repositories.sessions.create(
        session_id="ses-project",
        user_id="local-user",
        scene_id="desktop-agent",
        session_type="workspace",
        workspace_id=workspace.id,
        cwd=str(workspace_root),
        workspace_roots=[str(workspace_root)],
    )
    snapshot = service.keydex_runtime_cache.get_snapshot(workspace_root)
    dispatcher = service._build_turn_dispatcher(
        session_id=session.id,
        turn_index=1,
        chat_adapter=None,
        aggregator=TurnCompletedAggregator(),
    )
    request = ChatRequest(
        session_id=session.id,
        message="拆 issues",
        model="qwen-coder",
    )

    await service._emit_skill_activation_context(
        dispatcher=dispatcher,
        request=request,
        session=session,
        trace_id="trace-1",
        root_node_id="trace-1-root",
        turn_index=1,
        skill_activation=SkillActivationRequest(skill_name="dev-plan", origin="slash"),
        keydex_snapshot=snapshot,
    )
    await service._emit_user_message(
        dispatcher=dispatcher,
        request=request,
        session=session,
        trace_id="trace-1",
        turn_index=1,
    )

    messages = service.message_event_service.get_display_messages(session.id)

    assert messages[0]["content"] == "拆 issues"
    item = messages[0]["contextItems"][0]
    assert item["type"] == "skill"
    assert item["label"] == "/dev-plan"
    assert item["skill_name"] == "dev-plan"
    assert item["source"] == "workspace"
    assert item["description"] == "Build a structured development plan."
    assert "This body must not be stored" not in str(item)
