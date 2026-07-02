from __future__ import annotations

from backend.app.tools.command_runtime.models import CommandRuntime
from backend.app.tools.command_runtime.providers import (
    CmdProvider,
    GitBashProvider,
    PowerShellProvider,
)


def test_cmd_provider_uses_cmd_arguments_without_shell_true() -> None:
    runtime = CommandRuntime(
        shell="cmd",
        tool_name="run_cmd",
        shell_path=r"C:\Windows\System32\cmd.exe",
        shell_label="Windows CMD",
    )

    spec = CmdProvider().build(runtime, 'echo "hello" && ver')

    assert spec.argv == [
        r"C:\Windows\System32\cmd.exe",
        "/d",
        "/s",
        "/c",
        'echo "hello" && ver',
    ]


def test_powershell_provider_disables_profile_and_preserves_exit_code() -> None:
    runtime = CommandRuntime(
        shell="powershell",
        tool_name="run_powershell",
        shell_path=r"C:\Program Files\PowerShell\7\pwsh.exe",
        shell_label="PowerShell 7+",
        shell_edition="Core",
    )

    spec = PowerShellProvider().build(runtime, "Write-Output keydex")

    assert "-NoProfile" in spec.argv
    assert "-NonInteractive" in spec.argv
    assert "$global:LASTEXITCODE" in spec.argv[-1]


def test_git_bash_provider_uses_bash_c_only() -> None:
    runtime = CommandRuntime(
        shell="git_bash",
        tool_name="run_git_bash",
        shell_path=r"C:\Program Files\Git\bin\bash.exe",
        shell_label="Git Bash",
    )

    spec = GitBashProvider().build(runtime, "echo $PATH | grep Git")

    assert spec.argv == [runtime.shell_path, "-c", "echo $PATH | grep Git"]
