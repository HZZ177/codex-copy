from __future__ import annotations

import subprocess
from types import SimpleNamespace

from backend.app.tools.command_runtime.discovery import discover_shell, validate_shell_executable


def _completed(stdout: bytes = b"keydex\n", stderr: bytes = b"", returncode: int = 0):
    return SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)


def test_validate_cmd_executable_runs_cmd_probe(tmp_path, monkeypatch) -> None:
    cmd = tmp_path / "cmd.exe"
    cmd.write_text("", encoding="utf-8")
    calls = []

    def fake_run(argv, **kwargs):
        calls.append(argv)
        return _completed()

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = validate_shell_executable("cmd", cmd)

    assert result.found is True
    assert result.label == "Windows CMD"
    assert calls[0][1:4] == ["/d", "/s", "/c"]


def test_validate_powershell_detects_pwsh_label(tmp_path, monkeypatch) -> None:
    pwsh = tmp_path / "pwsh.exe"
    pwsh.write_text("", encoding="utf-8")

    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: _completed(
            b"KEYDEX_PS_EDITION=Core\nKEYDEX_PS_VERSION=7.5.0\nkeydex\n"
        ),
    )

    result = validate_shell_executable("powershell", pwsh)

    assert result.found is True
    assert result.label == "PowerShell 7+"
    assert result.edition == "Core"
    assert result.version == "7.5.0"


def test_validate_git_bash_rejects_wrong_executable_type(tmp_path) -> None:
    powershell = tmp_path / "powershell.exe"
    powershell.write_text("", encoding="utf-8")

    result = validate_shell_executable("git_bash", powershell)

    assert result.found is False
    assert "Git Bash" in (result.error or "")


def test_validate_git_bash_rejects_non_git_bash_path(tmp_path) -> None:
    bash = tmp_path / "bash.exe"
    bash.write_text("", encoding="utf-8")

    result = validate_shell_executable("git_bash", bash)

    assert result.found is False
    assert "Git Bash" in (result.error or "")


def test_discover_shell_only_uses_manual_git_bash_path_when_provided(tmp_path, monkeypatch) -> None:
    bash = tmp_path / "Git" / "bin" / "bash.exe"
    bash.parent.mkdir(parents=True)
    bash.write_text("", encoding="utf-8")
    calls = []

    def fake_run(argv, **kwargs):
        calls.append(argv)
        return _completed(b"keydex\ngit version 2.45.0.windows.1\n")

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = discover_shell("git_bash", manual_path=str(bash))

    assert result.found is True
    assert result.path == str(bash.resolve())
    assert result.label == "Git Bash"
    assert result.edition == "git-bash"
    assert result.version == "2.45.0.windows.1"
    assert len(calls) == 1


def test_discover_git_bash_does_not_accept_wsl_system32_bash(tmp_path, monkeypatch) -> None:
    wsl_bash = tmp_path / "Windows" / "System32" / "bash.exe"
    wsl_bash.parent.mkdir(parents=True)
    wsl_bash.write_text("", encoding="utf-8")
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.discovery._automatic_candidates",
        lambda shell: [wsl_bash],
    )

    result = discover_shell("git_bash")

    assert result.found is False
    assert "Git Bash" in (result.error or "")


def test_discover_shell_reports_missing_without_fallback(monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.app.tools.command_runtime.discovery._automatic_candidates",
        lambda shell: [],
    )

    result = discover_shell("git_bash")

    assert result.found is False
    assert "Git Bash" in (result.error or "")
