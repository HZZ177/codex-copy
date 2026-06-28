from fastapi import Request

from backend.app.core.config import AppSettings
from backend.app.storage import StorageRepositories


def get_repositories(request: Request) -> StorageRepositories:
    return request.app.state.repositories


def get_app_settings(request: Request) -> AppSettings:
    return request.app.state.settings
