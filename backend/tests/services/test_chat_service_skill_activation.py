from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.core.config import AppSettings
from backend.app.core.time import to_iso_z, utc_now
from backend.app.services import ChatRequest, ChatService
from backend.app.services.chat_service import (
    MessageInjectionRole,
    MessageInjectionType,
    SkillActivationError,
    SkillActivationRequest,
    _build_message_injection_items,
    _build_skill_activation_request,
)
from backend.app.storage import MODEL_DEFAULT_CHAT, ModelProviderRecord, StorageRepositories, init_database


def _service(tmp_path: Path) -> tuple[ChatService, StorageRepositories]:
    repositories = StorageRepositories(init_database(tmp_path / "app.db"))
    _configure_model_default(repositories)
    service = ChatService(
        settings=AppSettings(data_dir=tmp_path / "data", workspace_root=tmp_path),
        repositories=repositories,
        agent_runner=object(),  # validation tests fail before agent execution
    )
    return service, repositories


def _configure_model_default(repositories: StorageRepositories) -> None:
    now = to_iso_z(utc_now())
    provider = ModelProviderRecord(
        id="provider-1",
        name="测试模型服务",
        base_url="http://model.test/v1",
        api_key="test-key",
        enabled=True,
        models=["qwen-coder"],
        model_enabled={},
        health={},
        created_at=now,
        updated_at=now,
    )
    repositories.model_providers.upsert(provider)
    repositories.model_providers.set_model_default(
        scope=MODEL_DEFAULT_CHAT,
        provider_id=provider.id,
        model="qwen-coder",
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
""",
        encoding="utf-8",
    )


def test_skill_activation_parser_supports_snake_case() -> None:
    activation = _build_skill_activation_request(
        {
            "skill_activation": {
                "skill_name": "dev-plan",
                "source": "workspace",
                "origin": "slash",
            }
        }
    )

    assert activation == SkillActivationRequest(
        skill_name="dev-plan",
        source="workspace",
        origin="slash",
    )


def test_skill_activation_parser_supports_camel_case() -> None:
    activation = _build_skill_activation_request(
        {
            "skillActivation": {
                "skillName": "dev-plan",
                "source": "workspace",
                "origin": "slash",
            }
        }
    )

    assert activation == SkillActivationRequest(
        skill_name="dev-plan",
        source="workspace",
        origin="slash",
    )


def test_skill_activation_parser_rejects_invalid_public_shape() -> None:
    with pytest.raises(SkillActivationError) as not_object:
        _build_skill_activation_request({"skill_activation": "dev-plan"})
    assert not_object.value.code == "skill_activation_invalid"

    with pytest.raises(SkillActivationError) as empty_name:
        _build_skill_activation_request({"skill_activation": {"skill_name": ""}})
    assert empty_name.value.code == "skill_activation_invalid"

    with pytest.raises(SkillActivationError) as source_unsupported:
        _build_skill_activation_request(
            {"skill_activation": {"skill_name": "dev-plan", "source": "system"}}
        )
    assert source_unsupported.value.code == "skill_source_unsupported"


def test_skill_activation_parser_rejects_public_tool_call_preset() -> None:
    with pytest.raises(SkillActivationError) as exc_info:
        _build_skill_activation_request(
            {
                "tool_call_preset": {
                    "type": "force",
                    "calls": [{"name": "load_skill", "args": {"skill_name": "dev-plan"}}],
                }
            }
        )
    assert exc_info.value.code == "skill_activation_invalid"


def test_skill_activation_does_not_break_message_injection_parser() -> None:
    items = _build_message_injection_items(
        {
            "skill_activation": {"skill_name": "dev-plan"},
            "message_injection": [
                {
                    "type": MessageInjectionType.FOLLOW.value,
                    "role": MessageInjectionRole.SYSTEM.value,
                    "content": "extra context",
                }
            ],
        }
    )

    assert len(items) == 1
    assert items[0].content == "extra context"


@pytest.mark.asyncio
async def test_chat_service_rejects_skill_activation_for_chat_session(tmp_path: Path) -> None:
    service, repositories = _service(tmp_path)
    session = repositories.sessions.create(
        session_id="ses-chat",
        user_id="local-user",
        scene_id="desktop-agent",
    )

    result = await service.handle_chat(
        ChatRequest(
            session_id=session.id,
            message="use skill",
            provider_id="provider-1",
            model="qwen-coder",
            runtime_params={"skill_activation": {"skill_name": "dev-plan"}},
        )
    )

    assert result.status == "failed"
    assert result.error == "Workspace Skills can only be used in workspace sessions"
    events = repositories.message_events.list_by_session(session.id)
    assert events[-1].data["code"] == "skill_session_unsupported"


@pytest.mark.asyncio
async def test_chat_service_rejects_missing_workspace_skill(tmp_path: Path) -> None:
    service, repositories = _service(tmp_path)
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
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

    result = await service.handle_chat(
        ChatRequest(
            session_id=session.id,
            message="use skill",
            provider_id="provider-1",
            model="qwen-coder",
            runtime_params={"skill_activation": {"skill_name": "dev-plan"}},
        )
    )

    assert result.status == "failed"
    assert result.error == "Skill does not exist or has been deleted"
    events = repositories.message_events.list_by_session(session.id)
    assert events[-1].data["code"] == "skill_not_found"
    assert events[-1].data["details"] == {"skill_name": "dev-plan"}


def test_chat_service_accepts_existing_workspace_skill(tmp_path: Path) -> None:
    service, repositories = _service(tmp_path)
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

    service._validate_skill_activation(
        SkillActivationRequest(skill_name="dev-plan"),
        session,
    )
