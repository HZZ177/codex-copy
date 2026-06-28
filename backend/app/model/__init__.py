"""模型配置、工具规格与 OpenAI 兼容供应商管理客户端。"""

from backend.app.model.base import ModelInfo, ModelSettings, ToolSpec
from backend.app.model.defaults import (
    ModelSelectionError,
    ResolvedModelSelection,
    resolve_model_default,
    resolve_model_selection,
)
from backend.app.model.provider_client import (
    ModelConfigError,
    ModelProviderError,
    OpenAICompatibleProviderClient,
    parse_model_list,
)

__all__ = [
    "ModelConfigError",
    "ModelInfo",
    "ModelSelectionError",
    "ModelSettings",
    "ModelProviderError",
    "OpenAICompatibleProviderClient",
    "ResolvedModelSelection",
    "ToolSpec",
    "parse_model_list",
    "resolve_model_default",
    "resolve_model_selection",
]
