from __future__ import annotations

import os
from pathlib import Path


def _resolve_log_path() -> Path:
    explicit = os.getenv("CODEX_COPY_LOG_DIR")
    if explicit:
        return Path(explicit).expanduser().resolve()
    data_dir = Path(os.getenv("CODEX_COPY_DATA_DIR", ".data")).expanduser().resolve()
    return data_dir / "logs"


_log_path = _resolve_log_path()
_log_path.mkdir(parents=True, exist_ok=True)

log_path = str(_log_path)
