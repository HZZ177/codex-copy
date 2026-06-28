from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.model.base import ModelSettings
from backend.app.storage import (
    MODEL_DEFAULT_CHAT,
    MODEL_DEFAULT_FAST,
    MODEL_DEFAULT_SCOPES,
    StorageRepositories,
)


@dataclass(frozen=True)
class ResolvedModelSelection:
    scope: str
    provider_id: str
    provider_name: str
    settings: ModelSettings


class ModelSelectionError(ValueError):
    def __init__(
        self, code: str, message: str, *, scope: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.scope = scope
        self.details = {"scope": scope, **(details or {})}


def resolve_model_default(
    repositories: StorageRepositories,
    scope: str,
) -> ResolvedModelSelection:
    normalized_scope = _require_default_scope(scope)
    default = repositories.model_providers.get_model_default(normalized_scope)
    if default is None:
        raise ModelSelectionError(
            "model_default_not_configured",
            f"{_scope_label(normalized_scope)}未配置",
            scope=normalized_scope,
        )
    return resolve_model_selection(
        repositories,
        provider_id=default.provider_id,
        model=default.model,
        scope=normalized_scope,
        label=_scope_label(normalized_scope),
        code_prefix="model_default",
    )


def resolve_model_selection(
    repositories: StorageRepositories,
    *,
    provider_id: str,
    model: str,
    scope: str = "chat",
    label: str = "对话模型",
    code_prefix: str = "model_selection",
) -> ResolvedModelSelection:
    cleaned_provider_id = provider_id.strip()
    cleaned_model = model.strip()
    if not cleaned_provider_id or not cleaned_model:
        raise ModelSelectionError(
            f"{code_prefix}_required",
            f"{label}必须显式指定供应商和模型",
            scope=scope,
            details={"provider_id": cleaned_provider_id or None, "model": cleaned_model or None},
        )
    provider = repositories.model_providers.get(cleaned_provider_id)
    if provider is None:
        raise ModelSelectionError(
            f"{code_prefix}_provider_not_found",
            f"{label}供应商不存在",
            scope=scope,
            details={"provider_id": cleaned_provider_id},
        )
    if not provider.enabled:
        raise ModelSelectionError(
            f"{code_prefix}_provider_disabled",
            f"{label}供应商已停用",
            scope=scope,
            details={"provider_id": provider.id},
        )
    if cleaned_model not in provider.models:
        raise ModelSelectionError(
            f"{code_prefix}_model_not_found",
            f"{label}必须来自供应商模型列表",
            scope=scope,
            details={"provider_id": provider.id, "model": cleaned_model},
        )
    if provider.model_enabled.get(cleaned_model) is False:
        raise ModelSelectionError(
            f"{code_prefix}_model_disabled",
            f"{label}模型已停用",
            scope=scope,
            details={"provider_id": provider.id, "model": cleaned_model},
        )
    return ResolvedModelSelection(
        scope=scope,
        provider_id=provider.id,
        provider_name=provider.name,
        settings=ModelSettings(
            base_url=provider.base_url,
            api_key=provider.api_key,
            model=cleaned_model,
        ),
    )


def _require_default_scope(scope: str) -> str:
    normalized = scope.strip()
    if normalized not in MODEL_DEFAULT_SCOPES:
        expected = ", ".join(sorted(MODEL_DEFAULT_SCOPES))
        raise ModelSelectionError(
            "model_default_unknown",
            f"未知模型默认值：{normalized or '<empty>'}",
            scope=normalized,
            details={"expected": expected},
        )
    return normalized


def _scope_label(scope: str) -> str:
    return {
        MODEL_DEFAULT_CHAT: "默认对话模型",
        MODEL_DEFAULT_FAST: "快速模型",
    }.get(scope, "模型默认值")
