from __future__ import annotations

import os
import signal
import subprocess
import sys

from backend.app.core.logger import logger


def kill_process_tree(pid: int) -> None:
    if pid <= 0:
        return
    if sys.platform == "win32":
        _kill_windows_tree(pid)
        return
    _kill_posix_group(pid)


def _kill_windows_tree(pid: int) -> None:
    try:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception as exc:
        logger.warning(f"[CommandRuntime] taskkill 失败 | pid={pid} | error={exc}")


def _kill_posix_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except Exception:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        except Exception as exc:
            logger.warning(f"[CommandRuntime] kill 失败 | pid={pid} | error={exc}")
