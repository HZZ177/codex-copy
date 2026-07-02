from __future__ import annotations

import subprocess
import sys
import threading
import time
from pathlib import Path

from backend.app.core.logger import logger
from backend.app.tools.command_runtime.models import (
    CommandRequest,
    CommandRunResult,
    CommandRuntime,
    CommandStatus,
)
from backend.app.tools.command_runtime.output_store import CommandOutputStore
from backend.app.tools.command_runtime.process_manager import (
    ActiveCommand,
    CommandProcessManager,
    command_process_manager,
)
from backend.app.tools.command_runtime.process_tree import kill_process_tree
from backend.app.tools.command_runtime.providers import provider_for_runtime


class CommandRunner:
    def __init__(self, manager: CommandProcessManager | None = None) -> None:
        self.manager = manager or command_process_manager

    def run(
        self,
        *,
        request: CommandRequest,
        runtime: CommandRuntime,
        output_store: CommandOutputStore,
        approval: dict[str, object],
    ) -> CommandRunResult:
        started_at = time.perf_counter()
        output_store.open()
        process: subprocess.Popen | None = None
        cancel_event = threading.Event()
        try:
            spec = provider_for_runtime(runtime).build(runtime, request.command)
            process = subprocess.Popen(
                spec.argv,
                cwd=request.cwd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                creationflags=_creationflags(),
                startupinfo=_startupinfo(),
                start_new_session=sys.platform != "win32",
            )
            active = ActiveCommand(
                command_id=request.command_id,
                session_id=request.session_id,
                turn_index=request.turn_index,
                trace_id=request.trace_id,
                run_id=request.run_id,
                tool_call_id=request.tool_call_id,
                shell=runtime.shell,
                shell_path=runtime.shell_path,
                pid=process.pid,
                process=process,
                cancel_event=cancel_event,
            )
            self.manager.register(active)
            readers = [
                _reader_thread("stdout", process.stdout, output_store),
                _reader_thread("stderr", process.stderr, output_store),
            ]
            deadline = started_at + request.timeout_seconds
            status: CommandStatus = "completed"
            while process.poll() is None:
                manager_record = self.manager.get(request.command_id)
                if manager_record is not None and manager_record.cancel_event.is_set():
                    status = "cancelled"
                    kill_process_tree(process.pid)
                    break
                if time.perf_counter() >= deadline:
                    status = "timed_out"
                    if manager_record is not None:
                        manager_record.cancel_reason = "timeout"
                        manager_record.cancel_event.set()
                    kill_process_tree(process.pid)
                    break
                if output_store.output_limit_exceeded:
                    status = "output_limit_exceeded"
                    if manager_record is not None:
                        manager_record.cancel_reason = "output_limit"
                        manager_record.cancel_event.set()
                    kill_process_tree(process.pid)
                    break
                time.sleep(0.05)

            exit_code = process.wait(timeout=10)
            for reader in readers:
                reader.join(timeout=5)
            snapshot = output_store.snapshot()
            if status == "completed" and snapshot.output_limit_exceeded:
                status = "output_limit_exceeded"
            duration_ms = max(0, int((time.perf_counter() - started_at) * 1000))
            logger.info(
                "[CommandRuntime] 命令完成 | "
                f"command_id={request.command_id} | shell={runtime.shell} | "
                f"status={status} | exit_code={exit_code} | duration_ms={duration_ms} | "
                f"output_bytes={snapshot.output_bytes}"
            )
            return CommandRunResult(
                kind="command_result",
                command_id=request.command_id,
                tool=request.tool_name,
                shell=runtime.shell,
                shell_label=runtime.shell_label,
                shell_path=runtime.shell_path,
                command=request.command,
                description=request.description,
                cwd=request.cwd_label,
                status=status,
                exit_code=exit_code,
                duration_ms=duration_ms,
                timeout_seconds=request.timeout_seconds,
                output_path=snapshot.output_path,
                output_bytes=snapshot.output_bytes,
                output_truncated=snapshot.output_truncated,
                output_limit_exceeded=snapshot.output_limit_exceeded,
                stdout=snapshot.stdout,
                stderr=snapshot.stderr,
                stdout_tail=snapshot.stdout_tail,
                stderr_tail=snapshot.stderr_tail,
                combined_tail=snapshot.combined_tail,
                approval=dict(approval),
                run_id=request.run_id,
                tool_call_id=request.tool_call_id,
            )
        except Exception as exc:
            duration_ms = max(0, int((time.perf_counter() - started_at) * 1000))
            snapshot = output_store.snapshot()
            logger.opt(exception=True).error(
                "[CommandRuntime] 命令启动失败 | "
                f"command_id={request.command_id} | shell={runtime.shell} | error={exc}"
            )
            return CommandRunResult(
                kind="command_result",
                command_id=request.command_id,
                tool=request.tool_name,
                shell=runtime.shell,
                shell_label=runtime.shell_label,
                shell_path=runtime.shell_path,
                command=request.command,
                description=request.description,
                cwd=request.cwd_label,
                status="failed_to_start",
                exit_code=None,
                duration_ms=duration_ms,
                timeout_seconds=request.timeout_seconds,
                output_path=snapshot.output_path if Path(snapshot.output_path).exists() else None,
                output_bytes=snapshot.output_bytes,
                output_truncated=snapshot.output_truncated,
                output_limit_exceeded=snapshot.output_limit_exceeded,
                stdout=snapshot.stdout,
                stderr=snapshot.stderr,
                stdout_tail=snapshot.stdout_tail,
                stderr_tail=snapshot.stderr_tail,
                combined_tail=snapshot.combined_tail,
                approval=dict(approval),
                error={"type": type(exc).__name__, "message": str(exc)},
                run_id=request.run_id,
                tool_call_id=request.tool_call_id,
            )
        finally:
            if process is not None:
                self.manager.finish(request.command_id)
            output_store.close()


def _reader_thread(
    stream_name: str,
    pipe,
    output_store: CommandOutputStore,
) -> threading.Thread:
    def read_loop() -> None:
        if pipe is None:
            return
        try:
            while True:
                chunk = pipe.read(4096)
                if not chunk:
                    break
                output_store.write(stream_name, chunk)
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    thread = threading.Thread(target=read_loop, name=f"command-{stream_name}-reader", daemon=True)
    thread.start()
    return thread


def _creationflags() -> int:
    if sys.platform != "win32":
        return 0
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
        subprocess, "CREATE_NEW_PROCESS_GROUP", 0
    )


def _startupinfo() -> subprocess.STARTUPINFO | None:
    if sys.platform != "win32":
        return None
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return startupinfo
