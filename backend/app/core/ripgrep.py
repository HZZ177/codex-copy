from __future__ import annotations

import os
import sys
from pathlib import Path

WINDOWS_TAURI_TRIPLE = "x86_64-pc-windows-msvc"
BUNDLED_RIPGREP_BINARY_NAME = f"rg-{WINDOWS_TAURI_TRIPLE}.exe" if os.name == "nt" else "rg"
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def resolve_ripgrep_binary() -> Path | None:
    candidates = [
        *_pyinstaller_ripgrep_candidates(),
        Path(sys.executable).resolve().parent / BUNDLED_RIPGREP_BINARY_NAME,
        REPOSITORY_ROOT / "desktop" / "src-tauri" / "binaries" / BUNDLED_RIPGREP_BINARY_NAME,
        REPOSITORY_ROOT / "desktop" / "src-tauri" / "binaries" / "rg.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _pyinstaller_ripgrep_candidates() -> list[Path]:
    root = getattr(sys, "_MEIPASS", "")
    if not root:
        return []
    bundle_root = Path(str(root))
    return [
        bundle_root / BUNDLED_RIPGREP_BINARY_NAME,
        bundle_root / "binaries" / BUNDLED_RIPGREP_BINARY_NAME,
        bundle_root / "rg.exe",
    ]
