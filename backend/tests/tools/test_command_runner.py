from __future__ import annotations

import sys
from pathlib import Path

from backend.app.tools.command_runtime.models import CommandRequest, CommandRuntime
from backend.app.tools.command_runtime.output_store import CommandOutputStore
from backend.app.tools.command_runtime.providers import CommandSpawnSpec
from backend.app.tools.command_runtime.runner import CommandRunner


class PythonProvider:
    def build(self, runtime: CommandRuntime, command: str) -> CommandSpawnSpec:
        return CommandSpawnSpec(
            executable=sys.executable,
            argv=[sys.executable, "-c", command],
            shell_label="Python",
            shell_path=sys.executable,
        )


def _runtime() -> CommandRuntime:
    return CommandRuntime(
        shell="git_bash",
        tool_name="run_git_bash",
        shell_path=str(Path(sys.executable)),
        shell_label="Python Test Shell",
    )


def _request(tmp_path, command: str, *, timeout_seconds: float = 5) -> CommandRequest:
    return CommandRequest(
        command_id="cmd-test",
        tool_name="run_git_bash",
        command=command,
        description="test command",
        cwd=tmp_path,
        cwd_label=".",
        timeout_seconds=timeout_seconds,
        session_id="ses-command",
        user_id="local-user",
        turn_index=1,
        trace_id="trace-command",
        run_id="run-command",
        tool_call_id="tool-call-command",
    )


def _store(tmp_path, *, inline_chars: int = 12000, file_bytes: int = 1024 * 1024):
    return CommandOutputStore(
        output_path=tmp_path / "out.log",
        inline_output_max_chars=inline_chars,
        tail_max_chars=2048,
        output_file_max_bytes=file_bytes,
    )


def test_command_runner_runs_successful_foreground_command(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.runner.provider_for_runtime",
        lambda runtime: PythonProvider(),
    )

    result = CommandRunner().run(
        request=_request(tmp_path, "print('ok')"),
        runtime=_runtime(),
        output_store=_store(tmp_path),
        approval={"required": False},
    )

    assert result.status == "completed"
    assert result.exit_code == 0
    assert result.stdout.strip() == "ok"
    assert result.cwd == "."
    assert Path(result.output_path or "").exists()


def test_command_runner_returns_nonzero_as_completed(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.runner.provider_for_runtime",
        lambda runtime: PythonProvider(),
    )

    result = CommandRunner().run(
        request=_request(tmp_path, "import sys; print('bad', file=sys.stderr); sys.exit(3)"),
        runtime=_runtime(),
        output_store=_store(tmp_path),
        approval={"required": False},
    )

    assert result.status == "completed"
    assert result.exit_code == 3
    assert "bad" in result.stderr


def test_command_runner_times_out_and_preserves_tail(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.runner.provider_for_runtime",
        lambda runtime: PythonProvider(),
    )

    result = CommandRunner().run(
        request=_request(
            tmp_path,
            "import time; print('before-timeout', flush=True); time.sleep(2)",
            timeout_seconds=0.2,
        ),
        runtime=_runtime(),
        output_store=_store(tmp_path),
        approval={"required": False},
    )

    assert result.status == "timed_out"
    assert "before-timeout" in result.stdout_tail


def test_command_runner_uses_cwd(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.runner.provider_for_runtime",
        lambda runtime: PythonProvider(),
    )

    result = CommandRunner().run(
        request=_request(
            tmp_path,
            "from pathlib import Path; print(Path.cwd().name)",
        ),
        runtime=_runtime(),
        output_store=_store(tmp_path),
        approval={"required": False},
    )

    assert result.status == "completed"
    assert tmp_path.name in result.stdout


def test_command_runner_limits_output_file_and_returns_tail(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.runner.provider_for_runtime",
        lambda runtime: PythonProvider(),
    )

    result = CommandRunner().run(
        request=_request(
            tmp_path,
            "for index in range(200): print('line-' + str(index))",
        ),
        runtime=_runtime(),
        output_store=_store(tmp_path, inline_chars=256, file_bytes=512),
        approval={"required": False},
    )

    assert result.status == "output_limit_exceeded"
    assert result.output_limit_exceeded is True
    assert result.output_truncated is True
    assert "line-" in result.combined_tail
