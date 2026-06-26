from __future__ import annotations

from pathlib import Path

from backend.app.core.config import default_data_dir
from backend.app.core.env import get_prefixed_env


def _resolve_log_path() -> Path:
    explicit = get_prefixed_env("LOG_DIR")
    if explicit:
        return Path(explicit).expanduser().resolve()
    data_dir_value = get_prefixed_env("DATA_DIR")
    data_dir = Path(data_dir_value).expanduser().resolve() if data_dir_value else default_data_dir()
    return data_dir / "logs"


_log_path = _resolve_log_path()
_log_path.mkdir(parents=True, exist_ok=True)

log_path = str(_log_path)
