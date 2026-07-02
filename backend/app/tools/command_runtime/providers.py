from __future__ import annotations

from dataclasses import dataclass

from backend.app.tools.command_runtime.models import CommandRuntime


@dataclass(frozen=True)
class CommandSpawnSpec:
    executable: str
    argv: list[str]
    shell_label: str
    shell_path: str


class CommandProvider:
    def build(self, runtime: CommandRuntime, command: str) -> CommandSpawnSpec:
        raise NotImplementedError


class CmdProvider(CommandProvider):
    def build(self, runtime: CommandRuntime, command: str) -> CommandSpawnSpec:
        return CommandSpawnSpec(
            executable=runtime.shell_path,
            argv=[runtime.shell_path, "/d", "/s", "/c", command],
            shell_label=runtime.shell_label,
            shell_path=runtime.shell_path,
        )


class PowerShellProvider(CommandProvider):
    def build(self, runtime: CommandRuntime, command: str) -> CommandSpawnSpec:
        wrapped = (
            f"& {{ {command} }}; "
            "if ($global:LASTEXITCODE -ne $null) { exit $global:LASTEXITCODE } "
            "elseif ($?) { exit 0 } else { exit 1 }"
        )
        return CommandSpawnSpec(
            executable=runtime.shell_path,
            argv=[
                runtime.shell_path,
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                wrapped,
            ],
            shell_label=runtime.shell_label,
            shell_path=runtime.shell_path,
        )


class GitBashProvider(CommandProvider):
    def build(self, runtime: CommandRuntime, command: str) -> CommandSpawnSpec:
        return CommandSpawnSpec(
            executable=runtime.shell_path,
            argv=[runtime.shell_path, "-c", command],
            shell_label=runtime.shell_label,
            shell_path=runtime.shell_path,
        )


def provider_for_runtime(runtime: CommandRuntime) -> CommandProvider:
    if runtime.shell == "cmd":
        return CmdProvider()
    if runtime.shell == "powershell":
        return PowerShellProvider()
    return GitBashProvider()
