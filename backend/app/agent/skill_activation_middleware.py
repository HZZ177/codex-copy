from __future__ import annotations

from typing import Any

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import RemoveMessage, SystemMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES

from backend.app.agent.state import build_pending_skill_activations_reset_update
from backend.app.core.logger import logger


class SkillActivationInjectionMiddleware(AgentMiddleware):
    async def abefore_model(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        pending = list((state or {}).get("pending_skill_activations") or [])
        if not pending:
            return None

        messages = list((state or {}).get("messages") or [])
        injected_messages: list[SystemMessage] = []
        injected_skill_names: list[str] = []
        for item in pending:
            if not isinstance(item, dict):
                continue
            content = str(item.get("content") or "").strip()
            if not content:
                continue
            injected_messages.append(SystemMessage(content=content))
            skill_name = str(item.get("skill_name") or "").strip()
            if skill_name:
                injected_skill_names.append(skill_name)

        reset_update = build_pending_skill_activations_reset_update()
        if not injected_messages:
            return reset_update

        logger.info(
            "[SkillActivationInjectionMiddleware] injected skill activation messages | "
            f"count={len(injected_messages)} | skills={injected_skill_names}"
        )
        return {
            "messages": [
                RemoveMessage(id=REMOVE_ALL_MESSAGES),
                *messages,
                *injected_messages,
            ],
            **reset_update,
        }
