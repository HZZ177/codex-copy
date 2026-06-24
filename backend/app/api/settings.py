from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.app.api.dependencies import get_repositories
from backend.app.core.logger import logger
from backend.app.model import ModelSettings
from backend.app.storage import ModelProviderRecord, StorageRepositories

router = APIRouter(prefix="/api/settings", tags=["settings"])
RepositoriesDep = Depends(get_repositories)

MODEL_SETTINGS_KEY = "model_settings"
APPEARANCE_SETTINGS_KEY = "appearance_settings"


class AppearanceSettings(BaseModel):
    font_family: Literal["system", "maple-mono"] = "system"


class SettingsResponse(BaseModel):
    model: dict[str, Any]
    appearance: AppearanceSettings


class UpdateSettingsRequest(BaseModel):
    model: ModelSettings | None = None
    appearance: AppearanceSettings | None = None


def merge_model_settings(
    current: ModelSettings,
    update: ModelSettings,
    *,
    keep_existing_api_key: bool = True,
) -> ModelSettings:
    values = update.model_dump(mode="json")
    if keep_existing_api_key and update.api_key is None:
        values["api_key"] = current.api_key
    return ModelSettings(**values)


def load_model_settings(repositories: StorageRepositories) -> ModelSettings:
    return ModelSettings(**repositories.settings.get(MODEL_SETTINGS_KEY, default={}))


def load_appearance_settings(repositories: StorageRepositories) -> AppearanceSettings:
    settings = repositories.settings.get(APPEARANCE_SETTINGS_KEY, default={})
    if isinstance(settings, dict) and settings.get("font_family") in {"segoe-ui", "misans"}:
        settings = {**settings, "font_family": "system"}
    return AppearanceSettings(**settings)


def load_effective_model_settings(repositories: StorageRepositories) -> ModelSettings:
    default = repositories.model_providers.get_default()
    if default is not None:
        provider = repositories.model_providers.get(default.provider_id)
        if provider is not None:
            return ModelSettings(
                base_url=provider.base_url,
                api_key=provider.api_key,
                model=default.model,
            )
    return load_model_settings(repositories)


def save_provider_model_settings(
    repositories: StorageRepositories,
    provider: ModelProviderRecord,
    model: str,
) -> None:
    settings = ModelSettings(
        base_url=provider.base_url,
        api_key=provider.api_key,
        model=model,
    )
    repositories.settings.set(MODEL_SETTINGS_KEY, settings.model_dump(mode="json"))


@router.get("", response_model=SettingsResponse)
async def get_settings(
    repositories: StorageRepositories = RepositoriesDep,
) -> SettingsResponse:
    settings = load_effective_model_settings(repositories).public_dict()
    logger.debug(
        "[SettingsAPI] 读取模型设置 | "
        f"base_url={settings.get('base_url', '')} | model={settings.get('model', '')}"
    )
    appearance = load_appearance_settings(repositories)
    return SettingsResponse(model=settings, appearance=appearance)


@router.put("", response_model=SettingsResponse)
async def put_settings(
    request: UpdateSettingsRequest,
    repositories: StorageRepositories = RepositoriesDep,
) -> SettingsResponse:
    if request.model is not None:
        current = load_model_settings(repositories)
        merged = merge_model_settings(current, request.model)
        repositories.settings.set(MODEL_SETTINGS_KEY, merged.model_dump(mode="json"))
        logger.info(
            "[SettingsAPI] 更新模型设置 | "
            f"base_url={merged.base_url} | model={merged.model} | "
            f"api_key_set={bool(merged.api_key)}"
        )
    if request.appearance is not None:
        repositories.settings.set(APPEARANCE_SETTINGS_KEY, request.appearance.model_dump(mode="json"))
        logger.info(
            "[SettingsAPI] 更新外观设置 | "
            f"font_family={request.appearance.font_family}"
        )
    settings = load_model_settings(repositories).public_dict()
    appearance = load_appearance_settings(repositories)
    return SettingsResponse(model=settings, appearance=appearance)
