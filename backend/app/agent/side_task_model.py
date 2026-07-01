from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from backend.app.agent.factory import AgentFactory, agent_factory
from backend.app.model import ModelSelectionError, resolve_model_default
from backend.app.storage import MODEL_DEFAULT_FAST, StorageRepositories


@dataclass(frozen=True)
class SideTaskLLM:
    scope: str
    provider_id: str
    provider_name: str
    model: str
    llm: Any


class SideTaskModelError(RuntimeError):
    def __init__(
        self, code: str, message: str, *, scope: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.scope = scope
        self.details = {"scope": scope, **(details or {})}


def create_side_task_llm(
    repositories: StorageRepositories,
    *,
    scope: str = MODEL_DEFAULT_FAST,
    factory: AgentFactory = agent_factory,
    http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> SideTaskLLM:
    try:
        resolved = resolve_model_default(repositories, scope)
    except ModelSelectionError as exc:
        raise SideTaskModelError(
            exc.code,
            str(exc),
            scope=exc.scope,
            details=exc.details,
        ) from exc
    try:
        llm = factory.get_or_create_llm(
            resolved.settings,
            model=resolved.settings.model,
            temperature=temperature,
            max_tokens=max_tokens,
            streaming=False,
            http_transport=http_transport,
            llm_request_logs=repositories.llm_request_logs,
            provider_id=resolved.provider_id,
            provider_name=resolved.provider_name,
        )
    except Exception as exc:
        raise SideTaskModelError(
            "side_task_model_create_failed",
            str(exc),
            scope=scope,
            details={"provider_id": resolved.provider_id, "model": resolved.settings.model},
        ) from exc
    return SideTaskLLM(
        scope=scope,
        provider_id=resolved.provider_id,
        provider_name=resolved.provider_name,
        model=resolved.settings.model,
        llm=llm,
    )
